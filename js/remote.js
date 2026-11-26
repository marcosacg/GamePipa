// Outros jogadores (online ou bots) e pipas avoadas da disputa — só visual, sem física
import * as THREE from 'three';
import { S } from './state.js';
import { noOutline } from './materials.js';
import { KITES } from './config.js';
import { scene, makeLabel, groundH } from './scene.js';
import { makeCharacter, disposeCharacter, poseCharacter, poseAngry } from './player.js';
import { makeKiteMesh, TailRenderer, proceduralTail, backPose, hangTail, BACK_SCALE, pinTail } from './kite.js';
import { DUEL } from './shared/duel.js';
import { strayTrail } from './shared/linha.js';
import { Corda } from './corda.js';
import { TailSim } from './rabiola.js';
import { LinhaSolta, CorpoSolto, cortarEm } from './linhasolta.js';

const LN = 30;
const V = a => new THREE.Vector3(a[0], a[1], a[2]);

function makeLine(color = 0xf7f3e8) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LN + 1) * 3), 3));
  const l = new THREE.Line(g, noOutline(new THREE.LineBasicMaterial({ color })));
  l.frustumCulled = false;
  scene.add(l);
  return l;
}

export class RemoteView {
  constructor(id, meta) {
    this.id = id; this.meta = meta;
    this.char = makeCharacter(meta.style);
    scene.add(this.char.g);
    const type = KITES[meta.kite.type] ? meta.kite.type : 'pipa';
    this.type = type;
    this.kite = makeKiteMesh(type, meta.kite.pat);
    scene.add(this.kite);
    this.nTail = Math.min(10, KITES[type].tail);
    this.tail = new TailRenderer(type, meta.kite.pat, this.nTail);
    this.tailPts = [];
    this.tsim = new TailSim(this.nTail, id.length * 3.1);
    this.line = makeLine();
    this.rope = new Corda(LN, id.length * 7.3);
    this.label = makeLabel(meta.name);
    this.kiteLabel = makeLabel(meta.name, '#ffd166');
    scene.add(this.label, this.kiteLabel);
    this.pos = new THREE.Vector3(); this.hand = new THREE.Vector3(); this.k = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.tPos = new THREE.Vector3(); this.tHand = new THREE.Vector3(); this.tK = new THREE.Vector3(); this.tQ = new THREE.Quaternion();
    this.yaw = 0; this.tYaw = 0; this.mv = 0; this.L = 20; this.st = 'voando';
    this.first = true;
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.lostT = 0; this.lostHold = false; this.lostK = new THREE.Vector3();
  }
  /**
   * Ele perdeu a enroscada: some com a pipa e fica bravo AGORA, sem esperar o navegador dele.
   * Continua assim até a pipa nova dele aparecer em outro lugar (se a aba dele estiver
   * parada em segundo plano, a pipa velha não fica congelada no céu).
   */
  markLost() { this.lostT = DUEL.lostTime; this.lostHold = true; this.lostK.copy(this.tK); }
  /**
   * A linha dele foi cortada no ponto x: o pedaço da mão até o corte cai solto (física) e
   * devolve o pedaço do corte até a pipa (começando na pipa), que vai com a avoada.
   */
  cutLine(x) {
    const P = this.rope.ok ? this.rope.p : [this.hand.clone(), this.k.clone()];
    const X = x ? new THREE.Vector3().fromArray(x) : P[Math.max(1, P.length - 3)];
    const r = cortarEm(P, X);
    this.solta = new LinhaSolta(r.mao, LN, { chao: groundH }); this.soltaT = 0;
    this.solta.kick(new THREE.Vector3().subVectors(this.hand, r.c).setLength(4));
    return r.pipa;
  }
  apply(s) {
    this.tPos.fromArray(s.pos); this.tHand.fromArray(s.hand); this.tK.fromArray(s.k);
    this.tQ.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    if (this.tQ.lengthSq() < .5) this.tQ.set(0, 0, 0, 1);
    this.tQ.normalize();
    this.tYaw = s.yaw; this.mv = s.mv; this.L = s.L; this.st = s.st; this.give = s.give;
    // rabiola cortada (fica curta) ou pipa nova (inteira de novo)
    if (Number.isInteger(s.n)) {
      const n = Math.min(10, KITES[this.type].tail, Math.max(1, s.n));
      if (n !== this.nTail && KITES[this.type].tail > 0) { this.tail.dispose(); this.nTail = n; this.tail = new TailRenderer(this.type, this.meta.kite.pat, n); this.tailPts = []; this.tsim = new TailSim(n, this.id.length * 3.1); }
    }
    if (this.first) { this.pos.copy(this.tPos); this.hand.copy(this.tHand); this.k.copy(this.tK); this.q.copy(this.tQ); this.yaw = this.tYaw; this.first = false; }
  }
  update(dt, t, windDirH, duelX, tailPull = null, tailF = 1) {
    if (this.lostT > 0) this.lostT -= dt;
    // já está com pipa nova (nas costas, soltando ou voando em outro lugar)?
    if (this.lostHold && this.lostT <= 0 && (this.st === 'costas' || this.st === 'lancando' || (this.st === 'voando' && this.tK.distanceTo(this.lostK) > 3))) this.lostHold = false;
    if (!this.lostHold && this.st !== 'arrebentou') this.solta = null;
    const st = this.lostHold ? 'arrebentou' : this.st;
    if (this.lostHold) { duelX = null; tailPull = null; }
    const f = 1 - Math.exp(-12 * dt);
    this.pos.lerp(this.tPos, f); this.hand.lerp(this.tHand, f); this.k.lerp(this.tK, f); this.q.slerp(this.tQ, f);
    let d = this.tYaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * f;
    const c = this.char;
    c.g.position.copy(this.pos); c.g.rotation.y = this.yaw;
    c.g.updateMatrixWorld(true);
    poseCharacter(c, dt, this.mv, this.hand);
    poseAngry(c, dt, t + this.id.length, st === 'arrebentou' || st === 'caiu' || st === 'enroscou');
    this.label.visible = st !== 'ausente';
    if (!this.awayLabel && st === 'ausente') { this.awayLabel = makeLabel(this.meta.name + ' · ausente', '#b8b8b8', true); scene.add(this.awayLabel); }
    if (this.awayLabel) { this.awayLabel.visible = st === 'ausente'; this.awayLabel.position.set(this.pos.x, this.pos.y + 2.3, this.pos.z); }
    this.label.position.set(this.pos.x, this.pos.y + 2.3, this.pos.z);

    const lost = st === 'arrebentou' || st === 'ausente'; // laçado ou sumiu: sem pipa no céu
    const back = st === 'costas';
    this.kite.visible = !lost; this.tail.setVisible(!lost); this.kiteLabel.visible = !lost && !back && !S.limpa;
    this.line.visible = !back;
    if (back) { backPose(this.pos, this.yaw, this._a, this.kite.quaternion); this.kite.position.copy(this._a); this.kite.scale.setScalar(BACK_SCALE); }
    else { this.kite.position.copy(this.k); this.kite.quaternion.copy(this.q); this.kite.scale.setScalar(1); }
    this.kiteLabel.position.set(this.k.x, this.k.y + 1.4, this.k.z);
    if (this.nTail > 0 && back) {
      this._a.set(0, this.kite.userData.bottom * BACK_SCALE, 0).applyQuaternion(this.kite.quaternion).add(this.kite.position);
      this.tail.update(hangTail(this.tailPts, this._a, this.yaw, this.nTail, t, this.pos.y), t, windDirH);
      this.tsim.reset();
    } else if (this.nTail > 0 && !lost) {
      // rabiola com física: segue a pipa com atraso, tremulando no vento
      this._a.set(0, this.kite.userData.bottom, 0).applyQuaternion(this.q).add(this.k);
      // rabiola enroscada na linha de alguém: o laço preso fica na linha e o resto pendura pela física
      const pin = tailPull ? (this._pin = this._pin || { i: 1, p: new THREE.Vector3() }) : null;
      if (pin) { pin.i = Math.max(1, Math.min(this.nTail, Math.round(tailF * this.nTail))); pin.p.copy(tailPull); }
      const pts = this.tsim.update(dt, this._a, windDirH, this.windSpeed || 6, t, pin);
      this.tail.update(pts, t, windDirH);
    }

    const lp = this.line.geometry.attributes.position;
    if (lost) {
      // linha cortada: o pedaço que ficou na mão dele cai solto (física) e ele vai recolhendo
      if (!this.solta) this.cutLine(null);
      this.soltaT += dt;
      if (this.soltaT > 3) this.solta.recolher(Math.min(this.solta.len - 1, 3.5 * dt));
      this.solta.update(dt, this.hand, windDirH, this.windSpeed || 6, t);
      this.solta.write(lp, 0);
    } else if (!back) {
      // corda com barriga (o mesmo formato que a arena usa) e tremido; na enroscada passa pelo ponto do cruzamento
      this.rope.update(dt, this.hand, this.k, st === 'voando' ? this.L : this.hand.distanceTo(this.k) + 1, windDirH, this.windSpeed || 6, t, { pin: duelX, giving: !!this.give });
      this.rope.write(lp, 0);
    }
    if (lost || back) this.rope.reset();
    lp.needsUpdate = true;
  }
  dispose() {
    disposeCharacter(this.char);
    scene.remove(this.kite, this.line, this.label, this.kiteLabel);
    if (this.awayLabel) scene.remove(this.awayLabel);
    this.tail.dispose();
  }
}

/** pipa avoada (posição vem da arena ou do motor de física): pipa solta + o pedaço de linha do corte, tudo com física */
export class StrayView {
  /** tl = pedaço de linha que ela vai arrastando (m); piece = formato exato do pedaço (da pipa até o corte) */
  constructor(kite, tl = 0, piece = null) {
    this.kite = kite; // tipo/estampa (usado quando ela é aparada)
    this.tl = tl;
    const type = KITES[kite.type] ? kite.type : 'pipa';
    this.mesh = makeKiteMesh(type, kite.pat || 0);
    this.mesh.scale.setScalar(.9);
    scene.add(this.mesh);
    this.line = makeLine(0xeeeeee);
    this.n = Math.min(8, KITES[type].tail);
    this.tail = new TailRenderer(type, kite.pat || 0, this.n);
    this.tsim = new TailSim(this.n, Math.random() * 40);
    this.corpo = new CorpoSolto(Math.max(.3, ((this.mesh.userData.top || .5) - (this.mesh.userData.bottom || -.5)) * .45));
    this.piece = piece; this.solta = null;
    this.tag = makeLabel('AVOADA · apare!', '#ffd166', true);
    this.tag.scale.set(.3, .0375, 1);
    scene.add(this.tag);
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3(); this.first = true;
    this.ph = Math.random() * 10;
    this._t = new THREE.Vector3(); this._a = new THREE.Vector3();
  }
  /** o pedaço exato da linha cortada (da pipa até o ponto do corte) */
  setCut(piece) { this.piece = piece; this.solta = null; }
  set(p) { this.target.set(p[0], p[1], p[2]); if (this.first) { this.pos.copy(this.target); this.first = false; } }
  update(dt, t, windDirH) {
    this.pos.lerp(this.target, 1 - Math.exp(-8 * dt));
    const p = this.pos;
    p.y = Math.max(p.y, groundH(p.x, p.z) + .35); // não atravessa o telhado/chão
    // a pipa solta: vareta com o pé pesado e o pano no vento (gira e rodopia pela física)
    const ws = S.windSpeed || 6;
    this.corpo.update(dt, p, windDirH, ws, t);
    this.corpo.apply(this.mesh, windDirH);
    this.tag.visible = !S.limpa;
    this.tag.position.set(p.x, p.y + 1.5, p.z);
    this.tag.material.opacity = .65 + .35 * Math.sin(t * 6 + this.ph);
    // o pedaço de linha do corte: nasce no formato exato que tinha e vai arrastado, preso na pipa
    if (!this.solta) {
      let pts = this.piece;
      if (!pts || pts.length < 2) { const tl = this.tl > 0 ? this.tl : 12; pts = strayTrail([p.x, p.y, p.z], tl, windDirH.x, windDirH.z, 8, []); }
      this.solta = new LinhaSolta(pts, LN, { chao: groundH });
    }
    this.solta.update(dt, p, windDirH, ws, t);
    this.solta.write(this.line.geometry.attributes.position, 0);
    if (this.n > 0) {
      this._a.set(0, this.mesh.userData.bottom * .9, 0).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
      this.tail.update(this.tsim.update(dt, this._a, windDirH, ws, t), t, windDirH); // rabiola com física
    }
  }
  /** pontos atuais do pedaço de linha (passa para a aparada, sem pular) */
  linePts() { return this.solta ? this.solta.toArray() : null; }
  dispose() { scene.remove(this.mesh, this.line, this.tag); this.tail.dispose(); }
}
