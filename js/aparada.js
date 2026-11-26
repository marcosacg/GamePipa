// Pipa aparada: a RABIOLA da avoada enrosca na linha de quem aparou. A pipa fica pendurada pela
// rabiola, de cabeça pra baixo, balançando; o resto da rabiola e uns fios embolados caem do outro lado
// da linha, e a linha dela fica solta, pendurada no bico. Aos 6 segundos vem o "Aparou!", e ela CONTINUA pendurada,
// escorregando até a mão de quem aparou (Espaço traz mais rápido). Puxada rápida corta a rabiola e ela sai avoada.
// Na disputa/online quem decide (onde ela está, se cortou, se chegou) é a arena; no modo livre, este arquivo.
import * as THREE from 'three';
import { noOutline } from './materials.js';
import { KITES } from './config.js';
import { scene, groundH } from './scene.js';
import { makeKiteMesh, TailRenderer, proceduralTail } from './kite.js';
import { TailSim } from './rabiola.js';
import { LinhaSolta, CorpoSolto } from './linhasolta.js';

const SEG = .38;         // distância entre os laços da rabiola (m)
const DANGLE = 8;        // linha solta da avoada (m), quando não se sabe o pedaço exato do corte
const VENTO = 6;          // vento sentido pela pipa pendurada (m/s)
const TOLERA = 2;        // quanto tempo a aparada espera a linha de quem aparou voltar antes de cair (s)
const GRUDA = .8;        // tempo grudando/balançando antes de começar a escorregar (s)
export const DURACAO = 6; // segundos pendurada na linha até o aviso de "Aparou!"
const ND = 30, NC = 28;  // trechos da linha pendurada e pontos da voltinha enrolada

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
  constructor({ kite, from, line, onArrive, onDrop, persist = false, getF = null, reel = null, rip = null, onHome = null, onCut = null, f0 = null, piece = null, tl = DANGLE }) {
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
    this.rope = makeLineObj(ND + 1, 0xeeeeee);   // a linha da avoada (o pedaço do corte), solta, presa na pipa
    this.strands = [];
    // rabiola, pipa e linha solta: tudo com física (nada de animação pronta)
    this.tsim = new TailSim(this.n, this.ph = Math.random() * 10, SEG);
    this.piece = piece; this.tlen = Math.max(2, Math.min(60, tl || DANGLE)); this.rsim = null;
    const ud = this.mesh.userData;
    this.corpo = new CorpoSolto(Math.max(.25, ((ud.top || .5) - (ud.bottom || -.5)) * .45), this.ph);
    this.corpo.ax.set(0, -1, 0);                  // pendurada pela rabiola: começa de cabeça pra baixo
    this.coilL = makeLineObj(NC, 0xeeeeee);      // voltinha enrolada na linha de quem aparou
    scene.add(this.mesh, this.rope, this.coilL);
    this.pos = new THREE.Vector3().copy(from); this.vel = new THREE.Vector3();
    this.hook = new THREE.Vector3();
    const l = line();
    this.f = f0 != null ? f0 : l ? nearestF(l, from) : .5;
    if (l) { lineAt(l, this.f, this.hook); _d.subVectors(this.pos, this.hook); const dl = _d.length(); if (dl > this.hang) this.pos.copy(this.hook).addScaledVector(_d, this.hang / dl); }
    this.t = 0; this.v = 0; this.dropped = false; this.done = false;
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
    this._dt = dt;
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
      if (this.rp >= 1) { const p = this.hook.clone(), pts = this.linePts(); this.dispose(); if (this.onCut) this.onCut(p, pts); return false; }
    }

    // pipa pendurada: só física — peso, vento no pano (arrasto) e a rabiola segurando no gancho
    _w.copy(windDirH).multiplyScalar(VENTO);
    _a.set(0, -9.81 * .55, 0).addScaledVector(_w.sub(this.vel), 1.1);
    this.vel.addScaledVector(_a, dt);
    this.pos.addScaledVector(this.vel, dt);
    _d.subVectors(this.pos, this.hook);
    const dl = _d.length(), rope = this.hang;
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

  /**
   * A pipa é uma vareta física (pé pesado, pano pegando vento). Pendurada: o pé fica onde a rabiola segura
   * (this.pos) e ela vira de cabeça pra baixo sozinha pelo peso; caindo: gira em volta do centro.
   */
  pose(t, windDirH, _unused, hanging) {
    const dt = this._dt || .016;
    this.corpo.update(dt, this.pos, windDirH, VENTO, t, hanging);
    this.corpo.apply(this.mesh, windDirH);
    // rabiola com física: sai do pé da pipa, presa no gancho (laço "up") e o resto pendura do outro lado
    const pin = hanging ? (this._pin = this._pin || { i: this.up, p: new THREE.Vector3() }) : null;
    if (pin) pin.p.copy(this.hook);
    this.tail.update(this.tsim.update(dt, this.corpo.bot, windDirH, VENTO, t, pin), t, windDirH);
  }

  /** a linha da avoada (o pedaço exato do corte), solta, presa na pipa: física de fio com peso e vento */
  drawRope(t, windDirH) {
    const c = this.mesh.position;
    if (!this.rsim) {
      const pts = this.piece && this.piece.length > 1 ? this.piece : [c.clone(), c.clone().addScaledVector(windDirH, -this.tlen * .4).add(new THREE.Vector3(0, -this.tlen * .9, 0))];
      this.rsim = new LinhaSolta(pts, ND, { chao: groundH });
    }
    this.rsim.update(this._dt || .016, c, windDirH, VENTO, t);
    this.rsim.write(this.rope.geometry.attributes.position, 0);
  }
  /** pontos atuais da linha solta dela (passa adiante se ela soltar e virar avoada) */
  linePts() { return this.rsim ? this.rsim.toArray() : null; }

  /** duas voltinhas da linha da avoada em volta da linha de quem aparou */
  drawCoil(t, tan) {
    const p = this.coilL.geometry.attributes.position;
    _s.crossVectors(tan, _up).normalize(); _n.crossVectors(_s, tan).normalize();
    for (let i = 0; i < NC; i++) {
      const s = i / (NC - 1), a = s * Math.PI * 4, r = .09; // voltinhas paradas em volta da linha
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
  /** caindo de verdade: peso, vento e a linha dela arrastando, até o chão (e fica um pouco lá) */
  fall(dt, t, windDirH) {
    this._dt = dt;
    const gy = groundH(this.pos.x, this.pos.z) + .3;
    if (this.pos.y > gy) {
      this.vel.y -= 9.81 * .55 * dt; this.vel.addScaledVector(_w.copy(windDirH).multiplyScalar(VENTO).sub(this.vel), 1.1 * dt);
      this.pos.addScaledVector(this.vel, dt);
    } else { this.pos.y = gy; this.vel.set(0, 0, 0); this.noChao = (this.noChao || 0) + dt; }
    this.pose(t, windDirH, _up, false);
    this.drawRope(t, windDirH);
    if (this.noChao > 4 || this.t > 25) { this.dispose(); return false; }
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
