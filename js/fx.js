// Efeitos visuais: estouro (enroscada, linha arrebentando, aparada) e a rabiola enrolada/pendurada na linha.
// Tudo cresce com a distância da câmera, para dar para ver lá no alto.
import * as THREE from 'three';
import { scene, camera, makeLabel } from './scene.js';

const triGeo = new THREE.BufferGeometry();
triGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, .12, 0, -.09, -.07, 0, .09, -.07, 0], 3));
const ringGeo = new THREE.RingGeometry(.55, .75, 28);
const knotGeo = new THREE.IcosahedronGeometry(.11, 0);

const bursts = [];
const coils = new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _ax = new THREE.Vector3(),
  _p = new THREE.Vector3(), _q = new THREE.Vector3();

/** escala para algo continuar visível de longe */
function distScale(pos, ref = 14, max = 5) { return clamp(camera.position.distanceTo(pos) / ref, 1, max); }

/** estouro de partículas + anel + texto subindo */
export function burst(pos, color = '#ffd166', text = null, big = false) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.scale.setScalar(distScale(pos) * (big ? 1.3 : 1));
  scene.add(g);
  const parts = [];
  const n = big ? 28 : 16;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(triGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? color : '#ffffff', side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false }));
    const v = new THREE.Vector3(Math.random() - .5, Math.random() - .2, Math.random() - .5).normalize().multiplyScalar((big ? 6 : 4) * (.5 + Math.random()));
    m.userData = { v, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9) };
    m.scale.setScalar(1.6);
    g.add(m); parts.push(m);
  }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false }));
  g.add(ring);
  let label = null;
  if (text) {
    label = makeLabel(text, color, true);
    label.position.copy(pos);
    scene.add(label);
  }
  bursts.push({ g, parts, ring, label, age: 0, dur: big ? 1.8 : 1.3, base: pos.clone(), lift: g.scale.x });
}

/* ---------- faixa (fita) com espessura, atualizada todo quadro ---------- */
function makeStrip(n, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
  m.frustumCulled = false;
  m.userData.n = n;
  scene.add(m);
  return m;
}
/** pt(i, out) devolve o ponto i; wv(i, out) devolve meia-largura */
function writeStrip(m, pt, wv) {
  const a = m.geometry.attributes.position;
  for (let i = 0; i <= m.userData.n; i++) {
    pt(i, _p); wv(i, _q);
    a.setXYZ(i * 2, _p.x + _q.x, _p.y + _q.y, _p.z + _q.z);
    a.setXYZ(i * 2 + 1, _p.x - _q.x, _p.y - _q.y, _p.z - _q.z);
  }
  a.needsUpdate = true;
}

/**
 * Rabiola presa na linha do adversário (como na foto: a fita enrola e fica pendurada na linha).
 * Chame todo quadro enquanto a enroscada na rabiola existir.
 * a,b = pontas da linha de quem pegou; x = ponto preso na rabiola; color = cor da rabiola presa
 */
export function coil(key, a, b, x, color, shaking) {
  let c = coils.get(key);
  if (!c) {
    c = {
      wrap: makeStrip(110, color), stripe: makeStrip(110, '#ffffff'),
      hang: [makeStrip(28, color), makeStrip(28, '#ffffff'), makeStrip(28, color)],
      knot: new THREE.Mesh(knotGeo, new THREE.MeshBasicMaterial({ color, fog: false })),
      label: makeLabel('RABIOLA PRESA!', '#ffd166', true),
      age: 0, seen: true, center: new THREE.Vector3().copy(x),
    };
    scene.add(c.knot, c.label);
    coils.set(key, c);
  }
  c.seen = true;
  // centro = ponto da linha de quem pegou mais perto da rabiola
  _ax.subVectors(b, a);
  const len2 = _ax.lengthSq() || 1;
  const tt = clamp(_c.subVectors(x, a).dot(_ax) / len2, .05, .98);
  _c.copy(a).addScaledVector(_ax, tt);
  c.center.lerp(_c, c.age ? .35 : 1);
  _ax.normalize();
  _u.set(0, 1, 0).cross(_ax); if (_u.lengthSq() < 1e-4) _u.set(1, 0, 0); _u.normalize();
  _w.crossVectors(_ax, _u);

  const sc = distScale(c.center, 16, 4);
  const grow = Math.min(1, c.age / .8);
  const turns = .6 + grow * 4.5;
  const span = (.4 + grow * 1.6) * Math.min(sc, 2.5);
  const r = (.16 + .03 * Math.sin(c.age * 9)) * sc;
  const jit = shaking ? .08 * sc : 0;
  const t = c.age;
  const center = c.center;

  // a fita enrolando em volta da linha
  for (const [mesh, off, wid] of [[c.wrap, 0, .07], [c.stripe, Math.PI, .03]]) {
    const n = mesh.userData.n;
    writeStrip(mesh,
      (i, out) => {
        const s = i / n, ang = s * turns * Math.PI * 2 + t * 2.5 + off;
        const rr = r + Math.sin(s * 40 + t * 20) * jit;
        return out.copy(center).addScaledVector(_ax, (s - .5) * span).addScaledVector(_u, Math.cos(ang) * rr).addScaledVector(_w, Math.sin(ang) * rr);
      },
      (i, out) => out.copy(_ax).multiplyScalar(wid * sc));
  }
  // pontas penduradas na linha, balançando no vento
  const hangLen = (.6 + grow * 2.6) * Math.min(sc, 2.5);
  c.hang.forEach((m, k) => {
    const n = m.userData.n;
    const start = (k - 1) * .35 * span;
    const ph = k * 1.7;
    writeStrip(m,
      (i, out) => {
        const s = i / n;
        out.copy(center).addScaledVector(_ax, start).addScaledVector(_u, Math.sin(t * 6 + s * 5 + ph) * .25 * s * sc);
        out.y -= s * hangLen;
        return out.addScaledVector(_w, Math.cos(t * 4 + s * 4 + ph) * .15 * s * sc);
      },
      (i, out) => out.copy(_u).multiplyScalar(.05 * sc * (1 - i / n * .5)));
  });
  c.knot.position.copy(center);
  c.knot.scale.setScalar((1 + grow) * sc * (shaking ? 1 + Math.sin(t * 30) * .15 : 1));
  c.label.position.copy(center); c.label.position.y += .9 * sc;
  c.label.material.opacity = .7 + .3 * Math.sin(t * 7);
  return center;
}

function disposeCoil(c) {
  for (const m of [c.wrap, c.stripe, ...c.hang]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  scene.remove(c.knot, c.label);
}

/** some com as rabiolas enroladas que não estão mais presas */
function pruneCoils() {
  for (const [k, c] of coils) {
    if (!c.seen) { disposeCoil(c); coils.delete(k); }
    else c.seen = false;
  }
}

export function clearFx() {
  for (const c of coils.values()) disposeCoil(c);
  coils.clear();
  for (const b of bursts) { scene.remove(b.g); if (b.label) scene.remove(b.label); }
  bursts.length = 0;
}

export function updateFx(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.age += dt;
    const k = b.age / b.dur;
    for (const m of b.parts) {
      m.userData.v.y -= 6 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.rotation.x += m.userData.spin.x * dt; m.rotation.y += m.userData.spin.y * dt; m.rotation.z += m.userData.spin.z * dt;
      m.material.opacity = 1 - k;
    }
    b.ring.quaternion.copy(camera.quaternion);
    b.ring.scale.setScalar(1 + k * 6);
    b.ring.material.opacity = Math.max(0, 1 - k * 1.4);
    if (b.label) {
      b.label.position.copy(b.base); b.label.position.y += (1 + k * 1.5) * b.lift;
      b.label.material.opacity = k < .7 ? 1 : 1 - (k - .7) / .3;
    }
    if (k >= 1) {
      scene.remove(b.g); if (b.label) scene.remove(b.label);
      b.parts.forEach(m => m.material.dispose()); b.ring.material.dispose();
      bursts.splice(i, 1);
    }
  }
  for (const c of coils.values()) c.age += dt;
  pruneCoils();
}
