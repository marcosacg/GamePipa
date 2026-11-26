// Linha da pipa desenhada como corda (só visual).
// Ela segue o formato "oficial" da linha (barriga calculada em js/shared/linha.js, o mesmo da arena),
// mas com atraso e tremido: quando a pipa dá cabeçada a linha chicoteia, com vento ela treme,
// e quando se dá linha a folga fica balançando. Cada ponto é puxado por uma mola até o formato,
// e um limite de comprimento por trecho impede a linha de esticar além do que tem.
import * as THREE from 'three';
import { sagOf } from './shared/linha.js';
import { noise1 } from './shared/wind.js';

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

    // tremido: ondas que correm pela linha, mais fortes com vento, no meio dela e com folga
    _side.crossVectors(_ab, _up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0); else _side.normalize();
    const amp = (.02 + .008 * windSpeed) * Math.min(1, dist / 15) * (1 + dist / 50) * (1 + Math.min(2.5, slack * .25)) * (o.giving ? 1.6 : 1);

    const segMax = (dist + (dist > .5 ? 8 * sag * sag / (3 * dist) : 0)) / n * 1.03 + .002;
    const steps = dt > .025 ? 2 : 1, h = Math.min(dt, .05) / steps;
    for (let st = 0; st < steps; st++) {
      P[0].copy(a); P[n].copy(b);
      for (let i = 1; i < n; i++) {
        const s = i / n, mid = Math.sin(Math.PI * s);
        // perto da mão a folga fica mais solta (mola mais fraca)
        const k = (ip === i ? 400 : 15 + 22 * s) * (o.giving ? .7 : 1); // mola mais mole: a linha faz "S" quando a pipa corre
        _d.subVectors(T[i], P[i]).multiplyScalar(k);
        const w1 = noise1(t * 1.9 - s * 5 + this.seed), w2 = noise1(t * 2.4 - s * 6 + this.seed + 31); // ondas suaves que correm pela linha
        _d.addScaledVector(_side, w1 * amp * 22 * mid).addScaledVector(_up, w2 * amp * 12 * mid);
        V[i].addScaledVector(_d, h).multiplyScalar(Math.exp(-9 * h));
        P[i].addScaledVector(V[i], h);
      }
      if (ip > 0) { P[ip].copy(o.pin); V[ip].set(0, 0, 0); }
      // a linha não estica: nenhum trecho fica maior que o comprimento dela permite
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < n; i++) {
          _t.subVectors(P[i + 1], P[i]);
          const l = _t.length();
          if (l <= segMax) continue;
          const c = (l - segMax) / l;
          const fa = i === 0 || i === ip ? 0 : i + 1 === n || i + 1 === ip ? 1 : .5;
          P[i].addScaledVector(_t, c * fa);
          P[i + 1].addScaledVector(_t, -c * (1 - fa));
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
