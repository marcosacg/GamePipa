// Objetos do cenário em estilo "estilizado suave": só a parte visual (sem física).
// Usados pelo jogo (scene.js), pela vitrine e pela exportação da pasta Assets.
import * as THREE from 'three';
import { mesh, smat } from './materials.js';
import { makeCharacter, makeSpool, bumpy } from './player.js';
import { makeKiteMesh, proceduralTail } from './kite.js';
import { KITES, getPatterns, PRESETS } from './config.js';

/* ---------------- utilidades ---------------- */
export function rng(seed) { // gerador com semente (mesmo resultado sempre)
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** pinta os vértices com um degradê de baixo (c0) para cima (c1) + manchinhas */
function paintGradient(geo, c0, c1, speck = .06, seed = 1) {
  const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox, a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / ((max.y - min.y) || 1);
    const n = Math.sin(p.getX(i) * 7.1 + seed) * Math.sin(p.getZ(i) * 6.3 + seed * 2) * speck;
    c.copy(a).lerp(b, Math.min(1, Math.max(0, t * t * .2 + t * .8 + n)));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
/** caixa com UV em escala de metro (a textura repete certinho em paredes de qualquer tamanho) */
export function boxWorldUV(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * size[f][0] / tile, uv.getY(i) * size[f][1] / tile); }
  return g;
}
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function noise(x, w, h, amt, seed = 1) {
  const r = rng(seed), img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
}

/* ---------------- texturas (também vão para Assets/texturas) ---------------- */
const TEX = {};
export const textures = {
  /** reboco claro (a cor da casa multiplica por cima) */
  reboco: () => TEX.reboco || (TEX.reboco = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#f1ece3'; x.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '120,100,80'},${.015 + r() * .025})`; x.beginPath(); x.ellipse(r() * w, r() * h, 20 + r() * 50, 14 + r() * 30, r() * 3, 0, 7); x.fill(); }
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(110,95,80,.05)'; x.fillRect(r() * w, 0, 2 + r() * 5, h); }
    const gr = x.createLinearGradient(0, h * .75, 0, h); gr.addColorStop(0, 'rgba(90,70,50,0)'); gr.addColorStop(1, 'rgba(90,70,50,.22)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    noise(x, w, h, 18, 4);
  })),
  /** tijolo baiano de casa sem reboco */
  tijolo: () => TEX.tijolo || (TEX.tijolo = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#c9b5a0'; x.fillRect(0, 0, w, h);
    const r = rng(7), bh = 32, bw = 64;
    for (let row = 0; row < h / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < w / bw + 1; col++) {
        const L = 38 + r() * 10, s = 55 + r() * 10;
        x.fillStyle = `hsl(${16 + r() * 6},${s}%,${L}%)`;
        x.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
      }
    }
    noise(x, w, h, 22, 7);
  })),
  /** grama (tons neutros: a cor do chão vem dos vértices) */
  grama: () => TEX.grama || (TEX.grama = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 700; i++) { const v = 170 + r() * 85; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 4); }
    noise(x, w, h, 26, 11);
  })),
  /** bola de capotão */
  bola: () => TEX.bola || (TEX.bola = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#f7f5ef'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222';
    const hex = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.6); } x.fill(); };
    for (let i = 0; i < 6; i++) hex(i * 43 + 20, 40, 11);
    for (let i = 0; i < 6; i++) hex(i * 43 + 41, 92, 11);
    noise(x, w, h, 12, 3);
  }, false)),
};

/* ---------------- capim (blades em tufos, balançam com o vento) ---------------- */
export function grassBladeGeometry(seed = 1) {
  const r = rng(seed), pos = [], col = [];
  for (let b = 0; b < 4; b++) {
    const a = r() * Math.PI * 2, h = .32 + r() * .3, lean = .08 + r() * .12, w = .028 + r() * .02;
    const ox = (r() - .5) * .12, oz = (r() - .5) * .12, ca = Math.cos(a), sa = Math.sin(a);
    const P = (u, v) => { const bend = lean * v * v; return [ox + ca * u * w * (1 - v) + sa * bend, v * h, oz - sa * u * w * (1 - v) + ca * bend]; };
    const base = .55, tip = 1;
    const A = P(-1, 0), B = P(1, 0), C = P(-1, .55), D = P(1, .55), T = P(0, 1);
    for (const [p, shade] of [[A, base], [B, base], [C, .8], [B, base], [D, .8], [C, .8], [C, .8], [D, .8], [T, tip]]) { pos.push(...p); col.push(shade, shade, shade); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** material do capim com balanço no vento (uTime/uWind atualizados pelo jogo) */
export const grassUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
export function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = grassUniforms.uTime; sh.uniforms.uWind = grassUniforms.uWind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hh = max(position.y, 0.0);
      float ph = uTime * 2.2 + ip.x * 0.35 + ip.z * 0.27;
      transformed.x += (sin(ph) * 0.6 + sin(ph * 2.3) * 0.25) * hh * 0.35 * uWind;
      transformed.z += cos(ph * 0.8) * hh * 0.2 * uWind;`);
  };
  return m;
}
export function makeGrassClump() { const m = new THREE.Mesh(grassBladeGeometry(3), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, color: '#6a9a38' })); m.castShadow = false; return m; }

/* ---------------- árvores fofas ---------------- */
const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 });
const leafMatLite = new THREE.MeshLambertMaterial({ vertexColors: true });
function blob(r, c0, c1, seed, detail = 2, lite = false) {
  const g = paintGradient(bumpy(new THREE.SphereGeometry(r, lite ? 14 : 26, lite ? 10 : 18), r * .08, 3.2 / r, seed), c0, c1, .07, seed);
  return mesh(g, lite ? leafMatLite : leafMat, !lite, !lite);
}
function trunk(h, r0, r1, color, seg = 9) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 1.7) * .05); }
  g.computeVertexNormals();
  return mesh(g, smat(color, { roughness: 1 }));
}
/**
 * Árvore. Devolve { g, r, top, label, spheres:[{r,y}], trunk:{r,hh} } (tamanhos para a física/turbulência).
 * lite = árvore do fundo (mais leve).
 */
export function makeTree(kind, seed = 1, lite = false) {
  const R = rng(seed + 17), g = new THREE.Group(), det = lite ? 1 : 2;
  let r, top, cy, label, spheres, tr;
  if (kind === 'mangueira') {
    const h = 2.4 + R() * .8; r = 3.6 + R() * 1.2; cy = h + r * .6; label = 'na mangueira';
    const t = trunk(h + 1.2, .5, .3, '#5b3b25'); t.position.y = (h + 1.2) / 2; g.add(t);
    for (const s of [-1, 1]) { const b = trunk(2.2, .18, .1, '#5b3b25', 7); b.position.set(s * .7, h + .6, 0); b.rotation.z = -s * .7; g.add(b); }
    const c0 = ['#244f20', '#2a5a24', '#22491f'][Math.floor(R() * 3)], c1 = '#5d9a3e';
    const main = blob(r, c0, c1, seed, det, lite); main.position.y = cy; main.scale.y = .82; g.add(main);
    const b1 = blob(r * .72, c0, c1, seed + 1, det, lite); b1.position.set(r * .6, cy - .5, .4); g.add(b1);
    const b2 = blob(r * .66, c0, c1, seed + 2, det, lite); b2.position.set(-r * .55, cy - .3, -.5); g.add(b2);
    if (!lite) { const b3 = blob(r * .5, c0, c1, seed + 3, det); b3.position.set(.2, cy + r * .55, -.2); g.add(b3); }
    top = cy + r * .85;
    spheres = [{ r: r * .95, y: cy }]; tr = { r: .4, hh: h / 2 + .5, label: 'no tronco da mangueira' };
  } else if (kind === 'eucalipto') {
    const h = 11 + R() * 5; r = 2.2 + R() * .6; cy = h + 1.5; label = 'no eucalipto';
    const t = trunk(h + 2.5, .34, .16, '#d8cbb4'); t.position.y = (h + 2.5) / 2; g.add(t);
    const c0 = '#46703f', c1 = '#9cbf85';
    const parts = [[0, 0, 1], [.9, -2.8, .72], [-.7, 1.9, .62]];
    for (const [x, dy, s] of parts) { const b = blob(r * s, c0, c1, seed + dy, det, lite); b.position.set(x, cy + dy, (s - .8) * .5); b.scale.y = 1.8; g.add(b); }
    top = cy + r * 2.4; r *= 1.25;
    spheres = [{ r: r * .9, y: cy + r * .55 }, { r: r * .9, y: cy - r * .65 }]; tr = { r: .3, hh: h / 2 + 1, label };
  } else {
    const h = 2 + R(); r = 2.8 + R() * .8; cy = h + r * .7; label = 'no pé de jamelão';
    const t = trunk(h + 1.2, .4, .24, '#4a3020'); t.position.y = (h + 1.2) / 2; g.add(t);
    const main = blob(r, '#2c4a22', '#69964a', seed, det, lite); main.position.y = cy; main.scale.y = .9; g.add(main);
    if (!lite) {
      const fruit = smat('#3b1f4a', { roughness: .35 });
      for (let i = 0; i < 14; i++) {
        const a = R() * Math.PI * 2, e = (R() - .2) * 1.2;
        const f = mesh(new THREE.SphereGeometry(.13, 10, 8), fruit, false); f.scale.y = 1.3;
        f.position.set(Math.cos(a) * Math.cos(e) * r * .97, cy + Math.sin(e) * r * .87, Math.sin(a) * Math.cos(e) * r * .97); g.add(f);
      }
    }
    top = cy + r;
    spheres = [{ r: r * .95, y: cy }]; tr = { r: .35, hh: h / 2 + .5, label };
  }
  g.rotation.y = R() * Math.PI * 2;
  return { g, r: r * 1.3, top, label, spheres, trunk: tr };
}

/* ---------------- casas ---------------- */
const glassM = () => smat('#2c3a4a', { roughness: .15, metalness: .3 });
export function makeHouse({ w = 7, d = 8, floors = 1, unfinished = false, color = '#f4d35e', seed = 1 } = {}) {
  const R = rng(seed + 91), g = new THREE.Group();
  const h = floors * 2.9;
  const wallM = unfinished
    ? new THREE.MeshStandardMaterial({ map: textures.tijolo(), roughness: .95 })
    : new THREE.MeshStandardMaterial({ map: textures.reboco(), color, roughness: .92 });
  const body = mesh(boxWorldUV(w, h, d, 2.4), wallM); body.position.y = h / 2; g.add(body);
  // laje
  const lajeM = new THREE.MeshStandardMaterial({ map: textures.reboco(), color: '#b9b4a8', roughness: 1 });
  const slab = mesh(boxWorldUV(w + .35, .24, d + .35, 2.4), lajeM); slab.position.y = h + .12; g.add(slab);
  if (R() < .6) { const mur = mesh(boxWorldUV(w + .35, .65, .16, 2.4), wallM); mur.position.set(0, h + .56, d / 2 + .1); g.add(mur); }
  // caixa d'água
  if (R() < .75) {
    const tank = new THREE.Group();
    const body2 = mesh(new THREE.CylinderGeometry(.62, .52, .8, 22), smat('#2b6cb0', { roughness: .45 })); tank.add(body2);
    const lid = mesh(new THREE.CylinderGeometry(.66, .66, .08, 22), smat('#3d82c9', { roughness: .45 })); lid.position.y = .44; tank.add(lid);
    tank.position.set((R() - .5) * (w - 1.8), h + .64, (R() - .5) * (d - 1.8)); g.add(tank);
  }
  // antena parabólica
  if (R() < .35) {
    const dish = mesh(new THREE.SphereGeometry(.45, 18, 8, 0, Math.PI * 2, 0, Math.PI * .32), smat('#e9e9e9', { side: THREE.DoubleSide, roughness: .5 }));
    dish.rotation.x = -1.1; dish.position.set(w / 2 - .7, h + .9, -d / 2 + .7); g.add(dish);
    const st = mesh(new THREE.CylinderGeometry(.03, .03, .7, 6), smat('#999')); st.position.set(w / 2 - .7, h + .5, -d / 2 + .7); g.add(st);
  }
  // porta com batente
  const frameM = smat(unfinished ? '#8e7a68' : '#ece6da', { roughness: .8 });
  const doorX = -w / 4;
  const frame = mesh(new THREE.BoxGeometry(1.1, 2.2, .08), frameM, false); frame.position.set(doorX, 1.1, d / 2 + .02); g.add(frame);
  const door = mesh(new THREE.BoxGeometry(.9, 2.05, .06), smat(['#7a4b2a', '#3d5a80', '#5c946e', '#9b2226'][Math.floor(R() * 4)], { roughness: .6 }), false);
  door.position.set(doorX, 1.03, d / 2 + .05); g.add(door);
  const knob = mesh(new THREE.SphereGeometry(.04, 8, 6), smat('#d4b062', { metalness: .8, roughness: .3 }), false); knob.position.set(doorX + .33, 1.05, d / 2 + .1); g.add(knob);
  const step = mesh(new THREE.BoxGeometry(1.3, .14, .4), lajeM); step.position.set(doorX, .07, d / 2 + .2); g.add(step);
  // janelas com moldura e vidro
  for (let f = 0; f < floors; f++) {
    for (const wx of f === 0 ? [w / 4] : [-w / 4, w / 4]) {
      const y = 1.6 + f * 2.9;
      const fr = mesh(new THREE.BoxGeometry(1.3, 1.1, .08), frameM, false); fr.position.set(wx, y, d / 2 + .02); g.add(fr);
      const gl = mesh(new THREE.BoxGeometry(1.1, .9, .06), glassM(), false); gl.position.set(wx, y, d / 2 + .05); g.add(gl);
      const bar = mesh(new THREE.BoxGeometry(.05, .9, .07), frameM, false); bar.position.set(wx, y, d / 2 + .07); g.add(bar);
      const sill = mesh(new THREE.BoxGeometry(1.4, .07, .2), frameM, false); sill.position.set(wx, y - .58, d / 2 + .1); g.add(sill);
    }
  }
  // ferro aparente na laje de casa sem acabamento
  if (unfinished && floors === 1) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const fe = mesh(new THREE.CylinderGeometry(.025, .025, 1.1, 5), smat('#5a4a3a'), false); fe.position.set(sx * (w / 2 - .15), h + .75, sz * (d / 2 - .15)); g.add(fe);
  }
  g.userData.h = h;
  return g;
}

/* ---------------- nuvens e morros ---------------- */
const cloudM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: '#c9d6e8', emissiveIntensity: .45, fog: false });
export function makeCloud(seed = 1) {
  const R = rng(seed + 300), g = new THREE.Group();
  const n = 4 + Math.floor(R() * 4);
  for (let k = 0; k < n; k++) {
    const r = 5 + R() * 6;
    const geo = paintGradient(bumpy(new THREE.SphereGeometry(r, 22, 14), r * .06, 2.5 / r, seed + k), '#cdd7e6', '#ffffff', .03, k);
    const b = new THREE.Mesh(geo, cloudM);
    b.position.set(k * 7 - n * 3.5 + R() * 3, R() * 2.5, R() * 6); b.scale.set(1.1, .58, .9);
    g.add(b);
  }
  return g;
}
export function makeHill(r, h, seed = 1) {
  const geo = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geo.attributes.position, R = rng(seed);
  const ph = R() * 10;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); p.setY(i, y * (1 + Math.sin(x * 3 + ph) * Math.cos(z * 2.5 + ph) * .18)); }
  geo.scale(r, h, r);
  geo.computeVertexNormals();
  paintGradient(geo, '#557a3c', '#86a95a', .05, seed);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/* ---------------- objetos ---------------- */
export function makeGoal() {
  const g = new THREE.Group(), wood = smat('#ece3cc', { roughness: .7 }), wood2 = smat('#8a6a43');
  const p1 = mesh(new THREE.CylinderGeometry(.07, .08, 2.3, 12), wood); p1.position.set(-3.1, 1.15, 0); p1.rotation.z = .03;
  const p2 = mesh(new THREE.CylinderGeometry(.07, .08, 2.25, 12), wood); p2.position.set(3.1, 1.12, 0); p2.rotation.z = -.02;
  const bar = mesh(new THREE.CylinderGeometry(.065, .065, 6.3, 12), wood); bar.rotation.z = Math.PI / 2 + .015; bar.position.set(0, 2.27, 0);
  const back = mesh(new THREE.CylinderGeometry(.04, .04, 1.2, 8), wood2); back.rotation.x = .9; back.position.set(-3.1, .6, -.5);
  g.add(p1, p2, bar, back);
  return g;
}
export function makePole() {
  const g = new THREE.Group(), poleM = smat('#a3a39b', { roughness: .9 }), woodM = smat('#6d5338');
  const pole = mesh(new THREE.CylinderGeometry(.12, .2, 9.2, 12), poleM); pole.position.y = 4.6; g.add(pole);
  const cross = mesh(new THREE.BoxGeometry(1.9, .14, .14), woodM); cross.position.y = 8.6; g.add(cross);
  for (const x of [-.8, -.3, .3, .8]) { const ins = mesh(new THREE.CylinderGeometry(.05, .06, .16, 8), smat('#e8e4d8', { roughness: .3 }), false); ins.position.set(x, 8.75, 0); g.add(ins); }
  const arm = mesh(new THREE.CylinderGeometry(.04, .04, 1.4, 8), poleM); arm.rotation.z = Math.PI / 2; arm.position.set(-.6, 7.6, 0); g.add(arm);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf6b', emissiveIntensity: 0, roughness: .4 });
  const head = mesh(new THREE.SphereGeometry(.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), smat('#6f6f6a', { side: THREE.DoubleSide })); head.position.set(-1.3, 7.55, 0); g.add(head);
  const bulb = mesh(new THREE.SphereGeometry(.14, 12, 8), lampMat, false); bulb.position.set(-1.3, 7.48, 0); g.add(bulb);
  g.userData.lampMat = lampMat;
  return g;
}
export function makeBall() {
  const m = mesh(new THREE.SphereGeometry(.11, 28, 18), new THREE.MeshStandardMaterial({ map: textures.bola(), roughness: .55 }));
  m.position.y = .11;
  return m;
}
export function makeRing() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(2.6, .2, 12, 40), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: .7, roughness: .35, metalness: .3 })));
  g.position.y = 3;
  return g;
}
export function makeSpoolModel(type) { return makeSpool(type); }

/** vara de bambu com forquilha (o eixo é +Y; segura a 0,45 da base) */
export function makeBambooPole() {
  const g = new THREE.Group();
  const L = 3.6, bamboo = smat('#cdb46e', { roughness: .6 }), node = smat('#a58a45', { roughness: .6 });
  const rod = mesh(new THREE.CylinderGeometry(.022, .034, L, 10), bamboo, true, false); rod.position.y = L / 2 - .45; g.add(rod);
  for (let i = 1; i < 5; i++) { const n = mesh(new THREE.TorusGeometry(.034, .01, 6, 12), node, false, false); n.rotation.x = Math.PI / 2; n.position.y = -.45 + i * L / 5; g.add(n); }
  for (const s of [-1, 1]) { const f = mesh(new THREE.CylinderGeometry(.012, .016, .5, 6), bamboo, false, false); f.position.set(s * .1, L - .45 + .2, 0); f.rotation.z = -s * .45; g.add(f); }
  return g;
}

/** figurante (moleque da vara) — pose de "à toa" */
export function makeNPCKid(i = 0) {
  const p = PRESETS[(i + 2) % PRESETS.length];
  const c = makeCharacter({ ...p.style, skin: (i * 2 + 1) % 5 });
  c.g.position.set(0, 0, 0); c.g.rotation.y = 0;
  c.spool.visible = false;
  const pole = makeBambooPole(); pole.rotation.x = Math.PI / 2; pole.position.z = .55; c.armR.add(pole);
  c.armR.rotation.set(-.55, .1, 0);
  c.g.scale.setScalar(.9);
  return c.g;
}

/** pipa com rabiola parada (para vitrine e Assets) */
export function kiteWithTail(type, pat = 0) {
  const g = new THREE.Group();
  const k = makeKiteMesh(type, pat); g.add(k);
  const kt = KITES[type], n = Math.min(12, kt.tail);
  if (n > 0) {
    const pts = proceduralTail([], new THREE.Vector3(0, k.userData.bottom, 0), new THREE.Vector3(0, 0, -1), n, 0, 1).map(p => { p.z *= -.6; return p; });
    const P = getPatterns(type)[pat] || getPatterns(type)[0];
    if (kt.tailStyle === 'fitas') {
      (P.fitas || ['#fff']).forEach((col, r) => {
        const off = (r - 1) * .05;
        const curve = new THREE.CatmullRomCurve3(pts.map(p => p.clone().add(new THREE.Vector3(off, 0, 0))));
        const tube = mesh(new THREE.TubeGeometry(curve, 30, .018, 4), smat(col, { roughness: .6 }), false);
        tube.scale.z = .4; g.add(tube);
      });
    } else {
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, .006, 4), smat('#dddddd'), false));
      const bowGeo = new THREE.BufferGeometry();
      bowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.13, .05, 0, -.13, -.05, 0, 0, 0, 0, .13, .05, 0, 0, 0, 0, .13, -.05, 0], 3));
      bowGeo.computeVertexNormals();
      for (let i = 1; i <= n; i++) {
        const b = mesh(bowGeo, smat(i % 2 ? P.c[0] : '#f5f5f5', { side: THREE.DoubleSide, roughness: .7 }), false);
        b.position.copy(pts[i]); b.rotation.y = (i % 3) * .5; g.add(b);
      }
    }
  }
  return g;
}
