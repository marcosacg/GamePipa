// Personagem estilizado (formas arredondadas) com estilos: pele, cabelo, chapéu, camisa, bermuda, carretel.
// Pontos de animação usados pelo jogo: legL, legR, armL, armR, headG, brows, blush, spool, angerTag.
// Os braços apontam para +Z a partir do ombro (a mão fica a ~0,55 do ombro).
import * as THREE from 'three';
import { SKINS, SHIRTS, SHORTS, normalizeStyle } from './config.js';
import { mesh, smat } from './materials.js';

const HAIR = '#2a1d16';
const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const capsule = (r, len, rad = 12) => new THREE.CapsuleGeometry(r, len, 4, rad);

/* ---------- texturas das camisas (listras, faixa, gola) ---------- */
const shirtTex = new Map();
export function shirtTexture(idx) {
  if (shirtTex.has(idx)) return shirtTex.get(idx);
  const sh = SHIRTS[idx];
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const band = (v0, v1, col) => { x.fillStyle = col; x.fillRect(0, (1 - v1) * 128, 64, (v1 - v0) * 128); };
  x.fillStyle = sh.a || '#000'; x.fillRect(0, 0, 64, 128);
  if (sh.mode === 'faixa') band(.42, .56, sh.b);
  if (sh.mode === 'listras') for (let v = .06; v < .9; v += .17) band(v, v + .08, sh.b);
  if (sh.mode === 'lisa') band(.9, 1, sh.b);
  if (sh.mode === 'regata') { band(0, .07, sh.b); band(.9, 1, sh.b); }
  // tecido: leve variação para não ficar chapado
  const img = x.getImageData(0, 0, 64, 128);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - .5) * 10; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  shirtTex.set(idx, t);
  return t;
}

/* ---------- sombra suave embaixo do boneco ---------- */
let blobTex = null;
export function blobShadow(size = .95, alpha = .38) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: alpha, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = .02; m.renderOrder = 1;
  m.userData.noExport = true; // sombra falsa: fica fora dos .glb da pasta Assets
  return m;
}

/** desloca os vértices pela normal com um "ruído" suave (cabelo fofo, copas de árvore) */
export function bumpy(geo, amp, freq = 9, seed = 0) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const l = v.length() || 1;
    const n = Math.sin(v.x * freq + seed) * Math.sin(v.y * freq * 1.3 + seed * 2) * Math.sin(v.z * freq * .9 + seed * 3)
      + .5 * Math.sin(v.x * freq * 2.1 + v.z * freq * 1.7 + seed);
    v.multiplyScalar(1 + (n * amp) / l);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function makeSpool(type) {
  const spool = new THREE.Group();
  if (type === 'lata') {
    const c = mesh(new THREE.CylinderGeometry(.085, .085, .16, 20), smat('#b8bcc2', { metalness: .7, roughness: .35 })); c.rotation.x = Math.PI / 2; spool.add(c);
    const w = mesh(new THREE.CylinderGeometry(.09, .09, .1, 20), smat('#f4f1e8', { roughness: .95 })); w.rotation.x = Math.PI / 2; spool.add(w);
  } else if (type === 'papelao') {
    const b = mesh(new THREE.BoxGeometry(.2, .14, .025), smat('#c9a27a', { roughness: 1 })); spool.add(b);
    const w = mesh(new THREE.CylinderGeometry(.075, .075, .12, 16), smat('#f4f1e8', { roughness: .95 })); w.rotation.z = Math.PI / 2; w.scale.set(1, 1, .4); spool.add(w);
  } else {
    const c = mesh(new THREE.CylinderGeometry(.065, .065, .16, 18), smat('#f4f1e8', { roughness: .95 })); c.rotation.x = Math.PI / 2; spool.add(c);
    for (const z of [-.085, .085]) { const f = mesh(new THREE.CylinderGeometry(.1, .1, .02, 22), smat('#a63d2a', { roughness: .5 })); f.rotation.x = Math.PI / 2; f.position.z = z; spool.add(f); }
  }
  return spool;
}

export function makeCharacter(styleIn) {
  const st = normalizeStyle(styleIn);
  const g = new THREE.Group();
  const skinHex = SKINS[st.skin];
  const skin = smat(skinHex, { roughness: .62 });
  const skinDark = smat(new THREE.Color(skinHex).multiplyScalar(.82).getHexString().replace(/^/, '#'), { roughness: .62 });
  const sh = SHIRTS[st.shirt];
  const bare = sh.mode === 'sem';
  const shirtM = bare ? skin : new THREE.MeshStandardMaterial({ map: shirtTexture(st.shirt), roughness: .85 });
  const sleeveM = bare ? skin : smat(sh.a, { roughness: .85 });
  const shortsM = smat(SHORTS[st.shorts], { roughness: .85 });
  const hairM = smat(HAIR, { roughness: .95 });
  const sandalM = smat('#2a9d8f', { roughness: .6 });
  const strapM = smat('#f4f1e8', { roughness: .6 });

  g.add(blobShadow());

  // ---------- pernas (pivô no quadril, descem em -Y) ----------
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [lg, x] of [[legL, -.095], [legR, .095]]) {
    lg.position.set(x, .82, 0);
    const tube = mesh(new THREE.CylinderGeometry(.09, .084, .2, 16), shortsM); tube.position.y = -.07; lg.add(tube);
    const leg = mesh(capsule(.067, .47), skin); leg.position.y = -.37; lg.add(leg);
    const foot = mesh(sphere(.065, 14, 10), skin); foot.scale.set(.85, .5, 1.55); foot.position.set(0, -.765, .05); lg.add(foot);
    const sole = mesh(capsule(.062, .14, 10), sandalM); sole.rotation.x = Math.PI / 2; sole.scale.set(1.15, 1, .26); sole.position.set(0, -.805, .045); lg.add(sole);
    const strap = mesh(new THREE.TorusGeometry(.045, .009, 6, 14, Math.PI), strapM, false); strap.position.set(0, -.79, .085); lg.add(strap);
    g.add(lg);
  }
  const shorts = mesh(new THREE.CylinderGeometry(.175, .2, .2, 22), shortsM); shorts.position.y = .86; shorts.scale.z = .8; g.add(shorts);

  // ---------- tronco moldado (camisa com textura) ----------
  const prof = [[.172, 0], [.19, .06], [.214, .19], [.224, .29], [.212, .37], [.17, .43], [.085, .47], [.001, .48]].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = mesh(new THREE.LatheGeometry(prof, 26), shirtM);
  torso.position.y = .9; torso.scale.set(1.08, 1, .76); g.add(torso);
  const neck = mesh(new THREE.CylinderGeometry(.056, .062, .12, 14), skin); neck.position.y = 1.4; g.add(neck);

  // ---------- cabeça (grupo para balançar) ----------
  const headG = new THREE.Group(); headG.position.y = 1.42; g.add(headG);
  const head = mesh(sphere(.21, 28, 20), skin); head.position.y = .21; head.scale.set(1, 1.06, .98); headG.add(head);
  for (const s of [-1, 1]) {
    const ear = mesh(sphere(.05, 12, 10), skinDark); ear.scale.set(.55, 1, .8); ear.position.set(s * .205, .2, -.01); headG.add(ear);
    const eye = mesh(sphere(.042, 14, 10), smat('#fbfaf6', { roughness: .3 }), false); eye.scale.set(1, 1.12, .55); eye.position.set(s * .076, .232, .176); headG.add(eye);
    const pupil = mesh(sphere(.024, 12, 8), smat('#1b130e', { roughness: .2 }), false); pupil.position.set(s * .074, .226, .2); headG.add(pupil);
    const shine = mesh(sphere(.007, 6, 4), smat('#ffffff', { roughness: .1, emissive: '#ffffff', emissiveIntensity: .6 }), false); shine.position.set(s * .074 + .008, .236, .222); headG.add(shine);
  }
  const brows = [-1, 1].map(s => {
    const b = mesh(capsule(.011, .055, 6), hairM, false); b.rotation.z = Math.PI / 2; b.position.set(s * .076, .3, .186); headG.add(b); return b;
  });
  const nose = mesh(sphere(.028, 12, 8), skinDark, false); nose.scale.set(1, .85, .9); nose.position.set(0, .18, .205); headG.add(nose);
  const mouth = mesh(new THREE.TorusGeometry(.038, .009, 6, 16, Math.PI), smat('#7a2e22', { roughness: .5 }), false);
  mouth.rotation.z = Math.PI; mouth.position.set(0, .125, .192); headG.add(mouth);
  const blush = new THREE.Group(); blush.visible = false; headG.add(blush);
  for (const s of [-1, 1]) { const b = mesh(sphere(.036, 10, 8), smat('#ff6b6b', { roughness: .8, transparent: true, opacity: .7 }), false); b.scale.set(1, .6, .3); b.position.set(s * .12, .16, .178); blush.add(b); }

  // ---------- cabelo ----------
  const cap = (r, frac, m) => {
    const h = mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI * frac), m);
    h.position.y = .21; h.rotation.x = -.38; h.scale.set(1, 1.06, 1); headG.add(h); return h;
  };
  if (st.hair === 'curto') cap(.224, .53, hairM);
  else if (st.hair === 'raspado') cap(.215, .5, smat('#45362c', { roughness: 1 }));
  else if (st.hair === 'blackpower') {
    const h = mesh(bumpy(new THREE.SphereGeometry(.31, 40, 28), .016, 24, 3), hairM);
    h.position.set(0, .3, -.045); h.scale.set(1.05, .9, 1); headG.add(h);
  } else if (st.hair === 'trancas') {
    cap(.222, .55, hairM);
    [-.12, -.04, .04, .12].forEach((x, i) => {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, .26, -.18), new THREE.Vector3(x * 1.1, .12, -.24), new THREE.Vector3(x * 1.25, -.06, -.22)]);
      headG.add(mesh(new THREE.TubeGeometry(curve, 12, .022, 8), hairM));
      const bead = mesh(sphere(.032, 10, 8), smat(['#ffd166', '#e63946', '#06d6a0', '#118ab2'][i], { roughness: .4 })); bead.position.set(x * 1.25, -.08, -.22); headG.add(bead);
    });
  } else if (st.hair === 'moicano') {
    cap(.214, .5, smat('#45362c', { roughness: 1 }));
    const crest = mesh(bumpy(sphere(.08, 18, 12), .006, 30), hairM); crest.scale.set(.5, 1, 2.5); crest.position.set(0, .41, -.02); headG.add(crest);
  }

  // ---------- chapéu ----------
  if (st.hat === 'bone' || st.hat === 'bonetras') {
    const capM = smat(bare ? '#d62828' : (sh.b || '#d62828'), { roughness: .8 });
    const front = st.hat === 'bone' ? 1 : -1;
    const dome = mesh(new THREE.SphereGeometry(.232, 28, 12, 0, Math.PI * 2, 0, Math.PI * .5), capM);
    dome.position.y = .235; dome.scale.y = .88; headG.add(dome);
    const brim = mesh(new THREE.CylinderGeometry(.15, .15, .018, 26), capM);
    brim.scale.set(1, 1, 1.1); brim.position.set(0, .255, front * .21); brim.rotation.x = front * .14; headG.add(brim);
    const btn = mesh(sphere(.02, 8, 6), capM); btn.position.y = .44; headG.add(btn);
  } else if (st.hat === 'palha') {
    const hp = [[.001, .17], [.12, .17], [.16, .14], [.175, .05], [.182, 0], [.36, -.012], [.405, -.04], [.412, -.05]].map(([r, y]) => new THREE.Vector2(r, y));
    const hat = mesh(new THREE.LatheGeometry(hp, 32), smat('#e3c16f', { roughness: 1, side: THREE.DoubleSide }));
    hat.position.y = .32; headG.add(hat);
    const band = mesh(new THREE.CylinderGeometry(.18, .183, .045, 28, 1, true), smat('#8b2d1e', { side: THREE.DoubleSide }));
    band.position.y = .345; headG.add(band);
  }

  // ---------- braços (pivô no ombro, apontam em +Z) ----------
  const sleeves = sh.mode === 'faixa' || sh.mode === 'listras' || sh.mode === 'lisa';
  const makeArm = x => {
    const a = new THREE.Group(); a.position.set(x, 1.3, 0); g.add(a);
    const limb = mesh(capsule(.055, .4), skin); limb.rotation.x = Math.PI / 2; limb.position.z = .26; a.add(limb);
    const hand = mesh(sphere(.058, 14, 10), skin); hand.scale.set(1, .9, 1.1); hand.position.z = .535; a.add(hand);
    if (sleeves) { const s = mesh(new THREE.CylinderGeometry(.078, .068, .17, 16), sleeveM); s.rotation.x = Math.PI / 2; s.position.z = .07; a.add(s); }
    const shoulder = mesh(sphere(.072, 14, 10), sleeves ? sleeveM : skin); a.add(shoulder);
    return a;
  };
  const armL = makeArm(-.245); armL.rotation.set(.75, .45, 0);
  const armR = makeArm(.245); armR.rotation.set(1.25, -.2, 0); // em descanso (no jogo o braço mira na pipa)

  // carretel na mão esquerda
  const spool = makeSpool(st.spool); spool.position.z = .57; armL.add(spool);

  // "#@$%!" que aparece em cima da cabeça quando fica bravo
  const angerTag = makeAngerTag();
  angerTag.position.y = 2.15; angerTag.visible = false;
  g.add(angerTag);

  g.position.set(0, 0, 22);
  return { g, legL, legR, armL, armR, spool, headG, brows, blush, angerTag, angry: 0, style: st, yaw: Math.PI, vel: new THREE.Vector3(), phase: 0, kickCd: 0 };
}

let angerTex = null;
function makeAngerTag() {
  if (!angerTex) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.font = '900 54px Bungee, Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 8; x.strokeStyle = '#1b1b1f'; x.strokeText('#@$%!', 128, 50);
    x.fillStyle = '#ff4d4d'; x.fillText('#@$%!', 128, 50);
    angerTex = new THREE.CanvasTexture(c); angerTex.colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false, fog: false }));
  sp.scale.set(.11, .041, 1); sp.renderOrder = 21;
  return sp;
}
export function angerTexture() { if (!angerTex) makeAngerTag(); return angerTex; }

/**
 * Boneco bravo enquanto espera a pipa nova: bate o pé, sacode os braços pro alto,
 * balança a cabeça, franze a testa, fica vermelho e solta um "#@$%!".
 * on = true enquanto estiver bravo. Chame depois de poseCharacter().
 */
export function poseAngry(c, dt, t, on) {
  c.angry += ((on ? 1 : 0) - c.angry) * Math.min(1, dt * 8);
  const k = c.angry;
  const show = k > .02;
  c.angerTag.visible = k > .3;
  c.blush.visible = k > .4;
  c.brows[0].rotation.z = Math.PI / 2 - .5 * k; c.brows[1].rotation.z = Math.PI / 2 + .5 * k;
  c.brows[0].position.y = c.brows[1].position.y = .3 - .02 * k;
  if (!show) { c.headG.rotation.set(0, 0, 0); c.armL.rotation.set(.75, .45, 0); return; }
  const shake = Math.sin(t * 18);
  c.armL.rotation.set(lerp(.75, -1.6, k) + shake * .3 * k, lerp(.45, .25, k), 0);
  c.armR.rotation.set(-1.6 + Math.sin(t * 18 + 1.3) * .3, -.25, 0);
  c.legL.rotation.x = Math.max(0, Math.sin(t * 11)) * .55 * k;
  c.legR.rotation.x = Math.max(0, -Math.sin(t * 11)) * .55 * k;
  c.g.position.y += Math.abs(Math.sin(t * 11)) * .05 * k;
  c.headG.rotation.set(-.12 * k, Math.sin(t * 13) * .35 * k, 0);
  c.angerTag.position.y = 2.15 + Math.abs(Math.sin(t * 6)) * .12;
  c.angerTag.material.rotation = Math.sin(t * 9) * .15;
}
const lerp = (a, b, t) => a + (b - a) * t;

export function disposeCharacter(c) {
  if (c.g.parent) c.g.parent.remove(c.g);
  c.g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
}

/** anima pernas (e um balanço leve do corpo) e aponta o braço da linha para a mão */
export function poseCharacter(c, dt, speed, hand) {
  c.phase += dt * speed * 3.2;
  const amt = Math.min(1, speed / 3);
  const sw = Math.sin(c.phase) * amt * .7;
  c.legL.rotation.x = sw; c.legR.rotation.x = -sw;
  c.headG.rotation.z = Math.sin(c.phase) * .04 * amt;
  if (hand) c.armR.lookAt(hand);
}
