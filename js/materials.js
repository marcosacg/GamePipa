// Materiais e atalho para criar malhas (sem depender da cena — evita importações em círculo)
import * as THREE from 'three';

const mats = {};
/** material facetado (visual low-poly antigo; ainda usado em detalhes pequenos) */
export function mat(hex, opts = {}) {
  const k = hex + JSON.stringify(opts);
  if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: .95, metalness: 0, flatShading: true, ...opts });
  return mats[k];
}

const smats = {};
/** material suave (sem facetas), para o visual estilizado */
export function smat(hex, opts = {}) {
  const k = hex + JSON.stringify(opts);
  if (!smats[k]) smats[k] = new THREE.MeshStandardMaterial({ color: hex, roughness: .78, metalness: 0, ...opts });
  return smats[k];
}

export function mesh(geo, m, cast = true, recv = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = recv; return o; }
