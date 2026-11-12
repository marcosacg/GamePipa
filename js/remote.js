// Outros jogadores (online ou bots) e pipas avoadas da disputa — só visual, sem física
import * as THREE from 'three';
import { KITES } from './config.js';
import { scene, makeLabel } from './scene.js';
import { makeCharacter, disposeCharacter, poseCharacter, poseAngry } from './player.js';
import { makeKiteMesh, TailRenderer, proceduralTail, backPose, hangTail, BACK_SCALE, pinTail } from './kite.js';
import { DUEL } from './shared/duel.js';

const LN = 30;
const V = a => new THREE.Vector3(a[0], a[1], a[2]);

function makeLine(color = 0xf7f3e8) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LN + 1) * 3), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
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
    this.line = makeLine();
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
  apply(s) {
    this.tPos.fromArray(s.pos); this.tHand.fromArray(s.hand); this.tK.fromArray(s.k);
    this.tQ.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    if (this.tQ.lengthSq() < .5) this.tQ.set(0, 0, 0, 1);
    this.tQ.normalize();
    this.tYaw = s.yaw; this.mv = s.mv; this.L = s.L; this.st = s.st;
    if (this.first) { this.pos.copy(this.tPos); this.hand.copy(this.tHand); this.k.copy(this.tK); this.q.copy(this.tQ); this.yaw = this.tYaw; this.first = false; }
  }
  update(dt, t, windDirH, duelX, tailPull = null, tailF = 1) {
    if (this.lostT > 0) this.lostT -= dt;
    // já está com pipa nova (nas costas, soltando ou voando em outro lugar)?
    if (this.lostHold && this.lostT <= 0 && (this.st === 'costas' || this.st === 'lancando' || (this.st === 'voando' && this.tK.distanceTo(this.lostK) > 3))) this.lostHold = false;
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
    this.kite.visible = !lost; this.tail.setVisible(!lost); this.kiteLabel.visible = !lost && !back;
    this.line.visible = !back;
    if (back) { backPose(this.pos, this.yaw, this._a, this.kite.quaternion); this.kite.position.copy(this._a); this.kite.scale.setScalar(BACK_SCALE); }
    else { this.kite.position.copy(this.k); this.kite.quaternion.copy(this.q); this.kite.scale.setScalar(1); }
    this.kiteLabel.position.set(this.k.x, this.k.y + 1.4, this.k.z);
    if (this.nTail > 0 && back) {
      this._a.set(0, this.kite.userData.bottom * BACK_SCALE, 0).applyQuaternion(this.kite.quaternion).add(this.kite.position);
      this.tail.update(hangTail(this.tailPts, this._a, this.yaw, this.nTail, t, this.pos.y), t, windDirH);
    } else if (this.nTail > 0 && !lost) {
      this._a.set(0, this.kite.userData.bottom, 0).applyQuaternion(this.q).add(this.k);
      const pts = proceduralTail(this.tailPts, this._a, windDirH, this.nTail, t, this.id.length);
      if (tailPull) pinTail(pts, tailPull, tailF);
      this.tail.update(pts, t, windDirH);
    }

    const lp = this.line.geometry.attributes.position;
    if (lost) {
      for (let i = 0; i <= LN; i++) { const s = i / LN; lp.setXYZ(i, this.hand.x + windDirH.x * s * 3, this.hand.y - s * 1.2, this.hand.z + windDirH.z * s * 3); }
    } else if (duelX) {
      const half = LN / 2;
      for (let i = 0; i <= LN; i++) {
        if (i <= half) this._b.lerpVectors(this.hand, duelX, i / half); else this._b.lerpVectors(duelX, this.k, (i - half) / half);
        lp.setXYZ(i, this._b.x, this._b.y, this._b.z);
      }
    } else {
      const dist = this.hand.distanceTo(this.k);
      const sag = Math.min(dist * .5, dist * .015 + Math.max(0, this.L - dist) * .7);
      for (let i = 0; i <= LN; i++) {
        const s = i / LN;
        this._b.lerpVectors(this.hand, this.k, s);
        this._b.y -= sag * 4 * s * (1 - s);
        this._b.addScaledVector(windDirH, sag * .3 * 4 * s * (1 - s));
        lp.setXYZ(i, this._b.x, this._b.y, this._b.z);
      }
    }
    lp.needsUpdate = true;
  }
  dispose() {
    disposeCharacter(this.char);
    scene.remove(this.kite, this.line, this.label, this.kiteLabel);
    if (this.awayLabel) scene.remove(this.awayLabel);
    this.tail.dispose();
  }
}

/** pipa avoada da disputa (posição vem da arena) */
export class StrayView {
  constructor(kite) {
    const type = KITES[kite.type] ? kite.type : 'pipa';
    this.mesh = makeKiteMesh(type, kite.pat || 0);
    this.mesh.scale.setScalar(.9);
    scene.add(this.mesh);
    this.line = makeLine(0xeeeeee);
    this.n = Math.min(8, KITES[type].tail);
    this.tail = new TailRenderer(type, kite.pat || 0, this.n);
    this.pts = [];
    this.tag = makeLabel('AVOADA · apare!', '#ffd166', true);
    this.tag.scale.set(.3, .0375, 1);
    scene.add(this.tag);
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3(); this.first = true;
    this.ph = Math.random() * 10;
    this._t = new THREE.Vector3(); this._a = new THREE.Vector3();
  }
  set(p) { this.target.set(p[0], p[1], p[2]); if (this.first) { this.pos.copy(this.target); this.first = false; } }
  update(dt, t, windDirH) {
    this.pos.lerp(this.target, 1 - Math.exp(-8 * dt));
    const p = this.pos;
    this.mesh.position.copy(p);
    this.mesh.lookAt(this._t.copy(p).addScaledVector(windDirH, -5));
    this.mesh.rotateZ(Math.sin(t * 2.2 + this.ph) * .6);
    this.mesh.rotateX(-.4);
    this.tag.position.set(p.x, p.y + 1.5 + Math.sin(t * 4 + this.ph) * .15, p.z);
    this.tag.material.opacity = .65 + .35 * Math.sin(t * 6 + this.ph);
    const l = this.line.geometry.attributes.position;
    for (let i = 0; i <= LN; i++) {
      const s = i / LN * 12;
      l.setXYZ(i, p.x - windDirH.x * s * .35 + Math.sin(t * 2 + s * .5 + this.ph) * .04 * s, p.y - s * .9, p.z - windDirH.z * s * .35);
    }
    l.needsUpdate = true;
    if (this.n > 0) {
      this._a.set(0, this.mesh.userData.bottom * .9, 0).applyQuaternion(this.mesh.quaternion).add(p);
      this.tail.update(proceduralTail(this.pts, this._a, windDirH, this.n, t, this.ph), t, windDirH);
    }
  }
  dispose() { scene.remove(this.mesh, this.line, this.tag); this.tail.dispose(); }
}
