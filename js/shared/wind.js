// Vento determinístico: cliente e servidor calculam o MESMO vento a partir do tempo da sala.
// Sem dependências, para rodar tanto no navegador quanto no Node.

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = hash(i), b = hash(i + 1);
  return (a + (b - a) * u) * 2 - 1;
}

/**
 * Estado do vento no instante t (segundos).
 * base = velocidade média (m/s), gust = intensidade das rajadas (0..1).
 * Retorna { speed, dir, dx, dz } — (dx, dz) é a direção horizontal para onde o vento sopra.
 */
export function windState(t, base = 5.8, gust = 0.35, out = {}) {
  const g = 1 + gust * noise1(t * 0.23 + 3) + 0.14 * noise1(t * 1.3)
    + (gust > 0.5 ? 0.35 * Math.max(0, noise1(t * 0.6 + 40)) : 0);
  out.speed = Math.min(17, Math.max(1.2, base * g));
  out.dir = 0.38 * noise1(t * 0.018 + 50);
  out.dx = Math.sin(out.dir);
  out.dz = -Math.cos(out.dir);
  return out;
}
