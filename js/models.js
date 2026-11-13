// Catálogo de modelos 3D do jogo: usado pela vitrine (ferramentas/vitrine.html)
// e pela exportação da pasta Assets (ferramentas/exportar-assets.html).
// Os modelos são os MESMOS que o jogo cria — se mudar aqui no código, é só exportar de novo.
import * as THREE from 'three';
import { PRESETS, KITE_ORDER, KITES, getPatterns, SPOOLS, SHIRTS } from './config.js';
import { makeCharacter, shirtTexture, angerTexture } from './player.js';
import { makeKiteMesh, kiteThumb } from './kite.js';
import * as props from './props.js';
import { makeFavelaBlock, favelaTex } from './cenarios/favela.js';

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function character(style) { const c = makeCharacter(style); c.g.position.set(0, 0, 0); c.g.rotation.y = 0; return c.g; }

/** lista de { pasta, nome, criar() } — tudo que vira .glb na pasta Assets */
export function assetList() {
  const list = [];
  for (const p of PRESETS) list.push({ pasta: 'personagens', nome: slug(p.name), criar: () => character(p.style) });
  list.push({ pasta: 'personagens', nome: 'figurante-com-vara', criar: () => props.makeNPCKid(0) });
  for (const type of KITE_ORDER) {
    getPatterns(type).forEach((pat, i) => {
      list.push({ pasta: 'pipas', nome: `${type}-${i + 1}${pat.name ? '-' + slug(pat.name) : ''}`, criar: () => props.kiteWithTail(type, i) });
    });
  }
  for (const s of SPOOLS) list.push({ pasta: 'objetos', nome: 'carretel-' + s.id, criar: () => props.makeSpoolModel(s.id) });
  list.push({ pasta: 'objetos', nome: 'vara-de-bambu', criar: () => props.makeBambooPole() });
  list.push({ pasta: 'objetos', nome: 'bola', criar: () => props.makeBall() });
  list.push({ pasta: 'objetos', nome: 'trave', criar: () => props.makeGoal() });
  list.push({ pasta: 'objetos', nome: 'poste', criar: () => props.makePole() });
  list.push({ pasta: 'objetos', nome: 'argola', criar: () => props.makeRing() });
  for (const k of ['mangueira', 'eucalipto', 'jamelao']) list.push({ pasta: 'cenario', nome: 'arvore-' + k, criar: () => props.makeTree(k, 7).g });
  list.push({ pasta: 'cenario', nome: 'casa-reboco-1-andar', criar: () => props.makeHouse({ w: 7, d: 8, floors: 1, unfinished: false, color: '#f4d35e', seed: 3 }) });
  list.push({ pasta: 'cenario', nome: 'casa-reboco-2-andares', criar: () => props.makeHouse({ w: 8, d: 8, floors: 2, unfinished: false, color: '#9ad1d4', seed: 5 }) });
  list.push({ pasta: 'cenario', nome: 'casa-tijolo', criar: () => props.makeHouse({ w: 7, d: 8, floors: 1, unfinished: true, seed: 9 }) });
  list.push({ pasta: 'cenario', nome: 'nuvem', criar: () => props.makeCloud(4) });
  list.push({ pasta: 'cenario', nome: 'tufo-de-capim', criar: () => props.makeGrassClump() });
  list.push({ pasta: 'cenario', nome: 'morro', criar: () => props.makeHill(30, 14, 2) });
  list.push({ pasta: 'cenario', nome: 'favela-quarteirao-colorido', criar: () => makeFavelaBlock(3, .35) });
  list.push({ pasta: 'cenario', nome: 'favela-quarteirao-tijolo', criar: () => makeFavelaBlock(8, .85) });
  return list;
}

/** imagens usadas no jogo (estampas, camisas, paredes, chão...) → PNG na pasta Assets/texturas */
export function textureList() {
  const list = [];
  for (const type of KITE_ORDER) getPatterns(type).forEach((pat, i) =>
    list.push({ pasta: 'texturas/estampas-de-pipa', nome: `${type}-${i + 1}${pat.name ? '-' + slug(pat.name) : ''}`, img: () => kiteThumb(type, i, 512) }));
  SHIRTS.forEach((sh, i) => { if (sh.mode === 'sem') return; const t = shirtTexture(i); list.push({ pasta: 'texturas/camisas', nome: slug(sh.name), img: () => t.image }); });
  for (const k of Object.keys(props.textures)) list.push({ pasta: 'texturas/cenario', nome: k, img: () => props.textures[k]().image });
  list.push({ pasta: 'texturas/efeitos', nome: 'bravo', img: () => angerTexture().image });
  for (const k of Object.keys(favelaTex)) list.push({ pasta: 'texturas/favela', nome: k === 'luz' ? 'janelas-acesas' : k === 'tijolo' || k === 'pintada' ? 'fachada-' + k : k, img: () => favelaTex[k]().image });
  return list;
}

/** grupos para a vitrine */
export const SHOWCASE = {
  'Personagens': () => ({ items: [...PRESETS.map(p => character(p.style)), props.makeNPCKid(1)], spacing: 1.05, focusY: 1, dist: 5.5 }),
  'Pipas': () => ({ items: KITE_ORDER.map(t => { const k = props.kiteWithTail(t, 0); k.position.y = 1.4; return k; }), spacing: 1.7, focusY: 1, dist: 7 }),
  'Estampas': () => ({ items: KITE_ORDER.flatMap(t => getPatterns(t).slice(0, 4).map((_, i) => { const k = makeKiteMesh(t, i); k.position.y = 1 + (i % 2) * 1.3; return k; })), spacing: .9, focusY: 1.6, dist: 12 }),
  'Árvores': () => ({ items: ['mangueira', 'eucalipto', 'jamelao'].map((k, i) => props.makeTree(k, i + 2).g), spacing: 10, focusY: 5, dist: 26 }),
  'Casas': () => ({
    items: [props.makeHouse({ w: 7, d: 8, floors: 1, color: '#f4d35e', seed: 3 }), props.makeHouse({ w: 8, d: 8, floors: 2, color: '#9ad1d4', seed: 5 }), props.makeHouse({ w: 7, d: 8, floors: 1, unfinished: true, seed: 9 })],
    spacing: 10, focusY: 2.5, dist: 22,
  }),
  'Objetos': () => ({
    items: [...SPOOLS.map(s => { const m = props.makeSpoolModel(s.id); m.position.y = .5; m.scale.setScalar(3); return m; }), (() => { const b = props.makeBall(); b.scale.setScalar(3); b.position.y = .33; return b; })(), (() => { const v = props.makeBambooPole(); v.position.y = .45; return v; })()],
    spacing: 1.2, focusY: 1, dist: 6.5,
  }),
  'Favela': () => ({ items: [makeFavelaBlock(3, .35), makeFavelaBlock(8, .85)], spacing: 36, focusY: 6, dist: 62 }),
  'Cenário': () => ({ items: [props.makeGoal(), props.makePole(), (() => { const r = props.makeRing(); r.scale.setScalar(.6); return r; })(), (() => { const c = props.makeCloud(2); c.scale.setScalar(.18); c.position.y = 7; return c; })(), (() => { const g = props.makeGrassClump(); g.scale.setScalar(3); return g; })()], spacing: 7.5, focusY: 3.2, dist: 24 }),
};
