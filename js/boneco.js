// "Boneco": personagem com esqueleto que dá para personalizar (pele, cabelo, chapéu, camisa, bermuda ou calça).
// Modelo: “Black Character”, de Stefano.Beccaletto (Sketchfab), CC BY 4.0 — versão enxuta em modelos/boneco.glb.
// O arquivo tem uma roupa só (blusa de manga comprida e calça). As variações são feitas na pintura:
//  - pele: a textura do rosto foi "neutralizada" e recebe o tom escolhido
//  - camisa: cor/listras/faixa pintadas por cima do tecido; a manga é "cortada" pintando o braço com a cor da pele
//  - bermuda: a calça é pintada com a cor da pele do joelho pra baixo
//  - cabelo e chapéu: peças simples presas no osso da cabeça (as mesmas ideias do boneco antigo)
import * as THREE from 'three';
import { SKINS, SHIRTS, SHORTS } from './config.js';
import { toonRampSoft, mesh, smat, addOutline } from './materials.js';

const HAIR = '#2a1d16';
const HEAD_SCALE = 1.2;                 // cabeça um pouco maior: jeito de desenho
/* medidas do modelo na pose de descanso (metros do arquivo; frente = +Z) */
const M = {
  skull: [0, 1.735, .022], rx: .1, ry: .112, rz: .118,
  shoulder: [.1659, 1.5029, -.0385], elbow: [.3096, 1.2576, -.0598], hand: [.4496, 1.0688, .0311],
  knee: .5673, band: [1.285, 1.375],
};

const lin = hex => new THREE.Color(hex);

/** material de tecido com "zonas": cor A, cor B (listras/faixa) e partes pintadas de pele (manga curta, bermuda) */
function zoneMaterial(base, kind) {
  const m = base.clone();
  m.color.set('#ffffff');
  const u = m.userData.u = {
    uA: { value: new THREE.Color('#ffffff') }, uB: { value: new THREE.Color('#ffffff') }, uSkin: { value: new THREE.Color('#b07a4f') },
    uMode: { value: 0 }, uCut: { value: -1 },
    uArm0: { value: new THREE.Vector3(...M.shoulder) }, uArmD: { value: new THREE.Vector3() }, uBand: { value: new THREE.Vector2(...M.band) },
    uFore0: { value: new THREE.Vector3(...M.elbow) }, uForeD: { value: new THREE.Vector3() },
  };
  const f = new THREE.Vector3(...M.hand).sub(u.uFore0.value).multiplyScalar(1.6); u.uForeD.value.copy(f).divideScalar(f.lengthSq()); const foreLen = f.length();
  const d = new THREE.Vector3(...M.elbow).sub(u.uArm0.value); u.uArmD.value.copy(d).divideScalar(d.lengthSq()); // projeção: 0 no ombro, 1 no cotovelo
  const armLen = d.length();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBind;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uSkin; uniform float uMode; uniform float uCut; uniform vec3 uArm0; uniform vec3 uArmD; uniform vec2 uBand; uniform vec3 uFore0; uniform vec3 uForeD;`)
      .replace('#include <map_fragment>', kind === 'top' ? `#include <map_fragment>
  {
    vec3 pb = vec3(abs(vBind.x), vBind.y, vBind.z) - uArm0;
    float tA = dot(pb, uArmD);                                   // posição ao longo do braço (0 ombro, 1 cotovelo)
    float perp = length(pb - uArmD * tA * ${(armLen * armLen).toFixed(5)});
    bool arm = tA > 0.0 && tA < 1.15 && perp < 0.085;            // está na manga (braço)?
    vec3 pf = vec3(abs(vBind.x), vBind.y, vBind.z) - uFore0;
    float tF = dot(pf, uForeD);
    if (tF > 0.0 && length(pf - uForeD * tF * ${(1).toFixed(1)} * ${(foreLen * foreLen).toFixed(5)}) < 0.095) { arm = true; tA = max(tA, 1.0 + tF); } // ...ou no antebraço/punho
    vec3 base = uA;
    if (uMode > 0.5 && uMode < 1.5) { if (!arm && vBind.y > uBand.x && vBind.y < uBand.y) base = uB; }                 // faixa no peito
    else if (uMode > 1.5) { float c = arm ? tA * ${(armLen).toFixed(4)} : vBind.y; if (fract(c * 13.0) < 0.42) base = uB; } // listras
    diffuseColor.rgb *= base;
    if (arm && tA > uCut) diffuseColor.rgb = uSkin;              // manga curta (ou sem manga): dali pra frente é braço
  }` : `#include <map_fragment>
  diffuseColor.rgb *= uA;
  if (vBind.y < uCut) diffuseColor.rgb = uSkin;                  // bermuda: do joelho pra baixo é perna`);
  };
  m.customProgramCacheKey = () => 'boneco-' + kind;
  return m;
}

/* ---------- peças da cabeça (coordenadas do boneco antigo: cabeça = esfera de raio .21 com centro em y=.21, frente +Z) ---------- */
function bumpy(geo, amp, freq, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const l = v.length() || 1;
    const n = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2) * Math.sin(v.z * freq * .9 + seed * 3);
    v.multiplyScalar(1 + amp * n / l); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}
function headPieces(st, hairM, own) {
  const g = new THREE.Group();
  const keep = m => { own.push(m); return m; };
  const part = (geo, m, outline = true) => { const o = mesh(geo, m, true, false); own.push(geo); g.add(o); if (outline) addOutline(o, .008); return o; };
  const cap = (r, frac, m) => { const h = part(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI * frac), m, false); h.position.y = .21; h.rotation.x = -.38; h.scale.set(1, 1.06, 1); return h; };
  const hat = st.hat !== 'nenhum';
  let ownHair = false;                                            // mostra o cabelo que vem no modelo?
  if (st.hair === 'curto') { if (hat) cap(.226, .56, hairM); else ownHair = true; }
  else if (st.hair === 'raspado') cap(.214, .5, keep(new THREE.MeshToonMaterial({ color: '#45362c', gradientMap: toonRampSoft() })));
  else if (st.hair === 'blackpower') {
    const h = part(bumpy(new THREE.SphereGeometry(.29, 36, 24), .016, 24, 3), hairM);
    h.position.set(0, .4, -.1); h.scale.set(1.08, hat ? .7 : .86, .95); if (hat) h.position.y = .27;
  } else if (st.hair === 'trancas') {
    cap(.226, .56, hairM);
    [-.12, -.04, .04, .12].forEach((x, i) => {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, .26, -.18), new THREE.Vector3(x * 1.1, .12, -.25), new THREE.Vector3(x * 1.25, -.06, -.24)]);
      part(new THREE.TubeGeometry(curve, 12, .022, 8), hairM, false);
      const bead = part(new THREE.SphereGeometry(.032, 10, 8), smat(['#ffd166', '#e63946', '#06d6a0', '#118ab2'][i]), false); bead.position.set(x * 1.25, -.08, -.24);
    });
  } else if (st.hair === 'moicano') {
    cap(.214, .5, keep(new THREE.MeshToonMaterial({ color: '#45362c', gradientMap: toonRampSoft() })));
    if (!hat) { const crest = part(bumpy(new THREE.SphereGeometry(.08, 18, 12), .006, 30, 0), hairM); crest.scale.set(.5, 1, 2.5); crest.position.set(0, .43, -.03); }
  }
  if (st.hat === 'bone' || st.hat === 'bonetras') {
    const sh = SHIRTS[st.shirt] || SHIRTS[0];
    const capM = smat(sh.b && sh.mode !== 'lisa' ? sh.b : '#d62828');
    const front = st.hat === 'bone' ? 1 : -1;
    const dome = part(new THREE.SphereGeometry(.228, 28, 12, 0, Math.PI * 2, 0, Math.PI * .5), capM);
    dome.position.y = .275; dome.scale.y = .78;
    const brim = part(new THREE.CylinderGeometry(.15, .15, .018, 26), capM);
    brim.scale.set(1, 1, 1.1); brim.position.set(0, .285, front * .22); brim.rotation.x = front * .14;
    const btn = part(new THREE.SphereGeometry(.02, 8, 6), capM, false); btn.position.y = .455;
  } else if (st.hat === 'palha') {
    const hp = [[.001, .17], [.12, .17], [.16, .14], [.178, .05], [.186, 0], [.36, -.012], [.405, -.04], [.412, -.05]].map(([r, y]) => new THREE.Vector2(r, y));
    const h = part(new THREE.LatheGeometry(hp, 32), smat('#e3c16f', { side: THREE.DoubleSide }));
    h.position.y = .345;
    const band = part(new THREE.CylinderGeometry(.184, .188, .045, 28, 1, true), smat('#8b2d1e', { side: THREE.DoubleSide }), false);
    band.position.y = .37;
  }
  return { g, ownHair };
}

/**
 * Veste o boneco conforme o estilo. inst = cópia do modelo; rig.head = osso da cabeça (classe B do anime.js);
 * scale = metros do jogo por metro do arquivo. Devolve a lista do que precisa ser descartado depois.
 */
export function dressBoneco(inst, rig, st, scale) {
  const own = [];
  const skin = lin(SKINS[st.skin] || SKINS[2]);
  const sh = SHIRTS[st.shirt] || SHIRTS[0];
  const hairM = new THREE.MeshToonMaterial({ color: HAIR, gradientMap: toonRampSoft() }); own.push(hairM);
  let hairMesh = null;
  for (const m of inst.meshes) {
    const n = m.userData.mat.name;
    if (n === 'Wolf3D_Body' || n === 'Wolf3D_Skin') { m.material = m.material.clone(); m.material.color.copy(skin); own.push(m.material); }
    else if (n === 'Wolf3D_Hair') { m.material = hairM; hairMesh = m; }
    else if (n === 'Wolf3D_Outfit_Top') {
      const z = m.material = zoneMaterial(m.material, 'top'); own.push(z);
      const u = z.userData.u;
      u.uSkin.value.copy(skin);
      u.uA.value.set(sh.a); u.uB.value.set(sh.b || '#ffffff');
      u.uMode.value = sh.mode === 'faixa' ? 1 : sh.mode === 'listras' ? 2 : 0;
      u.uCut.value = sh.mode === 'regata' ? .04 : .52;           // regata: sem manga; as outras: manga curta
    } else if (n === 'Wolf3D_Outfit_Bottom') {
      const z = m.material = zoneMaterial(m.material, 'bottom'); own.push(z);
      const u = z.userData.u;
      u.uSkin.value.copy(skin); u.uA.value.set(SHORTS[st.shorts] || SHORTS[0]);
      u.uCut.value = st.legs === 'calca' ? -1 : M.knee - .035;
    }
  }

  // peças presas na cabeça: um grupo nos eixos do boneco antigo (frente +Z), com o centro e o tamanho do crânio deste modelo
  const hb = rig.head.b, hs = 1 / hb.getWorldScale(new THREE.Vector3()).x;
  const bp = hb.getWorldPosition(new THREE.Vector3());                       // osso da cabeça no modelo (já na escala do jogo, frente -Z)
  const hold = new THREE.Group();
  hold.quaternion.copy(rig.head.rwi); hold.scale.setScalar(hs);
  const c = new THREE.Vector3(-M.skull[0], M.skull[1], -M.skull[2]).multiplyScalar(scale).sub(bp); // centro do crânio a partir do osso
  hold.position.copy(c.applyQuaternion(rig.head.rwi).multiplyScalar(hs));
  const { g, ownHair } = headPieces(st, hairM, own);
  g.rotation.y = Math.PI;                                                    // frente do grupo (+Z) → frente do modelo (-Z)
  g.scale.set(M.rx / .21 * scale, M.ry / .2226 * scale, M.rz / .2058 * scale);
  g.position.y = -.21 * g.scale.y;
  hold.add(g); hb.add(hold);
  if (hairMesh) { hairMesh.visible = ownHair; if (hairMesh.userData.outlineMesh) hairMesh.userData.outlineMesh.visible = ownHair; }
  hb.scale.multiplyScalar(HEAD_SCALE);
  return own;
}

export function disposeBoneco(own) { for (const o of own) o.dispose(); }
