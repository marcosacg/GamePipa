// Estado compartilhado entre os módulos
import * as THREE from 'three';

export const S = {
  running: false, paused: false, ended: false,
  mode: 'livre',                 // livre | desafios | disputa | online
  kiteType: 'pipa', patIdx: 0,
  style: null,                   // estilo do personagem
  name: 'Moleque',
  clock: 0, minutes: 16 * 60,
  L: 16, tension: 0, rawT: 0, overT: 0, stress: 0, jerk: 0, theta: 0,
  state: 'voando', stateTimer: 0, stuckPos: new THREE.Vector3(), hideKite: false,
  score: 0, scoreFrac: 0,
  windBase: 5.8, gustAmp: .35, windSpeed: 6, windDir: 0,
  windVec: new THREE.Vector3(0, 0, -6), windDirH: new THREE.Vector3(0, 0, -1), turb: 0,
  hand: new THREE.Vector3(0, 1.3, 20), spoolPos: new THREE.Vector3(),
  kitePos: new THREE.Vector3(0, 8, 10), kiteQ: new THREE.Quaternion(),
  mi: 0, mp: 0, missionDone: false, missionDelay: 0,
  rings: [], strays: [], ringTimer: 1, strayTimer: 6,
  pulling: false, stamina: 1,
  duelX: null,                   // ponto da enroscada (THREE.Vector3) quando em disputa
  tailTug: null,                 // ponto onde a linha do adversário prendeu a MINHA rabiola
  tailF: 0,                      // em que altura da rabiola ela está presa (0 = perto da pipa, 1 = ponta)
  lineLoad: false,               // a minha linha está arrastando a rabiola de alguém
  shakeT: 0, lastSteer: 0,
  joy: { x: 0, y: 0 },           // joystick de toque (celular): -1..1       // sacudida (A/D alternado) para soltar a rabiola
};

export const keys = {};

// referências a objetos vivos
export const G = {
  player: null,      // personagem local
  kite: null,        // pipa local (corpo físico + malhas)
  ball: null, ballMesh: null,
  session: null,     // sessão de disputa (bots ou online)
  remotes: new Map(),
  strayViews: new Map(),
  hooks: { onFail: null },
};
