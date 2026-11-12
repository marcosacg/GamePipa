// Monta o campinho de várzea: chão, campo, árvores, postes, casas, bandeirinhas, morros, capim, nuvens e bola.
// O visual vem de props.js; aqui ficam a posição de cada coisa e os corpos de colisão (Ammo).
import * as THREE from 'three';
import { clamp, lerp, smooth, noise2, srand } from './utils.js';
import { PH, makeBody, staticBox, UP } from './physics.js';
import { G } from './state.js';
import { G_GROUND, G_STATIC, G_BALL } from './config.js';
import { scene, FIELD, trees, groundH, lampMats } from './scene.js';
import { mesh, smat } from './materials.js';
import * as props from './props.js';

const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const flags = [];
const clouds = [];

function buildGround() {
  const A = PH.A;
  const g = new THREE.PlaneGeometry(900, 900, 160, 160);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, cols = [];
  const grass = new THREE.Color('#6fa03c'), grass2 = new THREE.Color('#4c7d2a'), dry = new THREE.Color('#a3a04e'),
    dirt = new THREE.Color('#b58552'), dirt2 = new THREE.Color('#946640'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundH(x, z));
    const n = noise2(x * .09, z * .09), n2 = noise2(x * .02 + 9, z * .02), n3 = noise2(x * .3 + 3, z * .3);
    const inF = Math.abs(x) < FIELD.hx + 1.5 && Math.abs(z) < FIELD.hz + 1.5;
    if (inF) {
      const wear = Math.max(smooth(10, 0, Math.abs(x)) * .6, smooth(9, 0, Math.abs(Math.abs(z) - FIELD.hz + 4)) * smooth(10, 0, Math.abs(x)), smooth(8, 0, Math.hypot(x, z)));
      const t = clamp(wear + n * .35 + .25, 0, 1);
      c.copy(grass).lerp(dry, clamp(n3 * .5 + .3, 0, .6)).lerp(dirt, t).lerp(dirt2, clamp(n2 * .5 + .2, 0, 1) * t);
    } else {
      c.copy(grass).lerp(grass2, clamp(n * .5 + .5, 0, 1)).lerp(dry, clamp(n2 * .6, 0, .35));
      if (Math.abs(x - 27) < 2.2) c.lerp(dirt2, .55);
    }
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const tex = props.textures.grama().clone(); tex.needsUpdate = true; tex.repeat.set(260, 260);
  scene.add(mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }), false, true));
  const gb = makeBody(new A.btBoxShape(new A.btVector3(450, 1, 450)), 0, new THREE.Vector3(0, -1, 0), null, G_GROUND, -1, { type: 'ground' });
  gb.setFriction(.8);

  // linhas do campo, já meio apagadas
  const lm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const line = (w, d, x, z) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lm); p.rotation.x = -Math.PI / 2; p.position.set(x, .03, z); scene.add(p); };
  line(FIELD.hx * 2, .12, 0, -FIELD.hz); line(FIELD.hx * 2, .12, 0, FIELD.hz);
  line(.12, FIELD.hz * 2, -FIELD.hx, 0); line(.12, FIELD.hz * 2, FIELD.hx, 0);
  line(FIELD.hx * 2, .12, 0, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.8, 4.95, 48), lm); ring.rotation.x = -Math.PI / 2; ring.position.y = .03; scene.add(ring);
  for (const s of [-1, 1]) { line(16, .12, 0, s * (FIELD.hz - 7)); line(.12, 7, -8, s * (FIELD.hz - 3.5)); line(.12, 7, 8, s * (FIELD.hz - 3.5)); }
}

function buildGoals() {
  for (const s of [-1, 1]) {
    const z = s * FIELD.hz;
    const g = props.makeGoal(); g.position.set(0, 0, z); if (s > 0) g.rotation.y = Math.PI; // escora pra fora do campo
    scene.add(g);
    for (const px of [-3.1, 3.1]) staticBox(.09, 1.15, .09, new THREE.Vector3(px, 1.15, z), { type: 'trave', label: 'na trave' });
    staticBox(3.2, .08, .08, new THREE.Vector3(0, 2.27, z), { type: 'trave', label: 'no travessão' });
  }
}

function addTree(x, z, kind, seed, physics = true) {
  const A = PH.A, y0 = groundH(x, z);
  const t = props.makeTree(kind, seed, !physics);
  t.g.position.set(x, y0, z);
  scene.add(t.g);
  if (!physics) return;
  for (const s of t.spheres) makeBody(new A.btSphereShape(s.r), 0, new THREE.Vector3(x, y0 + s.y, z), null, G_STATIC, -1, { type: 'tree', label: t.label });
  makeBody(new A.btCylinderShape(new A.btVector3(t.trunk.r, t.trunk.hh, t.trunk.r)), 0, new THREE.Vector3(x, y0 + t.trunk.hh, z), null, G_STATIC, -1, { type: 'tree', label: t.trunk.label });
  trees.push({ x, z, r: t.r, top: t.top, label: t.label });
}

function buildTrees() {
  const list = [
    [-26, -8, 'mangueira'], [-27, 14, 'mangueira'], [-24, -30, 'mangueira'], [24, -38, 'mangueira'], [-12, -41, 'mangueira'], [12, 42, 'mangueira'], [33, -12, 'mangueira'],
    [-34, -20, 'eucalipto'], [-36, 2, 'eucalipto'], [-33, 24, 'eucalipto'], [8, -44, 'eucalipto'], [-4, -48, 'eucalipto'], [38, 30, 'eucalipto'], [36, 6, 'eucalipto'],
    [-22, 31, 'jamelao'], [22, 37, 'jamelao'], [34, -30, 'jamelao'], [-30, -42, 'jamelao'], [-40, 38, 'jamelao'],
  ];
  list.forEach(([x, z, k], i) => addTree(x, z, k, i + 1, true));
  for (let i = 0; i < 70; i++) {
    const a = srand() * Math.PI * 2, r = 95 + srand() * 140;
    addTree(Math.cos(a) * r, Math.sin(a) * r, ['mangueira', 'eucalipto', 'jamelao'][Math.floor(srand() * 3)], 100 + i, false);
  }
}

function buildPoles() {
  const zs = []; for (let z = -70; z <= 70; z += 20) zs.push(z);
  const X = 27, wireY = 8.75;
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  for (const z of zs) {
    const g = props.makePole(); g.position.set(X, 0, z); scene.add(g);
    lampMats.push(g.userData.lampMat);
    staticBox(.2, 4.6, .2, new THREE.Vector3(X, 4.6, z), { type: 'post', label: 'no poste' });
  }
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    for (const dx of [-.8, -.3, .3, .8]) {
      const pts = [];
      for (let k = 0; k <= 20; k++) { const t = k / 20; pts.push(new THREE.Vector3(X + dx, wireY - Math.sin(t * Math.PI) * .7, lerp(z0, z1, t))); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
    staticBox(1.0, .35, 10, new THREE.Vector3(X, wireY - .5, (z0 + z1) / 2), { type: 'wire', label: 'no fio do poste' });
  }
}

function buildHouses() {
  const palette = ['#f4d35e', '#ee964b', '#9ad1d4', '#f6f1e9', '#e8a87c', '#e9c46a', '#a3c4bc', '#f28482', '#d4a373', '#b5c99a'];
  let seed = 1;
  function house(x, z, w, d, rotY) {
    const floors = srand() < .45 ? 2 : 1;
    const unfinished = srand() < .3;
    const color = palette[Math.floor(srand() * palette.length)];
    const g = props.makeHouse({ w, d, floors, unfinished, color, seed: seed++ });
    g.position.set(x, groundH(x, z), z);
    g.rotation.y = rotY;
    scene.add(g);
    const h = g.userData.h;
    staticBox(w / 2, h / 2 + .3, d / 2, new THREE.Vector3(x, h / 2, z), { type: 'house', label: 'na laje do vizinho' }, rotY);
  }
  for (let x = -72; x < 60;) { const w = 6 + srand() * 3; house(x + w / 2, -62 - srand() * 2, w, 8, 0); x += w + .4 + srand() * 1.2; }
  for (let x = -60; x < 60;) { const w = 6 + srand() * 3; house(x + w / 2, 56 + srand() * 2, w, 8, Math.PI); x += w + .4 + srand() * 1.2; }
  for (let z = -48; z < 48;) { const w = 6 + srand() * 3; house(-54 - srand() * 2, z + w / 2, w, 8, Math.PI / 2); z += w + .4 + srand() * 1.2; }

  // muro pichado
  const wallM = new THREE.MeshStandardMaterial({ map: props.textures.reboco(), color: '#d8d2c4', roughness: .95 });
  const wall = mesh(props.boxWorldUV(.25, 1.8, 46, 2.4), wallM); wall.position.set(-30, .9, 0); scene.add(wall);
  const cap = mesh(new THREE.BoxGeometry(.35, .08, 46.1), smat('#bdb6a6')); cap.position.set(-30, 1.84, 0); scene.add(cap);
  staticBox(.15, .9, 23, new THREE.Vector3(-30, .9, 0), { type: 'house', label: 'no muro' });
  const tagCols = ['#e63946', '#118ab2', '#ffd166', '#06d6a0', '#8338ec', '#1b1b1f'];
  for (let i = 0; i < 22; i++) {
    const w = .6 + srand() * 2.2, hh = .3 + srand() * .9;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ color: tagCols[i % tagCols.length], transparent: true, opacity: .8, roughness: .9 }));
    p.rotation.y = Math.PI / 2; p.position.set(-29.86, .3 + hh / 2 + srand() * (1.4 - hh), -21 + srand() * 42);
    scene.add(p);
  }
}

function buildBandeirinhas() {
  const cols = ['#e63946', '#ffd166', '#06d6a0', '#118ab2', '#ff7b00', '#ffffff'];
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-.18, 0, 0, .18, 0, 0, 0, -.38, 0], 3));
  tri.computeVertexNormals();
  function stringFlags(a, b, sag) {
    const pts = [];
    for (let k = 0; k <= 30; k++) { const t = k / 30; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (let k = 1; k < 30; k++) {
      const f = new THREE.Mesh(tri, smat(cols[k % cols.length], { side: THREE.DoubleSide, roughness: .8 }));
      f.position.copy(pts[k]); f.rotation.order = 'YXZ'; f.rotation.y = yaw;
      f.userData.phase = k; flags.push(f); scene.add(f);
    }
    const mid = new THREE.Vector3().lerpVectors(a, b, .5); mid.y -= sag * .7;
    staticBox(.25, .3, a.distanceTo(b) / 2, mid, { type: 'wire', label: 'nas bandeirinhas' }, Math.atan2(b.x - a.x, b.z - a.z));
  }
  stringFlags(new THREE.Vector3(-26, 6.2, -8), new THREE.Vector3(-27, 6.2, 14), 1.2);
  stringFlags(new THREE.Vector3(-22, 4.6, 31), new THREE.Vector3(-33, 9, 24), .8);
}

function buildFar() {
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + srand() * .3, r = 420 + srand() * 200;
    const h = 40 + srand() * 70, rr = 90 + srand() * 80;
    const hill = props.makeHill(rr, h, i + 1);
    hill.position.set(Math.cos(a) * r, -8, Math.sin(a) * r);
    scene.add(hill);
  }
  // capim: tufos que balançam com o vento (menos no celular)
  const N = COARSE ? 3500 : 9000;
  const im = new THREE.InstancedMesh(props.grassBladeGeometry(5), props.grassMaterial(), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x, z;
    do { x = (srand() - .5) * 220; z = (srand() - .5) * 220; } while (Math.abs(x) < FIELD.hx - 1 && Math.abs(z) < FIELD.hz - 1 && srand() > .1);
    p.set(x, groundH(x, z), z); q.setFromAxisAngle(UP, srand() * 6.28); const k = .7 + srand() * .9; s.set(k, k * (.8 + srand() * .5), k);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    im.setColorAt(i, c.setHSL(.2 + srand() * .07, .5, .32 + srand() * .14));
  }
  im.receiveShadow = true;
  scene.add(im);
}

function buildClouds() {
  for (let i = 0; i < 22; i++) {
    const g = props.makeCloud(i + 1);
    g.position.set((srand() - .5) * 800, 85 + srand() * 60, (srand() - .5) * 800);
    clouds.push(g); scene.add(g);
  }
}

function buildBall() {
  const A = PH.A;
  G.ballMesh = props.makeBall();
  scene.add(G.ballMesh);
  const b = makeBody(new A.btSphereShape(.11), .43, new THREE.Vector3(1.5, .2, 18), null, G_BALL, G_GROUND | G_STATIC | G_BALL, null);
  b.setRestitution(.55); b.setFriction(.7); b.setDamping(.15, .4);
  if (b.setRollingFriction) b.setRollingFriction(.02);
  G.ball = b;
}

export function buildWorld() {
  buildGround(); buildGoals(); buildTrees(); buildPoles(); buildHouses(); buildBandeirinhas(); buildFar(); buildClouds(); buildBall();
}

/** coisas que se mexem sozinhas: nuvens, bandeirinhas, capim, bola */
export function updateEnvironment(dt, clock, windDirH, windSpeed) {
  for (const c of clouds) {
    c.position.addScaledVector(windDirH, dt * windSpeed * .35);
    if (c.position.z < -450) c.position.z += 900; if (c.position.z > 450) c.position.z -= 900;
    if (c.position.x < -450) c.position.x += 900; if (c.position.x > 450) c.position.x -= 900;
  }
  for (const f of flags) f.rotation.x = Math.sin(clock * 4 + f.userData.phase) * .4 * (windSpeed / 6);
  props.grassUniforms.uTime.value = clock;
  props.grassUniforms.uWind.value = .5 + windSpeed / 8;
  if (G.ball) {
    const tr = G.ball.getWorldTransform(), o = tr.getOrigin(), r = tr.getRotation();
    G.ballMesh.position.set(o.x(), o.y(), o.z()); G.ballMesh.quaternion.set(r.x(), r.y(), r.z(), r.w());
  }
}
