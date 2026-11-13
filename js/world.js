// Gerenciador de cenários: monta o cenário escolhido (campinho, laje, morro) e troca na hora,
// desmontando as malhas e os corpos de colisão do anterior. As nuvens são de todos os cenários.
import * as THREE from 'three';
import { srand, setSeed } from './utils.js';
import { PH, removeBody } from './physics.js';
import { G } from './state.js';
import { scene, SCN, trees, blockers, lampMats } from './scene.js';
import * as props from './props.js';
import * as campinho from './cenarios/campinho.js';
import * as laje from './cenarios/laje.js';
import * as morro from './cenarios/morro.js';

export const SCENES = { campinho, laje, morro };
export const SCENE_LIST = [campinho.info, laje.info, morro.info];

const clouds = [];
let cur = null;   // { mod, root, bodies }
export const lastBuild = { ms: 0, bodies: 0 }; // quanto demorou para montar (para testes)

function buildClouds() {
  setSeed(991);
  for (let i = 0; i < 22; i++) {
    const g = props.makeCloud(i + 1);
    g.position.set((srand() - .5) * 800, 85 + srand() * 60, (srand() - .5) * 800);
    clouds.push(g); scene.add(g);
  }
}

function teardown() {
  if (!cur) return;
  for (const b of cur.bodies) removeBody(b);
  scene.remove(cur.root);
  cur.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  trees.length = 0; blockers.length = 0; lampMats.length = 0;
  G.ball = null; G.ballMesh = null;
  cur = null;
}

/** monta o cenário (id: 'campinho' | 'laje' | 'morro'). Retorna o id realmente montado. */
export function setScenario(id) {
  const mod = SCENES[id] || campinho;
  if (cur && cur.mod === mod) return mod.info.id;
  teardown();
  const root = new THREE.Group(); root.name = 'cenario-' + mod.info.id;
  scene.add(root);
  PH.track = [];
  setSeed(7);           // mesma semente = mesmo cenário em todos os computadores (importante no online)
  const t0 = performance.now();
  try { mod.build(root); }
  finally { cur = { mod, root, bodies: PH.track }; PH.track = null; }
  lastBuild.ms = Math.round(performance.now() - t0); lastBuild.bodies = cur.bodies.length;
  return mod.info.id;
}

export function currentScenario() { return cur ? cur.mod.info.id : null; }

export function buildWorld(id = 'campinho') {
  if (!clouds.length) buildClouds();
  return setScenario(id);
}

/** coisas que se mexem sozinhas: nuvens + o que for do cenário (bandeirinhas, varal, capim, teleférico...) */
export function updateEnvironment(dt, clock, windDirH, windSpeed) {
  for (const c of clouds) {
    c.position.addScaledVector(windDirH, dt * windSpeed * .35);
    if (c.position.z < -450) c.position.z += 900; if (c.position.z > 450) c.position.z -= 900;
    if (c.position.x < -450) c.position.x += 900; if (c.position.x > 450) c.position.x -= 900;
  }
  if (cur && cur.mod.update) cur.mod.update(dt, clock, windDirH, windSpeed);
}

export { SCN };
