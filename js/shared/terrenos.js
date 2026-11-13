// Formato do terreno de cada cenário. Sem Three.js: o servidor também usa
// (para saber quando uma pipa avoada chegou no chão/telhado).
import { hash } from './wind.js';

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, x) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
export function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(a * 57.0 + b * 131.0);
  return lerp(lerp(h(i, j), h(i + 1, j), ux), lerp(h(i, j + 1), h(i + 1, j + 1), ux), uy) * 2 - 1;
}

export const TERRAIN = {
  campinho(x, z) {
    const r = Math.sqrt(x * x + z * z);
    return smooth(110, 260, r) * (6 + noise2(x * .012, z * .012) * 9) + smooth(110, 200, r) * noise2(x * .05, z * .05) * 1.5;
  },
  laje(x, z) {
    const front = 36 * smooth(12, -140, z) * (1 - .55 * smooth(-200, -300, z));   // morro na frente
    const back = -15 * smooth(0, 160, z);                                          // desce para o vale
    const side = 16 * smooth(80, 240, Math.abs(x - 25 * Math.sin(z * .008)));     // morros dos lados
    const n = noise2(x * .016, z * .016) * 3.2 + noise2(x * .07 + 3, z * .07) * .7;
    const flat = 1 - smooth(12, 30, Math.hypot(x, z));
    return front + back + side + n * (1 - flat * .8);
  },
  morro(x, z) {
    const down = -40 * smooth(-4, -110, z);
    const other = 55 * smooth(-125, -255, z);                                       // morro do outro lado, de frente
    const side = -20 * smooth(22, 80, Math.abs(x)) * smooth(36, -4, z);             // laterais caem logo depois do terrão
    const back = 7 * smooth(18, 90, z) + 6 * smooth(60, 160, Math.abs(x)) * smooth(-20, 60, z);
    const n = noise2(x * .02, z * .02) * 3.5 + noise2(x * .08 + 7, z * .08) * .8;
    const raw = down + other + side + back + n;
    const m = 1 - smooth(16, 34, Math.hypot(x, (z - 4) * 1.1));
    return lerp(raw, noise2(x * .1, z * .1) * .25, m);
  },
};

/** chão aproximado para o servidor: terreno + altura média dos telhados onde tem favela */
export function approxGround(scene) {
  const T = TERRAIN[scene] || TERRAIN.campinho;
  if (scene === 'laje') return (x, z) => T(x, z) + (Math.hypot(x, z) < 22 ? 8 : 5);
  if (scene === 'morro') return (x, z) => T(x, z) + (Math.hypot(x, (z - 4) * 1.1) < 36 ? 0 : 5);
  return T;
}
