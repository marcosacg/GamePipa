// Formato da linha da pipa, igual no servidor e no navegador.
// A linha não é uma reta: ela faz "barriga" (cai no meio e é empurrada pelo vento). O desenho no navegador
// é uma corda simulada (js/corda.js) que segue este mesmo formato, e a arena (enroscada, rabiola presa,
// aparar avoada) usa estas polilinhas. Assim o que se vê é o que conta na disputa.
// Sem dependências além do vento, para rodar no Node também.

import { noise1 } from './wind.js';

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (a, b, x) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** quantos pontos as polilinhas da arena usam (10 trechos) */
export const POLY_N = 10;

/**
 * Barriga da linha (m), no meio dela. dist = distância da mão até a pipa, L = linha solta.
 * Esticada ela ainda cai um pouco (2,2% da distância: 6,6 m com 300 m de linha); com folga cai bem mais.
 */
export function sagOf(dist, L) {
  const slack = Math.max(0, L - dist);
  return Math.min(dist * 0.45, dist * 0.022 + slack * 0.55);
}

/**
 * Pontos da linha da mão (h) até a pipa (k): array de n+1 pontos [x,y,z].
 * wdx, wdz = para onde o vento sopra (a barriga vai um pouco pra lá).
 */
export function lineShape(h, k, L, wdx, wdz, n = POLY_N, out = []) {
  const dx = k[0] - h[0], dy = k[1] - h[1], dz = k[2] - h[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const sag = sagOf(dist, L);
  for (let i = 0; i <= n; i++) {
    const t = i / n, b = 4 * t * (1 - t) * sag;
    const p = out[i] || (out[i] = [0, 0, 0]);
    p[0] = h[0] + dx * t + wdx * b * 0.3;
    p[1] = h[1] + dy * t - b;
    p[2] = h[2] + dz * t + wdz * b * 0.3;
  }
  out.length = n + 1;
  return out;
}

/**
 * Linha que a pipa avoada vai arrastando (o pedaço que sobrou depois do corte):
 * sai da pipa, desce e fica pra trás (contra o vento). tl = comprimento (m).
 */
export function strayTrail(p, tl, wdx, wdz, n = 8, out = []) {
  for (let i = 0; i <= n; i++) {
    const s = i / n * tl;
    const q = out[i] || (out[i] = [0, 0, 0]);
    const bow = Math.sin(Math.PI * i / n) * tl * 0.05;
    q[0] = p[0] - wdx * s * 0.45;
    q[1] = p[1] - s * 0.86 + bow;
    q[2] = p[2] - wdz * s * 0.45;
  }
  out.length = n + 1;
  return out;
}

/**
 * Vento conforme a altura: perto do chão é mais fraco, lá em cima mais forte.
 * 0 m: 72% · 30 m: 100% · 140 m ou mais: 118%.
 */
export function heightWind(y) {
  return 0.72 + 0.28 * sm(0, 30, y) + 0.18 * sm(30, 140, y);
}
/** rajadas que só existem lá no alto (a pipa alta "sente" mais o vento): multiplica o vento, 0,82..1,18 */
export function highGust(y, t) {
  return 1 + 0.18 * sm(25, 120, y) * noise1(t * 0.7 + 13);
}

/* ---------------- geometria ---------------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = 0; t = 0; }
  else if (a <= 1e-9) { s = 0; t = cl(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) { t = 0; s = cl(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? cl((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = cl(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = cl((b - c) / a, 0, 1); }
    }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  const dd = sub(c1, c2);
  return { d: Math.sqrt(dot(dd, dd)), s, t, c1, c2 };
}

/** caixa que envolve um trecho (com folga), para pular pares que estão longe */
function far(a0, a1, b0, b1, tol) {
  for (let k = 0; k < 3; k++) {
    const amin = Math.min(a0[k], a1[k]) - tol, amax = Math.max(a0[k], a1[k]) + tol;
    if (Math.max(b0[k], b1[k]) < amin || Math.min(b0[k], b1[k]) > amax) return true;
  }
  return false;
}

/**
 * Pontos mais próximos entre duas polilinhas.
 * s e t = onde, ao longo de cada uma (0 = começo, 1 = fim). c1/c2 = os pontos.
 */
export function polyPoly(A, B, tol = 4) {
  let best = null;
  const na = A.length - 1, nb = B.length - 1;
  for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
    if (best && far(A[i], A[i + 1], B[j], B[j + 1], Math.min(tol, best.d))) continue;
    const r = segSeg(A[i], A[i + 1], B[j], B[j + 1]);
    if (!best || r.d < best.d) { r.s = (i + r.s) / na; r.t = (j + r.t) / nb; best = r; }
  }
  return best || { d: Infinity, s: 0, t: 0, c1: A[0], c2: B[0] };
}

/** distância de um ponto até a polilinha; u = onde (0..1), c = ponto mais próximo */
export function pointPoly(p, A) {
  let best = Infinity, bu = 0, bc = A[0];
  const n = A.length - 1;
  for (let i = 0; i < n; i++) {
    const a = A[i], ab = sub(A[i + 1], a);
    const t = cl(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
    const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const dd = sub(c, p), d = Math.sqrt(dot(dd, dd));
    if (d < best) { best = d; bu = (i + t) / n; bc = c; }
  }
  return { d: best, u: bu, c: bc };
}
