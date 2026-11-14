// Regras do jogo: jogador, câmera, missões, argolas, avoadas e disputa
import * as THREE from 'three';
import { S, G, keys } from './state.js';
import { MISSIONS, KITES, getPatterns, MAX_LINE, MIN_LINE, G_STRAY, G_GROUND, G_STATIC, H, DISPUTA_WIND } from './config.js';
import { clamp, lerp, rand, lerpAngle, segDist } from './utils.js';
import { windState } from './shared/wind.js';
import { PH, makeBody, removeBody, getPos, getVel, setPos, setVel, force, UP } from './physics.js';
import { scene, camera, renderer, groundH, trees, SCN, collideWalk } from './scene.js';
import { makeKiteMesh, buildKite, resetKite, windAt, failKite, lineObj, putOnBack, isFail } from './kite.js';
import { makeCharacter, disposeCharacter, poseCharacter, poseAngry } from './player.js';
import { RemoteView, StrayView } from './remote.js';
import { Snd } from './audio.js';
import { toast, $ } from './hud.js';
import { burst, coil, clearFx } from './fx.js';
import { RESPAWN } from './config.js';
import { Ads } from './platform.js';
import { startAparada, clearAparadas } from './aparada.js';

/* =========================================================
   Vento
   ========================================================= */
const _ws = {};
export function updateWind() {
  const t = G.session ? G.session.time() : S.clock;
  windState(t, S.windBase, S.gustAmp, _ws);
  S.windSpeed = _ws.speed; S.windDir = _ws.dir;
  S.windDirH.set(_ws.dx, 0, _ws.dz);
  S.windVec.copy(S.windDirH).multiplyScalar(S.windSpeed);
}

/* =========================================================
   Personagem local
   ========================================================= */
export function setPlayerStyle(style) {
  const old = G.player;
  const c = makeCharacter(style);
  if (old) { c.g.position.copy(old.g.position); c.yaw = old.yaw; disposeCharacter(old); c.pop = 1; } // pop = pulinho ao trocar a roupa
  scene.add(c.g);
  G.player = c;
  S.style = c.style;
}
export function setKite(type, pat) {
  S.kiteType = KITES[type] ? type : 'pipa';
  S.patIdx = clamp(pat | 0, 0, getPatterns(S.kiteType).length - 1);
  buildKite();
  if (S.running) putOnBack(); else resetKite();
}

const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _mv = new THREE.Vector3(), _sh = new THREE.Vector3(), _ad = new THREE.Vector3(), _tmp = new THREE.Vector3();
export const cam = { shake: 0, yawSm: Math.PI, yawOff: 0, pitch: .14, dist: 7, autoD: 7, fovS: 62, lookP: .3, look: new THREE.Vector3(0, 6, 0), drag: false, yaw: Math.PI, menuView: 'jogar', orbit: 0, spin: -.35, spinV: 0 };
/** ângulo de onde a câmera do menu olha o personagem (vista "Personagem") */
const MENU_CHAR_A = Math.PI + .5;

export function updatePlayer(dt) {
  const P = G.player, pos = P.g.position, kp = S.kitePos;
  const tx = kp.x - pos.x, tz = kp.z - pos.z;
  const menuChar = !S.running && cam.menuView === 'personagem';
  if (menuChar) {
    // de frente para a câmera; arrastar gira o boneco (com inércia) e depois ele volta a ficar de 3/4
    if (!cam.drag) { cam.spin += cam.spinV * dt; cam.spinV *= Math.exp(-3 * dt); if (Math.abs(cam.spinV) < .4) cam.spin += (-.35 - cam.spin) * (1 - Math.exp(-.8 * dt)); }
    P.yaw = lerpAngle(P.yaw, MENU_CHAR_A + cam.spin, 1 - Math.exp(-(cam.drag ? 20 : 8) * dt));
  }
  else if (S.state === 'costas') {
    const sp = P.vel.length();
    const target = sp > .4 ? Math.atan2(P.vel.x, P.vel.z) : Math.atan2(S.windDirH.x, S.windDirH.z);
    P.yaw = lerpAngle(P.yaw, target, 1 - Math.exp(-(sp > .4 ? 10 : 2) * dt));
  }
  else if (tx * tx + tz * tz > .25) P.yaw = lerpAngle(P.yaw, Math.atan2(tx, tz), 1 - Math.exp(-6 * dt));
  P.g.rotation.y = P.yaw;
  if (P.pop > 0) { // pulinho elástico ao trocar o visual
    P.pop = Math.max(0, P.pop - dt * 2.6);
    const k = Math.sin((1 - P.pop) * Math.PI * 3) * P.pop * .09;
    P.g.scale.set(1 - k * .6, 1 + k, 1 - k * .6);
  }

  let mx = 0, mz = 0;
  if (S.running) {
    if (keys.ArrowUp) mz += 1; if (keys.ArrowDown) mz -= 1;
    if (keys.ArrowLeft) mx -= 1; if (keys.ArrowRight) mx += 1;
  }
  // joystick do celular (analógico): quanto mais empurra, mais rápido; no fim do curso, corre
  const joyMag = Math.hypot(S.joy.x, S.joy.y);
  if (S.running && joyMag > .12) { mx = S.joy.x; mz = S.joy.y; }
  _fw.set(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
  _rt.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  _mv.set(0, 0, 0).addScaledVector(_fw, mz).addScaledVector(_rt, mx);
  const spd = (keys.ShiftLeft || keys.ShiftRight || joyMag > .92) ? 6.2 : 3.4;
  if (_mv.lengthSq() > 0) _mv.normalize().multiplyScalar(spd * (joyMag > .12 ? Math.min(1, joyMag * 1.15) : 1));
  P.vel.lerp(_mv, 1 - Math.exp(-10 * dt));
  pos.addScaledVector(P.vel, dt);
  collideWalk(pos, .45);
  pos.x = clamp(pos.x, SCN.walk.x0, SCN.walk.x1); pos.z = clamp(pos.z, SCN.walk.z0, SCN.walk.z1);
  pos.y = groundH(pos.x, pos.z);

  // braço da linha aponta pra pipa
  P.g.updateMatrixWorld(true);
  P.armR.getWorldPosition(_sh);
  _fw.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  if (S.state === 'costas') _ad.copy(_fw).multiplyScalar(.35).add(_tmp.set(0, -.9, 0)); // braço solto, pipa nas costas
  else { _ad.subVectors(kp, _sh).normalize().multiplyScalar(.6); _ad.addScaledVector(_fw, .45).add(_tmp.set(0, -.35, 0)); }
  if (S.pulling) _ad.addScaledVector(_fw, -.9).add(_tmp.set(0, .9, 0));
  _ad.normalize();
  S.hand.copy(_sh).addScaledVector(_ad, .58);
  poseCharacter(P, dt, P.vel.length(), S.hand);
  const angry = S.running && isFail(S.state);
  poseAngry(P, dt, S.clock, angry);
  if (P.angry > .02) { P.g.updateMatrixWorld(true); P.armR.localToWorld(S.hand.set(0, 0, .58)); }
  P.spool.getWorldPosition(S.spoolPos);

  // chutar a bola
  P.kickCd -= dt;
  if (G.ball && P.kickCd <= 0) {
    getPos(G.ball, _tmp);
    const sp = P.vel.length();
    if (Math.hypot(_tmp.x - pos.x, _tmp.z - pos.z) < .6 && sp > .8) {
      const k = P.vel.clone().normalize().multiplyScalar(1.6 + sp * .35); k.y = .9 + sp * .15;
      PH.TV.setValue(k.x, k.y, k.z); G.ball.applyCentralImpulse(PH.TV); G.ball.activate();
      P.kickCd = .45; Snd.beep(180, .06, 'square', .08);
    }
  }
}

export function updateCamera(dt) {
  const pos = G.player.g.position, kp = S.kitePos;
  if (!S.running) {
    if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); cam.fovS = 62; }
    cam.orbit += dt * .06;
    if (cam.menuView === 'personagem') {
      // close no personagem, deslocado para a direita da tela (o menu fica à esquerda)
      // personagem de frente, no lado direito da tela (o menu ocupa a esquerda)
      const a = MENU_CHAR_A, narrow = innerWidth < 760;
      const D = narrow ? 4.4 : 3.5;
      _tmp.set(pos.x + Math.sin(a) * D, pos.y + 1.45, pos.z + Math.cos(a) * D);
      camera.position.lerp(_tmp, 1 - Math.exp(-4.5 * dt));
      _rt.set(Math.cos(a), 0, -Math.sin(a)); // direita da tela, vista da câmera
      cam.look.lerp(_ad.set(pos.x, pos.y + 1.0, pos.z).addScaledVector(_rt, narrow ? 0 : -1.05), 1 - Math.exp(-5.5 * dt));
    } else if (cam.menuView === 'pipa') {
      _tmp.copy(kp).addScaledVector(S.windDirH, -6); _tmp.y = kp.y - 1;
      camera.position.lerp(_tmp, 1 - Math.exp(-3 * dt));
      _rt.set(-S.windDirH.z, 0, S.windDirH.x);
      cam.look.lerp(_ad.copy(kp).addScaledVector(_rt, 2.2), 1 - Math.exp(-4 * dt));
    } else {
      const t = cam.orbit;
      const R = SCN.menuOrbit || 16; // na laje a câmera gira mais perto (senão entra na casa do vizinho)
      _tmp.set(pos.x + Math.sin(t) * R, pos.y + 4.5 + Math.sin(t * .7) * 1.5, pos.z + Math.cos(t) * R);
      _tmp.y = Math.max(_tmp.y, groundH(_tmp.x, _tmp.z) + 2.2);
      camera.position.lerp(_tmp, 1 - Math.exp(-2 * dt));
      cam.look.lerp(_ad.copy(kp).lerp(pos, .45), 1 - Math.exp(-3 * dt));
    }
    camera.lookAt(cam.look);
    return;
  }
  const tx = kp.x - pos.x, tz = kp.z - pos.z;
  const carrying = S.state === 'costas';
  if (carrying) cam.yawSm = lerpAngle(cam.yawSm, Math.atan2(S.windDirH.x, S.windDirH.z), 1 - Math.exp(-1.5 * dt));
  else if (tx * tx + tz * tz > 4) cam.yawSm = lerpAngle(cam.yawSm, Math.atan2(tx, tz), 1 - Math.exp(-2.5 * dt));
  cam.yaw = cam.yawSm + cam.yawOff;
  _fw.set(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));

  /*
    Terceira pessoa que enquadra o boneco E a pipa:
    a câmera fica atrás do boneco, na linha boneco→pipa, e escolhe a inclinação para o boneco
    ficar embaixo e a pipa em cima. Se não couber, ela recua e abre um pouco o ângulo.
  */
  const DEG = Math.PI / 180, BASE_FOV = 62;
  if (carrying) _ad.copy(pos).addScaledVector(_fw, 10).setY(pos.y + 6); // nas costas: olha pra onde a pipa vai subir
  else _ad.copy(kp);
  let D = cam.dist, fov = BASE_FOV, look = cam.pitch;
  for (let it = 0; it < 40; it++) {
    const camY = pos.y + 1.7 + D * Math.sin(cam.pitch), back = D * Math.cos(cam.pitch);
    const ahead = Math.max(1, (_ad.x - pos.x) * _fw.x + (_ad.z - pos.z) * _fw.z + back);
    const aK = Math.atan2(_ad.y + 1.2 - camY, ahead);   // topo da pipa (com folga)
    const aF = Math.atan2(pos.y - .1 - camY, back);     // pés do boneco
    const room = fov * DEG * .82;
    if (aK - aF < room || it === 39) {
      // centraliza os dois, mas sem deixar o boneco cair pra fora da parte de baixo
      look = Math.min((aK + aF) / 2, aF + fov * DEG * .42);
      break;
    }
    // primeiro abre um pouco o ângulo (o boneco continua grande), depois recua
    if (fov < 72) fov += 2; else if (D < 18) D += .75; else if (fov < 78) fov += 2; else { look = aF + fov * DEG * .42; break; }
  }
  const k1 = 1 - Math.exp(-2.2 * dt);
  cam.autoD += (D - cam.autoD) * k1;
  cam.fovS += (fov - cam.fovS) * k1;
  cam.lookP += (look - cam.lookP) * (1 - Math.exp(-4 * dt));
  if (Math.abs(camera.fov - cam.fovS) > .05) { camera.fov = cam.fovS; camera.updateProjectionMatrix(); }

  _tmp.copy(pos).addScaledVector(_fw, -cam.autoD * Math.cos(cam.pitch)); _tmp.y = pos.y + 1.7 + cam.autoD * Math.sin(cam.pitch);
  _tmp.y = Math.max(_tmp.y, groundH(_tmp.x, _tmp.z) + .5);
  camera.position.lerp(_tmp, 1 - Math.exp(-8 * dt));
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt);
    const a = cam.shake * .25;
    camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a;
  }
  // olha na direção escolhida (boneco embaixo, pipa em cima)
  cam.look.copy(camera.position).addScaledVector(_fw, 10 * Math.cos(cam.lookP));
  cam.look.y += 10 * Math.sin(cam.lookP);
  camera.lookAt(cam.look);
}

let dragId = null, dragX = 0, dragY = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  if (dragId !== null) return; // um dedo só gira a câmera
  dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; cam.drag = true;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch { }
});
const endDrag = e => { if (e.pointerId === dragId) { dragId = null; cam.drag = false; } };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - dragX, dy = e.clientY - dragY; dragX = e.clientX; dragY = e.clientY;
  if (!S.running) { // no menu: arrastar gira o personagem
    if (cam.menuView === 'personagem') { cam.spin += dx * .012; const ms = clamp(e.timeStamp - (cam._t || 0), 8, 120); cam._t = e.timeStamp; cam.spinV = clamp(dx * .012 / (ms / 1000), -10, 10) * .5; }
    return;
  }
  const k = e.pointerType === 'touch' ? 1.6 : 1;
  cam.yawOff = clamp(cam.yawOff - dx * .004 * k, -1.4, 1.4);
  cam.pitch = clamp(cam.pitch + dy * .003 * k, -.02, .7);
});
renderer.domElement.addEventListener('wheel', e => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * .7, 3.5, 16); }, { passive: true });
renderer.domElement.addEventListener('dblclick', () => { cam.yawOff = 0; cam.pitch = .14; });

/* =========================================================
   Falhas da pipa
   ========================================================= */
G.hooks.onFail = (kind, msg, sub) => {
  if (kind !== 'lacada') { toast(msg, sub, 'bad', 2.4); Snd.fail(); }
  const m = curMission();
  if (m && !S.missionDone && (m.type === 'linha' || m.type === 'ventania')) S.mp = 0;
};

/* =========================================================
   Argolas e avoadas (modos livre e desafios)
   ========================================================= */
const ringGeo = new THREE.TorusGeometry(2.6, .2, 6, 18);
const ringMat = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: .7, flatShading: true });
const discMat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false });

function spawnRing(minH = 0) {
  const P = G.player.g.position;
  const dirH = S.windDirH.clone().applyAxisAngle(UP, rand(-.75, .75));
  let r = rand(30, 65), e = rand(.45, 1.0);
  if (minH) { r = rand(58, 85); e = Math.max(e, Math.asin(Math.min(.95, (minH + 3) / r))); }
  const pos = new THREE.Vector3().copy(P).addScaledVector(dirH, Math.cos(e) * r);
  pos.y = Math.max(P.y + Math.max(12, Math.sin(e) * r + 1.3), groundH(pos.x, pos.z) + 11); // nunca dentro das casas
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(new THREE.CircleGeometry(2.5, 18), discMat));
  g.position.copy(pos);
  scene.add(g);
  S.rings.push({ g, pos, age: 0, high: minH > 0 });
}
function clearRings() { for (const r of S.rings) scene.remove(r.g); S.rings.length = 0; }

const KT = Object.keys(KITES);
/** a minha linha, enquanto a pipa está voando (a aparada fica pendurada nela) */
const myLine = () => (S.running && S.state === 'voando' && lineObj.visible ? lineObj : null);
/** a linha de um jogador (eu ou outro), para pendurar a pipa aparada */
function lineOf(ss, who, me) {
  if (who === me) return myLine;
  return () => {
    const r = G.remotes.get(who), st = ss.others.get(who)?.state;
    return r && r.line.visible && st && st.flying ? r.line : null;
  };
}

/* Rabiola presa + linhas encostando: quem teve a rabiola pega perdeu na hora. A pipa dele não vira
   avoada: fica 6 s pendurada pela rabiola na linha de quem ganhou, e só então vem o aviso de "Aparou!". */
function duelAparada(ss, e, me) {
  const lv = G.remotes.get(e.loser);
  if (lv) lv.markLost();                       // a pipa dele some do céu (agora está pendurada)
  const won = e.winner === me, lost = e.loser === me;
  if (lost) failKite('lacada');                // a minha some e vou para a espera
  if (won || lost) { cam.shake = .5; flashDuel(); Snd.tangle(); }
  if (e.x) burst(new THREE.Vector3().fromArray(e.x), '#ffffff', 'PEGOU NA RABIOLA!');
  const kite = e.kite || { type: 'pipa', pat: 0 };
  const from = e.k ? new THREE.Vector3().fromArray(e.k) : new THREE.Vector3().fromArray(e.x || [0, 20, 0]);
  const wName = ss.nameOf(e.winner), lName = ss.nameOf(e.loser);
  startAparada({
    kite, from, line: lineOf(ss, e.winner, me),
    onArrive: p => {
      if (!S.running || G.session !== ss) return;
      burst(p.setY(p.y + .8), '#06d6a0', won ? 'APAROU! +150' : wName + ' aparou');
      if (won) { toast('Aparou a pipa de ' + lName + '!', 'Pegou na rabiola e na linha · +150', 'good', 2.6); Snd.win(); Snd.ring(1.5); }
      else if (lost) { toast(wName + ' aparou sua pipa!', 'Sua rabiola enroscou na linha dele', 'bad', 2.6); Snd.fail(); }
      else toast(wName + ' aparou a pipa de ' + lName, '', '', 1.8);
    },
  });
}
function spawnStray() {
  const A = PH.A, P = G.player.g.position;
  const side = new THREE.Vector3(-S.windDirH.z, 0, S.windDirH.x);
  const p = new THREE.Vector3().copy(P).addScaledVector(S.windDirH, -55).addScaledVector(side, rand(-22, 22));
  p.y = Math.max(P.y + rand(26, 46), groundH(p.x, p.z) + 18);
  const type = KT[Math.floor(Math.random() * KT.length)];
  const pat = Math.floor(Math.random() * getPatterns(type).length);
  const st = { age: 0, ph: Math.random() * 10, caught: false, catchT: 0, stuck: false, stuckT: 0, dead: false, offset: new THREE.Vector3() };
  st.body = makeBody(new A.btBoxShape(new A.btVector3(.35, .45, .05)), .2, p, null, G_STRAY, G_GROUND | G_STATIC, { type: 'stray', ref: st });
  st.body.setGravity(new A.btVector3(0, 0, 0));
  st.body.setDamping(.1, .9); st.body.setActivationState(4);
  st.body.setAngularFactor(new A.btVector3(0, 0, 0));
  st.kite = { type, pat };
  st.view = new StrayView(st.kite);
  S.strays.push(st);
  toast('Pipa avoada!', 'Vem vindo do alto, pelas costas. Apare com a linha!', 'good', 2.2);
}
function removeStray(st) { removeBody(st.body); st.view.dispose(); }
function clearStrays() { for (const s of S.strays) removeStray(s); S.strays.length = 0; }

const _sp = new THREE.Vector3(), _sv = new THREE.Vector3(), _sf = new THREE.Vector3(), _sw = new THREE.Vector3();
/** forças nas avoadas (chamado a cada passo de física) */
export function strayForces() {
  for (const st of S.strays) {
    if (st.caught) { _sp.copy(S.kitePos).add(st.offset); setPos(st.body, _sp); setVel(st.body, _sv.set(0, 0, 0)); continue; }
    getPos(st.body, _sp); getVel(st.body, _sv);
    windAt(_sp, _sw);
    _sf.copy(_sw).multiplyScalar(.85); _sf.y -= .9;
    _sf.x += Math.sin(S.clock * 1.3 + st.ph) * 1.2;
    _sf.sub(_sv).multiplyScalar(.32);
    force(st.body, _sf);
  }
}

/* =========================================================
   Missões
   ========================================================= */
function curMission() { return S.mode === 'desafios' ? MISSIONS[S.mi] : null; }
function wantRings() { const m = curMission(); return S.mode === 'livre' || (m && !S.missionDone && (m.type === 'argolas' || m.type === 'argolasAltas')); }
function wantStrays() { const m = curMission(); return S.mode === 'livre' || (m && !S.missionDone && m.type === 'aparar'); }

function onMissionStart() {
  const m = curMission();
  clearRings(); clearStrays();
  S.windBase = 5.8; S.gustAmp = .35;
  S.ringTimer = 1.5; S.strayTimer = 4;
  if (m && m.type === 'ventania') { S.windBase = 7.2; S.gustAmp = .8; }
  if (m) toast(m.title, m.desc, 'good', 3.5);
}
function completeMission() {
  const m = curMission();
  S.score += 300; S.missionDone = true; S.missionDelay = 2.8;
  toast('Missão cumprida!', m.title + ' +300', 'good', 2.6);
  Snd.win(); Ads.happy();
  clearRings(); clearStrays();
}

/* =========================================================
   Lógica por quadro
   ========================================================= */
export function updateLogic(dt) {
  const kp = S.kitePos;
  if (S.running && S.state === 'voando') {
    S.pulling = !!keys.KeyW;
    if (keys.KeyS) S.L = Math.min(MAX_LINE, S.L + Math.min(6, .8 + S.rawT * 1.5) * dt); // a linha corre na mão conforme a pipa puxa
    if (keys.Space) S.L = Math.max(MIN_LINE, S.L - 7 * dt);
    if (S.pulling) S.L = Math.max(MIN_LINE, S.L - 3.2 * dt);
  } else S.pulling = false;
  S.stamina = S.pulling ? Math.max(0, S.stamina - .4 * dt) : Math.min(1, S.stamina + .25 * dt);
  // sacudida: trocar A/D rápido (vale para soltar a rabiola presa)
  const steer = S.running ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0;
  if (steer && S.lastSteer && steer !== S.lastSteer) S.shakeT = .6;
  if (steer) S.lastSteer = steer;
  S.shakeT = Math.max(0, S.shakeT - dt);

  if (S.state !== 'voando') S.stateTimer += dt;
  if (isFail(S.state) && S.stateTimer > RESPAWN) { if (S.running) putOnBack(); else resetKite(); }

  if (S.mode === 'disputa' || S.mode === 'online') { updateDisputa(dt); return; }

  if (S.running && S.state === 'voando' && kp.y > 10) { S.scoreFrac += dt * (1 + kp.y / 25); if (S.scoreFrac >= 1) { S.score += Math.floor(S.scoreFrac); S.scoreFrac %= 1; } }

  const m = curMission();
  if (S.running && m) {
    if (S.missionDone) {
      S.missionDelay -= dt;
      if (S.missionDelay <= 0) {
        S.mi++; S.mp = 0; S.missionDone = false;
        if (S.mi >= MISSIONS.length) endGame(true); else onMissionStart();
      }
    } else {
      if (m.type === 'altura' && S.state === 'voando') S.mp = Math.max(S.mp, kp.y);
      if (m.type === 'linha' && S.state === 'voando' && S.L >= 60) S.mp += dt;
      if (m.type === 'ventania' && S.state === 'voando') S.mp += dt;
      if (S.mp >= m.goal) completeMission();
    }
  }

  if (S.running && wantRings() && !S.rings.length) {
    S.ringTimer -= dt;
    if (S.ringTimer <= 0) { spawnRing(m && m.type === 'argolasAltas' ? 45 : 0); S.ringTimer = 1.2; }
  }
  for (let i = S.rings.length - 1; i >= 0; i--) {
    const r = S.rings[i];
    r.age += dt;
    r.g.lookAt(G.player.g.position.x, 1.5, G.player.g.position.z);
    r.g.children[0].rotation.z += dt * .8;
    r.g.scale.setScalar(1 + Math.sin(r.age * 4) * .05);
    if (S.state === 'voando' && kp.distanceTo(r.pos) < 2.9) {
      scene.remove(r.g); S.rings.splice(i, 1);
      const pts = r.high ? 150 : 100; S.score += pts;
      burst(r.pos, '#ffd166', 'ARGOLA! +' + pts);
      toast('Argola!', '+' + pts, 'good', 1.3); Snd.ring();
      if (m && !S.missionDone && (m.type === 'argolas' || (m.type === 'argolasAltas' && r.high))) S.mp++;
      if (m && S.mp >= m.goal && !S.missionDone) completeMission();
    } else if (r.age > 45) { scene.remove(r.g); S.rings.splice(i, 1); }
  }

  if (S.running && wantStrays()) {
    S.strayTimer -= dt;
    const max = S.mode === 'livre' ? 2 : 3;
    if (S.strayTimer <= 0 && S.strays.length < max) { spawnStray(); S.strayTimer = S.mode === 'livre' ? rand(18, 30) : rand(8, 12); }
  }
  for (let i = S.strays.length - 1; i >= 0; i--) {
    const st = S.strays[i];
    st.age += dt;
    getPos(st.body, _tmp);
    st.view.set([_tmp.x, _tmp.y, _tmp.z]);
    st.view.update(dt, S.clock, S.windDirH);
    if (S.state === 'voando' && (segDist(_tmp, S.hand, kp) < 1.7 || _tmp.distanceTo(kp) < 2.6)) {
      // encostou: a avoada gruda na minha linha e fica pendurada 6 s; depois vem o aviso e os pontos
      const kite = st.kite, from = _tmp.clone();
      removeStray(st); S.strays.splice(i, 1);
      Snd.beep(660, .12, 'triangle', .15);
      startAparada({
        kite, from, line: myLine,
        onArrive: p => {
          if (!S.running) return;
          burst(p.setY(p.y + .8), '#06d6a0', 'APAROU! +150');
          S.score += 150; toast('Aparou!', 'Pipa nova pra coleção. +150', 'good', 1.8); Snd.ring(); Snd.ring(1.5);
          const mm = curMission();
          if (mm && !S.missionDone && mm.type === 'aparar') { S.mp++; if (S.mp >= mm.goal) completeMission(); }
        },
        onDrop: () => { if (S.running) toast('A aparada caiu!', 'Sua linha soltou antes dela chegar', 'bad', 1.6); },
      });
    } else {
      if (st.stuck) st.stuckT += dt;
      if (st.dead || st.stuckT > 4 || st.age > 75 || _tmp.y < .7) { removeStray(st); S.strays.splice(i, 1); }
    }
  }

  if (S.running && S.mode === 'desafios' && S.minutes >= 19 * 60 && !S.ended) endGame(false);
}

/* =========================================================
   Disputa (bots ou online)
   ========================================================= */
function localNetState() {
  const P = G.player, p = P.g.position, h = S.hand, k = S.kitePos, q = S.kiteQ;
  const r = v => Math.round(v * 100) / 100;
  return {
    pos: [r(p.x), r(p.y), r(p.z)], yaw: r(P.yaw), mv: r(P.vel.length()),
    hand: [r(h.x), r(h.y), r(h.z)], k: [r(k.x), r(k.y), r(k.z)], q: [q.x, q.y, q.z, q.w].map(v => Math.round(v * 1000) / 1000),
    L: r(S.L), T: r(S.tension), breakN: G.kite.kt.breakN, st: S.hideKite ? 'arrebentou' : S.state,
    flying: S.state === 'voando', pull: S.pulling, give: !!keys.KeyS && S.state === 'voando', sta: r(S.stamina),
    n: G.kite.links.length, shake: S.shakeT > 0,
    te: G.kite.links.length ? (() => { const e = G.kite.pts[G.kite.pts.length - 1]; return [r(e.x), r(e.y), r(e.z)]; })() : null,
  };
}

const _dx = new THREE.Vector3();
function updateDisputa(dt) {
  const ss = G.session;
  if (!ss) return;
  ss.sendState(localNetState());
  ss.update(dt);

  for (const e of ss.drainEvents()) handleEvent(ss, e);

  // jogadores
  for (const [id, o] of ss.others) {
    if (!o.state) continue;
    let v = G.remotes.get(id);
    if (!v) { v = new RemoteView(id, o.meta); G.remotes.set(id, v); }
    v.apply(o.state);
  }
  for (const [id, v] of G.remotes) if (!ss.others.has(id)) { v.dispose(); G.remotes.delete(id); }
  const t = ss.time();
  for (const [id, v] of G.remotes) {
    const d = ss.duels.find(x => x.a === id || x.b === id);
    const victim = d && d.kind === 'rabiola' && d.att !== id;
    // quem teve a rabiola presa: linha reta, rabiola puxada; os outros: linha dobrada no ponto
    v.update(dt, t, S.windDirH, d && !victim ? _dx.fromArray(d.x).clone() : null, victim ? _dx.fromArray(d.x).clone() : null, d ? (d.f || 0) : 1);
  }

  // avoadas da arena
  const seen = new Set();
  for (const s of ss.strays) {
    seen.add(s.id);
    let v = G.strayViews.get(s.id);
    if (!v) { v = new StrayView(s.kite); G.strayViews.set(s.id, v); }
    v.set(s.p);
    v.update(dt, t, S.windDirH);
  }
  for (const [id, v] of G.strayViews) if (!seen.has(id)) { v.dispose(); G.strayViews.delete(id); }

  // animação: rabiola enrolada na linha de quem pegou
  for (const d of ss.duels) {
    if (d.kind !== 'rabiola' || !d.att) continue;
    const vic = d.att === d.a ? d.b : d.a;
    let a, b;
    if (d.att === ss.myId) { if (S.state !== 'voando') continue; a = S.hand; b = S.kitePos; }
    else { const v = G.remotes.get(d.att); if (!v) continue; a = v.hand; b = v.k; }
    const kite = vic === ss.myId ? { type: S.kiteType, pat: S.patIdx } : ss.others.get(vic)?.meta.kite;
    const vs = vic === ss.myId ? { shake: S.shakeT > 0 } : ss.others.get(vic)?.state;
    if (S.fxTail) coil(d.a + '|' + d.b, a, b, _dx.fromArray(d.x), tailColor(kite), !!(vs && vs.shake));
  }

  // minha enroscada
  const mine = ss.duels.find(x => x.a === ss.myId || x.b === ss.myId);
  const iAmVictim = mine && mine.kind === 'rabiola' && mine.att !== ss.myId;
  if (mine && S.state === 'voando' && !iAmVictim) { if (!S.duelX) S.duelX = new THREE.Vector3(); S.duelX.lerp(_dx.fromArray(mine.x), S.duelX.lengthSq() ? .3 : 1); }
  else S.duelX = null;
  if (iAmVictim && S.state === 'voando') { if (!S.tailTug) S.tailTug = new THREE.Vector3().fromArray(mine.x); else S.tailTug.lerp(_dx.fromArray(mine.x), .3); S.tailF = mine.f || 0; }
  else S.tailTug = null;
  S.lineLoad = !!(mine && mine.att === ss.myId && S.state === 'voando');
}

function tailColor(kite) {
  if (!kite || !KITES[kite.type]) return '#ffffff';
  const p = getPatterns(kite.type)[kite.pat] || getPatterns(kite.type)[0];
  return KITES[kite.type].tailStyle === 'fitas' && p.fitas ? p.fitas[0] : p.c[0];
}
function kitePosOf(ss, id) {
  if (id === ss.myId) return S.kitePos.clone();
  const v = G.remotes.get(id);
  return v ? v.k.clone() : null;
}
function flashDuel() {
  const el = $('duel');
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

function handleEvent(ss, e) {
  const me = ss.myId;
  switch (e.type) {
    case 'duelStart':
      if (e.x && (e.kind !== 'rabiola' || S.fxTail)) burst(new THREE.Vector3().fromArray(e.x), e.kind === 'rabiola' ? '#ffd166' : '#ffffff', e.kind === 'rabiola' ? 'ENROSCOU NA RABIOLA!' : 'ENROSCOU!', e.kind === 'rabiola');
      if (e.a === me || e.b === me) {
        cam.shake = .35; flashDuel();
        const other = ss.nameOf(e.a === me ? e.b : e.a);
        if (e.kind === 'rabiola' && e.att === me) toast('Prendeu a rabiola de ' + other + '!', 'Encoste a sua linha na dele: ele perde na hora e você apara', 'good', 2.6);
        else if (e.kind === 'rabiola') toast('Sua rabiola prendeu na linha de ' + other + '!', 'Afaste a pipa (A/D) pra escorregar · se as linhas encostarem, você perde!', 'bad', 3);
        else toast('Enroscou com ' + other + '!', 'W puxa (gasta fôlego) · S dá linha', 'good', 2.4);
        Snd.tangle();
      }
      break;
    case 'duelEnd': {
      if (e.aparada) { duelAparada(ss, e, me); break; }
      // a linha do perdedor arrebenta no ponto da enroscada e a pipa dele vira avoada
      if (e.x) burst(new THREE.Vector3().fromArray(e.x), '#e63946', 'ARREBENTOU!', true);
      const lp = kitePosOf(ss, e.loser);
      if (lp) burst(lp, '#ffd166', 'AVOADA! Quem aparar leva');
      const lv = G.remotes.get(e.loser);
      if (lv) lv.markLost(); // na tela de todo mundo a pipa dele some e ele fica bravo na hora
      if (e.winner === me || e.loser === me) cam.shake = .5;
      if (e.winner === me) { toast('Laçou a pipa de ' + ss.nameOf(e.loser) + '!', '+100 · ela virou avoada', 'good', 2.4); Snd.win(); }
      else if (e.loser === me) {
        toast(ss.nameOf(e.winner) + ' levou a melhor!', 'Sua linha arrebentou na enroscada', 'bad', 2.6); Snd.fail();
        failKite('lacada');
      } else toast(ss.nameOf(e.winner) + ' laçou ' + ss.nameOf(e.loser), '', '', 1.6);
      break;
    }
    case 'tailFree':
      if (e.vic === me) { toast('A rabiola escorregou e soltou!', 'Escapou dessa', 'good', 2); Snd.ring(.8); }
      else if (e.att === me) toast('A rabiola de ' + ss.nameOf(e.vic) + ' escapou', '', '', 1.8);
      break;
    case 'duelDraw':
      if (e.a === me || e.b === me) toast('Desenroscou!', 'Ninguém levou', '', 1.5);
      break;
    case 'catch': {
      // a avoada gruda na linha de quem aparou e fica pendurada 6 s; depois vem o aviso
      const sv = G.strayViews.get(e.id);
      const kite = e.kite || (sv && sv.kite) || { type: 'pipa', pat: 0 };
      if (sv) { sv.dispose(); G.strayViews.delete(e.id); }
      const mine = e.by === me, who = e.by;
      const line = lineOf(ss, who, me);
      const from = e.p ? new THREE.Vector3().fromArray(e.p) : (mine ? S.kitePos.clone() : new THREE.Vector3());
      if (mine) Snd.beep(660, .12, 'triangle', .15);
      startAparada({
        kite, from, line,
        onArrive: p => {
          if (!S.running || G.session !== ss) return;
          burst(p.setY(p.y + .8), '#06d6a0', mine ? 'APAROU! +50' : ss.nameOf(who) + ' aparou');
          if (mine) { toast('Aparou!', '+50', 'good', 1.5); Snd.ring(); }
          else toast(ss.nameOf(who) + ' aparou uma avoada', '', '', 1.4);
        },
      });
      break;
    }
    case 'strayIn': toast('Pipa avoada no céu!', 'Encoste a linha nela', 'good', 1.8); break;
    case 'round':
      if (e.round.state === 'pause') {
        const top = e.scores[0];
        toast('Fim da rodada!', top ? 'Rei do céu: ' + (top.id === me ? 'Você' : top.name) + ' (' + top.score + ')' : '', 'good', 5);
        Snd.win();
        if (top && top.id === me) Ads.happy();
        Ads.commercialBreak('fim-da-rodada'); // intervalo natural entre rodadas
      } else toast('Nova rodada!', 'Valendo!', 'good', 2);
      break;
    case 'pjoin': toast(e.name + ' chegou no campinho', '', '', 1.8); break;
    case 'pleave': toast(e.name + ' foi embora', '', '', 1.6); break;
    case 'oldServer':
      toast('Servidor desatualizado!', 'Feche a janela do servidor e abra o iniciar-servidor.bat de novo', 'bad', 8);
      break;
    case 'disconnected': toast('Conexão perdida', 'Voltando ao menu', 'bad', 3); setTimeout(() => toMenu(), 1500); break;
  }
}

function clearDisputa() {
  S.tailTug = null; S.lineLoad = false;
  clearFx();
  for (const v of G.remotes.values()) v.dispose(); G.remotes.clear();
  for (const v of G.strayViews.values()) v.dispose(); G.strayViews.clear();
  if (G.session) G.session.close();
  if (G.session && G.session.room) Ads.room(null);
  G.session = null; S.duelX = null;
}

/* =========================================================
   Início, pausa, fim
   ========================================================= */
export function startGame(mode, session = null) {
  clearRings(); clearStrays(); clearAparadas();
  if (G.session && G.session !== session) clearDisputa();
  S.mode = mode;
  G.session = session;
  S.score = 0; S.scoreFrac = 0; S.mi = 0; S.mp = 0; S.missionDone = false; S.ended = false; S.stamina = 1;
  S.minutes = mode === 'desafios' ? 16 * 60 : mode === 'livre' ? 16.5 * 60 : 17.2 * 60;
  const P = G.player;
  placePlayer(session && session.myId !== 'eu');
  P.vel.set(0, 0, 0);
  cam.yawOff = 0; cam.pitch = .14; cam.yawSm = Math.PI;
  if (session) { S.windBase = DISPUTA_WIND.base; S.gustAmp = DISPUTA_WIND.gust; }
  updateWind();
  updatePlayer(0);
  putOnBack();
  S.running = true; S.paused = false;
  hideMenu(); $('end').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  Snd.init();
  if (!session) onMissionStart();
  if (mode === 'livre') toast('Bora soltar pipa!', 'Aperte E para soltar a pipa das costas', 'good', 3.2);
  Ads.gameplayStart();
  if (session && session.room) Ads.room(session.room);
  if (session) toast(session.label, mode === 'online' ? 'Passe o código ' + session.room + ' pra turma' : 'Cruze a linha na deles pra enroscar', 'good', 3.5);
  camera.position.set(P.g.position.x, P.g.position.y + 3.5, P.g.position.z + 7);
}

/** põe o jogador num ponto de saída do cenário (online: um ponto qualquer, para não nascer em cima de ninguém) */
export function placePlayer(randomSpot = false) {
  const P = G.player, sp = SCN.spawns;
  const [x, z] = randomSpot ? sp[Math.floor(Math.random() * sp.length)] : sp[0];
  const j = randomSpot ? .8 : 0;
  P.g.position.set(x + rand(-j, j), 0, z + rand(-j, j));
  P.g.position.x = clamp(P.g.position.x, SCN.walk.x0, SCN.walk.x1); P.g.position.z = clamp(P.g.position.z, SCN.walk.z0, SCN.walk.z1);
  P.g.position.y = groundH(P.g.position.x, P.g.position.z);
  P.vel.set(0, 0, 0);
  P.yaw = Math.PI;
}

/* menu entra e sai com transição (o CSS cuida da animação) */
let menuTimer = 0;
function hideMenu() {
  const m = $('menu');
  if (m.classList.contains('hidden')) return;
  m.classList.add('leaving'); clearTimeout(menuTimer);
  menuTimer = setTimeout(() => { m.classList.add('hidden'); m.classList.remove('leaving'); }, 360);
}
function showMenu() {
  const m = $('menu');
  clearTimeout(menuTimer); m.classList.remove('leaving', 'hidden');
}

export function toMenu() {
  S.running = false; S.paused = false; S.ended = false;
  clearRings(); clearStrays(); clearDisputa(); clearAparadas();
  S.mode = 'livre'; S.windBase = 5.8; S.gustAmp = .35;
  $('pause').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.add('hidden'); showMenu();
  resetKite(); S.L = 30;
  Ads.gameplayStop();
  Ads.commercialBreak('menu');
}

export function setPause(p) {
  if (!S.running || S.ended) return;
  S.pauseOpen = p;
  S.paused = S.mode === 'online' ? false : p; // online o mundo não para: só abre a janela
  $('pauseText').textContent = S.mode === 'online' ? 'O jogo online continua rolando enquanto essa janela está aberta.' : 'O vento espera por você.';
  $('pause').classList.toggle('hidden', !p);
  if (p) Ads.gameplayStop(); else Ads.gameplayStart();
}

export function endGame(win) {
  S.ended = true; S.running = false;
  const done = win ? MISSIONS.length : S.mi;
  $('endTitle').textContent = win ? 'Rei da várzea!' : 'Hora da janta!';
  $('endText').innerHTML = '';
  $('endText').append(win ? 'Você cumpriu todas as missões antes de escurecer. O campinho inteiro parou pra ver.' : '"Ô menino, larga essa pipa e vem jantar!" A mãe chamou da janela.');
  const b = document.createElement('div'); b.style.marginTop = '14px';
  b.innerHTML = '<b>' + done + ' / ' + MISSIONS.length + '</b> missões · <b>' + S.score + '</b> pontos';
  $('endText').append(b);
  $('end').classList.remove('hidden');
  Ads.gameplayStop();
  if (win) { Snd.win(); Ads.happy(); }
}

export async function continueFree() {
  await Ads.commercialBreak('continuar');
  $('end').classList.add('hidden'); S.ended = false; S.mode = 'livre'; S.running = true; onMissionStart();
  Ads.gameplayStart();
}

export function advanceClockKey() {
  if (S.mode !== 'livre') return;
  S.minutes += 30; if (S.minutes > 19.6 * 60) S.minutes = 15.5 * 60;
}
