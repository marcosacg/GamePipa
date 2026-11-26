// Linha da pipa desenhada como corda (só visual).
// Ela segue o formato "oficial" da linha (barriga calculada em js/shared/linha.js, o mesmo da arena),
// mas com atraso e tremido: quando a pipa dá cabeçada a linha chicoteia, com vento ela treme,
// e quando se dá linha a folga fica balançando. Cada ponto é puxado por uma mola até o formato,
// e um limite de comprimento por trecho impede a linha de esticar além do que tem.
import * as THREE from 'three';
import { sagOf } from './shared/linha.js';
import { noise1 } from './shared/wind.js';

const ARRASTO = 1.1, PESO = 5, GUIA = 6; // vento no fio · peso da linha · mola até o formato oficial (linha bem esticada)
const _tg = new THREE.Vector3(), _acc = new THREE.Vector3();
const _ab = new THREE.Vector3(), _side = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3(), _d = new THREE.Vector3();

export class Corda {
  /** n = número de trechos (a corda tem n+1 pontos) */
  constructor(n, seed = Math.random() * 100) {
    this.n = n; this.seed = seed;
    this.p = []; this.v = []; this.tgt = [];
    for (let i = 0; i <= n; i++) { this.p.push(new THREE.Vector3()); this.v.push(new THREE.Vector3()); this.tgt.push(new THREE.Vector3()); }
    this.ok = false;
    this.lastA = new THREE.Vector3(); this.lastB = new THREE.Vector3();
  }
  /** esquece o movimento (próxima atualização já nasce no formato certo) */
  reset() { this.ok = false; }

  /**
   * a = mão, b = pipa, L = linha solta (m), windDirH = direção do vento, windSpeed (m/s), t = relógio.
   * o = { pin: ponto da enroscada (a linha passa por ali), giving: dando linha }
   */
  update(dt, a, b, L, windDirH, windSpeed, t, o = {}) {
    const n = this.n, P = this.p, V = this.v, T = this.tgt;
    _ab.subVectors(b, a);
    const dist = Math.max(.01, _ab.length());
    const sag = sagOf(dist, L);
    const slack = Math.max(0, L - dist);

    // formato que a linha "quer" ter (o mesmo da arena), ou passando pelo ponto da enroscada
    let ip = -1;
    if (o.pin) {
      const f = Math.min(.92, Math.max(.08, _t.subVectors(o.pin, a).dot(_ab) / (dist * dist)));
      ip = Math.max(2, Math.min(n - 2, Math.round(f * n)));
      for (let i = 0; i <= n; i++) {
        if (i <= ip) T[i].lerpVectors(a, o.pin, i / ip); else T[i].lerpVectors(o.pin, b, (i - ip) / (n - ip));
        const s = i <= ip ? i / ip : (i - ip) / (n - ip);
        T[i].y -= 4 * s * (1 - s) * sag * .25;
      }
    } else {
      for (let i = 0; i <= n; i++) {
        const s = i / n, bb = 4 * s * (1 - s) * sag;
        T[i].lerpVectors(a, b, s);
        T[i].y -= bb;
        T[i].x += windDirH.x * bb * .3; T[i].z += windDirH.z * bb * .3;
      }
    }

    // começo, ou a pipa/mão "pulou" (pipa nova, troca de cenário): nasce pronta
    if (!this.ok || a.distanceToSquared(this.lastA) > 400 || b.distanceToSquared(this.lastB) > 900) {
      for (let i = 0; i <= n; i++) { P[i].copy(T[i]); V[i].set(0, 0, 0); }
      this.ok = true;
    }
    this.lastA.copy(a); this.lastB.copy(b);

    /*
      Física da linha: cada ponto tem peso, é empurrado pelo vento (arrasto só de lado, como num fio)
      e a linha não estica (comprimento de cada trecho limitado). Uma mola bem fraca puxa para o formato
      "oficial" (o mesmo da arena), só para o desenho não se afastar do que vale na disputa.
      Com isso ela faz barriga sozinha, chicoteia nas cabeçadas, faz "S" quando a pipa corre e balança com as rajadas.
    */
    _side.crossVectors(_ab, _up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0); else _side.normalize();
    const Lr = dist + (dist > .5 ? 8 * sag * sag / (3 * dist) : 0);       // comprimento da linha entre a mão e a pipa
    const segMax = Lr / n * 1.01 + .002;
    const steps = dt > .02 ? 3 : 2, h = Math.min(dt, .05) / steps;
    const gust = (.12 + .035 * windSpeed) * (o.giving ? 2.2 : 1);          // rajadinhas que correm pela linha (esticada quase não balança)
    // linha esticada (sem folga): a pipa puxa forte e a linha fica reta, firme no formato; com folga ela fica solta
    const taut = Math.max(0, Math.min(1, 1 - slack / (1 + dist * .03)));
    const guia = GUIA + 34 * taut, arr = ARRASTO * (1 - .6 * taut), peso = PESO * (1 - .5 * taut);
    for (let st = 0; st < steps; st++) {
      P[0].copy(a); P[n].copy(b);
      for (let i = 1; i < n; i++) {
        const s = i / n;
        // vento no ponto (com rajadas que andam pela linha) menos a velocidade dele = vento que ele sente
        const m = s * Lr, w1 = noise1(t * 1.3 - m * .07 - s * 2 + this.seed), w2 = noise1(t * 1.7 - m * .1 - s * 2 + this.seed + 31);
        _d.copy(windDirH).multiplyScalar(windSpeed * (1 + .35 * w1)).addScaledVector(_side, w2 * gust * windSpeed).addScaledVector(_up, w1 * gust * 2).sub(V[i]);
        _tg.subVectors(P[i + 1], P[i - 1]); const tl = _tg.length() || 1; _tg.multiplyScalar(1 / tl);
        _d.addScaledVector(_tg, -_d.dot(_tg));                              // fio: o vento só empurra de lado
        _acc.copy(_d).multiplyScalar(arr);
        _acc.y -= peso;                                                     // peso da linha
        _acc.addScaledVector(_t.subVectors(T[i], P[i]), ip === i ? 400 : guia); // mola até o formato oficial (forte quando esticada)
        V[i].addScaledVector(_acc, h).multiplyScalar(Math.exp(-(1.5 + 5 * taut) * h));
        P[i].addScaledVector(V[i], h);
      }
      if (ip > 0) { P[ip].copy(o.pin); V[ip].set(0, 0, 0); }
      // a linha não estica: vai e volta pela linha algumas vezes encurtando os trechos compridos
      for (let it = 0; it < 6; it++) {
        const fwd = it % 2 === 0;
        for (let q = 0; q < n; q++) {
          const i = fwd ? q : n - 1 - q;
          _t.subVectors(P[i + 1], P[i]);
          const l = _t.length();
          if (l <= segMax) continue;
          const c = (l - segMax) / l;
          const fa = i === 0 || i === ip ? 0 : i + 1 === n || i + 1 === ip ? 1 : .5;
          P[i].addScaledVector(_t, c * fa);
          P[i + 1].addScaledVector(_t, -c * (1 - fa));
          // o que a linha segurou vira velocidade a menos (senão ela "vibra")
          if (fa > 0) V[i].addScaledVector(_t, c * fa / h * .5);
          if (fa < 1) V[i + 1].addScaledVector(_t, -c * (1 - fa) / h * .5);
        }
      }
    }
    P[0].copy(a); P[n].copy(b);
    return this;
  }

  /** copia os pontos para a geometria de uma THREE.Line, a partir do vértice "from" */
  write(attr, from = 0) {
    for (let i = 0; i <= this.n; i++) attr.setXYZ(from + i, this.p[i].x, this.p[i].y, this.p[i].z);
    attr.needsUpdate = true;
  }
}
