// Personagens prontos (modelos 3D com esqueleto, na pasta modelos/):
//   anime  → "Anime Boy for Blender", de Zaria (CC BY 4.0)
//   menino → "Boy Idle Mixamo animation free", de unbeatable (CC BY 4.0)
//   zepeto → "Zepeto Boy Model", de ZEPETO EXPORTER (CC BY 4.0)
//   garoto → "Black Boy Rigged Ready For Ue4", de MotionStudioArts (CC BY 4.0)
// Os arquivos vêm em pose de T. Aqui os ossos são movidos por código, igual para todos os modelos
// (parado, andando/correndo, braço da linha indo até a mão, carretel na outra mão, bravo, cabelo balançando).
import * as THREE from 'three';
import { loadGLB } from './tools/glbload.js';
import { toonRamp, toonRampSoft, addOutline } from './materials.js';

const mix = n => 'mixamorig:' + n + '_';
/** cada modelo: arquivo, crédito, para onde olha, altura no jogo e como achar os ossos */
export const RIGS = {
  anime: {
    url: 'modelos/anime-boy.glb', nome: 'Anime',
    credit: '“Anime Boy for Blender”, de Zaria (Sketchfab) · CC BY 4.0',
    turn: 0, height: null, outline: .0045, softBody: false, skipOutline: /Body_00_SKIN/,
    bone: { hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine', chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest', neck: 'J_Bip_C_Neck', head: 'J_Bip_C_Head' },
    side: s => ({ shoulder: `J_Bip_${s}_Shoulder`, upper: `J_Bip_${s}_UpperArm`, lower: `J_Bip_${s}_LowerArm`, hand: `J_Bip_${s}_Hand`, thigh: `J_Bip_${s}_UpperLeg`, shin: `J_Bip_${s}_LowerLeg`, foot: `J_Bip_${s}_Foot`,
      fingers: new RegExp(`^J_Bip_${s}_(Index|Middle|Ring|Little)\\d`), thumb: new RegExp(`^J_Bip_${s}_Thumb\\d`) }),
    hair: /^J_Sec_Hair/, hood: /^J_Sec_(C_Hood|[LR]_HoodString)/,
  },
  menino: {
    url: 'modelos/menino-bone.glb', nome: 'Menino de boné',
    credit: '“Boy Idle Mixamo animation free” e “Boy Walking animation Mixamo”, de unbeatable (Sketchfab) · CC BY 4.0',
    turn: Math.PI, height: 1.5, top: mix('HeadTop_End'), outline: .003, softBody: true, skipOutline: null,
    bone: { hips: mix('Hips'), spine: mix('Spine'), chest: mix('Spine1'), upperChest: mix('Spine2'), neck: mix('Neck'), head: mix('Head') },
    side: s => { const S = s === 'L' ? 'Left' : 'Right'; return { shoulder: mix(S + 'Shoulder'), upper: mix(S + 'Arm'), lower: mix(S + 'ForeArm'), hand: mix(S + 'Hand'), thigh: mix(S + 'UpLeg'), shin: mix(S + 'Leg'), foot: mix(S + 'Foot'),
      fingers: new RegExp(`^mixamorig:${S}Hand(Index|Middle|Ring|Pinky)[123]_`), thumb: new RegExp(`^mixamorig:${S}HandThumb[123]_`) }; },
    hair: /^mixamorig:Hair[AB]_/, hood: /^$/,
    // o rosto é uma tabela de expressões 10×10 na textura: mudar de expressão = deslocar a textura [u, v]
    face: { eyes: /Eyes/, mouth: /Mouth/, brows: /Brows/,
      angry: { eyes: [.2, -.9], mouth: [0, -.5], brows: [0, -.4] },   // olhos semicerrados, dentes cerrados, sobrancelha franzida
      blink: { eyes: [.2, -.2] } },                                    // olhos fechados
  },
  zepeto: {
    // este modelo veio SEM esqueleto: os ossos (Z_*) e os pesos foram criados por código (ver LEIA-ME)
    url: 'modelos/zepeto-boy.glb', nome: 'Zepeto',
    credit: '“Zepeto Boy Model”, de ZEPETO EXPORTER (Sketchfab) · CC BY 4.0',
    turn: Math.PI, height: 1.6, top: 'Z_HeadTop', outline: .003, softBody: true, skipOutline: /Material\.00[567]/,
    bone: { hips: 'Z_Hips', spine: 'Z_Spine', chest: 'Z_Chest', upperChest: 'Z_UpperChest', neck: 'Z_Neck', head: 'Z_Head' },
    side: s => ({ shoulder: `Z_${s}_Shoulder`, upper: `Z_${s}_UpperArm`, lower: `Z_${s}_LowerArm`, hand: `Z_${s}_Hand`, thigh: `Z_${s}_UpperLeg`, shin: `Z_${s}_LowerLeg`, foot: `Z_${s}_Foot`,
      fingers: /^$/, thumb: /^$/ }),   // sem ossos de dedo: a mão fica aberta
    hair: /^$/, hood: /^$/,
  },
  garoto: {
    // esqueleto no padrão da Unreal (UE4): pelvis, spine_01..03, clavicle, upperarm, lowerarm, hand, thigh, calf, foot
    url: 'modelos/garoto-ue4.glb', nome: 'Garoto',
    credit: '“Black Boy Rigged Ready For Ue4”, de MotionStudioArts (Sketchfab) · CC BY 4.0',
    turn: Math.PI, height: 1.45, top: 'head_end', outline: .003, softBody: true, skipOutline: null,
    bone: { hips: 'pelvis_', spine: 'spine_01_', chest: 'spine_02_', upperChest: 'spine_03_', neck: 'neck_01_', head: 'head_' },
    side: s => { const x = s.toLowerCase(); return { shoulder: `clavicle_${x}_`, upper: `upperarm_${x}_`, lower: `lowerarm_${x}_`, hand: `hand_${x}_`, thigh: `thigh_${x}_`, shin: `calf_${x}_`, foot: `foot_${x}_`,
      fingers: new RegExp(`^(index|middle|ring|pinky)_0[123]_${x}_\\d`), thumb: new RegExp(`^thumb_0[123]_${x}_\\d`) }; },
    hair: /^$/, hood: /^$/,
  },
};
export const RIG_IDS = Object.keys(RIGS);

const assets = {};
let loading = null;
/** baixa os modelos uma vez (chamar no começo do jogo). Os que falharem ficam de fora (o jogo usa o boneco padrão). */
export function loadAnime() {
  if (!loading) loading = Promise.all(RIG_IDS.map(id => loadGLB(RIGS[id].url).then(a => { assets[id] = a; })
    .catch(e => console.warn('Personagem "' + id + '" não carregou:', e.message)))).then(() => true);
  return loading;
}
export const animeReady = (id = 'anime') => !!assets[id];

/* materiais: cel shading com a textura do modelo; rosto e pele com sombra mais clara; olhos/boca sem sombra */
function materialFor(def) {
  return info => {
    const n = info.name;
    const face = /Face|Eye|Brow/i.test(n), skin = /SKIN/.test(n), eye = /Eye|Brow|Mouth/i.test(n);
    const opts = { map: info.map, side: info.doubleSided ? THREE.DoubleSide : THREE.FrontSide };
    const cf = info.color; if (cf && (cf[0] !== 1 || cf[1] !== 1 || cf[2] !== 1)) opts.color = new THREE.Color().setRGB(cf[0], cf[1], cf[2], THREE.LinearSRGBColorSpace); // cor base do material (ex.: cabelo escuro)
    if (info.alphaMode === 'MASK') opts.alphaTest = info.alphaCutoff;
    if (info.alphaMode === 'BLEND') { opts.transparent = true; opts.depthWrite = false; }
    const m = eye ? new THREE.MeshBasicMaterial(opts) : new THREE.MeshToonMaterial({ ...opts, gradientMap: face || skin || def.softBody ? toonRampSoft() : toonRamp() });
    m.name = n; m.userData.eye = eye;
    return m;
  };
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Vector3(), _d2 = new THREE.Vector3(), _u = new THREE.Vector3(),
  _s = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
const ID = new THREE.Quaternion();

/** osso com a pose de descanso guardada. set(q) aplica uma rotação dada nos eixos do modelo (X direita, Y cima, Z trás). */
class B {
  constructor(bone) {
    this.b = bone;
    this.rl = bone.quaternion.clone();                 // rotação local em descanso
    this.rw = bone.getWorldQuaternion(new THREE.Quaternion()); // rotação no modelo em descanso (o modelo ainda está solto, sem pai)
    this.rwi = this.rw.clone().invert();
    this.p0 = bone.position.clone();
  }
  set(q) { this.b.quaternion.copy(this.rl).multiply(this.rwi).multiply(q).multiply(this.rw); }
  /** o contrário do set: transforma uma rotação local (de uma animação do arquivo) em rotação nos eixos do modelo */
  toModel(local, out) { return out.copy(this.rw).multiply(_q3.copy(this.rl).invert()).multiply(local).multiply(this.rwi); }
  reset() { this.b.quaternion.copy(this.rl); }
}

/** cria um personagem do modelo pedido (style.model). makeSpool/blobShadow vêm do player.js (para não importar em círculo). */
export function makeAnimeCharacter(style, makeSpool, blobShadow, angerTag) {
  const id = style.model, def = RIGS[id], asset = assets[id];
  if (!def || !asset) return null;
  const inst = asset.instantiate(materialFor(def));
  const g = new THREE.Group();
  const holder = new THREE.Group(); holder.rotation.y = Math.PI;   // nos eixos do "modelo" a frente é -Z; o jogo usa +Z
  const pre = new THREE.Group(); pre.rotation.y = def.turn;        // vira os modelos que olham para +Z
  pre.add(inst.root); pre.updateMatrixWorld(true);

  // escala: deixa o personagem com a altura combinada
  const bone0 = n => { const b = inst.byName(n); if (!b) throw new Error('osso ausente: ' + n); return b; };
  const H0 = def.top ? bone0(def.top).getWorldPosition(new THREE.Vector3()).y                    // osso do topo da cabeça, se o modelo tiver
    : bone0(def.bone.head).getWorldPosition(new THREE.Vector3()).y * 1.135;                      // senão, um pouco acima do osso da cabeça
  const H = def.height || H0;
  pre.scale.setScalar(H / H0); pre.updateMatrixWorld(true);
  const k = H / 1.76;                                              // tudo que é distância foi ajustado para 1,76 m

  // tamanho de 1 unidade da malha no mundo (para o contorno ter a mesma espessura em qualquer modelo)
  let big = 0; for (const m of inst.meshes) { const bb = m.geometry.boundingBox; big = Math.max(big, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z); }
  const unit = H / big;
  for (const m of inst.meshes) {
    const info = m.userData.mat;
    m.renderOrder = info.alphaMode === 'BLEND' ? 2 : 0;
    if (info.alphaMode !== 'BLEND' && !m.material.userData.eye && !(def.skipOutline && def.skipOutline.test(info.name)))
      addOutline(m, +((/Hair|Face/i.test(info.name) ? def.outline * .7 : def.outline) / unit).toFixed(4));
  }

  // rosto com expressões: cada personagem ganha a sua cópia do material (para um piscar sem o outro piscar)
  let face = null;
  if (def.face) {
    face = { def: def.face, eyes: null, mouth: null, brows: null, blinkT: 2 + Math.random() * 3, own: [] };
    for (const m of inst.meshes) for (const part of ['eyes', 'mouth', 'brows']) {
      if (!def.face[part].test(m.userData.mat.name)) continue;
      m.material = m.material.clone(); m.material.map = m.material.map.clone(); m.material.map.needsUpdate = true;
      face[part] = m.material.map; face.own.push(m.material);
    }
  }

  const bone = n => new B(bone0(n));
  const side = s => {
    const d = def.side(s);
    const o = { shoulder: bone(d.shoulder), upper: bone(d.upper), lower: bone(d.lower), hand: bone(d.hand), thigh: bone(d.thigh), shin: bone(d.shin), foot: bone(d.foot),
      fingers: inst.nodes.filter(n => d.fingers.test(n.name)).map(n => new B(n)), thumb: inst.nodes.filter(n => d.thumb.test(n.name)).map(n => new B(n)) };
    const pu = o.upper.b.getWorldPosition(new THREE.Vector3()), pl = o.lower.b.getWorldPosition(new THREE.Vector3()), ph = o.hand.b.getWorldPosition(new THREE.Vector3());
    o.l1 = pu.distanceTo(pl); o.l2 = pl.distanceTo(ph);
    o.rest = pl.clone().sub(pu).normalize();   // direção do braço em descanso (pose de T)
    o.dir = Math.sign(o.rest.x) || 1;
    o.shoulderPos = pu;
    return o;
  };
  const rig = {
    hips: bone(def.bone.hips), spine: bone(def.bone.spine), chest: bone(def.bone.chest), upperChest: bone(def.bone.upperChest),
    neck: bone(def.bone.neck), head: bone(def.bone.head), L: side('L'), R: side('R'),
    hair: inst.nodes.filter(n => def.hair.test(n.name)).map(n => new B(n)),
    hood: inst.nodes.filter(n => def.hood.test(n.name)).map(n => new B(n)),
    holder, root: pre, k, H,
  };
  // para mexer o quadril em metros do modelo (o osso pode estar em outra escala/orientação)
  const hp = rig.hips.b.parent;
  rig.hipInv = hp.getWorldQuaternion(new THREE.Quaternion()).invert();
  rig.hipScale = 1 / hp.getWorldScale(new THREE.Vector3()).y;

  // caminhada gravada no arquivo (animação "andar", ex.: Mixamo): usada no quadril e nas pernas no lugar do andar por código
  const clip = (asset.animations || []).find(a => a.name === 'andar');
  if (clip) {
    const tr = (b, path) => clip.tracks.find(t => inst.nodes[t.node] === b.b && t.path === path);
    const quats = t => { const o = []; for (let i = 0; i + 3 < t.values.length; i += 4) o.push(new THREE.Quaternion().fromArray(t.values, i)); o.pop(); return o; }; // o último quadro repete o primeiro
    const w = { n: 0, parts: [], hipQ: null, hipP: null, off: 0 };
    const hq = tr(rig.hips, 'rotation'), hpos = tr(rig.hips, 'translation');
    if (hq) w.hipQ = quats(hq).map(q => rig.hips.toModel(q, new THREE.Quaternion()));
    if (hpos) { w.hipP = []; for (let i = 0; i + 2 < hpos.values.length; i += 3) w.hipP.push(new THREE.Vector3(hpos.values[i] - rig.hips.p0.x, hpos.values[i + 1] - rig.hips.p0.y, 0)); w.hipP.pop(); }
    for (const s of [rig.L, rig.R]) for (const part of ['thigh', 'shin', 'foot']) {
      const t = tr(s[part], 'rotation'); if (t) w.parts.push({ B: s[part], q: quats(t).map(q => s[part].toModel(q, new THREE.Quaternion())) });
      if (part === 'foot') for (const toe of s.foot.b.children) { // dedos do pé, se a animação mexer neles
        const tb = new B(toe), tt = tr(tb, 'rotation'); if (tt) w.parts.push({ B: tb, q: quats(tt).map(q => tb.toModel(q, new THREE.Quaternion())) });
      }
    }
    const th = w.parts.find(p => p.B === rig.L.thigh);
    if (th) {
      w.n = th.q.length;
      // acerta o passo com o resto do corpo: acha em que quadro a coxa esquerda está mais à frente (o código usa sen(fase))
      let sa = 0, ca = 0;
      th.q.forEach((q, i) => { const a = 2 * Math.atan2(q.x, q.w), an = a > Math.PI ? a - 2 * Math.PI : a, f = i / w.n * Math.PI * 2; sa += an * Math.sin(f); ca += an * Math.cos(f); });
      w.off = Math.atan2(ca, sa);
      rig.walk = w;
    }
  }

  holder.add(pre); g.add(holder);

  // carretel na mão esquerda (preso ao osso da mão; posição/rotação dadas nos eixos do modelo)
  const spool = makeSpool(style.spool);
  const hb = rig.L.hand.b, hs = 1 / hb.getWorldScale(new THREE.Vector3()).x; // desfaz a escala do osso (carretel em metros)
  const sh = new THREE.Group();
  sh.quaternion.copy(rig.L.hand.rwi);
  sh.scale.setScalar(hs);
  sh.position.copy(_v.set(-.075 * k, -.045 * k, -.01 * k).applyQuaternion(rig.L.hand.rwi).multiplyScalar(hs));
  spool.scale.setScalar(.8 * Math.max(.85, k));
  sh.add(spool); hb.add(sh);

  // referência do ombro da linha (o jogo calcula daqui para onde a mão vai)
  const armR = new THREE.Object3D(); armR.position.set(-rig.R.shoulderPos.x, rig.R.shoulderPos.y, -rig.R.shoulderPos.z); g.add(armR);
  const armL = new THREE.Object3D(); armL.position.set(-rig.L.shoulderPos.x, rig.L.shoulderPos.y, -rig.L.shoulderPos.z); g.add(armL);
  g.add(blobShadow());
  angerTag.position.y = H + .3; angerTag.visible = false; g.add(angerTag);

  return {
    kind: 'anime', model: id, g, rig, face, armR, armL, spool, handR: rig.R.hand.b, angerTag, tagY: H + .3,
    headG: new THREE.Object3D(), legL: new THREE.Object3D(), legR: new THREE.Object3D(), // só para compatibilidade
    angry: 0, phase: 0, t: Math.random() * 10, look: 0, lookYaw: 0,
  };
}

const ax = (axis, a, out = new THREE.Quaternion()) => out.setFromAxisAngle(axis, a);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qcc = new THREE.Quaternion(), qd = new THREE.Quaternion(),
  A = new THREE.Quaternion(), A1 = new THREE.Quaternion(), F1 = new THREE.Quaternion(), Bq = new THREE.Quaternion();

/**
 * Braço com dois ossos indo até um alvo (IK). target = ponto nos eixos do modelo; Aparent = rotação acumulada do tronco.
 * pole = para onde o cotovelo aponta.
 */
function armIK(rig, s, target, Aparent, pole) {
  s.upper.b.updateWorldMatrix(true, false);
  _s.setFromMatrixPosition(s.upper.b.matrixWorld); rig.holder.worldToLocal(_s);
  _v.subVectors(target, _s);
  const l1 = s.l1, l2 = s.l2;
  let d = _v.length();
  d = Math.min(l1 + l2 - .005, Math.max(Math.abs(l1 - l2) + .02, d));
  _v.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _u.copy(pole).addScaledVector(_v, -pole.dot(_v));
  if (_u.lengthSq() < 1e-6) _u.set(0, -1, 0);
  _u.normalize();
  _e.copy(_v).multiplyScalar(cosA).addScaledVector(_u, sinA);          // direção do braço (ombro → cotovelo)
  _d2.copy(_v).multiplyScalar(d).addScaledVector(_e, -l1).normalize(); // direção do antebraço
  F1.setFromUnitVectors(s.rest, _e);
  s.upper.set(qa.copy(Aparent).invert().multiply(F1));
  Bq.setFromUnitVectors(_e, _d2);
  s.lower.set(qb.copy(F1).invert().multiply(Bq).multiply(F1));
  s.hand.set(ID);
}

/**
 * Anima o personagem. speed = velocidade andando (m/s); hand = ponto do mundo onde a mão da linha deve ir (ou null).
 * angry (0..1) = bravo (braços pro alto, bate o pé, balança a cabeça).
 */
export function poseAnime(c, dt, speed, hand, angryOn, tt) {
  const r = c.rig, t = (c.t += dt), K = r.k;
  c.angry += ((angryOn ? 1 : 0) - c.angry) * Math.min(1, dt * 8);
  const k = c.angry;
  c.angerTag.visible = k > .3;
  if (c.angerTag.visible) { c.angerTag.position.y = c.tagY + Math.abs(Math.sin(tt * 6)) * .12; c.angerTag.material.rotation = Math.sin(tt * 9) * .15; }

  // ---- expressão do rosto (modelos com tabela de expressões): bravo, piscando ou normal ----
  if (c.face) {
    const f = c.face, d = f.def;
    f.blinkT -= dt; if (f.blinkT < -.13) f.blinkT = 2 + Math.random() * 4;
    const ex = k > .4 ? d.angry : f.blinkT < 0 ? d.blink : null;
    for (const part of ['eyes', 'mouth', 'brows']) if (f[part]) { const o = ex && ex[part]; f[part].offset.set(o ? o[0] : 0, o ? o[1] : 0); }
  }

  const run = Math.min(1, Math.max(0, (speed - 3.6) / 2.4));        // 0 andando, 1 correndo
  const amt = Math.min(1, speed / 2.2);
  c.phase += dt * (2.2 + speed * 1.55) * (amt > .02 ? 1 : 0);
  const ph = c.phase, sn = Math.sin(ph), cs = Math.cos(ph);
  const stomp = k > .02 ? Math.sin(tt * 11) : 0;

  // ---- tronco ----
  const breath = Math.sin(t * 1.7) * .012;
  const lean = -(amt * (.06 + run * .16)) - k * .1;                // inclina pra frente andando/correndo
  const bob = (-Math.abs(sn) * .035 * amt * (1 + run) - (amt < .05 ? .004 * Math.sin(t * 1.7) : 0) + Math.abs(stomp) * .03 * k) * K;
  r.hips.b.position.copy(r.hips.p0).add(_v.set(0, bob, 0).applyQuaternion(r.hipInv).multiplyScalar(r.hipScale));
  const hipYaw = sn * .09 * amt, hipRoll = cs * .035 * amt + (amt < .05 ? Math.sin(t * .6) * .012 : 0);
  ax(Y, hipYaw, qa).multiply(ax(Z, hipRoll, qb)).multiply(ax(X, lean * .4, qcc));
  // caminhada gravada (quando o modelo tem): quadril e pernas vêm dela; correndo, mistura com a corrida por código
  const W = r.walk, wk = W ? amt * (1 - .45 * run) * (1 - k) : 0;
  let wi = 0, wj = 0, wf = 0;
  if (wk > .001) {
    let u = ((ph - W.off) / (Math.PI * 2)) % 1; if (u < 0) u += 1;
    u *= W.n; wi = Math.floor(u) % W.n; wj = (wi + 1) % W.n; wf = u - Math.floor(u);
    if (W.hipQ) qa.slerp(qd.copy(W.hipQ[wi]).slerp(W.hipQ[wj], wf), wk);
    if (W.hipP) r.hips.b.position.lerp(_v2.copy(W.hipP[wi]).lerp(W.hipP[wj], wf).add(r.hips.p0), wk);
  }
  r.hips.set(qa); A.copy(qa);
  r.spine.set(ax(X, lean * .3 + breath, qa).multiply(ax(Y, -hipYaw * .7, qb))); A.multiply(qa);
  r.chest.set(ax(X, lean * .3 + breath, qa).multiply(ax(Y, -hipYaw * .7, qb)).multiply(ax(Z, -hipRoll, qcc))); A.multiply(qa);
  r.upperChest.set(ax(X, breath, qa)); A.multiply(qa);

  // ---- cabeça: olha para a pipa (direção da mão da linha) ----
  let look = 0, lookYaw = 0;
  if (hand && k < .5) {
    r.neck.b.updateWorldMatrix(true, false);
    _s.setFromMatrixPosition(r.neck.b.matrixWorld);
    _v.subVectors(hand, _s); r.holder.getWorldQuaternion(_qc); _v.applyQuaternion(_qc.invert());
    const hl = Math.hypot(_v.x, _v.z);
    look = Math.max(-.15, Math.min(.55, Math.atan2(_v.y + .35 * K, hl + .3 * K) * .75));
    lookYaw = Math.max(-.5, Math.min(.5, Math.atan2(-_v.x, -_v.z) * .5));
  }
  c.look += (look - c.look) * Math.min(1, dt * 5); c.lookYaw += (lookYaw - c.lookYaw) * Math.min(1, dt * 5);
  const shakeHead = Math.sin(tt * 13) * .35 * k;
  r.neck.set(ax(X, c.look * .45 - lean * .5, qa).multiply(ax(Y, c.lookYaw * .4 + shakeHead * .4, qb)));
  r.head.set(ax(X, c.look * .55 - .1 * k, qa).multiply(ax(Y, c.lookYaw * .6 + shakeHead * .6, qb)).multiply(ax(Z, Math.sin(ph) * .03 * amt, qcc)));

  // ---- pernas ----
  const swing = (.4 + run * .38) * amt;
  for (const [s, sg] of [[r.L, 1], [r.R, -1]]) {
    const th = sn * sg * swing + (k > .02 ? Math.max(0, stomp * sg) * .7 * k : 0);
    const lift = Math.max(0, cs * sg);                               // perna indo pra frente: dobra o joelho
    const knee = (lift * (.75 + run * .7) + .08) * amt + (k > .02 ? Math.max(0, stomp * sg) * 1.1 * k : 0);
    s.thigh.set(ax(X, th + knee * .35, qa).multiply(ax(Z, sg * -.02, qb)));
    s.shin.set(ax(X, -knee, qa));
    s.foot.set(ax(X, knee * .35 - th * .3, qa));
  }
  if (wk > .001) for (const p of W.parts) {
    p.B.toModel(p.B.b.quaternion, qa);                               // pose por código (ou descanso, nos dedos do pé)
    p.B.set(qa.slerp(qd.copy(p.q[wi]).slerp(p.q[wj], wf), wk));
  } else if (W) for (const p of W.parts) if (p.B.b.name.includes('Toe')) p.B.reset();

  // ---- braço da linha (direito): vai até o ponto que o jogo pede ----
  const sh = Math.sin(tt * 18);
  r.R.shoulder.set(ID); r.L.shoulder.set(ID);
  if (k > .5) armIK(r, r.R, _t.set(.3 + sh * .05, 1.85 + sh * .06, -.12).multiplyScalar(K), A, _pole.set(.6, -.4, .5));   // bravo: braços pro alto, sacudindo
  else if (hand) { _t.copy(hand); r.holder.worldToLocal(_t); armIK(r, r.R, _t, A, _pole.set(.5, -1, .5)); }
  else armIK(r, r.R, _t.set(.21, .97 - sn * .03 * amt, -.06 + sn * .12 * amt).multiplyScalar(K), A, _pole.set(.5, -.3, 1)); // solto ao lado do corpo
  // ---- braço do carretel (esquerdo): segura o carretel na frente do corpo; andando, balança um pouco ----
  if (k > .5) armIK(r, r.L, _t.set(-.3 - sh * .05, 1.85 - sh * .06, -.12).multiplyScalar(K), A, _pole.set(-.6, -.4, .5));
  else armIK(r, r.L, _t.set(-.17 + sn * .02 * amt, 1.0 + Math.abs(sn) * .02 * amt + breath, -.26 - sn * .05 * amt).multiplyScalar(K), A, _pole.set(-.7, -1, .6));

  // ---- dedos fechados (segurando linha e carretel) ----
  for (const s of [r.L, r.R]) {
    const curl = s === r.L ? 1.05 : .9;
    for (const f of s.fingers) f.set(ax(Z, -s.dir * curl, qa));
    for (const f of s.thumb) f.set(ax(Y, -s.dir * .35, qa));
  }

  // ---- cabelo e capuz balançam (vento + andar) ----
  const hw = .035 + amt * .05;
  r.hair.forEach((h, i) => h.set(ax(X, Math.sin(t * 2.4 + i * .7) * hw + amt * .06, qa).multiply(ax(Z, Math.sin(t * 1.9 + i) * hw * .7, qb))));
  r.hood.forEach((h, i) => h.set(ax(X, Math.sin(t * 2 + i) * .03 + amt * .08, qa)));

  r.root.updateMatrixWorld(true);
}

/** onde está a mão da linha (no mundo) */
export function animeHandWorld(c, out) {
  c.handR.updateWorldMatrix(true, false);
  out.setFromMatrixPosition(c.handR.matrixWorld);
  // um pouco à frente do pulso (onde a linha sai do punho fechado)
  _v.set(.07, -.02, 0).multiplyScalar(c.rig.k);
  c.handR.getWorldQuaternion(_q).multiply(c.rig.R.hand.rwi); // rotação do osso em eixos do modelo → mundo
  return out.add(_v.applyQuaternion(_q));
}

export function disposeAnime(c) {
  if (c.g.parent) c.g.parent.remove(c.g);
  if (c.face) for (const m of c.face.own) { m.map.dispose(); m.dispose(); }
  c.rig.root.traverse(s => { if (s.isSkinnedMesh && s.skeleton.boneTexture) s.skeleton.dispose(); });
}
