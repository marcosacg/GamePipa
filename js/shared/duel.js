// Arena de disputa: detecta linhas que se cruzam (enroscada), resolve o cabo de guerra
// e controla as pipas avoadas. Roda no servidor (online) e no navegador (contra bots).
// Linha comum, sem cerol: vence quem segura a enroscada; a linha de quem perde arrebenta de tanto esforço.

import { windState } from './wind.js';

export const DUEL = {
  touch: 1.2,        // distância (m) entre as linhas para enroscar
  minFrac: 0.12,     // não enrosca colado na mão...
  maxFrac: 0.97,     // ...nem exatamente na pipa
  minLine: 8,        // linha mínima para entrar em disputa
  maxTime: 15,       // depois disso as linhas desenroscam (empate)
  speed: 0.45,       // velocidade do cabo de guerra
  cooldown: 4,       // tempo até o mesmo par poder enroscar de novo
  catchDist: 1.8,    // distância para aparar uma avoada com a linha
  tailTouch: 1.4,    // distância da linha até a rabiola do outro para "pegar a rabiola"
  aparadaBonus: 50,  // rabiola presa + linhas encostando: quem prendeu ganha na hora e ainda apara a pipa
  slideRate: 0.45,   // quanto a rabiola escorrega por metro esticado, por segundo
  shakeSlide: 0.15,  // sacudir (A/D) ajuda a rabiola a escorregar
  snagTime: 25,      // tempo máximo com a rabiola presa (depois ela escapa sozinha)
  roundTime: 240,    // duração da rodada (s)
  pauseTime: 12,     // intervalo entre rodadas (s)
  maxPlayers: 8,
  lostTime: 2.2,     // quem perdeu fica "laçado" (sem pipa) esse tempo, para todo mundo ver
};

export const KITE_TYPES = ['pipa', 'raia', 'capucheta', 'bico', 'quadrada'];

// versão das regras/mensagens: se o servidor rodando for mais velho que os arquivos, o jogo avisa
export const PROTOCOL = 7; // 7: salas guardam o cenário (campinho, laje, morro)
export const SCENES = ['campinho', 'laje', 'morro'];

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

/** Pontos mais próximos entre os segmentos p1→q1 e p2→q2. */
export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; }
  else if (a <= EPS) { s = 0; t = cl(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= EPS) { t = 0; s = cl(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? cl((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = cl(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = cl((b - c) / a, 0, 1); }
    }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  const dd = sub(c1, c2);
  return { d: Math.sqrt(dot(dd, dd)), s, t, c1, c2 };
}

export function pointSeg(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const t = cl(dot(ap, ab) / (dot(ab, ab) || 1), 0, 1);
  const c = [a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]];
  return Math.sqrt(dot(c, c));
}

/** trecho da rabiola de um jogador: do pé da pipa até a ponta (te) */
export function tailSeg(s) {
  if (!s || !s.te || !(s.n > 0)) return null;
  return [[s.k[0], s.k[1] - 0.6, s.k[2]], s.te];
}

/** ponta da rabiola "estimada" a partir do vento (bots e quem não manda te) */
export function tailEndFromWind(k, W, n) {
  return [k[0] + W.dx * 0.32 * n, k[1] - 0.6 - 0.36 * n, k[2] + W.dz * 0.32 * n];
}

/**
 * Força de um jogador na enroscada.
 * - linha firme (tensão) ajuda
 * - puxar (W) ajuda muito, mas gasta fôlego
 * - dar linha (S) faz o "relo" e também ajuda
 * - pipa por cima da outra leva vantagem
 * role: 'att' = a minha linha pegou a rabiola dele (vantagem)
 *       'vic' = a rabiola é que foi pega (dar linha quase não adianta; sacudir com A/D ajuda)
 */
export function duelPower(p, o, role = null) {
  let pw = 0.4 + 0.8 * cl((p.T || 0) / (p.breakN || 30), 0, 1);
  if (p.pull && (p.sta || 0) > 0.02) pw += role === 'att' ? 1.3 : 0.9;
  if (p.give) pw += role === 'vic' ? 0.2 : 0.55;
  if (role === 'vic' && p.shake) pw += 0.5;
  if (role === 'att') pw += 0.45;
  if (p.k[1] > o.k[1] + 2) pw += 0.35;
  return pw;
}

/** a linha de X encostou na rabiola de Y? */
function lineOnTail(X, Y, tol) {
  const ts = tailSeg(Y.s);
  if (!ts) return null;
  const r = segSeg(X.s.hand, X.s.k, ts[0], ts[1]);
  return r.d < tol && r.s > DUEL.minFrac && r.s < 0.995 ? r : null;
}

export class Arena {
  constructor({ windBase = 6.2, windGust = 0.45 } = {}) {
    this.players = new Map();
    this.duels = [];
    this.strays = [];
    this.cool = new Map();
    this.sid = 1;
    this.ambient = 15;
    this.windBase = windBase;
    this.windGust = windGust;
    this._w = {};
  }

  addPlayer(id, meta) {
    this.players.set(id, { id, name: meta.name, kite: meta.kite, s: null, score: 0, lacadas: 0, aparadas: 0 });
  }
  setState(id, s) { const p = this.players.get(id); if (p) p.s = s; }
  removePlayer(id) { this.players.delete(id); }
  inDuel(id) { return this.duels.some(d => d.a === id || d.b === id); }
  /** perdeu uma enroscada há pouco (a pipa dele está avoada) */
  isLost(id) { const p = this.players.get(id); return !!(p && p.lostUntil > (this.t || 0)); }

  resetRound() {
    for (const p of this.players.values()) { p.score = 0; p.lacadas = 0; p.aparadas = 0; p.lostUntil = 0; }
    this.duels = []; this.strays = []; this.cool.clear(); this.ambient = 10;
  }

  spawnStray(pos, kite, owner = null) {
    this.strays.push({ id: this.sid++, p: [pos[0], pos[1], pos[2]], ph: Math.random() * 6.28, age: 0, kite, owner });
  }

  scores() {
    return [...this.players.values()]
      .map(p => ({ id: p.id, name: p.name, score: p.score, lacadas: p.lacadas, aparadas: p.aparadas }))
      .sort((a, b) => b.score - a.score);
  }

  /** Avança a simulação. t = tempo da sala (para o vento). Retorna lista de eventos. */
  update(dt, t) {
    const ev = [];
    this.t = t;
    const W = windState(t, this.windBase, this.windGust, this._w);
    const flying = p => !!(p && p.s && p.s.flying && !(p.lostUntil > t));

    for (const [k, v] of this.cool) { const nv = v - dt; if (nv <= 0) this.cool.delete(k); else this.cool.set(k, nv); }

    // enroscadas em andamento
    for (let i = this.duels.length - 1; i >= 0; i--) {
      const d = this.duels[i];
      const A = this.players.get(d.a), B = this.players.get(d.b);
      /* aparada = true: a rabiola do perdedor estava presa na linha do vencedor quando as linhas encostaram.
         Ele perde na hora e a pipa dele não vira avoada: fica pendurada pela rabiola na linha de quem ganhou. */
      const end = (w, l, aparada = false) => {
        this.duels.splice(i, 1);
        this.cool.set(key(d.a, d.b), DUEL.cooldown);
        if (w) {
          const Wp = this.players.get(w), Lp = this.players.get(l);
          if (Wp) { Wp.score += 100; Wp.lacadas++; if (aparada) { Wp.score += DUEL.aparadaBonus; Wp.aparadas++; } }
          if (Lp) Lp.lostUntil = t + DUEL.lostTime;
          if (!aparada && Lp && Lp.s && Lp.s.k[1] > 2) this.spawnStray(Lp.s.k, Lp.kite, l);
          ev.push({ type: 'duelEnd', winner: w, loser: l, x: d.x, kind: d.kind, aparada,
            k: Lp && Lp.s ? Lp.s.k.slice() : null, kite: Lp ? Lp.kite : null });
        } else ev.push({ type: 'duelDraw', a: d.a, b: d.b });
      };
      if (!A || !B) { end(null); continue; }
      const fa = flying(A), fb = flying(B);
      if (d.kind === 'rabiola') {
        /*
          RABIOLA PRESA: ninguém perde só por isso.
          - Se as LINHAS também se encostarem, quem teve a rabiola presa PERDE NA HORA
            e a pipa dele fica pendurada (aparada) na linha de quem prendeu.
          - Se a vítima afastar a pipa da linha do outro, a rabiola estica e vai escorregando até soltar.
        */
        if (!fa || !fb) { end(null); continue; } // alguém caiu por conta própria: só desprende
        const att = d.att === d.a ? A : B, vic = d.att === d.a ? B : A;
        const ts = tailSeg(vic.s);
        if (!ts) { end(null); continue; }
        const rl = segSeg(A.s.hand, A.s.k, B.s.hand, B.s.k);
        if (rl.d < DUEL.touch && rl.s > DUEL.minFrac && rl.s < DUEL.maxFrac && rl.t > DUEL.minFrac && rl.t < DUEL.maxFrac) {
          d.x = [(rl.c1[0] + rl.c2[0]) / 2, (rl.c1[1] + rl.c2[1]) / 2, (rl.c1[2] + rl.c2[2]) / 2];
          end(att.id, vic.id, true);
          continue;
        }
        const tv = sub(ts[1], ts[0]);
        const tl = Math.max(.5, Math.sqrt(dot(tv, tv)));
        // ponto da rabiola que está preso (fração d.f do pé da pipa até a ponta), segurado na linha de quem prendeu
        const pf = [ts[0][0] + tv[0] * d.f, ts[0][1] + tv[1] * d.f, ts[0][2] + tv[2] * d.f];
        const ab = sub(att.s.k, att.s.hand), u = cl(dot(sub(pf, att.s.hand), ab) / (dot(ab, ab) || 1), 0, 1);
        d.x = [att.s.hand[0] + ab[0] * u, att.s.hand[1] + ab[1] * u, att.s.hand[2] + ab[2] * u];
        // esticou? distância da pipa até a linha do outro maior que o pedaço de rabiola até o ponto preso
        const reach = pointSeg(vic.s.k, att.s.hand, att.s.k);
        const held = .6 + d.f * tl;
        d.stretch = cl((reach - held) / 2, 0, 1);
        const slide = (Math.max(0, reach - held) * DUEL.slideRate + (vic.s.shake ? DUEL.shakeSlide * tl : 0)) * dt / tl;
        d.f = Math.min(1, d.f + slide);
        d.t += dt;
        if (d.f >= .98 || d.t > DUEL.snagTime) {
          this.duels.splice(i, 1);
          this.cool.set(key(d.a, d.b), DUEL.cooldown);
          ev.push({ type: 'tailFree', a: d.a, b: d.b, att: d.att, vic: vic.id, x: d.x });
        }
        continue;
      }
      if (!fa || !fb) { if (fa) end(d.a, d.b); else if (fb) end(d.b, d.a); else end(null); continue; }
      {
        const r = segSeg(A.s.hand, A.s.k, B.s.hand, B.s.k);
        d.x = [(r.c1[0] + r.c2[0]) / 2, (r.c1[1] + r.c2[1]) / 2, (r.c1[2] + r.c2[2]) / 2];
        // durante a enroscada de linha, encostar na rabiola do outro dá vantagem
        const ta = lineOnTail(A, B, DUEL.tailTouch * 1.3), tb = lineOnTail(B, A, DUEL.tailTouch * 1.3);
        d.att = ta && !tb ? d.a : tb && !ta ? d.b : null;
        // linha com linha E a linha pegou a rabiola do outro: ele perde na hora (e a pipa dele é aparada)
        if (d.att) { end(d.att, d.att === d.a ? d.b : d.a, true); continue; }
      }
      const roleA = d.att === d.a ? 'att' : d.att === d.b ? 'vic' : null;
      const roleB = d.att === d.b ? 'att' : d.att === d.a ? 'vic' : null;
      d.t += dt;
      d.prog = cl(d.prog + (duelPower(A.s, B.s, roleA) - duelPower(B.s, A.s, roleB)) * dt * DUEL.speed, -1, 1);
      if (d.prog >= 1) end(d.a, d.b);
      else if (d.prog <= -1) end(d.b, d.a);
      else if (d.t > DUEL.maxTime) end(null);
    }

    // novas enroscadas
    const list = [...this.players.values()].filter(p => flying(p) && p.s.L >= DUEL.minLine);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (this.inDuel(A.id) || this.inDuel(B.id) || this.cool.has(key(A.id, B.id))) continue;
        // 1) linha na rabiola do outro: a rabiola fica presa (ainda sem disputa)
        let rt = lineOnTail(A, B, DUEL.tailTouch), att = A;
        if (!rt) { rt = lineOnTail(B, A, DUEL.tailTouch); att = B; }
        if (rt) {
          this.duels.push({ a: A.id, b: B.id, prog: 0, t: 0, x: rt.c2, kind: 'rabiola', att: att.id, f: Math.max(.05, rt.t), stretch: 0 });
          ev.push({ type: 'duelStart', a: A.id, b: B.id, x: rt.c2, kind: 'rabiola', att: att.id });
          continue;
        }
        // 2) linha com linha
        const r = segSeg(A.s.hand, A.s.k, B.s.hand, B.s.k);
        if (r.d < DUEL.touch && r.s > DUEL.minFrac && r.s < DUEL.maxFrac && r.t > DUEL.minFrac && r.t < DUEL.maxFrac) {
          const x = [(r.c1[0] + r.c2[0]) / 2, (r.c1[1] + r.c2[1]) / 2, (r.c1[2] + r.c2[2]) / 2];
          this.duels.push({ a: A.id, b: B.id, prog: 0, t: 0, x, kind: 'linha', att: null });
          ev.push({ type: 'duelStart', a: A.id, b: B.id, x, kind: 'linha', att: null });
        }
      }
    }

    // pipas avoadas: descem com o vento; quem encostar a linha apara
    for (let i = this.strays.length - 1; i >= 0; i--) {
      const s = this.strays[i];
      s.age += dt;
      const hf = 0.75 + 0.25 * cl(s.p[1] / 30, 0, 1);
      s.p[0] += (W.dx * W.speed * 0.8 * hf + Math.sin(t * 1.3 + s.ph) * 0.8) * dt;
      s.p[1] -= 0.9 * dt;
      s.p[2] += W.dz * W.speed * 0.8 * hf * dt;
      const gy = this.groundAt ? this.groundAt(s.p[0], s.p[2]) : 0; // chão/telhado do cenário
      if (s.p[1] < gy + 0.5 || s.age > 70) { this.strays.splice(i, 1); continue; }
      if (s.age < 1.2) continue;
      for (const p of this.players.values()) {
        if (!flying(p) || (s.owner === p.id && s.age < 2.2)) continue; // até o dono pode aparar de volta
        if (pointSeg(s.p, p.s.hand, p.s.k) < DUEL.catchDist) {
          p.score += 50; p.aparadas++;
          ev.push({ type: 'catch', id: s.id, by: p.id, p: s.p.slice(), kite: s.kite });
          this.strays.splice(i, 1);
          break;
        }
      }
    }

    // de vez em quando passa uma avoada de outro bairro
    if (this.players.size) {
      this.ambient -= dt;
      if (this.ambient <= 0) {
        this.ambient = 20 + Math.random() * 15;
        let cx = 0, cy = 0, cz = 0, n = 0;
        for (const p of this.players.values()) if (p.s) { cx += p.s.hand[0]; cy += p.s.hand[1]; cz += p.s.hand[2]; n++; }
        if (n) {
          cx /= n; cy /= n; cz /= n;
          const side = (Math.random() - 0.5) * 40;
          const pos = [cx - W.dx * 55 - W.dz * side, cy + 28 + Math.random() * 17, cz - W.dz * 55 + W.dx * side]; // acima de quem está jogando (laje, morro...)
          const type = KITE_TYPES[Math.floor(Math.random() * KITE_TYPES.length)];
          this.spawnStray(pos, { type, pat: Math.floor(Math.random() * 3) }, null);
          ev.push({ type: 'strayIn' });
        }
      }
    }
    return ev;
  }
}
