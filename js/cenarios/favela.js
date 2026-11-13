// Gerador de favela: centenas de casas empilhadas no morro, com tijolo aparente ou reboco pintado,
// janelas (que acendem à noite), lajes, caixas d'água, puxadinhos, fios e varais.
// Para não pesar, as casas viram poucas malhas grandes (uma por material) e as caixas d'água são instanciadas.
import * as THREE from 'three';
import { staticBox } from '../physics.js';
import { lampMats } from '../scene.js';
import { srand, lerp, setSeed } from '../utils.js';
import { rng } from '../props.js';

export const FLOOR = 2.9;                // altura de um andar
const TILE_W = 24, TILE_H = FLOOR * 2;   // a textura de fachada cobre 8 colunas de janelas × 2 andares
export const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/* =========================================================
   Texturas pintadas no canvas (também vão para Assets/texturas)
   ========================================================= */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function grain(x, w, h, amt, seed) {
  const r = rng(seed), img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}

/* mesmas janelas nas duas fachadas e no mapa de luz (para a luz cair em cima da janela certa) */
const W = 1024, H = 256, PX = W / TILE_W, PY = H / TILE_H;
const LAYOUT = (() => {
  const r = rng(77), out = [];
  for (let c = 0; c < 8; c++) for (let f = 0; f < 2; f++) {
    const k = r();
    const type = k < .13 ? 'nada' : k < .58 ? 'vidro' : k < .74 ? 'grade' : k < .88 ? 'veneziana' : 'basculante';
    const ww = type === 'basculante' ? .6 : .95 + r() * .6, wh = type === 'basculante' ? .45 : .95 + r() * .2;
    const x0 = c * 3 + .55 + r() * (2.4 - ww), y0 = f * FLOOR + .75 + (type === 'basculante' ? .05 : 0);
    out.push({ type, x0, y0, ww, wh, lit: r() < .5, ar: type === 'vidro' && r() < .22, warm: r() });
  }
  return out;
})();
const rect = (x, x0, y0, w, h) => x.fillRect(Math.round(x0 * PX), Math.round(y0 * PY), Math.round(w * PX), Math.round(h * PY));

function drawWindows(x, frameCol, sillCol) {
  for (const w of LAYOUT) {
    if (w.type === 'nada') continue;
    // moldura
    x.fillStyle = frameCol; rect(x, w.x0 - .07, w.y0 - .07, w.ww + .14, w.wh + .14);
    if (w.type === 'veneziana') {
      x.fillStyle = ['#3d6b8c', '#5b8a5a', '#8c5a3d', '#7a7a7a'][Math.floor(w.warm * 4)]; rect(x, w.x0, w.y0, w.ww, w.wh);
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let k = .08; k < w.wh; k += .1) rect(x, w.x0, w.y0 + k, w.ww, .025);
      x.fillStyle = 'rgba(0,0,0,.35)'; rect(x, w.x0 + w.ww / 2 - .015, w.y0, .03, w.wh);
    } else {
      const g = x.createLinearGradient(0, w.y0 * PY, 0, (w.y0 + w.wh) * PY);
      g.addColorStop(0, '#3d4b59'); g.addColorStop(1, '#1d2630');
      x.fillStyle = g; rect(x, w.x0, w.y0, w.ww, w.wh);
      x.fillStyle = 'rgba(255,255,255,.18)'; rect(x, w.x0 + .06, w.y0 + .06, w.ww * .35, w.wh * .25); // reflexo
      x.fillStyle = frameCol; rect(x, w.x0 + w.ww / 2 - .02, w.y0, .04, w.wh);
      if (w.type === 'grade') { x.fillStyle = '#2a2a2a'; for (let k = .12; k < w.ww; k += .16) rect(x, w.x0 + k, w.y0, .025, w.wh); }
      if (w.type === 'basculante') { x.fillStyle = frameCol; rect(x, w.x0, w.y0 + w.wh / 2 - .02, w.ww, .04); }
    }
    x.fillStyle = sillCol; rect(x, w.x0 - .12, w.y0 + w.wh + .05, w.ww + .24, .07);              // peitoril
    x.fillStyle = 'rgba(60,45,30,.13)'; rect(x, w.x0, w.y0 + w.wh + .12, w.ww, .6);             // escorrido embaixo
    if (w.ar) { x.fillStyle = '#e9e9e4'; rect(x, w.x0 + w.ww + .15, w.y0 + .2, .62, .42); x.fillStyle = '#9a9a96'; for (let k = .05; k < .4; k += .06) rect(x, w.x0 + w.ww + .19, w.y0 + .2 + k, .54, .02); }
  }
}

const FT = {};
export const favelaTex = {
  /** tijolo baiano aparente com viga e pilar de concreto */
  tijolo: () => FT.tijolo || (FT.tijolo = canvasTex(W, H, (x) => {
    x.fillStyle = '#a5826a'; x.fillRect(0, 0, W, H);
    const r = rng(5), bh = .1, bw = .21;
    for (let row = 0; row * bh < TILE_H; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let c = -1; c * bw < TILE_W; c++) {
        const L = 40 + r() * 13, S = 52 + r() * 14, hue = 12 + r() * 9;
        x.fillStyle = `hsl(${hue},${S}%,${L}%)`;
        rect(x, c * bw + off + .012, row * bh + .012, bw - .024, bh - .024);
      }
    }
    x.fillStyle = 'rgba(80,50,30,.10)'; for (let i = 0; i < 40; i++) rect(x, r() * TILE_W, r() * TILE_H, .5 + r() * 2, .2 + r() * .6);
    // vigas (em cada laje) e pilares de concreto
    x.fillStyle = '#9d9a92';
    for (let f = 0; f < 2; f++) rect(x, 0, f * FLOOR, TILE_W, .24);
    for (let c = 0; c < 8; c += 2) rect(x, c * 3, 0, .22, TILE_H);
    x.fillStyle = 'rgba(0,0,0,.12)'; for (let f = 0; f < 2; f++) rect(x, 0, f * FLOOR + .24, TILE_W, .04);
    drawWindows(x, '#8a8780', '#9d9a92');
    grain(x, W, H, 20, 5);
  })),
  /** reboco claro (a cor da casa vem dos vértices e multiplica por cima) */
  pintada: () => FT.pintada || (FT.pintada = canvasTex(W, H, (x) => {
    x.fillStyle = '#f2eee6'; x.fillRect(0, 0, W, H);
    const r = rng(9);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '110,95,80'},${.02 + r() * .04})`; x.beginPath(); x.ellipse(r() * W, r() * H, 20 + r() * 80, 10 + r() * 40, 0, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,.07)'; for (let f = 0; f < 2; f++) rect(x, 0, f * FLOOR, TILE_W, .2);
    x.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 18; i++) rect(x, r() * TILE_W, r() * TILE_H, .03 + r() * .06, .4 + r() * 1.5); // fissuras
    drawWindows(x, '#e6e3dc', '#d7d3ca');
    grain(x, W, H, 14, 9);
  })),
  /** mapa de luz das janelas (preto = apagado) */
  luz: () => FT.luz || (FT.luz = canvasTex(W, H, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    for (const w of LAYOUT) {
      if (!w.lit || w.type === 'nada' || w.type === 'veneziana') continue;
      x.fillStyle = w.warm < .7 ? '#c98e3c' : '#9fb2c8';
      rect(x, w.x0, w.y0, w.ww, w.wh);
      if (w.type === 'grade') { x.fillStyle = '#000'; for (let k = .12; k < w.ww; k += .16) rect(x, w.x0 + k, w.y0, .025, w.wh); }
    }
  })),
  /** laje de concreto vista de cima (manchas, emendas, marcas de chuva) */
  laje: () => FT.laje || (FT.laje = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#c4c0b8'; x.fillRect(0, 0, w, h);
    const r = rng(13);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(${r() < .6 ? '70,65,60' : '255,255,255'},${.012 + r() * .028})`; x.beginPath(); x.ellipse(r() * w, r() * h, 6 + r() * 50, 4 + r() * 34, r() * 3, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(40,35,30,.18)'; x.lineWidth = 1;
    for (let i = 0; i < 7; i++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - .5) * 40; py += (r() - .5) * 40; x.lineTo(px, py); } x.stroke(); }
    grain(x, w, h, 26, 13);
  })),
  /** chão de terra batida */
  terra: () => FT.terra || (FT.terra = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 900; i++) { const v = 150 + r() * 105; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 30; i++) { const v = 120 + r() * 60; x.fillStyle = `rgba(${v},${v},${v},.5)`; x.beginPath(); x.ellipse(r() * w, r() * h, 2 + r() * 5, 2 + r() * 4, 0, 0, 7); x.fill(); }
    grain(x, w, h, 30, 21);
  })),
};

/* =========================================================
   Malha "agrupada": várias caixas numa geometria só
   ========================================================= */
class Batch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  quad(a, b, c, d, nrm, uvs, cols) {
    const o = this.p.length / 3;
    for (const v of [a, b, c, d]) this.p.push(v[0], v[1], v[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const t of uvs) this.uv.push(t[0], t[1]);
    for (const cc of cols) this.c.push(cc.r, cc.g, cc.b);
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return !this.i.length; }
}

const _c0 = new THREE.Color(), _c1 = new THREE.Color();
/** parede vertical do ponto (x0,z0) ao (x1,z1); a frente fica para (-dz, dx) */
function wall(b, x0, z0, x1, z1, yb, yt, uOff, col, vTop = yt, uvMode = 'fachada') {
  const len = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
  let uv;
  if (uvMode === 'fachada') {
    const v = y => (y - vTop) / TILE_H + 1;
    uv = [[uOff / TILE_W, v(yb)], [(uOff + len) / TILE_W, v(yb)], [(uOff + len) / TILE_W, v(yt)], [uOff / TILE_W, v(yt)]];
  } else uv = [[0, yb / 3], [len / 3, yb / 3], [len / 3, yt / 3], [0, yt / 3]];
  _c0.copy(col).multiplyScalar(.62); // pé da parede mais escuro (sujeira e sombra)
  b.quad([x0, yb, z0], [x1, yb, z1], [x1, yt, z1], [x0, yt, z0], [nx, 0, nz], uv, [_c0, _c0, col, col]);
}
function top(b, xa, xb, za, zb, y, col, tile = 6) {
  b.quad([xa, y, za], [xa, y, zb], [xb, y, zb], [xb, y, za], [0, 1, 0],
    [[xa / tile, -za / tile], [xa / tile, -zb / tile], [xb / tile, -zb / tile], [xb / tile, -za / tile]], [col, col, col, col]);
}
/** caixa inteira (paredes + tampo) */
function box(b, xa, xb, za, zb, yb, yt, col, uvMode, uOff = 0) {
  wall(b, xa, zb, xb, zb, yb, yt, uOff, col, yt, uvMode);
  wall(b, xb, za, xa, za, yb, yt, uOff + 7, col, yt, uvMode);
  wall(b, xb, zb, xb, za, yb, yt, uOff + 13, col, yt, uvMode);
  wall(b, xa, za, xa, zb, yb, yt, uOff + 19, col, yt, uvMode);
  top(b, xa, xb, za, zb, yt, col);
}

const PALETTE = ['#f2efe8', '#ecdcbf', '#a9c9d8', '#f0b5a8', '#bfe0c8', '#f3dd8a', '#dcdcdc', '#f6c99a', '#9fc3e6', '#e7a1a1', '#c9b6e4', '#f7f3a0'];

/* =========================================================
   A favela
   ========================================================= */
/**
 * opts:
 *   terrain(x,z)   altura do terreno
 *   area           {x0,x1,z0,z1} onde nascem casas com colisão
 *   cell           tamanho do lote (m)
 *   reserved       retângulos onde não pode nascer casa sozinha (lajes feitas à mão)
 *   skip(x,z)      true = lote vazio (rua, escadaria, clareira)
 *   floors(x,z)    nº de andares (1..4)
 *   manual         casas feitas à mão: {xa,xb,za,zb, top, kind, color, tank}
 *   far            {r} — anel de casinhas distantes (sem colisão)
 */
export function buildFavela(root, opts) {
  const { terrain, area, cell = 7.4, reserved = [], skip = () => false, floors = () => 1 + Math.floor(srand() * 3), manual = [] } = opts;
  const houses = [];
  const blocked = (xa, xb, za, zb) => reserved.some(r => xa < r.x1 + .4 && xb > r.x0 - .4 && za < r.z1 + .4 && zb > r.z0 - .4);
  const cornerY = (xa, xb, za, zb) => {
    const ys = [terrain(xa, za), terrain(xb, za), terrain(xa, zb), terrain(xb, zb), terrain((xa + xb) / 2, (za + zb) / 2)];
    return [Math.min(...ys), Math.max(...ys)];
  };

  // ---- lotes ----
  const N = COARSE ? .8 : 1;
  for (let gx = area.x0; gx < area.x1; gx += cell) {
    for (let gz = area.z0; gz < area.z1; gz += cell) {
      const cx = gx + cell / 2, cz = gz + cell / 2;
      if (skip(cx, cz) || srand() > .9 * N + .06) continue;
      // às vezes o lote vira duas casinhas (uma na frente da outra)
      const split = srand() < .28;
      const parts = split ? [[gz, gz + cell / 2], [gz + cell / 2, gz + cell]] : [[gz, gz + cell]];
      for (const [pz0, pz1] of parts) {
        const gap = .25 + srand() * 1.1;
        const w = cell - gap - srand() * 1.4, d = (pz1 - pz0) - .25 - srand() * (split ? .4 : 1.4);
        if (w < 2.8 || d < 2.6) continue;
        const xa = gx + (cell - w) * srand(), za = pz0 + ((pz1 - pz0) - d) * srand();
        const xb = xa + w, zb = za + d;
        if (blocked(xa, xb, za, zb)) continue;
        const [y0, y1] = cornerY(xa, xb, za, zb);
        const fl = Math.max(1, Math.min(5, floors(cx, cz)));
        houses.push({ xa, xb, za, zb, yb: y0 - .8, top: y1 + fl * FLOOR + .1, kind: srand() < (opts.brick ?? .5) ? 'tijolo' : 'pintada', color: PALETTE[Math.floor(srand() * PALETTE.length)], tank: srand() < .62, extra: srand() < .3, gen: true });
      }
    }
  }
  for (const m of manual) {
    const [y0] = cornerY(m.xa, m.xb, m.za, m.zb);
    houses.push({ yb: y0 - .8, kind: 'pintada', color: '#f2efe8', tank: false, extra: false, ...m });
  }

  // ---- malhas ----
  const bT = new Batch(), bP = new Batch(), bR = new Batch(), tanks = [];
  const col = new THREE.Color(), colR = new THREE.Color();
  for (const h of houses) {
    const b = h.kind === 'tijolo' ? bT : bP;
    if (h.kind === 'tijolo') col.setRGB(1, 1, 1).multiplyScalar(.82 + srand() * .18); else col.set(h.color).multiplyScalar(.92 + srand() * .08);
    const u = Math.floor(srand() * 8) * 3;
    wall(b, h.xa, h.zb, h.xb, h.zb, h.yb, h.top, u, col);
    wall(b, h.xb, h.za, h.xa, h.za, h.yb, h.top, (u + 9) % 24, col);
    wall(b, h.xb, h.zb, h.xb, h.za, h.yb, h.top, (u + 15) % 24, col);
    wall(b, h.xa, h.za, h.xa, h.zb, h.yb, h.top, (u + 6) % 24, col);
    // laje: cinza de concreto, às vezes telha de fibrocimento (mais escura) ou pintada
    const k = srand();
    if (h.roofCol) colR.set(h.roofCol);
    else if (k < .14) colR.setRGB(.55, .56, .58); else if (k < .2) colR.set('#7aa7c7'); else if (k < .24) colR.set('#b0533c'); else colR.setRGB(1, 1, 1).multiplyScalar(.78 + srand() * .2);
    top(bR, h.xa, h.xb, h.za, h.zb, h.top, colR);
    // mureta da laje (meia altura) em parte das casas
    if (h.gen && srand() < .35) {
      const mh = .5 + srand() * .4, t = .15;
      box(b, h.xa, h.xb, h.zb - t, h.zb, h.top, h.top + mh, col, 'fachada', u);
      if (srand() < .5) box(b, h.xa, h.xa + t, h.za, h.zb - t, h.top, h.top + mh, col, 'fachada', u);
    }
    // puxadinho em cima da laje (quartinho da caixa d'água)
    let tankY = h.top, tx = 0, tz = 0;
    if (h.extra) {
      const ew = Math.min(2.6, (h.xb - h.xa) * .5), ed = Math.min(2.4, (h.zb - h.za) * .5);
      const ex = h.xa + .3 + srand() * (h.xb - h.xa - ew - .6), ez = h.za + .3 + srand() * (h.zb - h.za - ed - .6);
      box(b, ex, ex + ew, ez, ez + ed, h.top, h.top + 2.2, col, 'fachada', u);
      top(bR, ex, ex + ew, ez, ez + ed, h.top + 2.21, colR);
      h.sub = { xa: ex, xb: ex + ew, za: ez, zb: ez + ed, top: h.top + 2.2 };
      tankY = h.top + 2.2; tx = ex + ew / 2; tz = ez + ed / 2;
    } else { tx = lerp(h.xa + .9, h.xb - .9, srand()); tz = lerp(h.za + .9, h.zb - .9, srand()); }
    if (h.tank) tanks.push([tx, tankY, tz, .85 + srand() * .35]);
  }

  const facM = (map) => {
    const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .93, emissive: '#ffffff', emissiveMap: favelaTex.luz(), emissiveIntensity: 0 });
    lampMats.push(m); return m;
  };
  const roofM = new THREE.MeshStandardMaterial({ map: favelaTex.laje(), vertexColors: true, roughness: .97 });
  const add = (b, m) => { if (b.empty) return null; const o = new THREE.Mesh(b.geometry(), m); o.castShadow = true; o.receiveShadow = true; root.add(o); return o; };
  add(bT, facM(favelaTex.tijolo()));
  add(bP, facM(favelaTex.pintada()));
  add(bR, roofM);

  // caixas d'água azuis (instanciadas)
  if (tanks.length) {
    const g = new THREE.CylinderGeometry(.6, .5, .9, 14); g.translate(0, .45, 0);
    const lid = new THREE.CylinderGeometry(.64, .64, .08, 14); lid.translate(0, .94, 0);
    const im = new THREE.InstancedMesh(mergeGeos([g, lid]), new THREE.MeshStandardMaterial({ color: '#2f74b5', roughness: .45 }), tanks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    tanks.forEach((t, i) => { p.set(t[0], t[1], t[2]); s.setScalar(t[3]); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true;
    root.add(im);
  }

  // ---- colisão (pipa enrosca na laje do vizinho) ----
  for (const h of houses) {
    if (h.noBody || opts.physics === false) continue;
    staticBox((h.xb - h.xa) / 2, (h.top - h.yb) / 2, (h.zb - h.za) / 2,
      new THREE.Vector3((h.xa + h.xb) / 2, (h.top + h.yb) / 2, (h.za + h.zb) / 2), { type: 'house', label: 'na laje do vizinho' });
    if (h.sub) staticBox((h.sub.xb - h.sub.xa) / 2, 1.1, (h.sub.zb - h.sub.za) / 2,
      new THREE.Vector3((h.sub.xa + h.sub.xb) / 2, h.top + 1.1, (h.sub.za + h.sub.zb) / 2), { type: 'house', label: 'na laje do vizinho' });
  }

  // ---- altura do "chão" com as lajes (para quem anda, a câmera e a pipa que cai) ----
  const C = 8, grid = new Map();
  houses.forEach((h, i) => {
    for (let ix = Math.floor(h.xa / C); ix <= Math.floor(h.xb / C); ix++)
      for (let iz = Math.floor(h.za / C); iz <= Math.floor(h.zb / C); iz++) {
        const k = ix * 10007 + iz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
      }
  });
  function roofAt(x, z) {
    const l = grid.get(Math.floor(x / C) * 10007 + Math.floor(z / C));
    if (!l) return null;
    let best = null;
    for (const i of l) {
      const h = houses[i];
      if (x >= h.xa && x <= h.xb && z >= h.za && z <= h.zb) {
        let y = h.top;
        if (h.sub && x >= h.sub.xa && x <= h.sub.xb && z >= h.sub.za && z <= h.sub.zb) y = h.sub.top;
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  if (opts.far) buildFar(root, terrain, area, opts.far);
  return { houses, roofAt, ground: (x, z) => { const r = roofAt(x, z); return r === null ? terrain(x, z) : r; } };
}

/** um quarteirão de favela num morrinho (para a vitrine e a pasta Assets; sem colisão) */
export function makeFavelaBlock(seed = 3, brick = .5) {
  const g = new THREE.Group();
  setSeed(seed);
  const terrain = (x, z) => -z * .32 + Math.sin(x * .2) * .6;
  buildFavela(g, { terrain, area: { x0: -15, x1: 15, z0: -15, z1: 15 }, physics: false, brick, skip: () => false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(32, 32, 16, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: favelaTex.terra(), color: '#9b8670', roughness: 1 }));
  const p = ground.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrain(p.getX(i), p.getZ(i)) - .05);
  ground.geometry.computeVertexNormals(); ground.receiveShadow = true;
  g.add(ground);
  return g;
}

/** junta geometrias simples (mesmos atributos) numa só */
export function mergeGeos(list) {
  const out = new THREE.BufferGeometry();
  const names = Object.keys(list[0].attributes);
  for (const n of names) {
    const arrs = list.map(g => g.attributes[n].array), size = list[0].attributes[n].itemSize;
    const total = arrs.reduce((s, a) => s + a.length, 0), buf = new Float32Array(total);
    let o = 0; for (const a of arrs) { buf.set(a, o); o += a.length; }
    out.setAttribute(n, new THREE.BufferAttribute(buf, size));
  }
  const idx = []; let base = 0;
  for (const g of list) { const ia = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()]; for (const i of ia) idx.push(i + base); base += g.attributes.position.count; }
  out.setIndex(idx);
  return out;
}

/** casinhas lá longe, nos outros morros: só caixinhas coloridas (sem textura, sem colisão) */
function buildFar(root, terrain, area, { r = 330, density = .55, skip = () => false }) {
  const b = new Batch(), c = new THREE.Color(), cell = 8.5;
  const dens = COARSE ? density * .5 : density;
  const roofC = new THREE.Color();
  for (let x = -r; x < r; x += cell) {
    for (let z = -r; z < r; z += cell) {
      if (x > area.x0 - cell && x < area.x1 && z > area.z0 - cell && z < area.z1) continue;
      const d = Math.hypot(x, z);
      if (d > r || srand() > dens * (1 - d / r * .5) || skip(x, z)) continue;
      const w = 4 + srand() * 3.5, dd = 4 + srand() * 3.5, xa = x + srand() * (cell - w), za = z + srand() * (cell - dd);
      const y0 = Math.min(terrain(xa, za), terrain(xa + w, za + dd)) - 1.5;
      const y1 = Math.max(terrain(xa, za), terrain(xa + w, za + dd)) + (1 + Math.floor(srand() * 3)) * FLOOR;
      if (srand() < .5) c.setHSL(.04 + srand() * .03, .45 + srand() * .2, .42 + srand() * .12); else c.set(PALETTE[Math.floor(srand() * PALETTE.length)]).multiplyScalar(.85);
      wall(b, xa, za + dd, xa + w, za + dd, y0, y1, 0, c, y1, 'liso');
      wall(b, xa + w, za, xa, za, y0, y1, 0, c, y1, 'liso');
      wall(b, xa + w, za + dd, xa + w, za, y0, y1, 0, c, y1, 'liso');
      wall(b, xa, za, xa, za + dd, y0, y1, 0, c, y1, 'liso');
      roofC.setRGB(.62, .6, .57).multiplyScalar(.85 + srand() * .3);
      top(b, xa, xa + w, za, za + dd, y1, roofC);
    }
  }
  if (b.empty) return;
  const m = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = false; m.castShadow = false;
  root.add(m);
}

/* =========================================================
   Terreno (chão de terra/rua/mato com cor nos vértices)
   ========================================================= */
export function buildTerrain(root, terrain, colorAt, size = 900, seg = 180, texRepeat = 220) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, cols = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrain(x, z));
    colorAt(x, z, c);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const tex = favelaTex.terra().clone(); tex.needsUpdate = true; tex.repeat.set(texRepeat, texRepeat);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }));
  m.receiveShadow = true;
  root.add(m);
  return m;
}

/* =========================================================
   Fios entre postes / casas (a pipa enrosca)
   ========================================================= */
const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b });
export function wire(root, a, b, sag = .8, collide = true, label = 'no fio') {
  const pts = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
  root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  if (collide) {
    const mid = new THREE.Vector3().lerpVectors(a, b, .5); mid.y -= sag * .65;
    staticBox(.25, .25 + sag * .3, a.distanceTo(b) / 2, mid, { type: 'wire', label }, Math.atan2(b.x - a.x, b.z - a.z));
  }
  return pts;
}

/** varal com roupa pendurada (balança com o vento) */
export function varal(root, a, b, swing) {
  const pts = wire(root, a, b, .25, false);
  const cols = ['#e63946', '#f1faee', '#457b9d', '#ffd166', '#2a9d8f', '#f4a261', '#ffffff', '#8338ec', '#118ab2'];
  for (let k = 2; k < pts.length - 2; k += 2) {
    if (srand() < .25) continue;
    const kind = srand();
    const w = kind < .5 ? .5 : kind < .8 ? .35 : .7, h = kind < .5 ? .55 : kind < .8 ? .45 : .35;
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[Math.floor(srand() * cols.length)], side: THREE.DoubleSide, roughness: .9 }));
    m.position.copy(pts[k]); m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    m.castShadow = true; m.userData.ph = srand() * 6;
    root.add(m); swing.push(m);
  }
}
