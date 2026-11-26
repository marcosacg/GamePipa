// Molecada figurante: os mesmos personagens do jogo (boneco personalizável e os modelos prontos), com vara de bambu,
// correndo atrás das pipas avoadas. Quando uma avoada chega no chão, a molecada perto disputa a corrida até ela:
// quem chegar primeiro pega, levanta a pipa na ponta da vara e pula de alegria; quem perdeu fica bravo.
// Só visual: não mexe em pontos, física nem rede (cada jogador vê a sua molecada; o "chegou no chão" vem da arena).
import * as THREE from 'three';
import { S, G } from './state.js';
import { PRESETS, NPC_STYLES, SKINS, HAIRS, HATS, SHIRTS, SHORTS, KITES } from './config.js';
import { scene, groundH, SCN, collideWalk } from './scene.js';
import { makeCharacter, poseCharacter, poseAngry, disposeCharacter, lineHand } from './player.js';
import { makeBambooPole } from './props.js';
import { makeKiteMesh, TailRenderer } from './kite.js';
import { TailSim } from './rabiola.js';
import { clamp, lerpAngle, rand } from './utils.js';

const MAX_PER_KITE = 2;      // quantos correm atrás de cada avoada no céu
const ALCANCE = 55;          // até que distância a molecada corre pra pegar a pipa que caiu (m)
const PONTA = 3.15;          // ponta da vara, a partir da mão (m)
const npcs = [];
const caidas = [];           // pipas no chão esperando alguém pegar
let assignT = 0;

const pick = a => a[Math.floor(Math.random() * a.length)];

/** estilo de um figurante: um dos personagens do jogo, com roupa sorteada no boneco personalizável */
function estiloFigurante(i) {
  const base = PRESETS[(i + Math.floor(Math.random() * PRESETS.length)) % PRESETS.length].style;
  if (base.model !== 'boneco') return { ...base };
  return {
    ...base, skin: Math.floor(Math.random() * SKINS.length), hair: pick(HAIRS).id, hat: pick(HATS).id,
    shirt: Math.floor(Math.random() * SHIRTS.length), shorts: Math.floor(Math.random() * SHORTS.length), legs: Math.random() < .6 ? 'bermuda' : 'calca',
  };
}

/** vara de bambu no boneco antigo (formas simples): vai no braço */
function makePoleOnArm() {
  const g = makeBambooPole();
  g.rotation.x = Math.PI / 2;
  g.position.z = .55;
  return g;
}

/** remove a molecada (troca de cenário) */
export function clearNPCs() {
  for (const n of npcs) { scene.remove(n.c.g); if (n.pole && n.pole.parent === scene) scene.remove(n.pole); soltaPipa(n); disposeCharacter(n.c); }
  npcs.length = 0;
  for (const k of caidas) tiraPipa(k.p);
  caidas.length = 0;
}

/** cria a molecada nas zonas do cenário atual (campo inteiro, lajes dos vizinhos...) */
export function initNPCs() {
  clearNPCs();
  const homes = [];
  for (const zone of SCN.npcZones) for (const h of zone.homes) homes.push([h[0], h[1], zone]);
  homes.forEach(([x, z, zone], i) => {
    let c = makeCharacter(estiloFigurante(i));
    if (c.kind !== 'anime') { disposeCharacter(c); c = makeCharacter({ ...NPC_STYLES[i % NPC_STYLES.length].style, skin: Math.floor(Math.random() * 5) }); }
    if (c.spool) c.spool.visible = false;             // figurante não tem carretel, tem vara
    let pole;
    if (c.kind === 'anime') { pole = makeBambooPole(); scene.add(pole); }   // nos personagens com esqueleto a vara segue a mão
    else { pole = makePoleOnArm(); c.armR.add(pole); }
    c.g.position.set(clamp(x + rand(-1, 1), zone.x0, zone.x1), 0, clamp(z + rand(-1, 1), zone.z0, zone.z1));
    c.g.position.y = groundH(c.g.position.x, c.g.position.z);
    c.g.scale.setScalar(rand(.86, .97)); // a molecada é um pouco menor
    scene.add(c.g);
    npcs.push({
      c, zone, pole, home: new THREE.Vector3(x, 0, z), mode: 'idle', target: null,
      timer: 0, speed: rand(5.2, 6.8), vel: new THREE.Vector3(), yaw: Math.random() * 6.28,
      wander: new THREE.Vector3(x, 0, z), wanderT: rand(1, 4), ph: Math.random() * 10, jump: 0,
      caida: null, pipa: null, pipaT: 0, hand: new THREE.Vector3(), handT: new THREE.Vector3(), poleDir: new THREE.Vector3(0, 1, 0),
    });
  });
}

/* ---------------- pipa no chão / na ponta da vara ---------------- */
function fazPipa(kite) {
  const type = KITES[kite && kite.type] ? kite.type : 'pipa', pat = (kite && kite.pat) || 0;
  const mesh = makeKiteMesh(type, pat);
  mesh.scale.setScalar(.85);
  scene.add(mesh);
  const n = Math.min(7, KITES[type].tail);
  const tail = n > 0 ? new TailRenderer(type, pat, n) : null;
  if (tail) tail.objs.forEach(o => { o.visible = false; });
  return { mesh, n, tail, sim: n > 0 ? new TailSim(n, Math.random() * 30) : null, a: new THREE.Vector3() };
}
function tiraPipa(p) { if (!p) return; scene.remove(p.mesh); if (p.tail) p.tail.dispose(); }
function soltaPipa(n) { tiraPipa(n.pipa); n.pipa = null; }

/**
 * Uma avoada chegou no chão (evento da arena, ou a avoada do modo livre). p = [x,y,z] ou Vector3.
 * A molecada que alcança corre pra pegar: começa a disputa.
 */
export function npcKiteLanded(p, kite) {
  if (!npcs.length) return;
  const at = p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]);
  // só dá pra pegar onde a molecada consegue ir (o campo, a laje deles...)
  const quem = npcs.filter(n => at.x > n.zone.x0 - 1.5 && at.x < n.zone.x1 + 1.5 && at.z > n.zone.z0 - 1.5 && at.z < n.zone.z1 + 1.5
    && !n.pipa && n.mode !== 'celebrate' && Math.hypot(n.c.g.position.x - at.x, n.c.g.position.z - at.z) < ALCANCE);
  if (!quem.length) return;
  const z0 = quem[0].zone;
  at.x = clamp(at.x, z0.x0, z0.x1); at.z = clamp(at.z, z0.z0, z0.z1); at.y = groundH(at.x, at.z);
  const k = { p: fazPipa(kite), at, t: 0, dono: null };
  k.p.mesh.position.copy(at); k.p.mesh.position.y += .06;      // deitada no chão
  k.p.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
  caidas.push(k);
  for (const n of quem) { n.mode = 'grab'; n.caida = k; n.target = null; }
}

const _to = new THREE.Vector3(), _goal = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(),
  _x = new THREE.Vector3(), _z = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _tip = new THREE.Vector3();

/** avoadas no céu agora (modo livre/desafios e disputa/online) */
function strayTargets() {
  const out = [];
  for (const st of S.strays) if (st.view && !st.caught) out.push(st.view);
  for (const v of G.strayViews.values()) out.push(v);
  return out;
}

/** vara (e a pipa na ponta, se tiver): base na mão, apontando para poleDir */
function poseVara(n, dt, t) {
  const c = n.c;
  lineHand(c, n.hand);
  n.pole.position.copy(n.hand);
  n.pole.quaternion.setFromUnitVectors(_Y, n.poleDir);
  if (!n.pipa) return;
  // a pipa amarrada na ponta da vara, com a rabiola balançando no vento
  _tip.copy(n.hand).addScaledVector(n.poleDir, PONTA);
  const m = n.pipa.mesh;
  m.position.copy(_tip).addScaledVector(n.poleDir, .3);
  _z.copy(S.windDirH).multiplyScalar(-1); _z.y = 0;
  if (_z.lengthSq() < 1e-4) _z.set(0, 0, 1); _z.normalize();
  _x.crossVectors(n.poleDir, _z).normalize(); _z.crossVectors(_x, n.poleDir).normalize();
  _m.makeBasis(_x, n.poleDir, _z); m.quaternion.setFromRotationMatrix(_m);
  m.rotateZ(Math.sin(t * 5) * .15);
  if (n.pipa.tail) {
    n.pipa.tail.objs.forEach(o => { o.visible = true; });
    n.pipa.a.set(0, (m.userData.bottom || -.5) * .85 * .85, 0).applyQuaternion(m.quaternion).add(m.position);
    n.pipa.tail.update(n.pipa.sim.update(dt, n.pipa.a, S.windDirH, S.windSpeed || 6, t), t, S.windDirH);
  }
}

export function updateNPCs(dt, t) {
  if (!npcs.length) return;
  const targets = strayTargets();
  const alive = new Set(targets);

  // a avoada sumiu do céu sem cair no chão: alguém aparou com a linha → quem corria fica bravo
  for (const n of npcs) {
    if (n.mode === 'chase' && !alive.has(n.target)) { n.mode = 'upset'; n.timer = 1.4; n.target = null; }
  }

  // pipas no chão: se ninguém pegar em 15 s, somem
  for (let i = caidas.length - 1; i >= 0; i--) {
    const k = caidas[i]; k.t += dt;
    if (!k.dono && k.t > 15) { tiraPipa(k.p); caidas.splice(i, 1); for (const n of npcs) if (n.caida === k) { n.caida = null; n.mode = 'return'; } }
  }

  // distribui: até 2 moleques por avoada no céu, os mais perto
  assignT -= dt;
  if (assignT <= 0) {
    assignT = .5;
    for (const tg of targets) {
      const chasing = npcs.filter(n => n.mode === 'chase' && n.target === tg).length;
      if (chasing >= MAX_PER_KITE) continue;
      const free = npcs.filter(n => (n.mode === 'idle' || n.mode === 'return') && !n.pipa)
        .sort((a, b) => a.c.g.position.distanceTo(tg.pos) - b.c.g.position.distanceTo(tg.pos));
      for (let i = 0; i < Math.min(MAX_PER_KITE - chasing, free.length); i++) { free[i].mode = 'chase'; free[i].target = tg; }
    }
  }

  for (const n of npcs) {
    const c = n.c, pos = c.g.position;
    let speed = 0;
    c.happyOn = n.mode === 'celebrate';

    if (n.mode === 'chase') {
      // corre pro chão embaixo da pipa, um pouco à frente (ela vem com o vento)
      _goal.copy(n.target.pos).addScaledVector(S.windDirH, 3 + n.ph % 2);
      _goal.y = 0;
      speed = n.speed;
      const low = n.target.pos.y < pos.y + 7 && Math.hypot(n.target.pos.x - pos.x, n.target.pos.z - pos.z) < 4;
      n.jump = low ? n.jump + dt : 0;
    } else if (n.mode === 'grab') {
      // disputa: corrida até a pipa que caiu
      const k = n.caida;
      if (!k || k.dono) { n.mode = 'upset'; n.timer = 1.6; n.caida = null; }
      else {
        _goal.copy(k.at); speed = n.speed * 1.08;
        if (Math.hypot(k.at.x - pos.x, k.at.z - pos.z) < .9) {
          // chegou primeiro: pegou! (os outros perdem a corrida)
          k.dono = n; n.pipa = k.p; n.caida = null; n.mode = 'celebrate'; n.timer = 3.2; n.pipaT = 0;
          const i = caidas.indexOf(k); if (i >= 0) caidas.splice(i, 1);
          for (const o of npcs) if (o !== n && o.caida === k) { o.caida = null; o.mode = 'upset'; o.timer = rand(1.4, 2.2); }
        }
      }
    } else if (n.mode === 'return' || n.mode === 'idle') {
      if (n.mode === 'return') {
        _goal.copy(n.home); speed = 2.6;
        if (Math.hypot(n.home.x - pos.x, n.home.z - pos.z) < 1.5) n.mode = 'idle';
      } else {
        n.wanderT -= dt;
        if (n.wanderT <= 0) { n.wanderT = rand(3, 7); n.wander.set(clamp(n.home.x + rand(-3, 3), n.zone.x0, n.zone.x1), 0, clamp(n.home.z + rand(-3, 3), n.zone.z0, n.zone.z1)); }
        _goal.copy(n.wander); speed = 1.2;
      }
      // o vencedor fica um tempo mostrando a pipa e depois guarda
      if (n.pipa && (n.pipaT += dt) > 14) soltaPipa(n);
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
    for (const o of npcs) { // na corrida eles se esbarram (um não atravessa o outro)
      if (o === n) continue;
      const dx = pos.x - o.c.g.position.x, dz = pos.z - o.c.g.position.z, dd = Math.hypot(dx, dz);
      if (dd < .6 && dd > 0) { pos.x += dx / dd * (.6 - dd) * .5; pos.z += dz / dd * (.6 - dd) * .5; }
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

    const tt = t + n.ph;
    if (n.mode === 'chase' && n.jump > 0) pos.y += Math.abs(Math.sin(n.jump * 7)) * .45; // pulando pra alcançar
    if (n.mode === 'celebrate') pos.y += Math.abs(Math.sin(tt * 8)) * .4;                // pulando de alegria

    // ---------- animação ----------
    c.g.updateMatrixWorld(true);
    if (c.kind === 'anime') {
      // mão da vara: correndo atrás da pipa, vara erguida; indo pegar a do chão, vara pra frente; à toa, apoiada
      const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw), H = c.g.scale.y;
      let hand = null;
      if (n.mode === 'chase' || n.mode === 'grab') {
        hand = n.handT.set(pos.x + fx * .3 - fz * .22, pos.y + (n.mode === 'chase' ? 1.75 : 1.2) * H, pos.z + fz * .3 + fx * .22);
      }
      poseCharacter(c, dt, sp, hand);
      poseAngry(c, dt, tt, n.mode === 'upset');
      if (n.mode === 'chase' && n.target) _d.subVectors(n.target.pos, pos).normalize();
      else if (n.mode === 'celebrate') _d.set(Math.sin(tt * 9) * .35, 1, 0).normalize();     // sacudindo a pipa no alto
      else if (n.mode === 'grab') _d.set(fx * .9, .55, fz * .9).normalize();
      else if (n.pipa) _d.set(-fx * .12, 1, -fz * .12).normalize();                           // mostrando a pipa
      else _d.set(-fx * .35, 1, -fz * .35).normalize();                                        // apoiada, pra trás
      if (_d.y < .25) { _d.y = .25; _d.normalize(); }
      n.poleDir.lerp(_d, 1 - Math.exp(-8 * dt)).normalize();
      poseVara(n, dt, tt);
    } else {
      poseCharacter(c, dt, sp, null);
      poseAngry(c, dt, tt, n.mode === 'upset');
      if (n.mode === 'chase') {
        c.armR.rotation.set(-1.25 + Math.sin(tt * 7) * .25 - (n.jump > 0 ? .5 : 0), Math.sin(tt * 5) * .2, 0);
        c.armL.rotation.set(.3 + Math.sin(c.phase) * .8, .2, 0);
        c.headG.rotation.x = -.35;
      } else if (n.mode === 'celebrate') {
        c.armR.rotation.set(-2.4 + Math.sin(tt * 12) * .3, 0, 0);
        c.armL.rotation.set(-2.4 + Math.sin(tt * 12 + 1) * .3, 0, 0);
      } else if (n.mode !== 'upset') {
        c.armR.rotation.set(-.55 + Math.sin(tt * .7) * .05, .1, 0);
        if (sp > .3) c.armL.rotation.set(.4 + Math.sin(c.phase) * .5, .2, 0);
        c.headG.rotation.x = Math.sin(tt * .3) > .6 ? -.4 : 0;
      }
      if (n.pipa) { // boneco antigo: a pipa vai acima da cabeça
        n.pipa.mesh.position.set(pos.x, pos.y + 3.4, pos.z); n.pipa.mesh.rotation.set(0, n.yaw, Math.sin(tt * 5) * .2);
      }
    }
  }
}

/** informações para os testes */
export function npcsInfo() {
  return { n: npcs.length, modelos: npcs.map(n => n.c.model || n.c.kind), modos: npcs.map(n => n.mode), comPipa: npcs.filter(n => n.pipa).length, caidas: caidas.length };
}
