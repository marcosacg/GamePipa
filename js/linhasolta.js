// Física de linha solta e de pipa solta (só visual, mas tudo integrado: nada de animação pronta).
//
// LinhaSolta: um pedaço de linha de verdade, com comprimento fixo, que nasce exatamente no formato que a
// linha tinha na hora do corte. Cada ponto tem peso e é empurrado pelo vento (fio: o vento quase só empurra
// de lado), a linha não estica mas pode dobrar/embolar, e encosta no chão. Pode ficar presa numa ponta
// (a mão de quem foi cortado, a pipa avoada, a pipa aparada) e solta na outra.
//
// CorpoSolto: a pipa sem linha esticada (avoada, aparada). É uma vareta com o pé pesado (rabiola) e o bico
// pegando vento (o pano). O centro vai para onde a física manda; a vareta gira sozinha pelo peso, pelo
// vento relativo e pela aceleração do centro (como um pêndulo), e o pano roda em volta da vareta com o vento.
import * as THREE from 'three';
import { noise1 } from './shared/wind.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _tg = new THREE.Vector3(), _d = new THREE.Vector3(),
  _a = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const P3 = p => (p.isVector3 ? p : _a.set(p[0], p[1], p[2]));

/** comprimento de uma lista de pontos */
export function arcLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += P3(pts[i]).clone().distanceTo(P3(pts[i - 1]));
  return L;
}

/**
 * Corta uma corda (lista de Vector3 da mão até a pipa) no ponto mais perto de x.
 * Devolve { mao: [mão .. corte], pipa: [pipa .. corte] } — cada pedaço começa na ponta que fica presa.
 */
export function cortarEm(pts, x) {
  const X = x.isVector3 ? x : new THREE.Vector3(x[0], x[1], x[2]);
  let bi = 0, bu = 0, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    _tg.subVectors(pts[i + 1], pts[i]);
    const l2 = _tg.lengthSq() || 1e-9;
    const u = Math.max(0, Math.min(1, _d.subVectors(X, pts[i]).dot(_tg) / l2));
    const d = _s.copy(pts[i]).addScaledVector(_tg, u).distanceToSquared(X);
    if (d < bd) { bd = d; bi = i; bu = u; }
  }
  const c = new THREE.Vector3().copy(pts[bi]).lerp(pts[bi + 1], bu);
  const mao = pts.slice(0, bi + 1).map(p => p.clone()); mao.push(c.clone());
  const pipa = pts.slice(bi + 1).map(p => p.clone()).reverse(); pipa.push(c.clone());
  return { mao, pipa, c };
}

export class LinhaSolta {
  /**
   * pts = formato inicial (Vector3 ou [x,y,z]), da ponta presa até a ponta solta; n = trechos.
   * opts: { peso, arrasto, chao(x,z) → altura do chão, comp: comprimento (m) se não vier pts }
   */
  constructor(pts, n = 24, opts = {}) {
    this.n = n; this.peso = opts.peso ?? 3.5; this.arrasto = opts.arrasto ?? 4; // linha leve, mas cai (não fica boiando) this.chao = opts.chao || null;
    this.seed = Math.random() * 100;
    this.p = []; this.o = [];
    for (let i = 0; i <= n; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    this.set(pts);
  }
  /** recomeça no formato pts (reamostrado com trechos iguais) */
  set(pts) {
    const n = this.n, src = pts.map(p => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
    if (src.length < 2) src.push(src[0].clone().add(new THREE.Vector3(0, -.1, 0)));
    const cum = [0];
    for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + src[i].distanceTo(src[i - 1]));
    const L = Math.max(.05, cum[cum.length - 1]);
    this.len = L; this.seg = L / n;
    let j = 0;
    for (let i = 0; i <= n; i++) {
      const s = i / n * L;
      while (j < src.length - 2 && cum[j + 1] < s) j++;
      const u = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      this.p[i].copy(src[j]).lerp(src[j + 1], Math.max(0, Math.min(1, u)));
      this.o[i].copy(this.p[i]);
    }
    return this;
  }
  /** dá um empurrão (velocidade v na ponta solta, zero na ponta presa): o "estalo" da linha esticada no corte */
  kick(v, h = .007) { for (let i = 0; i <= this.n; i++) this.o[i].addScaledVector(v, -h * i / this.n); }
  /** recolhe (encurta) dl metros, como quem puxa a linha solta de volta */
  recolher(dl) { this.seg = Math.max(.02, this.seg - dl / this.n); this.len = this.seg * this.n; }

  /**
   * a = onde a ponta 0 está presa (ou null: solta); b = onde a última ponta está presa (ou null).
   * windDirH = para onde o vento sopra; wind = m/s; t = relógio.
   */
  update(dt, a, windDirH, wind, t, b = null) {
    const n = this.n, P = this.p, O = this.o;
    const steps = dt > .02 ? 3 : 2, h = Math.min(dt, .05) / steps;
    for (let st = 0; st < steps; st++) {
      for (let i = 0; i <= n; i++) {
        if ((i === 0 && a) || (i === n && b)) continue;
        _v.subVectors(P[i], O[i]).multiplyScalar(1 / h);
        // vento que o ponto sente (com rajadas que correm pela linha), menos a velocidade dele
        // (as rajadas têm tamanho em metros: a linha faz ondas e "S" como fio leve no ar)
        const m = i * this.seg, g1 = noise1(t * 1.1 - m * .16 + this.seed), g2 = noise1(t * 1.5 - m * .22 + this.seed + 21);
        _w.copy(windDirH).multiplyScalar(wind * (1 + .3 * g1));
        _w.x += -windDirH.z * g2 * wind * .5; _w.z += windDirH.x * g2 * wind * .5; _w.y += g1 * 1.6 + noise1(t * .8 - m * .1 + this.seed + 40) * .9;
        _w.sub(_v);
        // fio: o vento empurra quase só de lado (pouco ao comprido)
        const j0 = Math.max(0, i - 1), j1 = Math.min(n, i + 1);
        _tg.subVectors(P[j1], P[j0]); const tl = _tg.length();
        if (tl > 1e-6) { _tg.multiplyScalar(1 / tl); _w.addScaledVector(_tg, -_w.dot(_tg) * .85); }
        O[i].copy(P[i]);
        P[i].addScaledVector(_v, h).addScaledVector(_w, this.arrasto * h * h);
        P[i].y -= this.peso * h * h;
        if (this.chao) { // encosta no chão e fica (com atrito)
          const gy = this.chao(P[i].x, P[i].z) + .03;
          if (P[i].y < gy) { P[i].y = gy; O[i].x += (P[i].x - O[i].x) * .6; O[i].z += (P[i].z - O[i].z) * .6; O[i].y = gy; }
        }
      }
      if (a) P[0].copy(a);
      if (b) P[n].copy(b);
      // não estica (mas dobra e embola): vai e volta encurtando os trechos compridos
      for (let it = 0; it < 6; it++) {
        const fwd = it % 2 === 0;
        for (let q = 0; q < n; q++) {
          const i = fwd ? q : n - 1 - q;
          _d.subVectors(P[i + 1], P[i]);
          const l = _d.length();
          if (l <= this.seg) continue;
          const c = (l - this.seg) / l;
          const pa = (i === 0 && a), pb = (i + 1 === n && b);
          const fa = pa && pb ? 0 : pa ? 0 : pb ? 1 : .5;
          if (pa && pb) continue;
          P[i].addScaledVector(_d, c * fa); P[i + 1].addScaledVector(_d, -c * (1 - fa));
        }
      }
    }
    if (a) P[0].copy(a);
    if (b) P[n].copy(b);
    return P;
  }
  /** copia os pontos para a geometria de uma THREE.Line (a partir do vértice "from"); sobra = repete o último */
  write(attr, from = 0) {
    const n = this.n, cnt = attr.count;
    for (let k = from; k < cnt; k++) { const q = this.p[Math.min(n, k - from)]; attr.setXYZ(k, q.x, q.y, q.z); }
    attr.needsUpdate = true;
  }
  /** pontos como [x,y,z] (para passar adiante: avoada → aparada) */
  toArray() { return this.p.map(q => q.clone()); }
}

/**
 * Pipa solta (avoada ou aparada): vareta com o pé pesado (rabiola) e o bico pegando vento.
 * h = meia altura da pipa. Use: update(dt, centro, ...) e depois apply(mesh).
 */
export class CorpoSolto {
  constructor(h = .45, seed = Math.random() * 50) {
    this.h = h; this.seed = seed;
    this.ax = new THREE.Vector3(0, 1, 0);           // do pé para o bico
    this.top = new THREE.Vector3(); this.topO = new THREE.Vector3();
    this.bot = new THREE.Vector3(); this.botO = new THREE.Vector3();
    this.spin = Math.random() * 6.28; this.spinV = 0;
    this.ok = false;
  }
  reset() { this.ok = false; }
  /**
   * c = ponto fixo da vareta (o centro da avoada, ou o pé quando ela está pendurada pela rabiola: pe = true).
   * wind = m/s. Devolve o eixo (pé → bico).
   */
  update(dt, c, windDirH, wind, t, pe = false) {
    const h2 = this.h * 2;
    if (!this.ok) {
      this.bot.copy(c).addScaledVector(this.ax, pe ? 0 : -this.h); this.top.copy(this.bot).addScaledVector(this.ax, h2);
      this.botO.copy(this.bot); this.topO.copy(this.top); this.ok = true;
    }
    const steps = 2, k = Math.min(dt, .05) / steps;
    for (let st = 0; st < steps; st++) {
      const g1 = noise1(t * 2.3 + this.seed), g2 = noise1(t * 1.9 + this.seed + 9);
      // bico (o pano pega vento) e pé (rabiola: pesado, pouco arrasto)
      _w.copy(windDirH).multiplyScalar(wind * (1 + .45 * g1)); _w.x += -windDirH.z * wind * .5 * g2; _w.z += windDirH.x * wind * .5 * g2; _w.y += 1.5 * g1;
      _v.subVectors(this.top, this.topO).multiplyScalar(1 / k);
      this.topO.copy(this.top);
      this.top.addScaledVector(_v, k * .99).addScaledVector(_w.sub(_v), 2 * k * k);
      this.top.y -= 5.5 * k * k;
      _v.subVectors(this.bot, this.botO).multiplyScalar(1 / k);
      this.botO.copy(this.bot);
      _w.copy(windDirH).multiplyScalar(wind).sub(_v);
      this.bot.addScaledVector(_v, k * .99).addScaledVector(_w, .5 * k * k);
      this.bot.y -= 9.8 * k * k;
      // vareta rígida, presa no ponto c (centro ou pé)
      _d.subVectors(this.top, this.bot); const l = _d.length() || 1e-6; _d.multiplyScalar(1 / l);
      if (pe) { this.bot.copy(c); this.top.copy(c).addScaledVector(_d, h2); }
      else { this.bot.copy(c).addScaledVector(_d, -this.h); this.top.copy(c).addScaledVector(_d, this.h); }
      this.ax.copy(_d);
      // o pano roda em volta da vareta: o vento de lado faz torque, o ar segura
      this.spinV += (wind * .9 * noise1(t * .7 + this.seed + 3) - this.spinV * 1.6) * k;
      this.spin += this.spinV * k;
    }
    return this.ax;
  }
  /** põe a pipa (mesh) no lugar: centro = meio da vareta, pano girado pelo "spin" */
  apply(mesh, windDirH) {
    mesh.position.addVectors(this.top, this.bot).multiplyScalar(.5);
    const up = this.ax;
    // frente do pano: contra o vento, tirando a parte na direção da vareta, e girada pelo spin
    _s.copy(windDirH).multiplyScalar(-1).addScaledVector(up, windDirH.dot(up));
    if (_s.lengthSq() < 1e-4) _s.set(1, 0, 0).addScaledVector(up, -up.x);
    _s.normalize();
    _s.applyQuaternion(_q.setFromAxisAngle(up, this.spin));
    _tg.crossVectors(up, _s).normalize();
    _m.makeBasis(_tg, up, _s);
    mesh.quaternion.setFromRotationMatrix(_m);
  }
}
