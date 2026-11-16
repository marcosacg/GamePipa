// Leitor de .glb enxuto (glTF 2.0 binário) com suporte a esqueleto (SkinnedMesh), feito para os
// personagens prontos da pasta modelos/. Sem dependências além do Three.js.
// Lê: nós (TRS ou matriz), malhas com posição/normal/uv/juntas/pesos, skins, materiais com textura PNG/JPG
// embutida, alphaMode (MASK/BLEND), dupla face e animações (rotação/posição dos ossos, interpolação linear).
// Não lê: morph targets, extensões.
import * as THREE from 'three';

const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

/**
 * Carrega o arquivo e devolve { json, instantiate(makeMaterial) }.
 * instantiate() cria uma cópia nova (ossos próprios) que divide geometria e texturas com as outras.
 */
export async function loadGLB(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('não é um arquivo .glb');
  const jsonLen = dv.getUint32(12, true);
  const J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const bin = buf.slice(20 + jsonLen + 8);

  /** lê um accessor para um array tipado compacto (resolve byteStride e inteiros normalizados) */
  function accessor(i, asFloat = false) {
    const a = J.accessors[i], n = NUM[a.type], T = TYPED[a.componentType];
    const v = J.bufferViews[a.bufferView], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || T.BYTES_PER_ELEMENT * n;
    let out;
    if (stride === T.BYTES_PER_ELEMENT * n && off % T.BYTES_PER_ELEMENT === 0) out = new T(bin, off, a.count * n);
    else {
      out = new T(a.count * n);
      const d = new DataView(bin), get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = d[get](off + k * stride + c * T.BYTES_PER_ELEMENT, true);
    }
    if ((asFloat || a.normalized) && a.componentType !== 5126) {
      const f = new Float32Array(out.length), s = a.normalized ? NORM[a.componentType] : 1;
      for (let k = 0; k < out.length; k++) f[k] = out[k] / s;
      out = f;
    }
    return { array: out, size: n, count: a.count };
  }

  // texturas (imagens embutidas)
  const images = await Promise.all((J.images || []).map(async im => {
    const v = J.bufferViews[im.bufferView];
    const blob = new Blob([new Uint8Array(bin, v.byteOffset || 0, v.byteLength)], { type: im.mimeType || 'image/png' });
    return createImageBitmap(blob);
  }));
  const textures = (J.textures || []).map(t => {
    const tex = new THREE.Texture(images[t.source]);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4; tex.needsUpdate = true;
    return tex;
  });

  // geometrias (uma por primitiva)
  const geos = J.meshes.map(m => m.primitives.map(p => {
    const g = new THREE.BufferGeometry(), at = p.attributes;
    const set = (name, idx, float) => { const a = accessor(idx, float); g.setAttribute(name, new THREE.BufferAttribute(a.array, a.size)); };
    set('position', at.POSITION, true);
    if (at.NORMAL !== undefined) set('normal', at.NORMAL, true);
    if (at.TEXCOORD_0 !== undefined) set('uv', at.TEXCOORD_0, true);
    if (at.JOINTS_0 !== undefined) { const a = accessor(at.JOINTS_0); g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(a.array), 4)); }
    if (at.WEIGHTS_0 !== undefined) set('skinWeight', at.WEIGHTS_0, true);
    if (p.indices !== undefined) { const a = accessor(p.indices); g.setIndex(new THREE.BufferAttribute(a.array, 1)); }
    if (at.NORMAL === undefined) g.computeVertexNormals();
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }));

  const matInfo = (J.materials || []).map(m => {
    const p = m.pbrMetallicRoughness || {};
    return {
      name: m.name || '', color: p.baseColorFactor || [1, 1, 1, 1],
      map: p.baseColorTexture ? textures[p.baseColorTexture.index] : null,
      alphaMode: m.alphaMode || 'OPAQUE', alphaCutoff: m.alphaCutoff ?? .5, doubleSided: !!m.doubleSided,
    };
  });
  const inverseBinds = (J.skins || []).map(s => {
    const a = accessor(s.inverseBindMatrices, true), list = [];
    for (let i = 0; i < s.joints.length; i++) list.push(new THREE.Matrix4().fromArray(a.array, i * 16));
    return list;
  });

  // animações: guarda os canais; cada cópia do modelo monta os seus clipes (os ossos são outros)
  const anims = (J.animations || []).map(a => ({
    name: a.name || '',
    tracks: a.channels.filter(c => c.target.path === 'rotation' || c.target.path === 'translation').map(c => {
      const sm = a.samplers[c.sampler];
      return { node: c.target.node, path: c.target.path, times: accessor(sm.input, true).array, values: accessor(sm.output, true).array };
    }),
  }));

  /**
   * makeMaterial(info, index) → THREE.Material (chamado uma vez por material e guardado).
   * Devolve { root, nodes[], byName(prefixo), meshes[] }.
   */
  const matCache = new Map();
  function instantiate(makeMaterial) {
    const nodes = J.nodes.map(n => {
      const o = n.mesh === undefined ? new THREE.Bone() : new THREE.Group();
      o.name = n.name || '';
      if (n.matrix) { new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale); }
      else {
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
      }
      return o;
    });
    J.nodes.forEach((n, i) => (n.children || []).forEach(c => nodes[i].add(nodes[c])));
    const root = new THREE.Group();
    for (const i of J.scenes[J.scene || 0].nodes) root.add(nodes[i]);
    root.updateMatrixWorld(true);

    const skeletons = (J.skins || []).map((s, si) => new THREE.Skeleton(s.joints.map(j => nodes[j]), inverseBinds[si]));
    const meshes = [];
    J.nodes.forEach((n, i) => {
      if (n.mesh === undefined) return;
      J.meshes[n.mesh].primitives.forEach((p, pi) => {
        let m = matCache.get(p.material);
        if (!m) { m = makeMaterial(matInfo[p.material] || { name: '', color: [1, 1, 1, 1], map: null, alphaMode: 'OPAQUE' }, p.material); matCache.set(p.material, m); }
        const geo = geos[n.mesh][pi];
        let o;
        if (n.skin !== undefined) {
          o = new THREE.SkinnedMesh(geo, m);
          o.bind(skeletons[n.skin], new THREE.Matrix4()); // malha na origem: os ossos mandam em tudo
          o.frustumCulled = false;                         // a caixa não acompanha os ossos
          root.add(o);
        } else { o = new THREE.Mesh(geo, m); nodes[i].add(o); }
        o.castShadow = true; o.receiveShadow = false;
        o.userData.mat = matInfo[p.material];
        meshes.push(o);
      });
    });
    const byName = prefix => nodes.find(n => n.name.startsWith(prefix)) || null;
    /** clipes de animação desta cópia: { nome: THREE.AnimationClip } (use com THREE.AnimationMixer(root)) */
    const clips = () => {
      const out = {};
      for (const a of anims) {
        const tracks = a.tracks.map(t => t.path === 'rotation'
          ? new THREE.QuaternionKeyframeTrack(nodes[t.node].uuid + '.quaternion', t.times, t.values)
          : new THREE.VectorKeyframeTrack(nodes[t.node].uuid + '.position', t.times, t.values));
        out[a.name] = new THREE.AnimationClip(a.name, -1, tracks);
      }
      return out;
    };
    return { root, nodes, meshes, byName, skeletons, clips };
  }

  return { json: J, instantiate, materials: matInfo, animations: anims };
}
