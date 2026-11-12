// Disputa offline contra a molecada do bairro (bots). Mesma arena usada pelo servidor online.
// Sem Three.js aqui de propósito: dá para testar no Node.
import { Arena, DUEL, tailEndFromWind } from './shared/duel.js';
import { KITES } from './config.js';
import { windState } from './shared/wind.js';
import { PRESETS, KITE_ORDER, getPatterns, BOT_NAMES, DISPUTA_WIND } from './config.js';

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** quaternion (x,y,z,w) a partir dos eixos x,y,z (colunas da matriz de rotação) */
function quatFromBasis(x, y, z) {
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) { const s = .5 / Math.sqrt(tr + 1); qw = .25 / s; qx = (m21 - m12) * s; qy = (m02 - m20) * s; qz = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); qw = (m21 - m12) / s; qx = .25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = .25 * s; qz = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = .25 * s; }
  return [qx, qy, qz, qw];
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Bot {
  constructor(id, meta, base) {
    this.id = id; this.meta = meta; this.base = base;
    this.pos = [base[0], 0, base[1]];
    this.az = rnd(-.5, .5); this.el = .8; this.L = rnd(25, 40);
    this.flying = true; this.respawn = 0;
    this.target = null; this.retarget = rnd(2, 6);
    this.sta = 1; this.pull = false; this.give = false; this.pullT = 0;
    this.ph = Math.random() * 10; this.tilt = 0;
    this.hand = [base[0], 1.3, base[1]]; this.k = [base[0], 20, base[1] - 20]; this.q = [0, 0, 0, 1];
    this.yaw = Math.PI; this.mv = 0; this.T = 3; this.skill = rnd(.7, 1.1);
    this.n = Math.min(10, KITES[meta.kite.type]?.tail || 0); this.te = null;
    this.aimTail = false; this.shake = false; this.shakeT = 0;
  }
  update(dt, t, W, arena, states) {
    const windAz = Math.atan2(W.dx, W.dz);
    // anda um pouquinho em volta do seu canto
    const wx = this.base[0] + Math.sin(t * .05 + this.ph) * 3, wz = this.base[1] + Math.cos(t * .04 + this.ph) * 2;
    const dx0 = wx - this.pos[0], dz0 = wz - this.pos[2];
    const dd = Math.hypot(dx0, dz0);
    const spd = dd > .3 ? Math.min(1.4, dd) : 0;
    if (spd) { this.pos[0] += dx0 / dd * spd * dt; this.pos[2] += dz0 / dd * spd * dt; }
    this.mv = spd;
    this.hand = [this.pos[0], 1.3, this.pos[2]];

    if (!this.flying) {
      this.respawn -= dt;
      if (this.respawn <= 0 && !(this.onBack > 0)) this.onBack = rnd(1.2, 2.2); // pega pipa nova e põe nas costas
      if (this.onBack > 0) {
        this.onBack -= dt;
        if (this.onBack <= 0) { this.flying = true; this.L = 12; this.az = 0; this.el = .5; }
      }
    }

    const duel = arena.duels.find(d => d.a === this.id || d.b === this.id);
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = rnd(8, 16);
      const ids = [...states.keys()].filter(id => id !== this.id && states.get(id) && states.get(id).flying);
      const me = ids.includes('eu') && Math.random() < .55;
      this.target = me ? 'eu' : (ids.length && Math.random() < .7 ? ids[Math.floor(Math.random() * ids.length)] : null);
      this.aimTail = Math.random() < .4; // às vezes mira na rabiola em vez da linha
    }

    let desAz = .45 * Math.sin(t * .07 + this.ph), desL = 32;
    const T = this.target && states.get(this.target);
    if (!duel && T && T.flying) {
      const m = this.aimTail && T.te
        ? [(T.k[0] + T.te[0]) / 2, (T.k[1] + T.te[1]) / 2, (T.k[2] + T.te[2]) / 2]
        : [T.hand[0] + (T.k[0] - T.hand[0]) * .65, T.hand[1] + (T.k[1] - T.hand[1]) * .65, T.hand[2] + (T.k[2] - T.hand[2]) * .65];
      const dx = m[0] - this.hand[0], dz = m[2] - this.hand[2];
      desAz = wrap(Math.atan2(dx, dz) - windAz) + Math.sin(t * .9 + this.ph) * .3;
      desL = cl(Math.hypot(Math.hypot(dx, dz), m[1] - this.hand[1]) + 5, 12, 90);
    }
    // rabiola presa: quem foi preso foge pro lado (estica a rabiola); quem prendeu tenta encostar a linha
    if (duel && duel.kind === 'rabiola') {
      if (duel.att !== this.id) {
        if (!this.escDir) this.escDir = Math.random() < .5 ? -1 : 1;
        desAz = this.az + this.escDir * .9; desL = this.L + 4;
      } else {
        const V = states.get(duel.a === this.id ? duel.b : duel.a);
        if (V) {
          const m = [V.hand[0] + (V.k[0] - V.hand[0]) * .6, V.hand[1] + (V.k[1] - V.hand[1]) * .6, V.hand[2] + (V.k[2] - V.hand[2]) * .6];
          desAz = wrap(Math.atan2(m[0] - this.hand[0], m[2] - this.hand[2]) - windAz);
        }
      }
    } else this.escDir = 0;
    desAz = cl(desAz, -1.1, 1.1);
    const turn = .35 * this.skill;
    this.az += cl(desAz - this.az, -turn * dt, turn * dt);
    if (this.flying) this.L += cl(desL - this.L, -3 * dt, 3 * dt);
    this.el += cl((.85 + .12 * Math.sin(t * .31 + this.ph)) * Math.min(1, W.speed / 5) - this.el, -.3 * dt, .3 * dt);

    const a = windAz + this.az, ce = Math.cos(this.el);
    const u = [Math.sin(a) * ce, Math.sin(this.el), Math.cos(a) * ce];
    this.k = [this.hand[0] + u[0] * this.L, this.hand[1] + u[1] * this.L, this.hand[2] + u[2] * this.L];
    this.T = (1.5 + W.speed * .6) * (.8 + .2 * Math.sin(t * 2 + this.ph));
    // orientação da pipa: de frente para o bot, bico pra cima, balançando
    this.tilt = Math.sin(t * 1.4 + this.ph) * .25 + (desAz - this.az) * .8 + (this.shake ? Math.sin(t * 12) * .6 : 0);
    let up = norm([-u[0] * u[1], 1 - u[1] * u[1], -u[2] * u[1]]);
    const right = norm(cross(u, up));
    const nose = norm([up[0] * Math.cos(this.tilt) + right[0] * Math.sin(this.tilt), up[1] * Math.cos(this.tilt) + right[1] * Math.sin(this.tilt), up[2] * Math.cos(this.tilt) + right[2] * Math.sin(this.tilt)]);
    const z = [-u[0], -u[1], -u[2]];
    this.q = quatFromBasis(norm(cross(nose, z)), nose, z);
    this.yaw = Math.atan2(this.k[0] - this.hand[0], this.k[2] - this.hand[2]);
    this.te = this.n > 0 ? tailEndFromWind(this.k, W, this.n) : null;

    // tática na enroscada: puxadas em rajadas, administrando o fôlego
    if (duel) {
      this.pullT -= dt;
      if (this.pullT <= 0) {
        this.pull = this.sta > .35 && Math.random() < .55 * this.skill;
        this.give = !this.pull && Math.random() < .5;
        this.pullT = rnd(.6, 1.6);
      }
      // rabiola presa: sacode a pipa de um lado pro outro
      const victim = duel.kind === 'rabiola' && duel.att !== this.id;
      this.shakeT -= dt;
      if (victim && this.shakeT <= 0) { this.shake = Math.random() < .6 * this.skill; this.shakeT = .4; }
      if (!victim) this.shake = false;
    } else { this.pull = false; this.give = false; this.shake = false; }
    this.sta = this.pull ? Math.max(0, this.sta - .4 * dt) : Math.min(1, this.sta + .25 * dt);
  }
  state() {
    return {
      pos: [...this.pos], yaw: this.yaw, mv: this.mv, hand: this.hand, k: this.k, q: this.q, L: this.L,
      T: this.T, breakN: 30, st: this.flying ? 'voando' : this.onBack > 0 ? 'costas' : 'arrebentou', flying: this.flying,
      pull: this.pull, give: this.give, sta: this.sta, te: this.te, n: this.n, shake: this.shake,
    };
  }
}

export class LocalSession {
  constructor(me, nBots = 3) {
    this.myId = 'eu';
    this.label = 'Contra a molecada';
    this.arena = new Arena(DISPUTA_WIND);
    this.wind = DISPUTA_WIND;
    this.t = 0;
    this.events = [];
    this.others = new Map();
    this.bots = [];
    this.myState = null;
    this.arena.addPlayer('eu', me);
    this.round = { state: 'playing', endsAt: DUEL.roundTime };
    const bases = [[-12, 18], [13, 20], [5, 28], [-6, 30]];
    const names = [...BOT_NAMES].sort(() => Math.random() - .5);
    for (let i = 0; i < nBots; i++) {
      const type = KITE_ORDER[Math.floor(Math.random() * KITE_ORDER.length)];
      const meta = {
        name: names[i], style: { ...PRESETS[Math.floor(Math.random() * PRESETS.length)].style },
        kite: { type, pat: Math.floor(Math.random() * getPatterns(type).length) },
      };
      const b = new Bot('b' + i, meta, bases[i % bases.length]);
      this.bots.push(b);
      this.arena.addPlayer(b.id, meta);
      this.others.set(b.id, { meta, state: null });
    }
    this.strays = []; this.duels = []; this.scores = this.arena.scores();
  }
  time() { return this.t; }
  sendState(st) { this.myState = st; this.arena.setState('eu', st); }
  update(dt) {
    this.t += dt;
    const W = windState(this.t, this.wind.base, this.wind.gust);
    const states = new Map([['eu', this.myState]]);
    for (const b of this.bots) states.set(b.id, this.others.get(b.id).state);
    for (const b of this.bots) {
      b.update(dt, this.t, W, this.arena, states);
      const s = b.state();
      this.arena.setState(b.id, s);
      this.others.get(b.id).state = s;
    }
    if (this.t >= this.round.endsAt) {
      if (this.round.state === 'playing') this.round = { state: 'pause', endsAt: this.t + DUEL.pauseTime };
      else { this.arena.resetRound(); this.round = { state: 'playing', endsAt: this.t + DUEL.roundTime }; }
      this.events.push({ type: 'round', round: this.round, scores: this.arena.scores() });
    }
    if (this.round.state === 'playing') {
      const ev = this.arena.update(dt, this.t);
      for (const e of ev) {
        if (e.type === 'duelEnd') { const b = this.bots.find(x => x.id === e.loser); if (b) { b.flying = false; b.respawn = 2; } }
        this.events.push(e);
      }
    }
    this.strays = this.arena.strays;
    this.duels = this.arena.duels;
    this.scores = this.arena.scores();
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
  nameOf(id) { return id === this.myId ? 'Você' : (this.others.get(id)?.meta.name || '?'); }
  close() { }
}
