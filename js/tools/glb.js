// Exportador .glb (glTF 2.0 binário) enxuto, feito para os modelos do Rabiola.
// Sem dependências além do próprio Three.js. Roda no navegador (usa <canvas> para gerar os PNGs).
//
// Suporta: Group/Object3D (posição, rotação, escala), Mesh, InstancedMesh (vira um nó por instância),
// Line (como LINE_STRIP), atributos position/normal/uv/color + índices, materiais
// MeshStandard/Lambert/Phong/Basic (cor, rugosidade, metal, emissivo, textura embutida em PNG,
// alphaTest → MASK, transparente → BLEND, DoubleSide) e repetição de textura (KHR_texture_transform).
// Ignora: Sprite, objetos invisíveis e qualquer um marcado com userData.noExport.
import * as THREE from 'three';

const GL = { FLOAT: 5126, U16: 5123, U32: 5125, ARRAY: 34962, ELEMENTS: 34963, REPEAT: 10497, CLAMP: 33071, MIRROR: 33648, LINEAR: 9729, MIPMAP: 9987 };

export async function exportGLB(root, { name = root.name || 'modelo' } = {}) {
  root.updateMatrixWorld(true);
  const json = {
    asset: { version: '2.0', generator: 'Rabiola glb.js' },
    scene: 0, scenes: [{ name, nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
  };
  const chunks = []; let offset = 0;
  const used = new Set();
  const matCache = new Map(), texCache = new Map(), imgCache = new Map(), meshCache = new Map();

  function addView(typed, target) {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
    chunks.push(bytes.slice());
    const v = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength };
    if (target) v.target = target;
    offset += bytes.byteLength;
    json.bufferViews.push(v);
    return json.bufferViews.length - 1;
  }
  function addAccessor(attr, type, { normalize = false } = {}) {
    const n = attr.count, size = attr.itemSize;
    const out = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(i, k);
    if (normalize) for (let i = 0; i < n; i++) {
      const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2], l = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
    const acc = { bufferView: addView(out, GL.ARRAY), componentType: GL.FLOAT, count: n, type };
    if (type === 'VEC3' && !normalize) { // posição precisa de min/max
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = out[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
      acc.min = mn; acc.max = mx;
    }
    json.accessors.push(acc);
    return json.accessors.length - 1;
  }
  function addIndices(arr, count) {
    const big = count > 65535;
    const out = big ? new Uint32Array(arr) : new Uint16Array(arr);
    json.accessors.push({ bufferView: addView(out, GL.ELEMENTS), componentType: big ? GL.U32 : GL.U16, count: out.length, type: 'SCALAR' });
    return json.accessors.length - 1;
  }

  /* ---------- texturas → PNG ---------- */
  async function imageIndex(tex) {
    const img = tex.image;
    if (imgCache.has(img)) return imgCache.get(img);
    const w = img.width || img.videoWidth, h = img.height || img.videoHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (tex.flipY) { x.translate(0, h); x.scale(1, -1); } // o glTF guarda a imagem "de cabeça pra baixo" em relação ao Three
    x.drawImage(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const view = addView(new Uint8Array(await blob.arrayBuffer()));
    json.images = json.images || [];
    json.images.push({ bufferView: view, mimeType: 'image/png' });
    imgCache.set(img, json.images.length - 1);
    return json.images.length - 1;
  }
  const wrap = m => m === THREE.ClampToEdgeWrapping ? GL.CLAMP : m === THREE.MirroredRepeatWrapping ? GL.MIRROR : GL.REPEAT;
  async function textureInfo(tex) {
    if (!tex || !tex.image) return null;
    let idx = texCache.get(tex);
    if (idx === undefined) {
      json.samplers = json.samplers || [];
      json.samplers.push({ magFilter: GL.LINEAR, minFilter: GL.MIPMAP, wrapS: wrap(tex.wrapS), wrapT: wrap(tex.wrapT) });
      json.textures = json.textures || [];
      json.textures.push({ sampler: json.samplers.length - 1, source: await imageIndex(tex) });
      idx = json.textures.length - 1; texCache.set(tex, idx);
    }
    const info = { index: idx };
    if (tex.repeat.x !== 1 || tex.repeat.y !== 1 || tex.offset.x || tex.offset.y || tex.rotation) {
      info.extensions = { KHR_texture_transform: { offset: [tex.offset.x, tex.offset.y], scale: [tex.repeat.x, tex.repeat.y], rotation: tex.rotation || 0 } };
      used.add('KHR_texture_transform');
    }
    return info;
  }

  /* ---------- materiais ---------- */
  async function material(m) {
    if (matCache.has(m)) return matCache.get(m);
    const c = m.color || new THREE.Color(1, 1, 1);
    const out = {
      name: m.name || undefined,
      pbrMetallicRoughness: {
        baseColorFactor: [c.r, c.g, c.b, m.transparent ? (m.opacity ?? 1) : 1],
        metallicFactor: m.metalness ?? 0,
        roughnessFactor: m.roughness ?? (m.isMeshPhongMaterial ? .5 : 1),
      },
    };
    const map = await textureInfo(m.map);
    if (map) out.pbrMetallicRoughness.baseColorTexture = map;
    if (m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) {
      const k = Math.min(1, m.emissiveIntensity ?? 1);
      out.emissiveFactor = [m.emissive.r * k, m.emissive.g * k, m.emissive.b * k];
    }
    if (m.isMeshBasicMaterial || m.isLineBasicMaterial) { out.extensions = { KHR_materials_unlit: {} }; used.add('KHR_materials_unlit'); }
    if (m.alphaTest > 0) { out.alphaMode = 'MASK'; out.alphaCutoff = m.alphaTest; }
    else if (m.transparent && (m.opacity < 1 || m.map)) out.alphaMode = 'BLEND';
    if (m.side === THREE.DoubleSide) out.doubleSided = true;
    json.materials = json.materials || [];
    json.materials.push(out);
    matCache.set(m, json.materials.length - 1);
    return json.materials.length - 1;
  }

  /* ---------- malhas ---------- */
  async function meshIndex(obj) {
    const geo = obj.geometry, mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const key = geo.uuid + '|' + mats.map(m => m.uuid).join(',') + (obj.isLine ? '|L' : '');
    if (meshCache.has(key)) return meshCache.get(key);
    const a = geo.attributes;
    if (!a.position) return -1;
    const attrs = { POSITION: addAccessor(a.position, 'VEC3') };
    if (a.normal && !obj.isLine) attrs.NORMAL = addAccessor(a.normal, 'VEC3', { normalize: true });
    if (a.uv && !obj.isLine) attrs.TEXCOORD_0 = addAccessor(a.uv, 'VEC2');
    if (a.color && mats.some(m => m.vertexColors)) attrs.COLOR_0 = addAccessor(a.color, a.color.itemSize === 4 ? 'VEC4' : 'VEC3');
    const mode = obj.isLineSegments ? 1 : obj.isLineLoop ? 2 : obj.isLine ? 3 : 4;
    const prims = [];
    const groups = Array.isArray(obj.material) && geo.groups.length ? geo.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    for (const gr of groups) {
      const m = mats[gr.materialIndex] || mats[0];
      const p = { attributes: attrs, mode, material: await material(m) };
      const total = geo.index ? geo.index.count : a.position.count;
      const start = gr.start, end = Math.min(total, gr.start + gr.count);
      if (geo.index) p.indices = addIndices(Array.from(geo.index.array.slice(start, end)), a.position.count);
      else if (start > 0 || end < total) { const idx = []; for (let i = start; i < end; i++) idx.push(i); p.indices = addIndices(idx, a.position.count); }
      prims.push(p);
    }
    json.meshes.push({ name: obj.name || undefined, primitives: prims });
    meshCache.set(key, json.meshes.length - 1);
    return json.meshes.length - 1;
  }

  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function trs(node, mtx) {
    mtx.decompose(_p, _q, _s);
    if (_p.lengthSq() > 1e-12) node.translation = _p.toArray();
    if (Math.abs(_q.w) < 1 - 1e-9) node.rotation = _q.toArray();
    if (Math.abs(_s.x - 1) + Math.abs(_s.y - 1) + Math.abs(_s.z - 1) > 1e-9) node.scale = _s.toArray();
  }

  async function visit(obj, isRoot) {
    if (!obj.visible || obj.userData.noExport || obj.isSprite || obj.isPoints) return -1;
    const node = { name: obj.name || undefined };
    if (!isRoot) { obj.updateMatrix(); trs(node, obj.matrix); }
    const kids = [];
    if (obj.isInstancedMesh) {
      const mi = await meshIndex(obj);
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, _m);
        const n = { mesh: mi }; trs(n, _m);
        json.nodes.push(n); kids.push(json.nodes.length - 1);
      }
    } else if (obj.isMesh || obj.isLine) {
      const mi = await meshIndex(obj);
      if (mi >= 0) node.mesh = mi;
    }
    for (const c of obj.children) { const k = await visit(c, false); if (k >= 0) kids.push(k); }
    if (kids.length) node.children = kids;
    if (node.mesh === undefined && !kids.length && !isRoot) return -1; // grupo vazio
    json.nodes.push(node);
    return json.nodes.length - 1;
  }

  const rootIdx = await visit(root, true);
  if (rootIdx >= 0) json.scenes[0].nodes.push(rootIdx);
  if (used.size) json.extensionsUsed = [...used];

  // monta o arquivo .glb: cabeçalho + bloco JSON + bloco binário (cada um alinhado em 4 bytes)
  const pad4 = n => (n + 3) & ~3;
  const binLen = pad4(offset);
  json.buffers[0].byteLength = binLen;
  for (const k of ['images', 'samplers', 'textures', 'materials']) if (json[k] && !json[k].length) delete json[k];
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4E4F534A, true);
  out.set(jsonBytes, 20); for (let i = 20 + jsonBytes.length; i < 20 + jsonLen; i++) out[i] = 0x20;
  let o = 20 + jsonLen;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004E4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

/** imagem de um canvas/textura como PNG (Uint8Array) */
export async function texturePNG(texOrCanvas) {
  const img = texOrCanvas.isTexture ? texOrCanvas.image : texOrCanvas;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
