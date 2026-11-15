// Materiais e atalho para criar malhas (sem depender da cena — evita importações em círculo)
import * as THREE from 'three';

/* ================= VISUAL ANIME (cel shading) ================= */
let ramp = null, rampSoft = null;
function makeRamp(stops) {
  const d = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(d, stops.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
/** degraus de luz do desenho animado: sombra, meio-tom e luz (3 faixas bem marcadas) */
export function toonRamp() { return ramp || (ramp = makeRamp([118, 118, 190, 255, 255])); }
/** versão mais suave (rosto e pele: sombra clara, como em anime) */
export function toonRampSoft() { return rampSoft || (rampSoft = makeRamp([172, 172, 228, 255, 255])); }


/**
 * Material do jogo: sombreamento em faixas (cel shading), como desenho animado.
 * Aceita as mesmas opções de antes; as que só existem no material "realista" (rugosidade, metal...) são ignoradas.
 */
const DROP = ['roughness', 'metalness', 'flatShading', 'envMapIntensity'];
export function toonMat(opts = {}) {
  const o = { ...opts };
  const soft = o.soft; delete o.soft;
  for (const k of DROP) delete o[k];
  return new THREE.MeshToonMaterial({ gradientMap: soft ? toonRampSoft() : toonRamp(), ...o });
}

const mats = {};
/** material de cor lisa (antes era facetado) */
export function mat(hex, opts = {}) {
  const k = hex + JSON.stringify(opts);
  if (!mats[k]) mats[k] = toonMat({ color: hex, ...opts });
  return mats[k];
}

const smats = {};
/** material de cor lisa e suave */
export function smat(hex, opts = {}) {
  const k = hex + JSON.stringify(opts);
  if (!smats[k]) smats[k] = toonMat({ color: hex, ...opts });
  return smats[k];
}

export function mesh(geo, m, cast = true, recv = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = recv; return o; }

/** contorno de desenho: a malha desenhada de novo, só as costas, um pouco "inchada" e escura */
const outlines = new Map();
export function outlineMaterial(width = .006, color = '#2a1c22') {
  const k = width + color;
  if (outlines.has(k)) return outlines.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${width.toFixed(5)};`);
  };
  m.customProgramCacheKey = () => 'outline' + width;
  outlines.set(k, m);
  return m;
}
/** acrescenta o contorno a uma malha (funciona com malha comum e com esqueleto) */
export function addOutline(o, width = .006, color) {
  const m = outlineMaterial(width, color);
  let ol;
  if (o.isSkinnedMesh) { ol = new THREE.SkinnedMesh(o.geometry, m); ol.bind(o.skeleton, o.bindMatrix); ol.frustumCulled = false; }
  else ol = new THREE.Mesh(o.geometry, m);
  ol.userData.noExport = true; ol.userData.outline = true;
  ol.castShadow = false; ol.receiveShadow = false;
  if (o.isSkinnedMesh) o.parent.add(ol); else o.add(ol);
  return ol;
}

/**
 * Marca um material opaco como "sem traço": ele grava alfa 0 na imagem e o acabamento (post.js)
 * não desenha contorno em volta dele. Para coisas finas: linha da pipa, capim, fios.
 */
export function noOutline(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, '  gl_FragColor.a = 0.0;\n}');
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + 'noOutline';
  return m;
}
