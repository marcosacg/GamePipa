// Pipa aparada: a RABIOLA da avoada enrosca na linha de quem aparou. A pipa fica pendurada pela
// rabiola, de cabeça pra baixo, balançando; o resto da rabiola e uns fios embolados caem do outro lado
// da linha, e a linha dela fica solta, pendurada no bico. Aos 6 segundos vem o "Aparou!", e ela CONTINUA pendurada,
// escorregando até a mão de quem aparou (Espaço traz mais rápido). Puxada rápida corta a rabiola e ela sai avoada.
// Na disputa/online quem decide (onde ela está, se cortou, se chegou) é a arena; no modo livre, este arquivo.
import * as THREE from 'three';
import { noOutline } from './materials.js';
import { KITES } from './config.js';
import { scene } from './scene.js';
import { makeKiteMesh, TailRenderer, proceduralTail } from './kite.js';

const SEG = .38;         // distância entre os laços da rabiola (m)
const DANGLE = 7;        // linha solta da avoada, pendurada no bico (m); os fios embolados caem do gancho
const STRANDS = 3;
const TOLERA = 2;        // quanto tempo a aparada espera a linha de quem aparou voltar antes de cair (s)
const GRUDA = .8;        // tempo grudando/balançando antes de começar a escorregar (s)
export const DURACAO = 6; // segundos pendurada na linha até o aviso de "Aparou!"
const ND = 26, NC = 28;  // pontos da linha pendurada e da voltinha enrolada

const list = [];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(),
  _w = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();

/** ponto da linha desenhada (THREE.Line) na fração f (0 = mão, 1 = pipa) */
function lineAt(line, f, out) {
  const p = line.geometry.attributes.position, n = p.count - 1;
  const x = Math.max(0, Math.min(1, f)) * n, i = Math.min(n - 1, Math.floor(x)), u = x - i;
  return out.set(
    p.getX(i) + (p.getX(i + 1) - p.getX(i)) * u,
    p.getY(i) + (p.getY(i + 1) - p.getY(i)) * u,
    p.getZ(i) + (p.getZ(i + 1) - p.getZ(i)) * u);
}
/** fração da linha mais perto do ponto p */
function nearestF(line, p) {
  const pos = line.geometry.attributes.position, n = pos.count - 1;
  let best = 0, bd = Infinity;
  for (let i = 0; i <= n; i++) { const d = _a.set(pos.getX(i), pos.getY(i), pos.getZ(i)).distanceToSquared(p); if (d < bd) { bd = d; best = i; } }
  return best / n;
}
function lineLength(line) {
  const p = line.geometry.attributes.position; let L = 0;
  for (let i = 1; i < p.count; i++) L += Math.hypot(p.getX(i) - p.getX(i - 1), p.getY(i) - p.getY(i - 1), p.getZ(i) - p.getZ(i - 1));
  return L;
}
function makeLineObj(n, color) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const l = new THREE.Line(g, noOutline(new THREE.LineBasicMaterial({ color }))); l.frustumCulled = false;
  return l;
}

class Hanging {
  /**
   * persist: continua pendurada depois do "Aparou!" · getF(): onde ela está na linha (arena), ou null
   * reel(): recolhendo (Espaço) · rip(): puxada rápida agora (quanto passou do limite) · onHome / onCut
   */
  constructor({ kite, from, line, onArrive, onDrop, persist = false, getF = null, reel = null, rip = null, onHome = null, onCut = null, f0 = null }) {
    if (!from) { const l0 = line(); from = l0 && f0 != null ? lineAt(l0, f0, new THREE.Vector3()) : new THREE.Vector3(0, 20, 0); }
    const type = KITES[kite.type] ? kite.type : 'pipa', pat = kite.pat || 0;
    this.getLine = line; this.onArrive = onArrive; this.onDrop = onDrop;
    this.persist = persist; this.getF = getF; this.reel = reel; this.rip = rip; this.onHome = onHome; this.onCut = onCut; this.rp = 0;
    this.mesh = makeKiteMesh(type, pat); this.mesh.scale.setScalar(.9);
    this.n = Math.max(5, Math.min(11, KITES[type].tail));
    this.up = Math.ceil(this.n * .55);            // laços entre a pipa e a linha; o resto cai do outro lado
    this.hang = this.up * SEG;                    // comprimento da rabiola que segura a pipa
    this.tail = new TailRenderer(type, pat, this.n); this.tailPts = [];
    for (let i = 0; i <= this.n; i++) this.tailPts.push(new THREE.Vector3().copy(from));
    this.rope = makeLineObj(ND + 1, 0xeeeeee);   // a linha da avoada, solta, pendurada no bico
    this.strands = [];                            // fios soltos/embolados que caem junto
    for (let k = 1; k < STRANDS; k++) this.strands.push({ l: makeLineObj(ND + 1, k === 1 ? 0xdddddd : 0xf4f4f4), pts: [], len: .55 + Math.random() * .35, ph: Math.random() * 10 });
    for (const st of this.strands) { scene.add(st.l); for (let i = 0; i <= ND; i++) st.pts.push(new THREE.Vector3().copy(from)); }
    this.coilL = makeLineObj(NC, 0xeeeeee);      // voltinha enrolada na linha de quem aparou
    scene.add(this.mesh, this.rope, this.coilL);
    this.pos = new THREE.Vector3().copy(from); this.vel = new THREE.Vector3();
    this.hook = new THREE.Vector3();
    const l = line();
    this.f = f0 != null ? f0 : l ? nearestF(l, from) : .5;
    this.t = 0; this.v = 0; this.ph = Math.random() * 10; this.dropped = false; this.done = false;
    this.side = Math.random() < .5 ? 1 : -1;
    this.dangle = []; for (let i = 0; i <= ND; i++) this.dangle.push(new THREE.Vector3().copy(from));
  }

  update(dt, t, windDirH) {
    if (this.done) return false;
    this.t += dt;
    let line = this.dropped ? null : this.getLine();
    if (line && !line.visible) line = null;
    // a linha pode "sumir" por um instante (travadinha na conexão de quem aparou): só cai se sumir de verdade
    this.semLinha = line ? 0 : (this.semLinha || 0) + dt;
    if (!this.dropped && !line && this.semLinha > TOLERA) this.drop();
    if (this.dropped) return this.fall(dt, t, windDirH);

    // escorrega pela linha até a mão (devagar no começo, depois mais rápido)
    if (line) {
      const L = lineLength(line) || 1;
      const fT = this.getF ? this.getF() : null;
      if (fT != null) this.f += (fT - this.f) * (1 - Math.exp(-6 * dt));   // a arena diz onde ela está
      else if (this.t > GRUDA) {
        const vmax = this.persist ? (this.reel && this.reel() ? 3 : .5) : .8;
        this.v = Math.min(vmax, this.v + .6 * dt); // escorrega devagar pela linha, balançando
        if (this.v > vmax) this.v = vmax;
        this.f -= this.v * dt / L;
      }
      if (!this.persist) this.f = Math.max(this.f, Math.min(.5, 2 / L)); // (antigo) para a uns 2 m da mão
      else if (!this.getF && this.f * L <= 3) { this.home(); return false; } // chegou na mão: guardada
      lineAt(line, this.f, this.hook);
    } // sem linha por um instante: fica balançando no último ponto
    if (this.t >= DURACAO && !this.arrived) {
      this.arrived = true;
      if (this.onArrive) this.onArrive(this.pos.clone()); // o aviso aparece em cima da pipa aparada
      if (!this.persist) { this.dispose(); return false; }
    }
    // modo livre: puxada rápida corta a rabiola e ela sai avoada
    if (this.rip && this.t > 1.5) {
      const r = this.rip();
      this.rp = r > 0 ? this.rp + r * .55 * dt : Math.max(0, this.rp - dt);
      if (this.rp >= 1) { const p = this.hook.clone(); this.dispose(); if (this.onCut) this.onCut(p); return false; }
    }

    // pipa pendurada: ponto com massa preso no gancho por um pedaço de linha (balança sozinha)
    _w.copy(windDirH).multiplyScalar(4.5);
    _a.set(0, -3.4, 0).addScaledVector(_w.sub(this.vel), .9);
    _a.x += Math.sin(t * 2.3 + this.ph) * 1.2; _a.z += Math.cos(t * 1.9 + this.ph) * .8;
    this.vel.addScaledVector(_a, dt);
    this.pos.addScaledVector(this.vel, dt);
    _d.subVectors(this.pos, this.hook);
    const dl = _d.length(), rope = this.t < GRUDA ? this.hang + (1 - this.t / GRUDA) * 1.2 : this.hang;
    if (dl > rope) {
      _d.multiplyScalar(1 / dl);
      this.pos.copy(this.hook).addScaledVector(_d, rope);
      this.vel.addScaledVector(_d, -this.vel.dot(_d)); // a linha segura: tira a velocidade que afasta
    }
    this.vel.multiplyScalar(Math.exp(-.6 * dt));

    // direção da linha de quem aparou (para a voltinha e para saber o "outro lado")
    this.tan = this.tan || new THREE.Vector3(0, 1, 0);
    if (line) { lineAt(line, this.f + .02, _b); lineAt(line, this.f - .02, _t); this.tan.subVectors(_b, _t).normalize(); }
    _t.copy(this.tan);
    _s.crossVectors(_t, _up).normalize();
    const kiteSide = Math.sign(_d.subVectors(this.pos, this.hook).dot(_s)) || this.side;
    this.other = (this.other || new THREE.Vector3()).copy(_s).multiplyScalar(-kiteSide); // lado oposto ao da pipa

    // pendurada pela rabiola: de cabeça pra baixo (bico apontando para longe do gancho)
    this.pose(t, windDirH, _d.subVectors(this.pos, this.hook).normalize(), true);
    this.drawRope(t, windDirH);
    this.drawCoil(t, _t);
    return true;
  }

  /** nose = para onde aponta o bico; hanging = pendurada pela rabiola (a ponta de cima da rabiola fica no gancho) */
  pose(t, windDirH, nose, hanging) {
    const ud = this.mesh.userData;
    // this.pos é onde a rabiola sai da pipa; o centro da pipa fica do outro lado
    this.mesh.position.copy(this.pos).addScaledVector(nose, -(ud.bottom || -.5) * .9);
    this.mesh.up.copy(nose);
    this.mesh.lookAt(_n.copy(this.mesh.position).addScaledVector(windDirH, -5));
    this.mesh.rotateZ(Math.sin(t * 3.1 + this.ph) * .25);
    if (!hanging) {
      _n.set(0, ud.bottom * .9, 0).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
      this.tail.update(proceduralTail(this.tailPts, _n, windDirH, this.n, t, this.ph), t, windDirH);
      return;
    }
    // rabiola: da pipa até o gancho (esticada, com o peso da pipa) e o resto caindo do outro lado da linha
    const P = this.tailPts, up = this.up;
    for (let i = 0; i <= this.n; i++) {
      if (i <= up) {
        const s = i / up;
        _a.lerpVectors(this.pos, this.hook, s);
        _a.addScaledVector(windDirH, Math.sin(s * Math.PI) * .18).y -= Math.sin(s * Math.PI) * .08;
      } else {
        const k = i - up, len = k * SEG;
        _a.copy(this.hook).addScaledVector(this.other, .18 + k * .03).addScaledVector(_up, -len)
          .addScaledVector(windDirH, len * .35 + len * len * .03)
          .add(_b.set(Math.sin(t * 3 + k * .8 + this.ph) * .07 * k, 0, Math.cos(t * 2.5 + k * .7 + this.ph) * .06 * k));
      }
      P[i].lerp(_a, i === 0 || i === up ? 1 : .35);
    }
    this.tail.update(P, t, windDirH);
  }

  /** a linha da avoada, solta, pendurada no bico; e uns fios embolados caindo do gancho */
  drawRope(t, windDirH) {
    const p = this.rope.geometry.attributes.position, ud = this.mesh.userData;
    _n.set(0, ud.top || .5, 0).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
    for (let i = 0; i <= ND; i++) {
      const s = i / ND, len = DANGLE * s;
      const target = _a.copy(_n).addScaledVector(_up, -len).addScaledVector(windDirH, len * len * .05)
        .add(_b.set(Math.sin(t * 2.6 + s * 5 + this.ph) * .35 * s, 0, Math.cos(t * 2.2 + s * 4 + this.ph) * .3 * s));
      this.dangle[i].lerp(target, i === 0 ? 1 : .25); // segue com atraso: parece corda de verdade
      p.setXYZ(i, this.dangle[i].x, this.dangle[i].y, this.dangle[i].z);
    }
    p.needsUpdate = true;
    for (const st of this.strands) {
      const sp = st.l.geometry.attributes.position;
      for (let i = 0; i <= ND; i++) {
        const s = i / ND, len = 9 * st.len * s;
        const target = _a.copy(this.hook).addScaledVector(this.other, (.1 + .4 * st.len) * Math.min(1, s * 3))
          .addScaledVector(_up, -len).addScaledVector(windDirH, len * len * .06)
          .add(_b.set(Math.sin(t * 3.1 + s * 7 + st.ph) * .45 * s, Math.sin(s * 19 + st.ph) * .08, Math.cos(t * 2.7 + s * 6 + st.ph) * .4 * s));
        st.pts[i].lerp(target, i === 0 ? 1 : .2);
        sp.setXYZ(i, st.pts[i].x, st.pts[i].y, st.pts[i].z);
      }
      sp.needsUpdate = true;
    }
  }

  /** duas voltinhas da linha da avoada em volta da linha de quem aparou */
  drawCoil(t, tan) {
    const p = this.coilL.geometry.attributes.position;
    _s.crossVectors(tan, _up).normalize(); _n.crossVectors(_s, tan).normalize();
    for (let i = 0; i < NC; i++) {
      const s = i / (NC - 1), a = s * Math.PI * 4 + t * .5, r = .09;
      _a.copy(this.hook).addScaledVector(tan, (s - .5) * .45).addScaledVector(_s, Math.cos(a) * r).addScaledVector(_n, Math.sin(a) * r);
      p.setXYZ(i, _a.x, _a.y, _a.z);
    }
    p.needsUpdate = true;
  }

  /** chegou na mão de quem aparou: guardada */
  home() {
    if (this.done) return;
    const p = this.pos.clone();
    this.dispose();
    if (this.onHome) this.onHome(p);
  }
  /** tira da tela agora (a arena cortou a rabiola: ela virou avoada, ou chegou na mão) */
  remove() { if (!this.done) this.dispose(); }
  /** ponto onde ela está presa na linha */
  get hookPos() { return this.hook; }
  /** a linha de quem aparou sumiu (arrebentou, enroscou...): a avoada cai */
  drop() {
    this.dropped = true; this.t = 0;
    this.coilL.visible = false;
    if (this.onDrop) this.onDrop();
  }
  fall(dt, t, windDirH) {
    this.vel.y -= 4 * dt; this.vel.addScaledVector(_w.copy(windDirH).multiplyScalar(3).sub(this.vel), .6 * dt);
    this.pos.addScaledVector(this.vel, dt);
    this.pose(t, windDirH, _up, false);
    this.rope.visible = false; for (const st of this.strands) st.l.visible = false;
    if (this.t > 2.2) { this.dispose(); return false; }
    return true;
  }
  dispose() {
    scene.remove(this.mesh, this.rope, this.coilL);
    for (const st of this.strands) { scene.remove(st.l); st.l.geometry.dispose(); }
    this.tail.dispose();
    this.rope.geometry.dispose(); this.coilL.geometry.dispose();
    this.done = true;
  }
}

/**
 * Começa a animação de uma avoada presa na linha.
 * kite {type,pat}, from (Vector3 onde encostou), line() → THREE.Line da linha de quem aparou (ou null),
 * onArrive(pontoDaMão) quando chega, onDrop() se a linha de quem aparou sumir antes.
 */
export function startAparada(opts) { const h = new Hanging(opts); list.push(h); return h; }

export function updateAparadas(dt, t, windDirH) {
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].update(dt, t, windDirH)) list.splice(i, 1);
}
export function clearAparadas() { for (const h of list) if (!h.done) h.dispose(); list.length = 0; }
export function aparadasCount() { return list.length; }
export function aparadasInfo() { return list.map(h => ({ t: +h.t.toFixed(1), caindo: h.dropped })); }
