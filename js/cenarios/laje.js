// Cenário "Laje": soltando pipa em cima da laje, no meio da favela.
// O vento sopra para -Z: na frente, o morro cheio de casas sobe até o topo com árvores;
// atrás, a favela desce para o vale e a cidade.
import * as THREE from 'three';
import { smooth, noise2, srand, clamp } from '../utils.js';
import { PH, makeBody, staticBox } from '../physics.js';
import { G_STATIC } from '../config.js';
import { SCN, trees, blockers, lampMats } from '../scene.js';
import { mesh, smat } from '../materials.js';
import * as props from '../props.js';
import { TERRAIN } from '../shared/terrenos.js';
import { buildFavela, buildTerrain, wire, varal, FLOOR, COARSE, favelaTex } from './favela.js';

let root = null;
const swing = [];

export const info = { id: 'laje', nome: 'Laje', desc: 'Em cima da laje, no meio da favela. As casas sobem o morro bem na frente!' };

const terrain = TERRAIN.laje; // formato do morro (o servidor usa o mesmo)

/** rua que sobe o morro fazendo curva, e a rua de baixo */
const isStreet = (x, z) => Math.abs(x - 34 - 14 * Math.sin(z * .028)) < 3.2 || (Math.abs(z - 26) < 3.4 && x > -120 && x < 120)
  || Math.abs(x + 62 + 9 * Math.sin(z * .04)) < 2.4;
const isSummit = (x, z) => z < -112 && z > -175 && Math.abs(x + 10) < 48 - (z + 112) * .2;
const campinho = (x, z) => Math.hypot(x + 58, z + 38) < 11; // um terreninho vazio no meio das casas

export function build(group) {
  root = group; swing.length = 0;
  const corners = [[-8, -6], [8, -6], [-8, 6], [8, 6], [0, 0]].map(([x, z]) => terrain(x, z));
  const LY = Math.max(...corners) + 3 * FLOOR + .1;   // altura da nossa laje

  // lajes feitas à mão: a nossa e as dos vizinhos (a molecada fica nelas)
  const lajes = {
    nossa: { xa: -8, xb: 8, za: -6, zb: 6, top: LY, kind: 'pintada', color: '#f0e4cc', roofCol: '#d6d1c7' },
    esq: { xa: -21, xb: -9.3, za: -5, zb: 7.5, top: LY + 1.5, kind: 'tijolo', roofCol: '#cfcac0' },
    dir: { xa: 9.3, xb: 19.5, za: -9.5, zb: 1.6, top: LY - 1.7, kind: 'pintada', color: '#9fc3e6', roofCol: '#c9c4ba' },
    tras: { xa: -7.5, xb: 7.5, za: 7.3, zb: 14, top: LY - 3, kind: 'tijolo', roofCol: '#bdb8ae' },
  };
  const manual = Object.values(lajes);
  const reserved = manual.map(h => ({ x0: h.xa, x1: h.xb, z0: h.za, z1: h.zb }));

  Object.assign(SCN, {
    id: 'laje',
    menuOrbit: 10,
    walk: { x0: -7.55, x1: 7.55, z0: -5.55, z1: 5.55 },
    spawns: [[0, 1], [-4, -2], [4, -2.5], [-3, 3], [3.5, 3], [-5.6, .5], [5.6, 0], [0, -3.5]],
    bots: [[-4.5, -1.5], [4.5, -2.5], [-2, 3.2], [3, 3.2]],
    npcZones: [
      { x0: lajes.esq.xa + .8, x1: lajes.esq.xb - .8, z0: lajes.esq.za + .8, z1: lajes.esq.zb - .8, homes: [[-17, 0], [-13, 4]] },
      { x0: lajes.dir.xa + .8, x1: lajes.dir.xb - .8, z0: lajes.dir.za + .8, z1: lajes.dir.zb - .8, homes: [[13, -6], [16, -2]] },
    ],
    fallLabel: (x, z) => (fav.roofAt(x, z) !== null ? 'na laje do vizinho' : 'na rua'),
  });

  const fav = buildFavela(root, {
    terrain,
    area: COARSE ? { x0: -112, x1: 112, z0: -175, z1: 100 } : { x0: -150, x1: 150, z0: -190, z1: 130 },
    reserved,
    manual,
    skip: (x, z) => isStreet(x, z) || isSummit(x, z) || campinho(x, z) || (Math.abs(x) < 26 && z > -14 && z < 16 && srand() < .15),
    floors: (x, z) => {
      if (z > -30 && z < -6 && Math.abs(x) < 24) return 1 + Math.floor(srand() * 2);   // na frente da laje: mais baixas (dá pra ver o morro)
      if (z > 0) return 2 + Math.floor(srand() * 3);                                     // perto do asfalto: prédios de 2 a 4 andares
      return 1 + Math.floor(srand() * 3 + srand() * .8);
    },
    far: { r: 400, density: .6, skip: (x, z) => z < -260 },
  });
  SCN.ground = fav.ground;

  buildTerrain(root, terrain, (x, z, c) => {
    const n = noise2(x * .08, z * .08);
    if (isStreet(x, z)) return c.setRGB(.38, .38, .4).multiplyScalar(.9 + n * .1);              // asfalto/cimento
    if (isSummit(x, z) || z < -250) return c.setHSL(.24 + n * .03, .42, .3 + n * .05);          // mato no topo
    if (campinho(x, z)) return c.setHSL(.07, .42, .5 + n * .04);                                // terrão
    return c.setHSL(.07 + n * .02, .2, .42 + n * .06);                                          // chão batido entre as casas
  }, 900, 200, 260);

  buildOurLaje(lajes.nossa, LY);
  buildNeighbours(lajes);
  buildSummit();
  buildWires(LY);
  buildBackdrop();
}

/* ---------------- a nossa laje ---------------- */
function buildOurLaje(h, LY) {
  const murM = new THREE.MeshStandardMaterial({ map: props.textures.reboco(), color: '#e3dccd', roughness: .95 });
  const capM = smat('#b9b3a6');
  const mur = (xa, xb, za, zb, hh) => {
    const m = mesh(props.boxWorldUV(xb - xa, hh, zb - za, 2.4), murM); m.position.set((xa + xb) / 2, LY + hh / 2, (za + zb) / 2); root.add(m);
    const c = mesh(new THREE.BoxGeometry(xb - xa + .06, .06, zb - za + .06), capM); c.position.set((xa + xb) / 2, LY + hh + .03, (za + zb) / 2); root.add(c);
  };
  const t = .18;
  mur(h.xa, h.xb, h.za, h.za + t, .62);          // frente (baixinha, para ver o morro)
  mur(h.xa, h.xa + t, h.za + t, h.zb, .9);        // esquerda
  mur(h.xb - t, h.xb, h.za + t, h.zb - 3.5, .9);  // direita (abertura onde chega a escada)
  mur(h.xa + 3.2, h.xb, h.zb - t, h.zb, .9);      // fundos

  // quartinho da escada (com porta) no canto de trás
  const qx0 = h.xa + .2, qx1 = h.xa + 3, qz0 = h.zb - 2.8, qz1 = h.zb - .2, qh = 2.3;
  const q = mesh(props.boxWorldUV(qx1 - qx0, qh, qz1 - qz0, 2.4), new THREE.MeshStandardMaterial({ map: props.textures.tijolo(), roughness: .95 }));
  q.position.set((qx0 + qx1) / 2, LY + qh / 2, (qz0 + qz1) / 2); root.add(q);
  const ql = mesh(new THREE.BoxGeometry(qx1 - qx0 + .3, .14, qz1 - qz0 + .3), smat('#a8a296')); ql.position.set((qx0 + qx1) / 2, LY + qh + .07, (qz0 + qz1) / 2); root.add(ql);
  const door = mesh(new THREE.BoxGeometry(.85, 1.95, .06), smat('#3d5a80', { roughness: .6 })); door.position.set(qx1 - .7, LY + .98, qz0 - .02); root.add(door);
  blockers.push({ x0: qx0, x1: qx1, z0: qz0, z1: qz1 });
  staticBox((qx1 - qx0) / 2, qh / 2, (qz1 - qz0) / 2, new THREE.Vector3((qx0 + qx1) / 2, LY + qh / 2, (qz0 + qz1) / 2), { type: 'house', label: 'no quartinho da laje' });

  // caixa d'água de 1000 litros em cima do quartinho, e antena parabólica
  const tank = new THREE.Group();
  tank.add(mesh(new THREE.CylinderGeometry(.78, .62, 1.0, 24), smat('#2b6cb0', { roughness: .45 })));
  const lid = mesh(new THREE.CylinderGeometry(.82, .82, .1, 24), smat('#3d82c9', { roughness: .45 })); lid.position.y = .55; tank.add(lid);
  tank.position.set((qx0 + qx1) / 2, LY + qh + .64, (qz0 + qz1) / 2); root.add(tank);
  const dish = mesh(new THREE.SphereGeometry(.5, 20, 8, 0, Math.PI * 2, 0, Math.PI * .32), smat('#ececec', { side: THREE.DoubleSide, roughness: .5 }));
  dish.rotation.x = -1.1; dish.position.set(qx1 - .3, LY + qh + .75, qz1 - .3); root.add(dish);

  // pilar com ferro aparente (a laje de cima que nunca saiu)
  for (const [px, pz] of [[h.xb - .3, h.za + .3], [h.xb - .3, h.zb - 3.8]]) {
    const pil = mesh(new THREE.BoxGeometry(.25, 1.0, .25), smat('#9d9a92')); pil.position.set(px, LY + .5, pz); root.add(pil);
    for (const [ox, oz] of [[-.07, -.07], [.07, -.07], [-.07, .07], [.07, .07]]) {
      const fe = mesh(new THREE.CylinderGeometry(.014, .014, .9, 5), smat('#6b4a32'), false); fe.position.set(px + ox, LY + 1.4, pz + oz); fe.rotation.z = (srand() - .5) * .2; root.add(fe);
    }
    blockers.push({ x: px, z: pz, r: .25 });
  }

  // varal no lado direito (balança com o vento)
  const p1 = new THREE.Vector3(h.xb - 1.2, LY + 1.75, h.zb - 4.5), p2 = new THREE.Vector3(h.xb - 1.2, LY + 1.75, h.za + 1.5);
  for (const p of [p1, p2]) {
    const post = mesh(new THREE.CylinderGeometry(.03, .03, 1.8, 6), smat('#7a7a7a')); post.position.set(p.x, LY + .9, p.z); root.add(post);
    blockers.push({ x: p.x, z: p.z, r: .12 });
  }
  varal(root, p1, p2, swing);

  // coisinhas no chão: balde, carretéis, tijolos
  const balde = mesh(new THREE.CylinderGeometry(.17, .13, .32, 16), smat('#e85d75', { roughness: .5 })); balde.position.set(h.xa + 4, LY + .16, h.zb - .8); root.add(balde);
  for (const [k, x, z] of [['lata', -1.2, 4.6], ['papelao', 1.8, 4.9]]) {
    const s = props.makeSpoolModel(k); s.position.set(x, LY + .08, z); s.rotation.set(Math.PI / 2, 0, srand() * 3); root.add(s);
  }
  const tij = new THREE.MeshStandardMaterial({ map: props.textures.tijolo(), roughness: .95 });
  for (let i = 0; i < 9; i++) {
    const b = mesh(new THREE.BoxGeometry(.19, .09, .29), tij); b.position.set(h.xb - 2.6 + (i % 3) * .21, LY + .05 + Math.floor(i / 3) * .095, h.zb - 1 + (srand() - .5) * .05); root.add(b);
  }
  blockers.push({ x0: h.xb - 2.75, x1: h.xb - 2.0, z0: h.zb - 1.2, z1: h.zb - .8 });
}

/* ---------------- lajes dos vizinhos ---------------- */
function buildNeighbours(L) {
  const m = new THREE.MeshStandardMaterial({ map: props.textures.reboco(), color: '#cfc8b8', roughness: .95 });
  // mureta só de um lado (o resto é aberto, a molecada fica na beirada)
  const e = L.esq; const a = mesh(props.boxWorldUV(e.xb - e.xa, .7, .16, 2.4), m); a.position.set((e.xa + e.xb) / 2, e.top + .35, e.zb - .08); root.add(a);
  const d = L.dir; const b = mesh(props.boxWorldUV(.16, .55, d.zb - d.za, 2.4), m); b.position.set(d.xb - .08, d.top + .28, (d.za + d.zb) / 2); root.add(b);
  // caixa d'água e antena nos vizinhos
  const tank = (x, y, z) => { const t = mesh(new THREE.CylinderGeometry(.6, .5, .9, 20), smat('#2f74b5', { roughness: .45 })); t.position.set(x, y + .45, z); root.add(t); };
  tank(e.xa + 1.2, e.top, e.zb - 1.4); tank(d.xb - 1.3, d.top, d.za + 1.2);
}

/* ---------------- topo do morro com árvores ---------------- */
function addTree(x, z, kind, seed, physics) {
  const A = PH.A, y0 = SCN.ground(x, z) - .2;
  const t = props.makeTree(kind, seed, !physics);
  t.g.position.set(x, y0, z); t.g.scale.setScalar(physics ? 1.35 : 1.2);
  root.add(t.g);
  if (!physics) return;
  const k = 1.35;
  for (const s of t.spheres) makeBody(new A.btSphereShape(s.r * k), 0, new THREE.Vector3(x, y0 + s.y * k, z), null, G_STATIC, -1, { type: 'tree', label: t.label });
  trees.push({ x, z, r: t.r * k, top: y0 + t.top * k, label: t.label });
}
function buildSummit() {
  const spots = [[-20, -128], [-2, -135], [14, -126], [-34, -142], [6, -150], [-14, -156], [28, -140], [-44, -126]];
  spots.forEach(([x, z], i) => addTree(x, z, i % 3 === 2 ? 'eucalipto' : 'mangueira', 40 + i, true));
  for (let i = 0; i < 40; i++) {
    const x = (srand() - .5) * 120, z = -120 - srand() * 60;
    if (!isSummit(x, z)) continue;
    addTree(x, z, ['mangueira', 'jamelao', 'eucalipto'][i % 3], 80 + i, false);
  }
  // árvores soltas no meio das casas
  for (let i = 0; i < 24; i++) {
    const x = (srand() - .5) * 260, z = -170 + srand() * 290;
    if (Math.hypot(x, z) < 35) continue;
    addTree(x, z, srand() < .6 ? 'mangueira' : 'jamelao', 200 + i, false);
  }
  // bandeira azul no mastro, no morro da direita (como na foto)
  const fx = 64, fz = -66, fy = SCN.ground(fx, fz);
  const mast = mesh(new THREE.CylinderGeometry(.06, .08, 9, 8), smat('#d9d9d9')); mast.position.set(fx, fy + 4.5, fz); root.add(mast);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.5, 8, 1); flagGeo.translate(1.2, 0, 0);
  const flag = mesh(flagGeo, smat('#1d4ed8', { side: THREE.DoubleSide, roughness: .8 }));
  flag.position.set(fx, fy + 8.2, fz); flag.userData.flag = true; root.add(flag); swing.push(flag);
  staticBox(.15, 4.5, .15, new THREE.Vector3(fx, fy + 4.5, fz), { type: 'post', label: 'no mastro da bandeira' });
}

/* ---------------- fios: poste na rua de baixo e os "gatos" chegando nas casas ---------------- */
function buildWires(LY) {
  const xs = []; for (let x = -100; x <= 100; x += 22) xs.push(x);
  const Z = 22.6, tops = [];
  for (const x of xs) {
    const y = SCN.ground(x, Z);
    const p = props.makePole(); p.position.set(x, y, Z); root.add(p);
    lampMats.push(p.userData.lampMat);
    staticBox(.2, 4.6, .2, new THREE.Vector3(x, y + 4.6, Z), { type: 'post', label: 'no poste' });
    tops.push(new THREE.Vector3(x, y + 8.75, Z));
  }
  for (let i = 0; i < tops.length - 1; i++) for (const dx of [-.5, .5]) {
    const a = tops[i].clone(), b = tops[i + 1].clone(); a.z += dx; b.z += dx;
    wire(root, a, b, .7, dx < 0, 'no fio do poste');
  }
  // gatos: do poste até as lajes (atrás e dos lados, longe de onde a pipa sobe)
  const from = tops[Math.floor(tops.length / 2)];
  wire(root, from, new THREE.Vector3(-7.6, LY + .9, 5.8), 1.2, true, 'no gato da luz');
  wire(root, from.clone().add(new THREE.Vector3(.3, 0, 0)), new THREE.Vector3(-7.6, LY + .8, 5.2), 1.4, false);
  wire(root, tops[Math.floor(tops.length / 2) + 1], new THREE.Vector3(19, LY - .6, 1.2), 1.6, true, 'no gato da luz');
  wire(root, tops[Math.floor(tops.length / 2) - 1], new THREE.Vector3(-21, LY + 2.2, 7), 1.6, true, 'no gato da luz');
  // fios de um vizinho a outro, dos lados
  wire(root, new THREE.Vector3(-21, LY + 2.4, -4.6), new THREE.Vector3(-34, LY - 1, -20), 1.3, true);
  wire(root, new THREE.Vector3(19.5, LY - .5, -9), new THREE.Vector3(33, LY - 2.5, -22), 1.1, true);
}

/* ---------------- morros lá longe ---------------- */
function buildBackdrop() {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + srand() * .3, r = 470 + srand() * 180;
    const hill = props.makeHill(110 + srand() * 90, 50 + srand() * 90, i + 31);
    hill.position.set(Math.cos(a) * r, -16, Math.sin(a) * r);
    root.add(hill);
  }
}

export function update(dt, clock, windDirH, windSpeed) {
  const w = windSpeed / 6;
  for (const m of swing) {
    if (m.userData.flag) { m.rotation.y = Math.atan2(-windDirH.z, windDirH.x) + Math.sin(clock * 3) * .15; m.rotation.x = Math.sin(clock * 5) * .1 * w; }
    else m.rotation.x = Math.sin(clock * 3 + m.userData.ph) * .35 * w + .25 * w;
  }
}

export { favelaTex };
