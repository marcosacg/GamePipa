// Arena de disputa: detecta linhas que se cruzam (enroscada), resolve o cabo de guerra
// e controla as pipas avoadas. Roda no servidor (online) e no navegador (contra bots).
// Corte como linha com cerol: cruzou, quem passar a linha mais rápido no cruzamento (puxada forte, pipa correndo,
// relo) corta a do outro em fração de segundo. Quem fica parado é cortado.
// As linhas têm barriga (js/shared/linha.js): o enrosco é calculado no formato que aparece na tela.

import { windState, noise1 } from './wind.js';
import { lineShape, polyPoly, pointPoly, strayTrail, heightWind, POLY_N } from './linha.js';

export const DUEL = {
  touch: 1.2,        // distância (m) entre as linhas para enroscar
  minFrac: 0.12,     // não enrosca colado na mão...
  maxFrac: 0.97,     // ...nem exatamente na pipa
  minLine: 8,        // linha mínima para entrar em disputa
  maxTime: 5,        // ninguém mexeu a linha: depois disso elas desenroscam (empate)
  speed: 2.2,        // rapidez do corte (cerol): puxada contra quem está parado corta em ~0,3 s
  centro: 0.6,       // os dois parados (ou empatados): o corte volta pro meio
  folego: 2,         // segurar a mesma tecla rende 100% por esse tempo (s)...
  cansa: 2.5,        // ...e depois cai até 60%
  manobra: 0.1,      // linha passando rápido no cruzamento (pipa correndo) corta: +0,1 por m/s (até 15 m/s)
  // puxada rápida = puxar (W) com a pipa correndo mais que isso (m/s): corta rabiola presa ou pendurada
  rapida: 7,
  rasga: 0.55,       // quão rápido a rabiola corta na puxada rápida (por m/s acima do limite, por segundo)
  // pipa aparada pendurada na linha (não some): escorrega até a mão de quem aparou
  desce: 0.5,        // m/s que ela escorrega sozinha
  desceRecolhendo: 3,// m/s segurando Espaço (recolher)
  guarda: 3,         // a esta distância da mão (m) ela fica guardada
  guardaBonus: 50,   // pontos por trazer a aparada até a mão
  toqueAparada: 1.3, // linha de outro jogador a essa distância da pipa pendurada corta a rabiola (vira avoada)
  linhaLonga: 0.25,  // linha muito comprida responde mais devagar (até -25% na puxada/relo, de 35 m a 100 m)
  cortaRabiola: 9,   // linha passando na rabiola com a pipa a mais que isso (m/s), ou na puxada rápida: o cerol corta a rabiola
  cooldown: 4,       // tempo até o mesmo par poder enroscar de novo
  catchDist: 1.8,    // distância para aparar uma avoada com a linha
  tailTouch: 1.4,    // distância da linha até a rabiola do outro para "pegar a rabiola"
  aparadaBonus: 50,  // rabiola presa + linhas encostadas por 1 s: quem prendeu ganha e ainda apara a pipa
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
export const PROTOCOL = 14; // 14: corte no ponto exato (sid/tl no duelEnd), avoada com física · 13: rabiola: cerol corta passando rápido; presa + linhas cruzadas = corte normal (sem contagem)
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
 * Força de corte de um jogador agora (P = jogador da arena, com P.s = estado e P.ks = velocidade da pipa).
 * - puxada (W) é o golpe mais forte, mas gasta fôlego
 * - dar linha (S) é o "relo": quase tão forte quanto
 * - segurar a mesma tecla perde força depois de 1,5 s: o certo é alternar puxada e relo
 * - passar a pipa rápido pela linha do outro soma (manobra)
 * - linha muito comprida responde mais devagar (não adianta só ficar longe)
 * h = { p, g }: há quanto tempo ele está segurando a puxada / o relo
 */
const fresh = hold => cl(1 - (hold - DUEL.folego) / DUEL.cansa, 0.6, 1);
export function duelPower(P, h = null) {
  const p = P.s || P;
  const resp = 1 - DUEL.linhaLonga * cl(((p.L || 0) - 35) / 65, 0, 1);
  let pw = 0;
  if (p.pull && (p.sta || 0) > 0.02) pw += 1.0 * resp * fresh(h ? h.p : 0);
  else if (p.give) pw += 0.6 * resp * fresh(h ? h.g : 0); // relo corta menos que a puxada
  pw += DUEL.manobra * Math.min(15, P.ks || 0);
  return pw;
}
/** puxada rápida agora? devolve quanto passou do limite (0 = não) */
export function fastPull(P) {
  const p = P && P.s;
  if (!p || !p.pull || !((p.sta || 0) > 0.02)) return 0;
  return Math.max(0, (P.ks || 0) - DUEL.rapida);
}
/** ponto da polilinha na fração f (0 = mão, 1 = pipa) */
/** comprimento da linha do jogador P do ponto x até a pipa (ao longo da linha com barriga) */
function cutLen(P, x) {
  const A = P.poly;
  if (!A || !x) return 0;
  const u = pointPoly(x, A).u, n = A.length - 1;
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = A[i], b = A[i + 1], sl = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const s0 = i / n, s1 = (i + 1) / n;
    if (s1 <= u) continue;
    L += sl * (s0 >= u ? 1 : (s1 - u) * n);
  }
  return L;
}
/*
  Avoada com física (sem balanço de enfeite): massa no ar, arrastada pelo vento (que muda com a altura e
  tem rajadas), sustentação que vai e volta conforme a pipa rodopia, peso da pipa + o pedaço de linha.
  Começa com a velocidade que a pipa tinha na hora do corte (ela "escapa" e depois vai com o vento).
*/
const STRAY = { massa: .16, arrasto: .9, linhaKg: .0004 };
function strayStep(s, W, t, dt) {
  const v = s.v || (s.v = [0, 0, 0]);
  const hf = heightWind(s.p[1]), g1 = noise1(t * .9 + s.ph * 7), g2 = noise1(t * 1.3 + s.ph * 5 + 11), g3 = noise1(t * .6 + s.ph * 3 + 29);
  const ws = W.speed * hf * .82 * (1 + .25 * g1); // a linha que ela arrasta segura um pouco
  const wx = W.dx * ws - W.dz * ws * .35 * g2, wz = W.dz * ws + W.dx * ws * .35 * g2;
  const peso = 9.81 * (1 + Math.min(80, s.tl || 0) * STRAY.linhaKg / STRAY.massa);
  const sust = 9.81 * (.9 + .3 * g3);                   // o pano rodopiando ora segura, ora não
  const k = STRAY.arrasto;
  v[0] += (k * (wx - v[0])) * dt;
  v[1] += (k * (0 - v[1]) * 1.4 + sust - peso) * dt;
  v[2] += (k * (wz - v[2])) * dt;
  s.p[0] += v[0] * dt; s.p[1] += v[1] * dt; s.p[2] += v[2] * dt;
}

function polyAt(A, f) {
  const n = A.length - 1, x = cl(f, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), u = x - i;
  return [A[i][0] + (A[i + 1][0] - A[i][0]) * u, A[i][1] + (A[i + 1][1] - A[i][1]) * u, A[i][2] + (A[i + 1][2] - A[i][2]) * u];
}

/** atualiza o "cansaço" das teclas de um jogador na enroscada */
function holdStep(h, s, dt) {
  const pulling = s.pull && (s.sta || 0) > 0.02;
  h.p = pulling ? h.p + dt : Math.max(0, h.p - 2 * dt);
  h.g = s.give && !pulling ? h.g + dt : Math.max(0, h.g - 2 * dt);
}

/** a linha de X encostou na rabiola de Y? (r.s = onde na linha de X, r.t = onde na rabiola) */
function lineOnTail(X, Y, tol) {
  const ts = tailSeg(Y.s);
  if (!ts || !X.poly) return null;
  const r = polyPoly(X.poly, ts, tol * 2);
  return r.d < tol && r.s > DUEL.minFrac && r.s < 0.995 ? r : null;
}
/** linha de A x linha de B */
const lineLine = (A, B) => polyPoly(A.poly, B.poly, DUEL.touch * 3);

export class Arena {
  constructor({ windBase = 6.2, windGust = 0.45 } = {}) {
    this.players = new Map();
    this.duels = [];
    this.strays = [];
    this.hangs = [];   // pipas aparadas penduradas na linha de alguém (pela rabiola)
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
    this.duels = []; this.strays = []; this.hangs = []; this.cool.clear(); this.ambient = 10;
  }

  /** tl = pedaço de linha que a avoada vai arrastando (m) */
  spawnStray(pos, kite, owner = null, tl = 0, v = null) {
    const s = { id: this.sid++, p: [pos[0], pos[1], pos[2]], v: v ? v.slice() : [0, 0, 0], ph: Math.random() * 6.28, age: 0, kite, owner, tl: cl(tl, 0, 80), trail: [] };
    this.strays.push(s);
    return s;
  }

  /** pendura a pipa (kite) na linha de "by", na fração f; why = 'aparada' (rabiola) ou 'catch' (avoada) */
  hang(by, kite, f, owner, from, why, ev, tl = 8) {
    const h = { id: this.sid++, by, kite, f: cl(f, 0.05, 0.98), owner, age: 0, rip: 0 };
    this.hangs.push(h);
    ev.push({ type: 'hang', id: h.id, by, kite, f: h.f, owner, from: from ? from.slice() : null, why, tl: h.tl = tl });
    return h;
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
    // formato de cada linha agora (com barriga) e a velocidade de cada pipa (para a manobra no corte)
    for (const p of this.players.values()) {
      if (!(p.s && p.s.hand && p.s.k)) continue;
      p.poly = lineShape(p.s.hand, p.s.k, p.s.L || 0, W.dx, W.dz, POLY_N, p.poly || []);
      if (p.lastK && t - p.lastKT > 0.03) {
        const v = Math.hypot(p.s.k[0] - p.lastK[0], p.s.k[1] - p.lastK[1], p.s.k[2] - p.lastK[2]) / (t - p.lastKT);
        p.ks = (p.ks || 0) * 0.6 + Math.min(40, v) * 0.4;
        const it = 1 / (t - p.lastKT), kv = p.kv || (p.kv = [0, 0, 0]);
        for (let q = 0; q < 3; q++) kv[q] = kv[q] * 0.5 + cl((p.s.k[q] - p.lastK[q]) * it, -30, 30) * 0.5;
      }
      if (!p.lastK || t - p.lastKT > 0.03) { p.lastK = p.s.k.slice(); p.lastKT = t; }
    }

    // enroscadas em andamento
    for (let i = this.duels.length - 1; i >= 0; i--) {
      const d = this.duels[i];
      const A = this.players.get(d.a), B = this.players.get(d.b);
      /* aparada = a rabiola do perdedor estava presa na linha de quem ganhou o corte: a pipa dele não sai
         avoada, fica pendurada pela rabiola na linha do vencedor. */
      const end = (w, l, aparada = false) => {
        if (d.pr && w === d.att) aparada = true;
        this.duels.splice(i, 1);
        this.cool.set(key(d.a, d.b), DUEL.cooldown);
        if (w) {
          const Wp = this.players.get(w), Lp = this.players.get(l);
          if (Wp) { Wp.score += 100; Wp.lacadas++; if (aparada) { Wp.score += DUEL.aparadaBonus; Wp.aparadas++; } }
          if (Lp) Lp.lostUntil = t + DUEL.lostTime;
          // a linha dele corta EXATAMENTE no ponto do cruzamento: o pedaço do corte até a pipa vai com ela
          const tl = Lp && Lp.s ? cutLen(Lp, d.x) : 0;
          let sid = null;
          if (!aparada && Lp && Lp.s && Lp.s.k[1] > 2) sid = this.spawnStray(Lp.s.k, Lp.kite, l, Math.max(2, tl), Lp.kv).id;
          ev.push({ type: 'duelEnd', winner: w, loser: l, x: d.x, kind: d.kind, aparada, sid, tl,
            k: Lp && Lp.s ? Lp.s.k.slice() : null, kite: Lp ? Lp.kite : null });
          // aparada: a pipa dele fica pendurada pela rabiola na linha de quem ganhou (e não some)
          if (aparada && Wp && Wp.poly && Lp) this.hang(w, Lp.kite, pointPoly(d.tx || d.x || Wp.s.k, Wp.poly).u, l, Lp.s ? Lp.s.k : d.x, 'aparada', ev, Math.max(2, tl));
        } else ev.push({ type: 'duelDraw', a: d.a, b: d.b });
      };
      if (!A || !B) { end(null); continue; }
      const fa = flying(A), fb = flying(B);
      if (d.kind === 'rabiola') {
        /*
          RABIOLA PRESA (enroscou devagar): a pipa presa é arrastada pela linha do outro.
          - Escapa esticando/sacudindo (a rabiola escorrega até soltar pela ponta) ou cortando a rabiola com puxada rápida.
          - Se as LINHAS se cruzarem, vira corte normal (cerol). Se a presa for cortada, fica pendurada pela rabiola
            na linha de quem cortou (aparada); se quem prendeu for cortado, a outra escapa.
        */
        if (!fa || !fb) { end(null); continue; } // alguém caiu por conta própria: só desprende
        const att = d.att === d.a ? A : B, vic = d.att === d.a ? B : A;
        const ts = tailSeg(vic.s);
        if (!ts) { end(null); continue; }
        const rl = lineLine(A, B);
        if (rl.d < DUEL.touch && rl.s > DUEL.minFrac * .5 && rl.s < .99 && rl.t > DUEL.minFrac * .5 && rl.t < .99) {
          d.kind = 'linha'; d.pr = true; d.tx = d.x; d.prog = 0; d.t = 0;
          d.x = [(rl.c1[0] + rl.c2[0]) / 2, (rl.c1[1] + rl.c2[1]) / 2, (rl.c1[2] + rl.c2[2]) / 2];
          ev.push({ type: 'duelStart', a: d.a, b: d.b, x: d.x, kind: 'linha', att: d.att, pr: true });
          continue;
        }
        // puxada rápida (de qualquer um dos dois) com a rabiola presa: a linha corta a rabiola no ponto preso
        const rr = fastPull(att) + fastPull(vic);
        d.rip = rr > 0 ? (d.rip || 0) + rr * DUEL.rasga * dt : Math.max(0, (d.rip || 0) - dt);
        if (d.rip >= 1) {
          this.duels.splice(i, 1);
          this.cool.set(key(d.a, d.b), DUEL.cooldown);
          ev.push({ type: 'tailCut', a: d.a, b: d.b, att: att.id, vic: vic.id, x: d.x, f: d.f, by: fastPull(att) >= fastPull(vic) ? att.id : vic.id });
          continue;
        }
        const tv = sub(ts[1], ts[0]);
        const tl = Math.max(.5, Math.sqrt(dot(tv, tv)));
        // ponto da rabiola que está preso (fração d.f do pé da pipa até a ponta), segurado na linha de quem prendeu
        const pf = [ts[0][0] + tv[0] * d.f, ts[0][1] + tv[1] * d.f, ts[0][2] + tv[2] * d.f];
        d.x = pointPoly(pf, att.poly).c;
        // esticou? distância da pipa até a linha do outro maior que o pedaço de rabiola até o ponto preso
        const reach = pointPoly(vic.s.k, att.poly).d;
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
        const r = lineLine(A, B);
        d.x = [(r.c1[0] + r.c2[0]) / 2, (r.c1[1] + r.c2[1]) / 2, (r.c1[2] + r.c2[2]) / 2];
        // rabiola presa que virou corte: o ponto preso continua na linha de quem prendeu
        if (d.pr) { const P = d.att === d.a ? A : B; if (P.poly && d.tx) d.tx = pointPoly(d.tx, P.poly).c; }
      }
      d.t += dt;
      d.ha = d.ha || { p: 0, g: 0 }; d.hb = d.hb || { p: 0, g: 0 };
      holdStep(d.ha, A.s, dt); holdStep(d.hb, B.s, dt);
      // corte: quem está mexendo mais a linha avança; parados, volta pro meio
      d.prog = cl(d.prog + ((duelPower(A, d.ha) - duelPower(B, d.hb)) * DUEL.speed - DUEL.centro * d.prog) * dt, -1, 1);
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
          const vic = att === A ? B : A;
          if (fastPull(att) > 0 || (att.ks || 0) > DUEL.cortaRabiola) {
            // a linha passou rápido: o cerol corta a rabiola ali mesmo e o pedaço cai
            this.cool.set(key(A.id, B.id), 1.5);
            ev.push({ type: 'tailCut', a: A.id, b: B.id, att: att.id, vic: vic.id, x: rt.c2, f: Math.max(.05, rt.t), by: att.id });
            continue;
          }
          this.duels.push({ a: A.id, b: B.id, prog: 0, t: 0, x: rt.c2, kind: 'rabiola', att: att.id, f: Math.max(.05, rt.t), stretch: 0 });
          ev.push({ type: 'duelStart', a: A.id, b: B.id, x: rt.c2, kind: 'rabiola', att: att.id });
          continue;
        }
        // 2) linha com linha
        const r = lineLine(A, B);
        if (r.d < DUEL.touch && r.s > DUEL.minFrac && r.s < DUEL.maxFrac && r.t > DUEL.minFrac && r.t < DUEL.maxFrac) {
          const x = [(r.c1[0] + r.c2[0]) / 2, (r.c1[1] + r.c2[1]) / 2, (r.c1[2] + r.c2[2]) / 2];
          this.duels.push({ a: A.id, b: B.id, prog: 0, t: 0, x, kind: 'linha', att: null });
          ev.push({ type: 'duelStart', a: A.id, b: B.id, x, kind: 'linha', att: null });
        }
      }
    }

    // pipas aparadas penduradas: escorregam até a mão; puxada rápida ou a linha de outro corta a rabiola (vira avoada)
    for (let i = this.hangs.length - 1; i >= 0; i--) {
      const h = this.hangs[i], P = this.players.get(h.by);
      h.age += dt;
      const solta = (p, why, by = h.by) => {
        this.hangs.splice(i, 1);
        const ns = this.spawnStray(p, h.kite, h.owner, h.tl || 8);
        ns.block = h.by; // quem deixou escapar não apara de volta na hora
        ev.push({ type: 'hangCut', id: h.id, holder: h.by, by, p: p.slice(), why, kite: h.kite, sid: ns.id });
      };
      if (!P || !flying(P) || !P.poly) { solta(h.last || [0, 20, 0], 'perdeu'); continue; }
      const L = Math.max(1, P.s.L || 1);
      if (h.age > 1.2) h.f -= (P.s.reel ? DUEL.desceRecolhendo : DUEL.desce) * dt / L;
      const hp = polyAt(P.poly, h.f); h.last = hp;
      if (h.f * L <= DUEL.guarda) {
        this.hangs.splice(i, 1);
        P.score += DUEL.guardaBonus;
        ev.push({ type: 'hangHome', id: h.id, by: h.by, kite: h.kite });
        continue;
      }
      // puxada rápida de quem segura: a rabiola corta
      const fp = h.age > 1.5 ? fastPull(P) : 0;
      h.rip = fp > 0 ? h.rip + fp * DUEL.rasga * dt : Math.max(0, h.rip - dt);
      if (h.rip >= 1) { solta(hp, 'puxada'); continue; }
      // a linha de outro jogador encostou na pipa pendurada: corta a rabiola
      let cortou = null;
      if (h.age > 1.5) for (const q of this.players.values()) {
        if (q.id === h.by || !flying(q) || !q.poly) continue;
        if (pointPoly(hp, q.poly).d < DUEL.toqueAparada) { cortou = q.id; break; }
      }
      if (cortou) solta(hp, 'linha', cortou);
    }

    // pipas avoadas: descem com o vento; quem encostar a linha apara
    for (let i = this.strays.length - 1; i >= 0; i--) {
      const s = this.strays[i];
      s.age += dt;
      strayStep(s, W, t, dt);
      const gy = this.groundAt ? this.groundAt(s.p[0], s.p[2]) : 0; // chão/telhado do cenário
      if (s.p[1] < gy + 0.5 || s.age > 70) { this.strays.splice(i, 1); continue; }
      if (s.tl > 0) strayTrail(s.p, s.tl, W.dx, W.dz, 6, s.trail);
      if (s.age < 1.2) continue;
      for (const p of this.players.values()) {
        if (!flying(p) || !p.poly || (s.owner === p.id && s.age < 2.2) || (s.block === p.id && s.age < 3)) continue; // até o dono pode aparar de volta
        // apara encostando a linha na pipa OU na linha que ela vai arrastando
        const naPipa = pointPoly(s.p, p.poly).d < DUEL.catchDist;
        const naLinha = !naPipa && s.tl > 0 && polyPoly(s.trail, p.poly, 3).d < DUEL.catchDist * 0.75;
        if (naPipa || naLinha) {
          p.score += 50; p.aparadas++;
          ev.push({ type: 'catch', id: s.id, by: p.id, p: s.p.slice(), kite: s.kite, pelaLinha: naLinha });
          this.strays.splice(i, 1);
          this.hang(p.id, s.kite, pointPoly(s.p, p.poly).u, s.owner, s.p, 'catch', ev, s.tl || 8);
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
          this.spawnStray(pos, { type, pat: Math.floor(Math.random() * 3) }, null, 10 + Math.random() * 20);
          ev.push({ type: 'strayIn' });
        }
      }
    }
    return ev;
  }
}
