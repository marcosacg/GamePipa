// Molecada figurante: correm com varas de bambu atrás das pipas avoadas.
// Só enfeite visual: não mexem em pontos, física nem rede (cada jogador vê a sua molecada).
import * as THREE from 'three';
import { S, G } from './state.js';
import { PRESETS } from './config.js';
import { scene, mesh, mat, groundH, SCN, collideWalk } from './scene.js';
import { makeCharacter, poseCharacter, poseAngry, disposeCharacter } from './player.js';
import { makeBambooPole } from './props.js';
import { clamp, lerpAngle, rand } from './utils.js';

const MAX_PER_KITE = 2;
const npcs = [];
let assignT = 0;

/** vara de bambu na mão (alinhada com o braço, que aponta em +Z) */
function makePole() {
  const g = makeBambooPole();
  g.rotation.x = Math.PI / 2;
  g.position.z = .55;
  return g;
}

/** remove a molecada (troca de cenário) */
export function clearNPCs() {
  for (const n of npcs) { scene.remove(n.c.g); disposeCharacter(n.c); }
  npcs.length = 0;
}

/** cria a molecada nas zonas do cenário atual (campo inteiro, lajes dos vizinhos...) */
export function initNPCs() {
  clearNPCs();
  const presets = [...PRESETS].sort(() => Math.random() - .5);
  const homes = [];
  for (const zone of SCN.npcZones) for (const h of zone.homes) homes.push([h[0], h[1], zone]);
  homes.forEach(([x, z, zone], i) => {
    const style = { ...presets[i % presets.length].style, skin: Math.floor(Math.random() * 5), shirt: Math.floor(Math.random() * 6) };
    const c = makeCharacter(style);
    c.spool.visible = false;             // figurante não tem carretel, tem vara
    c.armR.add(makePole());
    c.g.position.set(clamp(x + rand(-1, 1), zone.x0, zone.x1), 0, clamp(z + rand(-1, 1), zone.z0, zone.z1));
    c.g.position.y = groundH(c.g.position.x, c.g.position.z);
    c.g.scale.setScalar(rand(.82, .95)); // a molecada é um pouco menor
    scene.add(c.g);
    npcs.push({
      c, zone, home: new THREE.Vector3(x, 0, z), mode: 'idle', target: null, lastPos: new THREE.Vector3(),
      timer: 0, speed: rand(5.2, 6.6), vel: new THREE.Vector3(), yaw: Math.random() * 6.28,
      wander: new THREE.Vector3(x, 0, z), wanderT: rand(1, 4), ph: Math.random() * 10, jump: 0,
    });
  });
}

/** avoadas no céu agora (modo livre/desafios e disputa/online) */
function strayTargets() {
  const out = [];
  for (const st of S.strays) if (st.view && !st.caught) out.push(st.view);
  for (const v of G.strayViews.values()) out.push(v);
  return out;
}

const _to = new THREE.Vector3(), _goal = new THREE.Vector3();

export function updateNPCs(dt, t) {
  if (!npcs.length) return;
  const targets = strayTargets();
  const alive = new Set(targets);

  // a pipa sumiu? quem estava embaixo comemora, quem chegou atrasado fica bravo
  for (const n of npcs) {
    if (n.mode === 'chase' && !alive.has(n.target)) {
      const dh = Math.hypot(n.lastPos.x - n.c.g.position.x, n.lastPos.z - n.c.g.position.z);
      n.mode = dh < 6 && n.lastPos.y < n.c.g.position.y + 7 ? 'celebrate' : 'upset';
      n.timer = n.mode === 'celebrate' ? 1.8 : 1.4;
      n.target = null;
    }
  }

  // distribui: até 2 moleques por avoada, os mais perto
  assignT -= dt;
  if (assignT <= 0) {
    assignT = .5;
    for (const tg of targets) {
      const chasing = npcs.filter(n => n.mode === 'chase' && n.target === tg).length;
      if (chasing >= MAX_PER_KITE) continue;
      const free = npcs.filter(n => n.mode === 'idle' || n.mode === 'return')
        .sort((a, b) => a.c.g.position.distanceTo(tg.pos) - b.c.g.position.distanceTo(tg.pos));
      for (let i = 0; i < Math.min(MAX_PER_KITE - chasing, free.length); i++) {
        free[i].mode = 'chase'; free[i].target = tg;
      }
    }
  }

  for (const n of npcs) {
    const c = n.c, pos = c.g.position;
    let speed = 0;

    if (n.mode === 'chase') {
      // corre pro chão embaixo da pipa, um pouco à frente (ela vem com o vento)
      n.lastPos.copy(n.target.pos);
      _goal.copy(n.target.pos).addScaledVector(S.windDirH, 3 + n.ph % 2);
      _goal.y = 0;
      speed = n.speed;
      const low = n.target.pos.y < pos.y + 7 && Math.hypot(n.target.pos.x - pos.x, n.target.pos.z - pos.z) < 4;
      n.jump = low ? n.jump + dt : 0;
    } else if (n.mode === 'return' || n.mode === 'idle') {
      if (n.mode === 'return') {
        _goal.copy(n.home); speed = 2.6;
        if (Math.hypot(n.home.x - pos.x, n.home.z - pos.z) < 1.5) n.mode = 'idle';
      } else {
        n.wanderT -= dt;
        if (n.wanderT <= 0) { n.wanderT = rand(3, 7); n.wander.set(clamp(n.home.x + rand(-3, 3), n.zone.x0, n.zone.x1), 0, clamp(n.home.z + rand(-3, 3), n.zone.z0, n.zone.z1)); }
        _goal.copy(n.wander); speed = 1.2;
      }
    } else { // comemorando ou bravo: fica parado
      n.timer -= dt;
      if (n.timer <= 0) n.mode = 'return';
      _goal.copy(pos);
    }

    // movimento simples
    _goal.x = clamp(_goal.x, n.zone.x0, n.zone.x1); _goal.z = clamp(_goal.z, n.zone.z0, n.zone.z1); // não sai da sua laje/do campo
    _to.set(_goal.x - pos.x, 0, _goal.z - pos.z);
    const d = _to.length();
    if (d > .4 && speed > 0) _to.multiplyScalar(Math.min(speed, d * 2) / d); else _to.set(0, 0, 0);
    n.vel.lerp(_to, 1 - Math.exp(-6 * dt));
    pos.addScaledVector(n.vel, dt);
    collideWalk(pos, .4);
    if (G.player) { // não atravessa o jogador
      const p = G.player.g.position, dx = pos.x - p.x, dz = pos.z - p.z, dd = Math.hypot(dx, dz);
      if (dd < .7 && dd > 0) { pos.x = p.x + dx / dd * .7; pos.z = p.z + dz / dd * .7; }
    }
    pos.x = clamp(pos.x, n.zone.x0, n.zone.x1); pos.z = clamp(pos.z, n.zone.z0, n.zone.z1);
    pos.y = groundH(pos.x, pos.z);

    const sp = n.vel.length();
    if (n.mode === 'chase' && n.target) {
      // olha pra pipa enquanto corre
      const ty = Math.atan2(n.target.pos.x - pos.x, n.target.pos.z - pos.z);
      n.yaw = lerpAngle(n.yaw, sp > 1 ? lerpAngle(Math.atan2(n.vel.x, n.vel.z), ty, .5) : ty, 1 - Math.exp(-8 * dt));
    } else if (sp > .3) n.yaw = lerpAngle(n.yaw, Math.atan2(n.vel.x, n.vel.z), 1 - Math.exp(-6 * dt));
    c.g.rotation.y = n.yaw;

    // ---------- animação ----------
    c.g.updateMatrixWorld(true);
    poseCharacter(c, dt, sp, null);
    poseAngry(c, dt, t + n.ph, n.mode === 'upset');
    const tt = t + n.ph;
    if (n.mode === 'chase') {
      // vara pro alto balançando, braço esquerdo correndo
      c.armR.rotation.set(-1.25 + Math.sin(tt * 7) * .25 - (n.jump > 0 ? .5 : 0), Math.sin(tt * 5) * .2, 0);
      c.armL.rotation.set(.3 + Math.sin(c.phase) * .8, .2, 0);
      c.headG.rotation.x = -.35; // olhando pra cima
      if (n.jump > 0) pos.y += Math.abs(Math.sin(n.jump * 7)) * .45; // pulando pra alcançar
    } else if (n.mode === 'celebrate') {
      c.armR.rotation.set(-2.4 + Math.sin(tt * 12) * .3, 0, 0);
      c.armL.rotation.set(-2.4 + Math.sin(tt * 12 + 1) * .3, 0, 0);
      pos.y += Math.abs(Math.sin(tt * 9)) * .4;
    } else if (n.mode !== 'upset') {
      // à toa: vara apoiada, olhando o céu de vez em quando
      c.armR.rotation.set(-.55 + Math.sin(tt * .7) * .05, .1, 0);
      if (sp > .3) c.armL.rotation.set(.4 + Math.sin(c.phase) * .5, .2, 0);
      c.headG.rotation.x = Math.sin(tt * .3) > .6 ? -.4 : 0;
    }
  }
}
