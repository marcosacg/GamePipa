// Utilidades matemáticas e ruído
import { hash, noise1 } from './shared/wind.js';
export { noise1 };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a, b) => a + Math.random() * (b - a);

export function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(a * 57.0 + b * 131.0);
  return lerp(lerp(h(i, j), h(i + 1, j), ux), lerp(h(i, j + 1), h(i + 1, j + 1), ux), uy) * 2 - 1;
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** distância do ponto p ao segmento a-b (objetos com x,y,z) */
export function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1;
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// gerador pseudo-aleatório com semente (cenário sempre igual)
let seed = 7;
export function srand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
