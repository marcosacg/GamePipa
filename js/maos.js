// Câmeras novas: primeira pessoa e por cima do ombro.
//  - Primeira pessoa: aparecem as duas mãos (a esquerda segura o carretel, a direita passa a linha pelo dedo).
//    A câmera acompanha a pipa sozinha; arrastar na tela olha em volta e depois ela volta para a pipa.
//    Antes de soltar, a pipa aparece segurada na frente.
//  - Ombro: atrás da cabeça, um pouco para a direita, olhando para o alto (como filmar alguém soltando pipa).
// Também desenha a mira (primeira pessoa) e o marcador da pipa quando ela fica pequenininha lá longe.
import * as THREE from 'three';
import { S, G, keys } from './state.js';
import { SKINS } from './config.js';
import { scene, camera, groundH } from './scene.js';
import { toonMat, addOutline } from './materials.js';
import { makeSpool } from './player.js';
import { hangTail, isFail } from './kite.js';
// a física do lançamento pergunta daqui onde a pipa está segurada (sem importar este arquivo: evita ciclo)
G.hooks.kiteHold = (p, q) => heldPose(p, q);
import { clamp, lerpAngle } from './utils.js';

export const CAM_MODES = ['terceira', 'ombro', 'primeira'];
export const CAM_NAMES = { terceira: 'Câmera atrás do boneco', ombro: 'Câmera no ombro', primeira: 'Primeira pessoa' };
const EYE = 1.5;            // altura dos olhos (m)

/* ---------------- mãos ---------------- */
// mão "genérica": pulso na origem, dedos para -Z, palma para -Y, polegar para -X (direita) ou +X (esquerda)
function makeHand(skin, side) {
  const g = new THREE.Group(), parts = [];
  const add = (geo, parent) => { const m = new THREE.Mesh(geo, skin); m.castShadow = false; parent.add(m); parts.push(m); return m; };
  const palm = add(new THREE.BoxGeometry(.082, .03, .088), g); palm.position.z = -.046;
  palm.geometry.translate(0, 0, 0);
  const fingers = [];
  const mk = (x, l1, l2, r, z0 = -.09) => {
    const j1 = new THREE.Group(); j1.position.set(x, 0, z0); g.add(j1);
    const s1 = add(new THREE.CapsuleGeometry(r, l1, 3, 8), j1); s1.rotation.x = Math.PI / 2; s1.position.z = -l1 / 2;
    const j2 = new THREE.Group(); j2.position.z = -l1; j1.add(j2);
    const s2 = add(new THREE.CapsuleGeometry(r * .92, l2, 3, 8), j2); s2.rotation.x = Math.PI / 2; s2.position.z = -l2 / 2;
    const tip = new THREE.Object3D(); tip.position.z = -l2 - r; j2.add(tip);
    return { j1, j2, tip };
  };
  for (let i = 0; i < 4; i++) fingers.push(mk((-.03 + i * .02) * (side === 'R' ? 1 : -1), [.038, .042, .04, .032][i], [.03, .032, .03, .025][i], .0095));
  // polegar: sai da lateral da palma, apontando para a frente e para dentro
  const th = mk(side === 'R' ? -.045 : .045, .03, .028, .011, -.025);
  th.j1.rotation.y = side === 'R' ? .7 : -.7;
  // antebraço
  const arm = add(new THREE.CapsuleGeometry(.036, .34, 4, 10), g); arm.rotation.x = Math.PI / 2; arm.position.z = .19; arm.scale.set(1.05, .9, 1);
  for (const p of parts) addOutline(p, .0025);
  return { g, fingers, thumb: th, index: fingers[0] };
}
/** dobra os dedos (0 = esticado, 1 = fechado) */
function curl(f, a, b = a) { f.j1.rotation.x = -a * 1.35; f.j2.rotation.x = -b * 1.5; }

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** orienta a mão: dedos para F, costas da mão para B (tudo no espaço da câmera) */
function aim(hand, F, B) {
  _z.copy(F).normalize().negate();
  _y.copy(B).addScaledVector(_z, -B.dot(_z)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z); hand.g.quaternion.setFromRotationMatrix(_m);
}

let vm = null;
function skinColor(st) {
  if (!st) return SKINS[2];
  if (st.model === 'moleque' || st.model === 'boneco') return SKINS[st.skin] || SKINS[2];
  return { anime: '#f3cfb3', menino: '#e6b089', zepeto: '#f2c7a5', garoto: '#5b3a29' }[st.model] || SKINS[2];
}
function build() {
  if (vm) { camera.remove(vm.g); vm.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const st = S.style || {};
  const skin = toonMat({ color: skinColor(st), soft: true });
  const g = new THREE.Group(); g.name = 'maos';
  const R = makeHand(skin, 'R'), Lh = makeHand(skin, 'L');
  const spool = makeSpool(st.spool || 'lata'); spool.scale.setScalar(.95);
  const sm = []; spool.traverse(o => { if (o.isMesh) sm.push(o); });
  for (const o of sm) { o.castShadow = false; addOutline(o, .003); }
  g.add(R.g, Lh.g, spool);
  g.traverse(o => { o.frustumCulled = false; o.renderOrder = 2; });
  vm = { g, R, L: Lh, spool, key: st.model + '|' + st.skin + '|' + st.spool, spin: 0, lastL: S.L, pullPh: 0, sway: 0, kick: 0 };
  camera.add(g);
}

/* ---------------- câmera ---------------- */
let saved = 'terceira';
try { saved = localStorage.getItem('rabiola.camera') || 'terceira'; } catch { }
export const fp = { mode: CAM_MODES.includes(saved) ? saved : 'terceira', yaw: 0, pitch: .3, offY: 0, offP: 0, lastDrag: -9, zoom: false, fov: 68, bob: 0 };

export function cycleCamera() {
  fp.mode = CAM_MODES[(CAM_MODES.indexOf(fp.mode) + 1) % CAM_MODES.length];
  fp.offY = 0; fp.offP = 0; fp.zoom = false;
  try { localStorage.setItem('rabiola.camera', fp.mode); } catch { }
  return fp.mode;
}
/** arrastar na tela (câmeras novas): olha em volta; depois de um tempo ela volta pra pipa */
export function dragLook(dx, dy, k) {
  fp.offY = clamp(fp.offY - dx * .004 * k, -2.6, 2.6);
  fp.offP = clamp(fp.offP - dy * .0035 * k, -1.4, 1.4);
  fp.lastDrag = S.clock;
}
export function resetLook() { fp.offY = 0; fp.offP = 0; }

const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _cp = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/**
 * Atualiza a câmera das visões novas. Devolve o "yaw" (para onde andar).
 */
export function updateCam1(dt, shake) {
  const P = G.player, pos = P.g.position, kp = S.kitePos;
  if (!camera.parent) scene.add(camera); // as mãos são filhas da câmera: ela precisa estar na cena
  _eye.set(pos.x, pos.y + EYE, pos.z);
  const sp = P.vel.length();
  fp.bob += dt * (sp > .3 ? 6 + sp * 1.4 : 0);
  if (fp.mode === 'primeira') _eye.y += Math.sin(fp.bob * 2) * .025 * Math.min(1, sp / 3);

  // para onde olhar: a pipa (ou, com ela nas costas, para onde o vento leva)
  let ty, tp;
  if (S.state === 'costas' || S.state === 'arrebentou' && S.hideKite) { ty = Math.atan2(S.windDirH.x, S.windDirH.z); tp = .12; }
  else {
    _dir.subVectors(kp, _eye);
    ty = Math.atan2(_dir.x, _dir.z); tp = Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z));
  }
  tp = clamp(tp, -.6, 1.42);
  const kf = 1 - Math.exp(-(S.state === 'voando' ? 7 : 3) * dt); // segue a pipa de perto (ela é rápida)
  fp.yaw = lerpAngle(fp.yaw, ty, kf); fp.pitch += (tp - fp.pitch) * kf;
  if (S.clock - fp.lastDrag > 1.6) { const k = 1 - Math.exp(-1.6 * dt); fp.offY -= fp.offY * k; fp.offP -= fp.offP * k; } // volta a mirar na pipa
  const yaw = fp.yaw + fp.offY;
  // no ombro a câmera não olha tão pra cima: a pipa fica no alto da tela e a cabeça embaixo
  const pitch = fp.mode === 'ombro' ? clamp(fp.pitch - .3 + fp.offP, -.3, .85) : clamp(fp.pitch + fp.offP, -1.25, 1.5);
  _dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

  if (fp.mode === 'ombro') {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    _cp.set(_eye.x - fx * 1.35 + fz * .42, _eye.y - .02, _eye.z - fz * 1.35 - fx * .42); // atrás e à esquerda: o boneco fica embaixo, à direita
    _cp.y = Math.max(_cp.y, groundH(_cp.x, _cp.z) + .4);
    camera.position.lerp(_cp, 1 - Math.exp(-12 * dt));
  } else camera.position.copy(_eye);
  if (shake > 0) { const a = shake * .25; camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a; }
  camera.lookAt(_t.copy(camera.position).add(_dir));

  // zoom (roda do mouse ou Z): ajuda a ver a pipa lá longe
  const want = fp.zoom ? 32 : 70;
  fp.fov += (want - fp.fov) * (1 - Math.exp(-6 * dt));
  if (Math.abs(camera.fov - fp.fov) > .05) { camera.fov = fp.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);

  // o boneco some na primeira pessoa (a câmera está dentro da cabeça)
  P.g.visible = fp.mode !== 'primeira';
  updateHands(dt);
  return yaw;
}

/** volta ao normal (menu ou câmera de terceira pessoa) */
export function leaveCam1() {
  if (G.player) G.player.g.visible = true;
  if (vm) vm.g.visible = false;
  S.lineFrom = null; S.spoolFrom = null; S.fpHold = false;
}

/* ---------------- mãos (primeira pessoa) ---------------- */
const _F = new THREE.Vector3(), _B = new THREE.Vector3(), _lineDir = new THREE.Vector3(), _lf = new THREE.Vector3(), _sf = new THREE.Vector3();
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _inv = new THREE.Matrix4(), _ta = new THREE.Vector3();
function updateHands(dt) {
  const on = fp.mode === 'primeira' && S.running;
  if (!on) { if (vm) vm.g.visible = false; S.lineFrom = null; S.spoolFrom = null; S.fpHold = false; return; }
  const st = S.style || {};
  if (!vm || vm.key !== st.model + '|' + st.skin + '|' + st.spool) build();
  vm.g.visible = fp.fov > 48; // com zoom as mãos saem da frente
  const t = S.clock, flying = S.state === 'voando';
  const pulling = flying && S.pulling, giving = flying && !!keys.KeyS, reel = flying && !!keys.Space;
  const steer = flying ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0;
  const k = 1 - Math.exp(-10 * dt);

  // direção da linha no espaço da câmera (a mão direita aponta pra lá)
  _inv.copy(camera.matrixWorld).invert();
  _lineDir.copy(S.kitePos).applyMatrix4(_inv).normalize();

  // ---------- mão direita: a linha passa pelo indicador ----------
  if (pulling) vm.pullPh += dt * 4.2; else vm.pullPh += (Math.round(vm.pullPh / Math.PI) * Math.PI - vm.pullPh) * k; // puxadas seguidas
  const pull = pulling ? Math.max(0, Math.sin(vm.pullPh)) : 0;
  vm.sway += dt;
  const tense = clamp(S.tension / 30, 0, 1);
  const R = vm.R;
  _hp.set(.2 + steer * .05, -.2 + Math.sin(vm.sway * 1.3) * .006 - pull * .16 + (giving ? .03 : 0), -.46 - (giving ? .1 : 0) + pull * .16 - tense * .03);
  if (S.fpHold) _hp.set(.12, -.27, -.5);                              // segurando a pipa pra soltar
  R.g.position.lerp(_hp, k);
  _F.copy(_lineDir).lerp(_t.set(0, .25, -1), .45);
  if (S.fpHold || !flying) _F.set(-.15, .35, -1);
  _B.set(1, .35, .2);                                                 // costas da mão para fora: a palma olha para dentro
  aim(R, _F, _B);
  curl(R.index, giving ? .05 : .15, giving ? .05 : .25);              // indicador quase esticado (a linha passa nele)
  for (let i = 1; i < 4; i++) curl(R.fingers[i], .85 + pull * .1, .9);
  curl(R.thumb, .35, .4);

  // ---------- mão esquerda: carretel ----------
  const Lh = vm.L;
  _hp.set(-.27 - steer * .015, -.31 + Math.sin(vm.sway * 1.1 + 1) * .005 + (reel ? Math.sin(t * 18) * .006 : 0), -.5);
  Lh.g.position.lerp(_hp, k);
  aim(Lh, _t.set(.42, .12, -1), _B.set(-.15, -1, .1));               // palma pra cima, dedos para a frente e para dentro
  for (let i = 0; i < 4; i++) curl(Lh.fingers[i], .95, 1.05);
  curl(Lh.thumb, .2, .3);
  // o carretel fica em cima da palma, com o eixo de lado; gira quando a linha sai ou entra
  const dL = S.L - vm.lastL; vm.lastL = S.L;
  vm.spin += clamp(dL, -2, 2) / .11;
  vm.spool.position.copy(Lh.g.position).add(_t.set(.03, .08, -.07));
  _e.set(-.15, 1.0, 0, 'YXZ'); vm.spool.quaternion.setFromEuler(_e); // eixo de lado: a boca do carretel olha pra direita
  vm.spool.rotateZ(vm.spin);

  // de onde a linha sai (topo do carretel) e por onde ela passa (ponta do indicador): em coordenadas do mundo
  vm.g.updateMatrixWorld(true);
  R.index.tip.getWorldPosition(_lf);
  vm.spool.localToWorld(_sf.set(0, .1, 0));
  S.lineFrom = S.lineFrom || new THREE.Vector3(); S.lineFrom.copy(_lf);
  S.spoolFrom = S.spoolFrom || new THREE.Vector3(); S.spoolFrom.copy(_sf);

  // pipa nas costas: na primeira pessoa ela aparece segurada na frente, pronta pra soltar
  S.fpHold = S.state === 'costas';
  if (S.fpHold && G.kite) holdKite();
}

/** pose da pipa segurada na frente da câmera (também usada pela física, para o lançamento sair daqui) */
export function heldPose(outP, outQ) {
  outP.set(.02, .02, -1.05).applyMatrix4(camera.matrixWorld);
  outQ.copy(camera.quaternion).multiply(_hq.setFromEuler(_e.set(-.12, 0, .05)));
  return outP;
}
const _ba = new THREE.Vector3();
function holdKite() {
  const k = G.kite;
  heldPose(k.mesh.position, k.mesh.quaternion);
  k.mesh.scale.setScalar(.78);
  if (k.links.length) {
    _ba.set(0, k.bottom * .78, 0).applyQuaternion(k.mesh.quaternion).add(k.mesh.position);
    hangTail(k.pts, _ba, fp.yaw, k.links.length, S.clock, G.player.g.position.y);
    k.tail.update(k.pts, S.clock, S.windDirH);
  }
}

/* ---------------- mira e marcador da pipa ---------------- */
let mira = null, mark = null;
const _pr = new THREE.Vector3();
export function updateCamHud() {
  if (!mira) {
    mira = document.createElement('div'); mira.id = 'mira'; document.body.appendChild(mira);
    mark = document.createElement('div'); mark.id = 'kiteMark'; document.body.appendChild(mark);
  }
  const playing = S.running && !S.paused;
  mira.style.display = playing && fp.mode === 'primeira' ? 'block' : 'none';
  // marcador: a pipa está tão longe que vira um pontinho
  const far = playing && S.state === 'voando' && !S.hideKite && camera.position.distanceTo(S.kitePos) > 45;
  if (far) {
    _pr.copy(S.kitePos).project(camera);
    const vis = _pr.z < 1 && Math.abs(_pr.x) < 1.05 && Math.abs(_pr.y) < 1.05;
    mark.style.display = vis ? 'block' : 'none';
    if (vis) mark.style.transform = `translate(${((_pr.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - _pr.y) / 2 * innerHeight).toFixed(1)}px)`;
    mark.classList.toggle('perigo', isFail(S.state) || S.overT > .2);
  } else mark.style.display = 'none';
}
