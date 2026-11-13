// Cenário "Morro": terrão no alto do morro. Na frente, a favela de tijolo desce a ladeira
// e sobe o morro do outro lado; um teleférico cruza o vale e as serras ficam lá no fundo.
import * as THREE from 'three';
import { smooth, noise2, srand, lerp } from '../utils.js';
import { PH, makeBody, staticBox, UP } from '../physics.js';
import { G_STATIC } from '../config.js';
import { SCN, trees, blockers } from '../scene.js';
import { mesh, smat } from '../materials.js';
import * as props from '../props.js';
import { TERRAIN } from '../shared/terrenos.js';
import { buildFavela, buildTerrain, wire, FLOOR, COARSE } from './favela.js';

let root = null;
const gondolas = [];
let cable = null;

export const info = { id: 'morro', nome: 'Morro', desc: 'No terrão lá no alto, com a favela inteira lá embaixo e o teleférico passando.' };

const CLEAR = { x: 0, z: 4, r: 24 };
const terrain = TERRAIN.morro; // formato do morro (o servidor usa o mesmo)
const inClear = (x, z, pad = 0) => Math.hypot(x - CLEAR.x, (z - CLEAR.z) * 1.1) < CLEAR.r + pad;
const isStreet = (x, z) => Math.abs(x + 18 + 22 * Math.sin(z * .022)) < 3 || Math.abs(z + 175 + 10 * Math.sin(x * .03)) < 3.2;

export function build(group) {
  root = group; gondolas.length = 0;
  Object.assign(SCN, {
    id: 'morro',
    menuOrbit: 14,
    walk: { x0: -17, x1: 17, z0: -9.5, z1: 17 },
    spawns: [[0, 6], [-5, 4], [5, 4], [-3, 9], [4, 9], [-9, 6], [9, 7], [0, 1]],
    bots: [[-8, 3], [8, 2], [-4, 11], [6, 12]],
    npcZones: [{ x0: -17, x1: 17, z0: -9, z1: 17, homes: [[-13, 13], [12, 14], [-14, -3], [13, -4]] }],
    fallLabel: (x, z) => (fav.roofAt(x, z) !== null ? 'na laje lá embaixo' : 'no morro'),
  });

  const fav = buildFavela(root, {
    terrain,
    area: COARSE ? { x0: -130, x1: 130, z0: -240, z1: 40 } : { x0: -170, x1: 170, z0: -280, z1: 60 },
    skip: (x, z) => inClear(x, z, 20) || isStreet(x, z) || (z > 16 && Math.abs(x) < 80) || (z > -10 && srand() < .4),
    floors: (x, z) => (Math.hypot(x, z) < 70 ? 1 + Math.floor(srand() * 2) : 1 + Math.floor(srand() * 3 + (z < -60 ? srand() * 1.4 : 0))),
    far: { r: 430, density: .65, skip: (x, z) => z > 80 },
    brick: .8,   // aqui quase tudo é tijolo aparente (como na foto)
  });
  SCN.ground = fav.ground;

  buildTerrain(root, terrain, (x, z, c) => {
    const n = noise2(x * .09, z * .09), n2 = noise2(x * .3, z * .3);
    if (inClear(x, z, 4)) return c.setHSL(.075 + n * .01, .45, .55 + n * .05 + n2 * .03);        // terrão alaranjado
    if (isStreet(x, z)) return c.setRGB(.4, .4, .42);
    if (z > 14 || inClear(x, z, 16)) return c.setHSL(.22 + n * .04, .38, .32 + n * .06);         // mato atrás
    return c.setHSL(.07, .25, .4 + n * .05);
  }, 1000, 200, 280);

  buildClearing();
  buildVegetation();
  buildCableCar();
  buildBackdrop();
}

/* ---------------- o terrão ---------------- */
function buildClearing() {
  // tela laranja de obra num pedaço da beirada (como na foto)
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.clearRect(0, 0, 64, 64); x.strokeStyle = '#ff7a1a'; x.lineWidth = 3;
    for (let i = -64; i < 128; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const posts = [[-22, 0], [-21, -5], [-19, -9.5], [-15, -12]];
  for (let i = 0; i < posts.length - 1; i++) {
    const [ax, az] = posts[i], [bx, bz] = posts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), map = tex.clone(); map.needsUpdate = true; map.repeat.set(len / 1.2, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.2), new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: .3, side: THREE.DoubleSide, roughness: .9 }));
    m.position.set((ax + bx) / 2, terrain((ax + bx) / 2, (az + bz) / 2) + .6, (az + bz) / 2);
    m.rotation.y = Math.atan2(-(bz - az), bx - ax);
    root.add(m);
  }
  for (const [x, z] of posts) { const p = mesh(new THREE.CylinderGeometry(.04, .04, 1.4, 6), smat('#8a6a46')); p.position.set(x, terrain(x, z) + .7, z); root.add(p); }

  // tijolos empilhados, um pneu velho, pedras
  const tij = new THREE.MeshStandardMaterial({ map: props.textures.tijolo(), roughness: .95 });
  for (let i = 0; i < 14; i++) { const b = mesh(new THREE.BoxGeometry(.19, .09, .29), tij); b.position.set(10 + (i % 4) * .21, .05 + Math.floor(i / 4) * .095, 15 + srand() * .05); b.rotation.y = (srand() - .5) * .15; root.add(b); }
  blockers.push({ x0: 9.8, x1: 10.8, z0: 14.7, z1: 15.3 });
  const tire = mesh(new THREE.TorusGeometry(.32, .12, 10, 20), smat('#1d1d1d', { roughness: .8 })); tire.rotation.x = Math.PI / 2; tire.position.set(-11, .12, 13); root.add(tire);
  for (let i = 0; i < 18; i++) {
    const a = srand() * Math.PI * 2, r = CLEAR.r - 3 + srand() * 6, x = Math.cos(a) * r, z = CLEAR.z + Math.sin(a) * r / 1.1;
    const s = mesh(new THREE.DodecahedronGeometry(.2 + srand() * .4, 1), smat('#9a8f80', { roughness: 1 }));
    s.position.set(x, terrain(x, z), z); s.scale.y = .6; root.add(s);
  }
}

/* ---------------- árvores e capim ---------------- */
function addTree(x, z, kind, seed, physics) {
  const A = PH.A, y0 = terrain(x, z) - .2;
  const t = props.makeTree(kind, seed, !physics);
  t.g.position.set(x, y0, z); root.add(t.g);
  if (!physics) return;
  for (const s of t.spheres) makeBody(new A.btSphereShape(s.r), 0, new THREE.Vector3(x, y0 + s.y, z), null, G_STATIC, -1, { type: 'tree', label: t.label });
  makeBody(new A.btCylinderShape(new A.btVector3(t.trunk.r, t.trunk.hh, t.trunk.r)), 0, new THREE.Vector3(x, y0 + t.trunk.hh, z), null, G_STATIC, -1, { type: 'tree', label: t.trunk.label });
  trees.push({ x, z, r: t.r, top: y0 + t.top, label: t.label });
}
function buildVegetation() {
  addTree(-15, 18, 'jamelao', 3, true);
  addTree(18, 20, 'mangueira', 5, true);
  addTree(24, -2, 'mangueira', 9, true);
  for (let i = 0; i < 70; i++) {
    const x = (srand() - .5) * 240, z = 20 + srand() * 120;
    if (inClear(x, z, 6)) continue;
    addTree(x, z, ['mangueira', 'eucalipto', 'jamelao'][i % 3], 300 + i, false);
  }
  // capim na beirada do terrão e no mato de trás
  const N = COARSE ? 2200 : 6000;
  const im = new THREE.InstancedMesh(props.grassBladeGeometry(7), props.grassMaterial(), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let n = 0;
  for (let k = 0; k < N * 4 && n < N; k++) {
    const x = (srand() - .5) * 140, z = -20 + srand() * 110;
    const d = Math.hypot(x - CLEAR.x, (z - CLEAR.z) * 1.1);
    if (d < CLEAR.r - 4 && srand() > .04) continue;
    if (z < -6 && !inClear(x, z, 8)) continue;
    p.set(x, terrain(x, z), z); q.setFromAxisAngle(UP, srand() * 6.28); const kk = .7 + srand() * .9; s.set(kk, kk * (.8 + srand() * .6), kk);
    m4.compose(p, q, s); im.setMatrixAt(n, m4); im.setColorAt(n, c.setHSL(.2 + srand() * .08, .45, .3 + srand() * .15)); n++;
  }
  im.count = n; im.receiveShadow = true;
  root.add(im);
}

/* ---------------- teleférico ---------------- */
function buildCableCar() {
  const line = x => -128 + x * .12;  // z do cabo para cada x
  const xs = [-330, -200, -80, 40, 160, 290];
  const tops = xs.map(x => { const z = line(x); return new THREE.Vector3(x, terrain(x, z) + 62, z); });
  const towerM = smat('#c9c9c9', { metalness: .3, roughness: .5 });
  for (const t of tops) {
    const base = terrain(t.x, t.z);
    const h = t.y - base;
    const col = mesh(new THREE.CylinderGeometry(.5, .9, h, 10), towerM); col.position.set(t.x, base + h / 2, t.z); root.add(col);
    const arm = mesh(new THREE.BoxGeometry(.5, .5, 4.6), towerM); arm.position.set(t.x, t.y, t.z); arm.rotation.y = Math.atan2(1, .12) - Math.PI / 2; root.add(arm);
    staticBox(.8, h / 2, .8, new THREE.Vector3(t.x, base + h / 2, t.z), { type: 'post', label: 'na torre do teleférico' });
  }
  // dois cabos (ida e volta)
  cable = [];
  for (const off of [-1.8, 1.8]) {
    const pts = [];
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i].clone(), b = tops[i + 1].clone(); a.z += off; b.z += off;
      const seg = wire(root, a, b, 4, true, 'no cabo do teleférico');
      if (i) seg.shift();
      pts.push(...seg);
    }
    cable.push(new THREE.CatmullRomCurve3(pts));
  }
  // cabines
  const cabM = smat('#f2f2f2', { roughness: .4 }), glassM = smat('#2c3a4a', { roughness: .15, metalness: .3 }), stripe = smat('#1f6fb2');
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(1.9, 1.7, 1.6), cabM); body.position.y = -2.1; g.add(body);
    const win = mesh(new THREE.BoxGeometry(1.95, .6, 1.65), glassM); win.position.y = -1.85; g.add(win);
    const st = mesh(new THREE.BoxGeometry(1.95, .15, 1.65), stripe); st.position.y = -2.75; g.add(st);
    const arm = mesh(new THREE.CylinderGeometry(.05, .05, 1.3, 6), smat('#555')); arm.position.y = -.6; g.add(arm);
    root.add(g);
    gondolas.push({ g, c: i % 2, t: (i / 8 + (i % 2) * .06) % 1 });
  }
}

/* ---------------- serras lá no fundo ---------------- */
function buildBackdrop() {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + srand() * .2, r = 520 + srand() * 200;
    const hill = props.makeHill(120 + srand() * 110, (Math.sin(a) < -.3 ? 120 : 60) + srand() * 90, i + 61);
    hill.position.set(Math.cos(a) * r, -30, Math.sin(a) * r);
    root.add(hill);
  }
}

export function update(dt, clock, windDirH, windSpeed) {
  props.grassUniforms.uTime.value = clock;
  props.grassUniforms.uWind.value = .5 + windSpeed / 8;
  if (!cable) return;
  for (const gd of gondolas) {
    gd.t = (gd.t + dt * .006 * (gd.c ? -1 : 1) + 1) % 1;
    cable[gd.c].getPointAt(gd.t, gd.g.position);
  }
}
