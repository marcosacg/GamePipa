// Pipas: desenho (formatos, estampas, rabiola) e a física da pipa do jogador
import * as THREE from 'three';
import { toonMat, noOutline } from './materials.js';
import { Corda } from './corda.js';
import { LinhaSolta, cortarEm } from './linhasolta.js';
import { flutter } from './rabiola.js';
const _fl = new THREE.Vector3(), _flS = new THREE.Vector3();
import { KITES, getPatterns, G_KITE, G_GROUND, G_STATIC, G_TAIL, MIN_LINE, MAX_LINE, LINE_STRENGTH, BREAK_HOLD } from './config.js';
import { S, G, keys } from './state.js';
import { PH, makeBody, removeBody, getPos, getVel, setPos, setVel, force, setRot, forEachContact, UP } from './physics.js';
import { scene, mesh, mat, smat, groundH, trees, SCN } from './scene.js';
import { lerp, smooth, wrapAngle, noise1 } from './utils.js';
import { heightWind, highGust } from './shared/linha.js';

/* =========================================================
   Formatos (coordenadas da pipa, tamanho 1)
   ========================================================= */
export const OUTLINES = {
  diamond:  [[0, .6], [.45, .14], [0, -.55], [-.45, .14]],
  hex:      [[0, .62], [.46, .32], [.46, -.18], [0, -.55], [-.46, -.18], [-.46, .32]],
  square:   [[0, .5], [.5, 0], [0, -.5], [-.5, 0]],
  bico:     [[-.5, .45], [.5, .45], [.47, .16], [0, -.62], [-.47, .16]],          // "bico listrado" (foto 1)
  quadrada: [[-.5, .5], [.5, .5], [.5, -.06], [0, -.62], [-.5, -.06]],            // "quadrada" (foto 2)
};
const STICKS = {
  diamond:  [[0, .6, 0, -.55], [-.45, .14, .45, .14]],
  hex:      [[0, .62, 0, -.55], [-.46, .32, .46, -.18], [.46, .32, -.46, -.18]],
  square:   [[0, .5, 0, -.5], [-.5, 0, .5, 0]],
  bico:     [[0, .8, 0, -.62], [-.5, .45, .5, .45]],
  quadrada: [[0, .82, 0, -.62], [-.5, .5, .5, .5], [-.5, -.06, .5, -.06]],
};
function bbox(o) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of o) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX, maxX, minY, maxY };
}

/** desenha a estampa da pipa num canvas 2D (também usado nas miniaturas do menu) */
export function drawKite(ctx, type, patIdx, W, Hh, pad = 0) {
  const kt = KITES[type], o = OUTLINES[kt.shape], b = bbox(o);
  const pats = getPatterns(type), pat = pats[patIdx] || pats[0], c = pat.c;
  const sx = (W - pad * 2) / (b.maxX - b.minX), sy = (Hh - pad * 2) / (b.maxY - b.minY);
  const P = (x, y) => [pad + (x - b.minX) * sx, pad + (b.maxY - y) * sy];
  const path = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [cx, cy] = P(x, y); if (i) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); }); ctx.closePath(); };
  const poly = (pts, col) => { ctx.fillStyle = col; path(pts); ctx.fill(); };
  const diamondAt = (x, y, r, col) => poly([[x, y + r], [x + r, y], [x, y - r], [x - r, y]], col);
  const FULL = [[-2, -2], [2, -2], [2, 2], [-2, 2]];

  ctx.save();
  path(o); ctx.clip();
  switch (pat.kind) {
    case 'split':
      poly([[-2, -2], [0, -2], [0, 2], [-2, 2]], c[0]); poly([[0, -2], [2, -2], [2, 2], [0, 2]], c[1]);
      break;
    case 'quad': {
      const cy = .1;
      poly([[-2, cy], [0, cy], [0, 2], [-2, 2]], c[0]); poly([[0, cy], [2, cy], [2, 2], [0, 2]], c[1]);
      poly([[-2, -2], [0, -2], [0, cy], [-2, cy]], c[1]); poly([[0, -2], [2, -2], [2, cy], [0, cy]], c[0]);
      break;
    }
    case 'faixa': { // duas cores em cima, faixa branca na diagonal, preto embaixo
      const m = -.8, above = (c0, col) => poly([[-2, c0 - 2 * m], [2, c0 + 2 * m], [2, 3], [-2, 3]], col);
      poly(FULL, c[3]); above(-.1, c[0]); above(.37, c[2]); above(.49, c[1]);
      break;
    }
    case 'lisa':
      poly(FULL, c[0]);
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = Math.max(1, W * .006);
      path([[0, .5], [0, -.62]]); ctx.stroke();
      path([[-.5, -.06], [.5, -.06]]); ctx.stroke();
      path([[-.5, .5], [0, -.06], [.5, .5]]); ctx.stroke();
      break;
    case 'losango': {
      poly(FULL, c[0]);
      poly([[-.5, .4], [-.07, .09], [-.5, -.02]], c[2]); poly([[.5, .4], [.07, .09], [.5, -.02]], c[2]);
      poly([[-.5, -.1], [-.08, -.08], [-.05, -.5]], c[2]); poly([[.5, -.1], [.08, -.08], [.05, -.5]], c[2]);
      for (let i = 0; i < 12; i++) diamondAt(0, .46 - i * .095, .045, i % 2 ? c[0] : c[1]);
      for (let i = -5; i <= 5; i++) if (i) diamondAt(i * .09, .05, .04, Math.abs(i) % 2 ? c[1] : c[0]);
      poly([[-.5, .5], [-.3, .5], [-.5, .3]], c[1]); poly([[.5, .5], [.3, .5], [.5, .3]], c[1]);
      break;
    }
    case 'triangulo':
      poly(FULL, c[0]);
      poly([[-.5, .5], [-.3, .5], [-.5, .3]], c[2]); poly([[.5, .5], [.3, .5], [.5, .3]], c[2]);
      poly([[0, .5], [-.48, .02], [.48, .02]], c[1]);
      diamondAt(0, -.04, .13, c[2]);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, W * .006);
      path([[-.5, -.06], [0, -.62], [.5, -.06]]); ctx.stroke();
      break;
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1.5, W * .012);
  path(o); ctx.stroke();
}

const texCache = new Map();
function kiteTexture(type, patIdx) {
  const k = type + ':' + patIdx;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  drawKite(c.getContext('2d'), type, patIdx, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(k, t);
  return t;
}

/** malha 3D de uma pipa (vela com estampa, varetas, estirante). Face voltada para +Z. */
export function makeKiteMesh(type, patIdx) {
  const kt = KITES[type], s = kt.size, o = OUTLINES[kt.shape], b = bbox(o);
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt); tilt.rotation.x = -.28;
  // vela levemente envergada (as pontas laterais vão pra trás, como pipa de verdade no vento)
  const bw = (b.maxX - b.minX) * s, bh = (b.maxY - b.minY) * s, hw = Math.max(Math.abs(b.minX), Math.abs(b.maxX)) * s;
  const bow = .09 * s;
  const bowZ = x => -bow * Math.pow(x / hw, 2);
  const geo = new THREE.PlaneGeometry(bw, bh, 18, 18);
  geo.translate((b.minX + b.maxX) / 2 * s, (b.minY + b.maxY) / 2 * s, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, bowZ(pos.getX(i)));
  geo.computeVertexNormals();
  const tex = kiteTexture(type, patIdx);
  const sail = mesh(geo, toonMat({ map: tex, side: THREE.DoubleSide, roughness: .75, alphaTest: .5 }), true, false);
  sail.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: .5 });
  tilt.add(sail);
  // varetas de bambu acompanhando a curva da vela
  const stickM = smat('#c9a25e', { roughness: .6 });
  for (const [ax, ay, bx, by] of STICKS[kt.shape]) {
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8, x = lerp(ax, bx, t) * s, y = lerp(ay, by, t) * s; pts.push(new THREE.Vector3(x, y, bowZ(x) + .018)); }
    tilt.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, .012, 6), stickM, false, false));
  }
  const lineM = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false }); // sem profundidade: não ganha traço de contorno
  if (kt.bridle) { // a vareta sai por cima e as linhas descem até os cantos, como nas fotos
    const topY = STICKS[kt.shape][0][1] * s, cy = b.maxY * s;
    tilt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.5 * s, cy, bowZ(-.5 * s) + .02), new THREE.Vector3(0, topY, .02), new THREE.Vector3(.5 * s, cy, bowZ(.5 * s) + .02)]), lineM));
  }
  tilt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, b.maxY * .75 * s, 0), new THREE.Vector3(0, .05 * s, .45 * s), new THREE.Vector3(0, b.minY * .7 * s, 0)]), lineM));
  root.userData.bottom = b.minY * s;
  root.userData.top = b.maxY * s;   // bico (onde a pipa fica pendurada quando é aparada)
  return root;
}

/** miniatura para o menu */
export function kiteThumb(type, patIdx, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawKite(c.getContext('2d'), type, patIdx, size, size, size * .1);
  return c;
}

/* =========================================================
   Rabiola: laços (clássica), fitas (bico) ou nada
   ========================================================= */
export class TailRenderer {
  constructor(type, patIdx, n) {
    const kt = KITES[type], pat = getPatterns(type)[patIdx] || getPatterns(type)[0];
    this.style = kt.tailStyle; this.n = n;
    this.objs = [];
    if (this.style === 'bows' && n > 0) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
      this.string = new THREE.Line(g, noOutline(new THREE.LineBasicMaterial({ color: 0xdddddd }))); this.string.frustumCulled = false;
      this.objs.push(this.string);
      const bowGeo = new THREE.BufferGeometry();
      bowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.13, .05, 0, -.13, -.05, 0, 0, 0, 0, .13, .05, 0, 0, 0, 0, .13, -.05, 0], 3));
      bowGeo.computeVertexNormals();
      this.bows = [];
      for (let i = 0; i < n; i++) {
        const bow = mesh(bowGeo, toonMat({ color: i % 2 ? pat.c[0] : '#f5f5f5', side: THREE.DoubleSide, flatShading: true }), false, false);
        this.bows.push(bow); this.objs.push(bow);
      }
    } else if (this.style === 'fitas' && n > 0) {
      this.ribbons = (pat.fitas || ['#ffffff']).map(col => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
        const idx = [];
        for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        g.setIndex(idx);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
        m.frustumCulled = false;
        this.objs.push(m);
        return m;
      });
    }
    for (const o of this.objs) scene.add(o);
    this._d = new THREE.Vector3(); this._side = new THREE.Vector3(); this._w = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  /** pts: n+1 pontos (o primeiro é onde a rabiola prende na pipa) */
  update(pts, t, windDirH) {
    if (this.style === 'bows' && this.string) {
      const sp = this.string.geometry.attributes.position;
      for (let i = 0; i <= this.n; i++) sp.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
      sp.needsUpdate = true;
      for (let i = 0; i < this.n; i++) {
        const bow = this.bows[i];
        bow.position.copy(pts[i + 1]);
        this._d.subVectors(pts[i], pts[i + 1]);
        if (this._d.lengthSq() > 1e-6) bow.quaternion.setFromUnitVectors(UP, this._d.normalize());
        bow.rotateY(Math.sin(t * 6 + i) * .6);
      }
    } else if (this.ribbons) {
      this._side.set(-windDirH.z, 0, windDirH.x);
      const R = this.ribbons.length;
      this.ribbons.forEach((rb, r) => {
        const a = rb.geometry.attributes.position;
        for (let i = 0; i <= this.n; i++) {
          const f = i / this.n;
          const off = (r - (R - 1) / 2) * .05 * (1 + f * 3) + Math.sin(t * 7 + i * .9 + r * 2) * .06 * f;
          this._p.copy(pts[i]).addScaledVector(this._side, off);
          const ph = t * 5 + i * .6 + r;
          this._w.copy(this._side).multiplyScalar(Math.cos(ph) * .03).add(this._d.set(0, Math.sin(ph) * .03, 0));
          a.setXYZ(i * 2, this._p.x + this._w.x, this._p.y + this._w.y, this._p.z + this._w.z);
          a.setXYZ(i * 2 + 1, this._p.x - this._w.x, this._p.y - this._w.y, this._p.z - this._w.z);
        }
        a.needsUpdate = true;
      });
    }
  }
  setVisible(v) { for (const o of this.objs) o.visible = v; }
  dispose() { for (const o of this.objs) scene.remove(o); }
}

/** rabiola "de mentira" para pipas remotas e avoadas (sem física) */
export function proceduralTail(out, attach, windDirH, n, t, seed = 0) {
  for (let i = 0; i <= n; i++) {
    if (!out[i]) out[i] = new THREE.Vector3();
    out[i].copy(attach).addScaledVector(windDirH, i * .32).add(_tmpV.set(
      Math.sin(t * 3 + i * .7 + seed) * .05 * i, -i * .36, Math.cos(t * 2.6 + i * .6 + seed) * .04 * i));
  }
  return out;
}
const _tmpV = new THREE.Vector3();

/* =========================================================
   Pipa do jogador (física)
   ========================================================= */
const LINE_N = 50;
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LINE_N + 1) * 3), 3));
export const lineObj = new THREE.Line(lineGeo, noOutline(new THREE.LineBasicMaterial({ color: 0xf7f3e8 })));
lineObj.frustumCulled = false;
scene.add(lineObj);

export function buildKite() {
  if (G.kite) destroyKite();
  const A = PH.A, type = S.kiteType, kt = KITES[type], s = kt.size;
  const body = makeBody(new A.btBoxShape(new A.btVector3(.4 * s, .5 * s, .06)), kt.mass, S.kitePos, null, G_KITE, G_GROUND | G_STATIC, { type: 'kite' });
  body.setDamping(.05, .9);
  body.setAngularFactor(new A.btVector3(0, 0, 0));
  body.setActivationState(4);
  body.setFriction(.6);
  const m = makeKiteMesh(type, S.patIdx);
  scene.add(m);
  const bottom = m.userData.bottom;
  const links = [], cons = [];
  const LL = .5; // distância entre os laços da rabiola
  let prev = body, prevPivot = new A.btVector3(0, bottom, 0);
  for (let i = 0; i < kt.tail; i++) {
    const p = new THREE.Vector3(S.kitePos.x, S.kitePos.y + bottom - LL * (i + .5), S.kitePos.z);
    const lb = makeBody(new A.btSphereShape(.05), .004, p, null, G_TAIL, G_GROUND, null);
    lb.setDamping(.25, .6); lb.setActivationState(4);
    const c = new A.btPoint2PointConstraint(prev, lb, prevPivot, new A.btVector3(0, LL / 2, 0));
    PH.world.addConstraint(c, true);
    links.push(lb); cons.push(c);
    prev = lb; prevPivot = new A.btVector3(0, -LL / 2, 0);
  }
  const tail = new TailRenderer(type, S.patIdx, kt.tail);
  G.kite = { body, mesh: m, links, cons, tail, kt, bottom, pts: Array.from({ length: kt.tail + 1 }, () => new THREE.Vector3()) };
}

export function destroyKite() {
  const k = G.kite;
  for (const c of k.cons) { PH.world.removeConstraint(c); PH.A.destroy(c); }
  for (const l of k.links) removeBody(l);
  removeBody(k.body);
  scene.remove(k.mesh);
  k.tail.dispose();
  G.kite = null;
}

/**
 * Rabiola cortada no ponto f (0 = pé da pipa, 1 = ponta): a pipa fica só com o pedaço de cima
 * (mais instável até a próxima pipa) e o resto cai rodopiando.
 */
const pieces = [];
export function cutTail(f) {
  const k = G.kite, n = k.links.length;
  if (!n) return 0;
  const keep = Math.max(1, Math.min(n - 1, Math.round(f * n)));
  if (keep >= n) return n;
  // o pedaço que soltou: cai com o vento
  const pts = k.pts.slice(keep).map(p => p.clone());
  const piece = { tail: new TailRenderer(S.kiteType, S.patIdx, pts.length - 1), pts, vel: new THREE.Vector3(0, -1, 0), t: 0 };
  pieces.push(piece);
  for (let i = n - 1; i >= keep; i--) {
    PH.world.removeConstraint(k.cons[i]); PH.A.destroy(k.cons[i]);
    removeBody(k.links[i]);
  }
  k.cons.length = keep; k.links.length = keep; k.pts.length = keep + 1;
  k.tail.dispose(); k.tail = new TailRenderer(S.kiteType, S.patIdx, keep);
  return keep;
}
function updatePieces(dt) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const pc = pieces[i];
    pc.t += dt;
    pc.vel.y = Math.max(-3, pc.vel.y - 2 * dt);
    pc.pts.forEach((p, j) => { p.addScaledVector(pc.vel, dt).addScaledVector(S.windDirH, (1.5 + j * .1) * dt); p.x += Math.sin(S.clock * 3 + j) * .02; });
    pc.tail.update(pc.pts, S.clock, S.windDirH);
    if (pc.t > 3.5 || pc.pts[0].y < groundH(pc.pts[0].x, pc.pts[0].z)) { pc.tail.dispose(); pieces.splice(i, 1); }
  }
}

/** desenho da rabiola presa: até o ponto preso ela vai até a linha; depois continua pendurada do outro lado */
const _pinOff = new THREE.Vector3();
export function pinTail(pts, tug, f) {
  const n = pts.length - 1;
  const hi = Math.max(1, Math.min(n, Math.round(f * n)));
  _pinOff.subVectors(tug, pts[hi]);
  for (let i = 1; i <= n; i++) {
    if (i <= hi) pts[i].lerp(tug, Math.pow(i / hi, 2));
    else pts[i].add(_pinOff);
  }
  return pts;
}

/* ---------------- pipa nas costas ---------------- */
export const isFail = st => st === 'enroscou' || st === 'caiu' || st === 'arrebentou';
export const BACK_SCALE = .6;     // a pipa nas costas aparece menor para não cobrir o boneco
const LAUNCH_TIME = .75;          // duração do lançamento (s)
/* jeito de voar: pipa rápida e fluida (lift = força pra onde o bico aponta; dart = tiro na puxada; side = freio de lado) */
export const FLY = { lift: 1.25, dart: 14, side: .65 };
/* puxa e descarrega: as puxadas (W) enchem a "carga"; dando linha (S) logo depois a linha corre solta
   e a pipa dispara pra cima (sobe bem mais rápido do que só dando linha) */
export const CARGA = { enche: 1.15, vaza: .25, gasta: .52, linha: 18, vsobe: 16, vsai: 13, puxa: 3 };

/** controle da linha (W puxa, S dá linha / descarrega, Espaço recolhe) — chamado a cada quadro */
export function lineControl(dt) {
  const c = S.carga || 0;
  if (S.state !== 'voando') { S.pulling = false; S.carga = Math.max(0, c - dt); S.descarga = 0; return; }
  S.pulling = !!keys.KeyW;
  if (S.pulling && S.stamina > .02) S.carga = Math.min(1, c + dt * CARGA.enche * Math.min(1, .35 + S.tension / 8)); // puxada enche
  else if (!keys.KeyS) S.carga = Math.max(0, c - dt * CARGA.vaza);                                                    // parado, vaza
  S.descarga = 0;
  if (keys.KeyS && !S.pulling) {
    let rate = Math.min(6, .8 + S.rawT * 1.5);                    // a linha corre na mão conforme a pipa puxa
    if (S.carga > .02) {
      // descarregando: a linha corre na mão só o tanto que a pipa puxa (sem ficar frouxa) e a pipa dispara pra onde o bico aponta
      S.descarga = S.carga;
      S.carga = Math.max(0, S.carga - dt * CARGA.gasta);
      const dist = S.kitePos.distanceTo(S.hand);
      const solta = dist + .3 + Math.max(0, S.kiteVr || 0) * .15;   // um pouco à frente de onde a pipa vai estar
      S.L = Math.min(MAX_LINE, Math.max(S.L + rate * dt * .5, Math.min(solta, S.L + CARGA.linha * dt)));
    } else S.L = Math.min(MAX_LINE, S.L + rate * dt);
  }
  if (keys.Space) S.L = Math.max(MIN_LINE, S.L - 7 * dt);
  if (S.pulling) S.L = Math.max(MIN_LINE, S.L - CARGA.puxa * dt);    // puxada: recolhe linha
}
const _eul = new THREE.Euler();

/** posição/rotação da pipa presa nas costas de quem está em pos, olhando para yaw */
export function backPose(pos, yaw, outP, outQ) {
  outP.set(pos.x - Math.sin(yaw) * .24, pos.y + 1.2, pos.z - Math.cos(yaw) * .24);
  outQ.setFromEuler(_eul.set(.12, yaw + Math.PI, 0, 'YXZ')); // face pra trás, encostada nas costas
  return outP;
}
/** rabiola pendurada nas costas: desce até o chão e arrasta atrás do boneco */
export function hangTail(out, attach, yaw, n, t, groundY = 0) {
  const bx = -Math.sin(yaw), bz = -Math.cos(yaw);
  for (let i = 0; i <= n; i++) {
    if (!out[i]) out[i] = new THREE.Vector3();
    let y = attach.y - i * .3, back = .06 * i;
    const floor = groundY + .03;
    if (y < floor) { back += (floor - y); y = floor; }
    out[i].set(attach.x + bx * back + Math.sin(t * 2 + i) * .02, y, attach.z + bz * back);
  }
  return out;
}

const _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _l0 = new THREE.Vector3(), _l1 = new THREE.Vector3(), _lq0 = new THREE.Quaternion(), _ba = new THREE.Vector3();
function placeOnBack() {
  const k = G.kite, P = G.player;
  // primeira pessoa: a pipa fica segurada na frente da câmera (o lançamento sai dali)
  if (S.fpHold && G.hooks.kiteHold) G.hooks.kiteHold(_bp, _bq); else backPose(P.g.position, P.yaw, _bp, _bq);
  S.kiteQ.copy(_bq);
  setPos(k.body, _bp); setRot(k.body, _bq); setVel(k.body, ZERO_V);
  if (k.links.length) {
    _ba.set(0, k.bottom * (S.fpHold ? .78 : BACK_SCALE), 0).applyQuaternion(_bq).add(_bp);
    hangTail(k.pts, _ba, P.yaw, k.links.length, S.clock, P.g.position.y);
    k.links.forEach((lb, i) => { setPos(lb, k.pts[i + 1]); setVel(lb, ZERO_V); });
  }
}

/** guarda a pipa nas costas (começo da partida e depois de perder) */
export function putOnBack() {
  if (G.kite.links.length < G.kite.kt.tail) buildKite(); // pipa nova: rabiola inteira de novo
  const k = G.kite;
  S.state = 'costas'; S.stateTimer = 0; S.hideKite = false;
  S.theta = 0; S.tension = 0; S.rawT = 0; S.overT = 0; S.stress = 0; S.jerk = 0;
  k.mesh.visible = true; k.tail.setVisible(true); lineObj.visible = false;
  placeOnBack();
}

/** solta a pipa das costas: ela sobe num arco até a janela de vento */
export function launchKite() {
  if (S.state !== 'costas') return false;
  const P = G.player.g.position;
  S.state = 'lancando'; S.stateTimer = 0; S.launchFp = !!S.fpHold;
  _l0.copy(S.kitePos); _lq0.copy(S.kiteQ);
  _l1.copy(P).addScaledVector(S.windDirH, 9); _l1.y = P.y + 7;
  lineObj.visible = true;
  return true;
}

export function resetKite() {
  const k = G.kite, P = G.player.g.position;
  const p = new THREE.Vector3().copy(P).addScaledVector(S.windDirH, 10); p.y = Math.max(P.y + 8, groundH(p.x, p.z) + 4);
  S.kitePos.copy(p);
  setPos(k.body, p); setVel(k.body, new THREE.Vector3());
  k.links.forEach((lb, i) => {
    setPos(lb, new THREE.Vector3(p.x, p.y + k.bottom - .5 * (i + .5), p.z).addScaledVector(S.windDirH, .1 * i));
    setVel(lb, new THREE.Vector3());
  });
  S.L = Math.max(MIN_LINE, p.distanceTo(S.hand) + .2);
  S.theta = 0; S.state = 'voando'; S.stateTimer = 0; S.overT = 0; S.tension = 0; S.rawT = 0; S.stress = 0; S.jerk = 0;
  S.hideKite = false;
  k.mesh.visible = true; k.tail.setVisible(true); lineObj.visible = true;
}

/** a pipa do jogador falhou: enroscou, caiu, arrebentou ou foi laçada */
export function failKite(kind, msg, sub) {
  if (S.state !== 'voando') return;
  S.state = kind === 'lacada' ? 'arrebentou' : kind; S.stateTimer = 0;
  if (kind === 'lacada') { S.hideKite = true; G.kite.mesh.visible = false; G.kite.tail.setVisible(false); }
  if (G.hooks.onFail) G.hooks.onFail(kind, msg, sub);
}

/* ---------------- vento local (com turbulência das árvores) ---------------- */
export function windAt(p, out) {
  // lá em cima venta mais e com rajadas próprias, que também mudam um pouco a direção
  const hf = heightWind(p.y) * highGust(p.y, S.clock);
  out.copy(S.windVec).multiplyScalar(hf);
  const swirl = smooth(25, 120, p.y) * noise1(S.clock * .45 + 7) * .14 * S.windSpeed;
  out.x += -S.windDirH.z * swirl; out.z += S.windDirH.x * swirl;
  let turb = 0;
  for (const tr of trees) {
    const dx = p.x - tr.x, dz = p.z - tr.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < tr.r + 10 && p.y < tr.top + 7) turb = Math.max(turb, smooth(tr.r + 10, tr.r, d) * smooth(tr.top + 7, tr.top - 2, p.y));
  }
  if (turb > 0) {
    const t = S.clock * 3;
    out.x += noise1(t + p.x) * turb * 3; out.y += noise1(t + 20) * turb * 2; out.z += noise1(t + 40 + p.z) * turb * 3;
    out.multiplyScalar(1 - turb * .35);
  }
  return turb;
}

/* ---------------- passo de física ---------------- */
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(),
  _a = new THREE.Vector3(), _eUp = new THREE.Vector3(0, 1, 0), _prevUp = new THREE.Vector3(0, 1, 0), _eR = new THREE.Vector3(), _nose = new THREE.Vector3(),
  _tmp = new THREE.Vector3(), _negU = new THREE.Vector3(), _bx = new THREE.Vector3(), _w = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _tq = new THREE.Quaternion(), ZERO_V = new THREE.Vector3();
const _qb = new THREE.Quaternion(), _zAx = new THREE.Vector3(0, 0, 1), _xAx = new THREE.Vector3(1, 0, 0);
const LINHA_KG_M = .0004; // linha de pipa: ~0,4 g por metro
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lastApparent = { v: 0 };

export function kitePhysicsStep(h, strayBodies) {
  const k = G.kite, kt = k.kt, body = k.body;
  getPos(body, _p); getVel(body, _v);
  const flying = S.state === 'voando';
  let T = 0;

  if (S.state === 'costas') {
    placeOnBack();
  } else if (S.state === 'lancando') {
    const e = Math.min(1, S.stateTimer / LAUNCH_TIME), ez = 1 - (1 - e) * (1 - e);
    _p.lerpVectors(_l0, _l1, ez); _p.y += Math.sin(Math.PI * e) * 2.5;
    // vira de frente para o jogador enquanto sobe
    _u.subVectors(_p, S.hand).normalize();
    _eUp.copy(UP).addScaledVector(_u, -_u.y);
    if (_eUp.lengthSq() < .002) _eUp.copy(_prevUp); else _eUp.normalize();
    _negU.copy(_u).negate();
    _bx.crossVectors(_eUp, _negU).normalize();
    _m4.makeBasis(_bx, _eUp, _negU); _tq.setFromRotationMatrix(_m4);
    S.kiteQ.copy(_lq0).slerp(_tq, ez);
    setPos(body, _p); setRot(body, S.kiteQ);
    setVel(body, _v.subVectors(_l1, _l0).multiplyScalar(.6 / LAUNCH_TIME));
    if (e >= 1) {
      S.state = 'voando'; S.stateTimer = 0; S.theta = 0;
      S.L = Math.max(MIN_LINE, _p.distanceTo(S.hand) + .2);
      _prevUp.copy(_eUp);
    }
  } else if (flying) {
    _d.subVectors(_p, S.hand);
    const dist = Math.max(.01, _d.length());
    _u.copy(_d).divideScalar(dist);
    S.kiteVr = _v.dot(_u); // velocidade da pipa se afastando da mão (a linha corre na mão nesse ritmo ao descarregar)
    _f.set(0, 0, 0);

    const turb = windAt(_p, _w);
    S.turb = turb;
    _a.subVectors(_w, _v);
    const amag = _a.length();
    lastApparent.v = amag;
    _f.addScaledVector(_a, kt.drag * amag);
    const q = Math.max(0, _a.dot(_u));
    const tf = smooth(S.L - 1.5, S.L - .05, dist);  // linha esticada = pipa de frente pro vento
    _eUp.copy(UP).addScaledVector(_u, -_u.y);
    if (_eUp.lengthSq() < .002) _eUp.copy(_prevUp); else _eUp.normalize();
    _prevUp.copy(_eUp);
    _eR.crossVectors(_u, _eUp).normalize();

    // embicar (A/D) e a rabiola/estirante puxando de volta pro prumo
    const steer = S.running ? ((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)) : 0;
    // pipa de combate: com a linha frouxa ela gira rápido no lugar; esticada, segue pra onde o bico aponta
    if (steer) S.theta += steer * kt.turn * 1.55 * h * (1.6 - .6 * tf);
    // rabiola curta (cortada) = pipa mais instável
    const stab = kt.stab * (kt.tail > 0 ? .45 + .55 * k.links.length / kt.tail : 1);
    if (!steer) S.theta -= S.theta * (stab * .8 + .45) * h * (.3 + .7 * tf);
    const gustNoise = noise1(S.clock * 1.7) * .35 * (S.windSpeed / 6) * (S.gustAmp / .35);
    S.theta += (gustNoise + turb * noise1(S.clock * 5 + 7) * 4) / stab * h;
    if (tf < .15) S.theta += noise1(S.clock * 2.3 + 11) * 4.2 * h; // linha frouxa: a pipa fica "louca" (cabeçada)
    S.theta = wrapAngle(S.theta);
    _nose.copy(_eUp).multiplyScalar(Math.cos(S.theta)).addScaledVector(_eR, Math.sin(S.theta));

    // rabiola presa na linha do adversário: ela é arrastada e puxa a pipa junto
    if (S.tailTug) {
      _tmp.subVectors(S.tailTug, _p);
      const dl = _tmp.length();
      if (dl > .01) {
        _tmp.multiplyScalar(1 / dl);
        _f.addScaledVector(_tmp, Math.min(2.2, .5 + dl * .3) * kt.mass / .3); // a pipa é puxada para o ponto preso (dá pra fugir)
        S.theta += Math.sign(_tmp.dot(_eR)) * 1.4 * h;                           // e embica para o lado da rabiola
        if (S.shakeT > 0) S.theta += Math.sin(S.clock * 14) * 2.2 * h;          // sacudindo
      }
    }

    _f.addScaledVector(_nose, kt.lift * q * q * (.4 + .6 * tf) * FLY.lift);
    _f.addScaledVector(_u, kt.push * q * q * (.4 + .6 * tf));
    // puxada: a pipa dá um tiro pra onde o bico aponta
    if (S.pulling && tf > .4 && S.stamina > .02) _f.addScaledVector(_nose, kt.mass * FLY.dart * tf);
    // descarregando: impulso pra onde o bico aponta e pra cima (a linha está correndo solta)
    if (S.descarga > 0) {
      // a energia das puxadas vira velocidade: a pipa sobe e se afasta levando linha
      const d = S.descarga;
      _f.y += kt.mass * 6 * Math.max(0, CARGA.vsobe * d - _v.y) + kt.mass * 9.81 * d * .6;
      _f.addScaledVector(_u, kt.mass * 6 * Math.max(0, CARGA.vsai * d - _v.dot(_u)));
    }
    _tmp.copy(_v).addScaledVector(_u, -_v.dot(_u));
    _f.addScaledVector(_tmp, -FLY.side * kt.mass); // freio de lado: menor = pipa mais rápida e solta
    // linha inextensível: quando esticada, segura tudo que puxa pra fora
    if (dist >= S.L - .02) {
      const Fr = _f.dot(_u) - kt.mass * 9.81 * _u.y;
      T = Math.max(0, Fr + kt.mass * _tmp.lengthSq() / dist);
      _f.addScaledVector(_u, -T);
    }
    if (S.lineLoad) T += 1.2 + .4 * S.windSpeed / 6; // a rabiola do outro pesa na minha linha
    // o peso da própria linha: metade dela fica "pendurada" na pipa (linha longa = pipa mais baixa)
    _f.y -= LINHA_KG_M * S.L * 9.81 * .5;
    S.rawT = T;
    force(body, _f);

    _negU.copy(_u).negate();
    _bx.crossVectors(_nose, _negU).normalize();
    _m4.makeBasis(_bx, _nose, _negU);
    _tq.setFromRotationMatrix(_m4);
    // a pipa "deita" nas curvas (inclina para o lado em que está indo) e treme com o vento no pano
    const side = _v.dot(_eR);
    S.kiteBank += (clamp(-side * .045, -.55, .55) - S.kiteBank) * (1 - Math.exp(-6 * h));
    const flut = Math.min(1, amag / 12) * (.03 + .05 * (1 - tf));
    _tq.multiply(_qb.setFromAxisAngle(_zAx, S.kiteBank + noise1(S.clock * 9.5) * flut))
      .multiply(_qb.setFromAxisAngle(_xAx, noise1(S.clock * 8.3 + 5) * flut * .8));
    // com a linha esticada ela vira rápido; frouxa, gira solta (inércia)
    S.kiteQ.slerp(_tq, 1 - Math.exp(-(4 + 9 * tf) * h));
    setRot(body, S.kiteQ);

    // "esforço" da linha = tensão média (~0,4 s) + trancos limitados: rajada rápida não arrebenta
    S.stress += (T + S.jerk - S.stress) * (1 - Math.exp(-h / .4));
    const lim = kt.breakN * LINE_STRENGTH;
    if (S.stress > lim) S.overT += h; else S.overT = Math.max(0, S.overT - h * 1.5);
    if (S.overT > BREAK_HOLD && S.running) failKite('arrebentou', 'A linha arrebentou!', 'Ficou muito tempo no vermelho. Dê linha para aliviar.');
    if (_p.y < groundH(_p.x, _p.z) + .45 && S.running) failKite('caiu', 'Caiu ' + SCN.fallLabel(_p.x, _p.z) + '!', 'Mantenha a linha esticada!');
  } else if (S.state === 'enroscou') {
    setPos(body, S.stuckPos); setVel(body, ZERO_V);
  } else {
    windAt(_p, _w); _a.subVectors(_w, _v);
    _f.copy(_a).multiplyScalar(kt.drag * _a.length() * 1.5);
    if (S.state === 'arrebentou') _f.y += kt.mass * 6.5;
    force(body, _f);
    S.kiteQ.multiply(_tq.setFromAxisAngle(_tmp.set(.3, 1, .2).normalize(), h * 4));
    setRot(body, S.kiteQ);
  }
  if (!flying) S.rawT = 0;
  S.tension = lerp(S.tension, S.rawT, .08);

  const nl = k.links.length;
  if (S.state !== 'costas') k.links.forEach((lb, i) => {
    getPos(lb, _tmp); getVel(lb, _v);
    const held = Math.max(0, Math.min(nl - 1, Math.round(S.tailF * nl) - 1));
    if (S.tailTug && S.state === 'voando' && Math.abs(i - held) <= 1) {
      // o laço que está na linha do adversário fica segurado ali (vai escorregando com o tailF)
      _d.subVectors(S.tailTug, _tmp);
      const dl = _d.length();
      if (dl > .05) { _d.multiplyScalar(Math.min(8, dl * 6) / dl); _v.lerp(_d, i === held ? .6 : .3); setVel(lb, _v); }
      return;
    }
    windAt(_tmp, _w); _a.subVectors(_w, _v);
    _f.copy(_a).multiplyScalar(.0015 * _a.length());
    // tremido da fita: ondas que correm do pé até a ponta (mais fortes com vento e na ponta)
    flutter(S.clock, i + 1, 3, S.windSpeed, _fl);
    _f.addScaledVector(_flS.set(-S.windDirH.z, 0, S.windDirH.x), _fl.x * .004).addScaledVector(S.windDirH, _fl.z * .004);
    _f.y += _fl.y * .004;
    force(lb, _f);
  });

  if (strayBodies) strayBodies(h);

  PH.world.stepSimulation(h, 0);

  // depois do passo: a pipa não passa do comprimento da linha
  S.jerk *= .9;
  if (S.state === 'voando') {
    getPos(body, _p);
    _d.subVectors(_p, S.hand);
    const dist = _d.length();
    if (dist > S.L) {
      _u.copy(_d).divideScalar(dist);
      getVel(body, _v);
      const vr = _v.dot(_u);
      if (vr > 0) {
        _v.addScaledVector(_u, -vr); setVel(body, _v);
        const j = kt.mass * vr / h * .15;
        S.rawT += j;
        S.jerk = Math.max(S.jerk, Math.min(j, kt.breakN * .25)); // tranco conta, mas com limite
      }
      _tmp.copy(S.hand).addScaledVector(_u, S.L);
      setPos(body, _tmp);
    }
  }
  forEachContact(onContact);
}

function onContact(a, b) { handle(a, b); handle(b, a); }
function handle(self, other) {
  if (self.type === 'kite' && S.state === 'voando' && S.running) {
    if (other.type === 'tree' || other.type === 'wire' || other.type === 'house' || other.type === 'post') {
      S.stuckPos.copy(S.kitePos);
      failKite('enroscou', 'Enroscou ' + other.label + '!', 'Já tem outra pipa na mão...');
    } else if (other.type === 'trave') failKite('caiu', 'Bateu ' + other.label + '!', 'Mantenha a linha esticada!');
    else if (other.type === 'ground') failKite('caiu', 'Caiu no chão!', 'Mantenha a linha esticada!');
  }
  if (self.type === 'stray' && self.ref && !self.ref.caught) {
    if (other.type === 'ground') self.ref.dead = true;
    else if (other.type !== 'kite') self.ref.stuck = true;
  }
}

/* ---------------- visual da pipa e da linha do jogador ---------------- */
const _kv = new THREE.Vector3();
export function syncKiteVisual() {
  const k = G.kite;
  getPos(k.body, S.kitePos);
  S.kiteSpeed = S.state === 'voando' ? getVel(k.body, _kv).length() : 0;
  if (pieces.length) updatePieces(1 / 60);
  k.mesh.position.copy(S.kitePos);
  k.mesh.quaternion.copy(S.kiteQ);
  const s0 = S.fpHold || S.launchFp ? .78 : BACK_SCALE;
  const sc = S.state === 'costas' ? s0 : S.state === 'lancando' ? lerp(s0, 1, Math.min(1, S.stateTimer / LAUNCH_TIME)) : 1;
  k.mesh.scale.setScalar(sc);
  lineObj.visible = S.state !== 'costas';
  if (k.kt.tail > 0) {
    k.pts[0].set(0, k.bottom * sc, 0).applyQuaternion(S.kiteQ).add(S.kitePos);
    k.links.forEach((lb, i) => getPos(lb, k.pts[i + 1]));
    if (S.tailTug && S.state === 'voando') pinTail(k.pts, S.tailTug, S.tailF);
    k.tail.update(k.pts, S.clock, S.windDirH);
  }

}

/**
 * Desenha a linha do jogador (corda com barriga, tremido e folga). Chamada depois da câmera,
 * porque em primeira pessoa a linha sai da mão que aparece na tela (S.lineFrom / S.spoolFrom).
 */
const myRope = new Corda(LINE_N - 1, 3.7);
let myCut = null; // o pedaço de linha solto que ficou na mão depois do corte
/**
 * Corta a minha linha no ponto x (onde a linha do outro passou), ou perto da pipa (x = null: arrebentou).
 * O pedaço da mão até o corte vira linha solta presa na mão; devolve o pedaço do corte até a pipa
 * (começando na pipa), que vai com a avoada.
 */
export function cortarMinhaLinha(x) {
  const P = myRope.ok ? myRope.p : [S.hand.clone(), S.kitePos.clone()];
  const X = x ? (x.isVector3 ? x : new THREE.Vector3().fromArray(x)) : P[Math.max(1, P.length - 3)];
  const r = cortarEm(P, X);
  myCut = new LinhaSolta(r.mao, LINE_N - 1, { chao: groundH });
  // a linha estava esticada: no corte ela "estala" e volta um pouco em direção à mão
  myCut.kick(_cutV.subVectors(S.hand, r.c).setLength(Math.min(6, 2 + S.tension * 4)));
  return r.pipa;
}
const _cutV = new THREE.Vector3();
const _linCor = new THREE.Color(0xf7f3e8), _linPerigo = new THREE.Color(0xff3b30);
export function updateMyLine(dt) {
  const lp = lineGeo.attributes.position;
  const from = S.lineFrom || S.hand, spool = S.spoolFrom || S.spoolPos;
  if (S.state === 'arrebentou') {
    // cortada/arrebentada: o pedaço que ficou na mão cai solto, com física, do formato exato que tinha
    if (!myCut) cortarMinhaLinha(null);
    lp.setXYZ(0, spool.x, spool.y, spool.z);
    if (S.stateTimer > 1.2) myCut.recolher(Math.min(myCut.len - 1, 7 * dt)); // e o jogador vai recolhendo
    myCut.update(dt, from, S.windDirH, S.windSpeed, S.clock);
    myCut.write(lp, 1);
    lineObj.material.color.copy(_linCor);
    myRope.reset();
    return;
  }
  myCut = null;
  if (!lineObj.visible) { myRope.reset(); return; }
  lp.setXYZ(0, spool.x, spool.y, spool.z);
  const lim = G.kite.kt.breakN * LINE_STRENGTH, perigo = Math.max(0, Math.min(1, (S.stress / lim - .6) / .35)) + (S.overT > 0 ? .3 : 0);
  lineObj.material.color.copy(_linCor).lerp(_linPerigo, Math.min(1, perigo) * (.6 + .4 * Math.sin(S.clock * 18) ** 2));
  const L = S.state === 'voando' ? S.L : from.distanceTo(S.kitePos) + 1;
  myRope.update(dt, from, S.kitePos, L, S.windDirH, S.windSpeed, S.clock, { pin: S.duelX, giving: !!keys.KeyS && S.state === 'voando' });
  myRope.write(lp, 1);
}
