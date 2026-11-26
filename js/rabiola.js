// Rabiola com física (só visual): uma corrente de pontos com peso, presa no pé da pipa, que o vento
// arrasta e faz tremular (ondas que correm do pé até a ponta, como fita de verdade).
// Ela segue a pipa com atraso: chicoteia nas cabeçadas, fica pra trás quando a pipa corre e cai pendurada
// quando o vento para. Usada nas pipas dos outros jogadores/bots, nas avoadas e nas pipas caindo.
// (A rabiola da SUA pipa é feita no motor de física, em kite.js, com o mesmo tremido.)
import * as THREE from 'three';
import { noise1 } from './shared/wind.js';

export const RABIOLA = {
  seg: .36,       // distância entre os laços (m)
  peso: 9,        // gravidade
  arrasto: 2,     // quanto o vento puxa a fita (com vento de 7 m/s ela fica uns 30° abaixo da horizontal)
  tremido: .55,   // força do tremido (× velocidade do vento)
};
/** força de tremido no laço i (lado e cima), igual para todas as rabiolas */
export function flutter(t, i, seed, wind, out) {
  const a = noise1(t * 6.5 - i * .9 + seed), b = noise1(t * 5.1 - i * .7 + seed + 17);
  return out.set(a, b * .6, -a * .5).multiplyScalar(RABIOLA.tremido * wind * Math.min(1, .3 + i * .15));
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3();

export class TailSim {
  /** opts: { peso, arrasto, tremido } para correntes diferentes (ex.: linha solta, mais leve) */
  constructor(n, seed = Math.random() * 50, seg = RABIOLA.seg, opts = {}) {
    this.n = n; this.seed = seed; this.seg = seg;
    this.peso = opts.peso ?? RABIOLA.peso; this.arrasto = opts.arrasto ?? RABIOLA.arrasto; this.trem = opts.tremido ?? 1;
    this.p = []; this.o = [];
    for (let i = 0; i <= n; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    this.ok = false; this.last = new THREE.Vector3();
  }
  reset() { this.ok = false; }
  /**
   * attach = pé da pipa; windDirH = para onde o vento sopra; wind = velocidade do vento (m/s).
   * pin = { i, p }: o laço i fica preso no ponto p (rabiola enroscada numa linha). Devolve os pontos.
   */
  update(dt, attach, windDirH, wind, t, pin = null) {
    const n = this.n, P = this.p, O = this.o;
    if (!this.ok || attach.distanceToSquared(this.last) > 36) { // começo ou pulou: nasce pendurada a favor do vento
      for (let i = 0; i <= n; i++) {
        P[i].copy(attach).addScaledVector(windDirH, i * this.seg * .7); P[i].y -= i * this.seg * .7;
        O[i].copy(P[i]);
      }
      this.ok = true;
    }
    this.last.copy(attach);
    _s.set(-windDirH.z, 0, windDirH.x); // lado (perpendicular ao vento)
    const steps = dt > .02 ? 2 : 1, h = Math.min(dt, .05) / steps;
    for (let st = 0; st < steps; st++) {
      P[0].copy(attach);
      for (let i = 1; i <= n; i++) {
        if (pin && i === pin.i) { O[i].copy(P[i]); P[i].copy(pin.p); continue; }
        // Verlet: velocidade = posição agora − antes
        _v.subVectors(P[i], O[i]).multiplyScalar(1 / h);
        _w.copy(windDirH).multiplyScalar(wind).sub(_v);                 // vento que o laço sente
        _f.copy(_w).multiplyScalar(this.arrasto);
        _f.y -= this.peso;
        flutter(t, i, this.seed, wind * this.trem, _d);
        _f.addScaledVector(_s, _d.x).addScaledVector(windDirH, _d.z); _f.y += _d.y;
        O[i].copy(P[i]);
        P[i].addScaledVector(_v, h * .985).addScaledVector(_f, h * h);
      }
      // laços presos uns nos outros (não esticam), do pé até a ponta
      const pi = pin ? pin.i : -1;
      for (let it = 0; it < 5; it++) {
        P[0].copy(attach); if (pin) P[pi].copy(pin.p);
        for (let i = 0; i < n; i++) {
          _d.subVectors(P[i + 1], P[i]);
          const l = _d.length() || 1e-6, c = (l - this.seg) / l;
          const fa = i === 0 || i === pi ? 0 : i + 1 === pi ? 1 : .5; // pontos presos não se mexem
          P[i].addScaledVector(_d, c * fa); P[i + 1].addScaledVector(_d, -c * (1 - fa));
        }
      }
      if (pin) P[pi].copy(pin.p);
    }
    P[0].copy(attach);
    return P;
  }
}
