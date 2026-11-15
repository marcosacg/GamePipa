// Cachorro figurante (shiba): anda atrás do jogador, senta, se sacode e abana o rabo.
// Só enfeite visual: não mexe em pontos, física nem rede (cada jogador vê o seu cachorro).
// Modelo: “Animated Dog, Shiba Inu”, de quander (Sketchfab), CC BY 4.0. Versão enxuta em modelos/cachorro-shiba.glb.
// O arquivo traz as animações "parado", "sentado" e "sacode"; o andar/correr é feito por código nas patas.
import * as THREE from 'three';
import { G } from './state.js';
import { scene, groundH, SCN, collideWalk } from './scene.js';
import { toonRampSoft, addOutline } from './materials.js';
import { blobShadow } from './player.js';
import { loadGLB } from './tools/glbload.js';
import { clamp, lerpAngle, rand } from './utils.js';

const URL_DOG = 'modelos/cachorro-shiba.glb';
const ALTURA = .52;              // altura do cachorro em pé, até o topo da cabeça (m)
let asset = null, dog = null, loading = null;

/** carrega o modelo (uma vez). Se falhar, o jogo segue sem cachorro. */
export function loadDog() {
  if (!loading) loading = loadGLB(URL_DOG).then(a => { asset = a; }).catch(e => console.warn('cachorro não carregou:', e.message));
  return loading;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _to = new THREE.Vector3(), _goal = new THREE.Vector3(), _box = new THREE.Box3();
const LAT = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);

/** eixo local do osso que corresponde ao eixo lateral do cachorro (para balançar as patas pra frente e pra trás) */
function sideAxis(bone, inv, axis = LAT) {
  bone.getWorldQuaternion(_q);
  return axis.clone().applyQuaternion(inv).applyQuaternion(_q.invert()).normalize();
}

function build() {
  const inst = asset.instantiate(info => new THREE.MeshToonMaterial({ map: info.map, gradientMap: toonRampSoft(), side: THREE.DoubleSide }));
  const g = new THREE.Group(), pre = new THREE.Group();
  pre.add(inst.root); g.add(pre);
  for (const n of inst.nodes) if (n.name === 'Light' || n.name === 'Camera') n.removeFromParent(); // vieram junto no arquivo
  // mede em pé (pose de descanso) e põe na escala certa, com as patas no chão
  pre.updateMatrixWorld(true);
  _box.makeEmpty();
  const P = n => inst.byName(n);
  for (const n of ['head_jnt', 'L_ear_tip_jnt', 'LF_toes_jnt', 'LB_toes_jnt', 'nose_jnt', 'tail_3_jnt']) { const b = P(n); if (b) _box.expandByPoint(b.getWorldPosition(_v)); }
  const h = Math.max(.01, _box.max.y - _box.min.y);
  const head = P('nose_jnt').getWorldPosition(new THREE.Vector3()), tail = P('tail_1_jnt').getWorldPosition(new THREE.Vector3());
  const yaw = Math.atan2(head.x - tail.x, head.z - tail.z);     // para onde o focinho aponta no arquivo
  pre.rotation.y = -yaw;                                         // focinho em +Z (o grupo g gira com rotation.y = rumo)
  pre.scale.setScalar(ALTURA / h * .92);
  pre.updateMatrixWorld(true);
  const foot = Math.min(P('LF_toes_jnt').getWorldPosition(_v).y, P('LB_toes_jnt').getWorldPosition(_v).y);
  pre.position.y = -foot + .02;
  pre.updateMatrixWorld(true);

  for (const m of inst.meshes) { m.castShadow = true; addOutline(m, .35); } // largura na unidade do modelo (cm)
  g.add(blobShadow(.8, .32));

  const inv = pre.getWorldQuaternion(new THREE.Quaternion()).invert();
  const leg = (...names) => names.map(n => P(n)).filter(Boolean).map(b => ({ b, ax: sideAxis(b, inv) }));
  const legs = {
    fl: leg('L_shoulder_jnt', 'L_elbow_jnt', 'L_wrist_jnt'), fr: leg('R_shoulder_jnt', 'R_elbow_jnt', 'R_wrist_jnt'),
    bl: leg('L_hip_jnt', 'L_knee_jnt', 'L_ankle_jnt'), br: leg('R_hip_jnt', 'R_knee_jnt', 'R_ankle_jnt'),
  };
  const spine = leg('spine_1_jnt', 'chest_jnt'), neck = leg('neck_base_jnt', 'head_jnt');
  const tailB = ['tail_1_jnt', 'tail_2_jnt', 'tail_3_jnt', 'tail_4_jnt'].map(P).filter(Boolean).map(b => ({ b, ax: sideAxis(b, inv, UP) }));
  const cog = P('COG_jnt');

  const mixer = new THREE.AnimationMixer(inst.root), clips = inst.clips(), act = {};
  for (const k of ['parado', 'sentado', 'sacode']) if (clips[k]) { act[k] = mixer.clipAction(clips[k]); act[k].play(); act[k].setEffectiveWeight(k === 'parado' ? 1 : 0); }
  return {
    g, pre, mixer, act, legs, spine, neck, tailB, cog, w: { parado: 1, sentado: 0, sacode: 0 },
    mode: 'segue', timer: rand(2, 5), vel: new THREE.Vector3(), yaw: 0, phase: 0, sp: 0, quiet: 0,
    spot: new THREE.Vector3(), side: Math.random() < .5 ? -1 : 1, ph: Math.random() * 10,
  };
}

export function clearDog() {
  if (!dog) return;
  scene.remove(dog.g); dog.mixer.stopAllAction();
  dog = null;
}

/** põe o cachorro perto do jogador (chamado ao montar/trocar o cenário) */
export function initDog() {
  clearDog();
  if (!asset || !G.player) return;
  try { dog = build(); } catch (e) { console.warn('cachorro não montou:', e.message); dog = null; return; }
  const p = G.player.g.position;
  dog.g.position.set(p.x + 1.6 * dog.side, 0, p.z + 1.2);
  dog.g.position.y = groundH(dog.g.position.x, dog.g.position.z);
  dog.spot.copy(dog.g.position);
  scene.add(dog.g);
}

/** gira um osso em torno do eixo lateral do cachorro (por cima da animação do arquivo) */
function swing(j, ang) { j.b.quaternion.multiply(_q.setFromAxisAngle(j.ax, ang)); }

export function updateDog(dt, t) {
  if (!dog || !G.player) return;
  const d = dog, pos = d.g.position, P = G.player.g.position;
  const dist = Math.hypot(P.x - pos.x, P.z - pos.z);
  const pv = G.player.vel ? Math.hypot(G.player.vel.x, G.player.vel.z) : 0;

  // ---------- o que ele quer fazer ----------
  d.timer -= dt;
  d.quiet = pv < .5 && dist < 6 ? d.quiet + dt : 0;
  const Wk = SCN.walk, fora = Wk && Wk.x0 != null && (pos.x < Wk.x0 - 1 || pos.x > Wk.x1 + 1 || pos.z < Wk.z0 - 1 || pos.z > Wk.z1 + 1);
  if (dist > 30 || fora) { // ficou pra trás ou em outra laje (o jogador recomeçou em outro canto): aparece perto de novo
    pos.set(P.x + 1.5 * d.side, 0, P.z + 1.2); if (Wk && Wk.x0 != null) { pos.x = clamp(pos.x, Wk.x0 + .3, Wk.x1 - .3); pos.z = clamp(pos.z, Wk.z0 + .3, Wk.z1 - .3); } pos.y = groundH(pos.x, pos.z); d.vel.set(0, 0, 0); d.spot.copy(pos); d.mode = 'segue';
  }
  if (d.mode === 'sacode') { if (d.timer <= 0) { d.mode = 'segue'; d.timer = rand(3, 6); } }
  else if (d.mode === 'senta') {
    if (dist > 7 || pv > 3) { d.mode = 'segue'; d.timer = rand(3, 6); }
    else if (d.timer <= 0) { if (Math.random() < .35) { d.mode = 'sacode'; d.timer = 3.2; d.act.sacode && d.act.sacode.reset(); } else { d.mode = 'passeia'; d.timer = rand(4, 8); d.spot.set(P.x + rand(-5, 5), 0, P.z + rand(-4, 5)); } }
  } else if (d.mode === 'passeia') {
    if (dist > 9 || pv > 3 || d.timer <= 0 || Math.hypot(d.spot.x - pos.x, d.spot.z - pos.z) < .6) { d.mode = 'segue'; d.timer = rand(2, 5); }
  } else { // segue
    if (d.quiet > 2.5 && d.timer <= 0) { d.mode = 'senta'; d.timer = rand(6, 14); }
  }

  // ---------- anda ----------
  let speed = 0;
  if (d.mode === 'segue') {
    // fica do lado do jogador, um pouco atrás
    const yaw = G.player.yaw || 0;
    _goal.set(P.x + Math.cos(yaw) * 1.5 * d.side - Math.sin(yaw) * 1.1, 0, P.z - Math.sin(yaw) * 1.5 * d.side - Math.cos(yaw) * 1.1);
    const dg = Math.hypot(_goal.x - pos.x, _goal.z - pos.z);
    speed = dg > 6 ? 7.5 : dg > 2.2 ? 4.2 : dg > .7 ? 1.6 : 0;
  } else if (d.mode === 'passeia') { _goal.copy(d.spot); speed = 1.4; }
  else _goal.copy(pos);
  _to.set(_goal.x - pos.x, 0, _goal.z - pos.z);
  const dl = _to.length();
  if (dl > .3 && speed > 0) _to.multiplyScalar(Math.min(speed, dl * 2.5) / dl); else _to.set(0, 0, 0);
  d.vel.lerp(_to, 1 - Math.exp(-5 * dt));
  const ox = pos.x, oz = pos.z;
  pos.addScaledVector(d.vel, dt);
  collideWalk(pos, .3);
  const W = SCN.walk; // limites de onde dá pra andar (laje, campo...)
  if (W && W.x0 != null) { pos.x = clamp(pos.x, W.x0 + .3, W.x1 - .3); pos.z = clamp(pos.z, W.z0 + .3, W.z1 - .3); }
  { const dx = pos.x - P.x, dz = pos.z - P.z, dd = Math.hypot(dx, dz); if (dd < .6 && dd > 0) { pos.x = P.x + dx / dd * .6; pos.z = P.z + dz / dd * .6; } }
  const gy = groundH(pos.x, pos.z);
  if (Math.abs(gy - pos.y) > 1.2 && dist < 30) { pos.x = ox; pos.z = oz; d.vel.set(0, 0, 0); } // não pula da laje nem sobe em telhado
  else pos.y += (gy - pos.y) * (1 - Math.exp(-14 * dt));
  const sp = dt > 0 ? Math.hypot(pos.x - ox, pos.z - oz) / dt : 0;
  d.sp += (sp - d.sp) * (1 - Math.exp(-8 * dt));
  if (d.sp > .3) d.yaw = lerpAngle(d.yaw, Math.atan2(d.vel.x, d.vel.z), 1 - Math.exp(-7 * dt));
  else if (d.mode !== 'passeia') d.yaw = lerpAngle(d.yaw, Math.atan2(P.x - pos.x, P.z - pos.z) + .5 * d.side, 1 - Math.exp(-2 * dt)); // parado: meio virado pro dono
  d.g.rotation.y = d.yaw;

  // ---------- animação ----------
  const moving = d.sp > .25;
  const want = { parado: 1, sentado: d.mode === 'senta' && !moving ? 1 : 0, sacode: d.mode === 'sacode' && !moving ? 1 : 0 };
  if (want.sentado || want.sacode) want.parado = 0;
  for (const k in want) {
    d.w[k] += (want[k] - d.w[k]) * (1 - Math.exp(-(k === 'sacode' ? 8 : 4) * dt));
    if (d.act[k]) d.act[k].setEffectiveWeight(d.w[k]);
  }
  d.mixer.update(dt);

  // andar/correr por cima da pose "parado": patas em diagonal (trote), corpo balança, rabo abana
  const run = clamp(d.sp / 6, 0, 1), amt = clamp(d.sp / 1.2, 0, 1) * (1 - d.w.sentado);
  d.phase += dt * (5 + d.sp * 2.2) * (moving ? 1 : 0);
  if (amt > .01) {
    const A = (.32 + .38 * run) * amt, ph = d.phase;
    const stepLeg = (L, p, front) => {
      const s = Math.sin(p), lift = Math.max(0, Math.cos(p));
      if (L[0]) swing(L[0], s * A * (front ? 1 : .9));
      if (L[1]) swing(L[1], (front ? -1 : 1) * lift * A * 1.1);
      if (L[2]) swing(L[2], (front ? 1 : -1) * lift * A * .6);
    };
    stepLeg(d.legs.fl, ph, true); stepLeg(d.legs.br, ph + .3, false);
    stepLeg(d.legs.fr, ph + Math.PI, true); stepLeg(d.legs.bl, ph + Math.PI + .3, false);
    if (d.spine[0]) swing(d.spine[0], Math.sin(ph * 2) * .04 * amt * (1 + run));
    if (d.neck[0]) swing(d.neck[0], Math.sin(ph * 2 + 1) * .05 * amt);
  }
  d.bob = Math.abs(Math.sin(d.phase)) * .035 * amt * (1 + run);
  d.pre.children[0].position.y = d.bob / d.pre.scale.x;
  // rabo abanando: mais rápido quando o dono está perto ou ele está andando
  const wag = Math.sin(t * (dist < 4 ? 11 : 6) + d.ph) * (.25 + .2 * amt) * (1 - d.w.sacode);
  for (let i = 0; i < d.tailB.length; i++) swing(d.tailB[i], wag * (.5 + i * .2));
}

/** para conferência (testes) */
export function dogInfo() { return dog ? { modo: dog.mode, vel: +dog.sp.toFixed(2), pesos: { ...dog.w } } : null; }
