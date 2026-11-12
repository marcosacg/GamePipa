// Servidor do Rabiola: entrega os arquivos do jogo e cuida das salas online.
// Sem dependências: só Node.js (18 ou mais novo).  Uso:  node server/server.js   (porta 8080)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Arena, DUEL, KITE_TYPES, PROTOCOL } from '../js/shared/duel.js';
import { VENDOR, ensureVendor } from './vendor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TICK = 1 / 20;

/* ---------------- arquivos estáticos ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && (req.url || '').startsWith('/api/salvar-asset')) { saveAsset(req, res); return; }
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/rabiola.html';
  const file = path.resolve(ROOT, '.' + url);
  if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}server${path.sep}`)) { res.writeHead(403); res.end('Proibido'); return; }
  // bibliotecas locais: se ainda não estiverem em vendor/, baixa uma vez e guarda
  const rel = url.startsWith('/vendor/') ? url.slice(8) : null;
  if (rel && VENDOR[rel] && !fs.existsSync(file)) {
    ensureVendor(rel).then(() => serveFile(file, res)).catch(e => {
      console.log('  [vendor] ' + e.message);
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não consegui baixar ' + rel + '. Rode: npm run vendor');
    });
    return;
  }
  serveFile(file, res);
});
/*
  Salva um arquivo na pasta Assets/ (usado por ferramentas/exportar-assets.html).
  Só aceita pedidos do próprio computador e só escreve .glb/.png/.md dentro de Assets/.
*/
const ASSETS = path.join(ROOT, 'Assets');
function saveAsset(req, res) {
  const ip = req.socket.remoteAddress || '';
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const rel = new URL(req.url, 'http://x').searchParams.get('caminho') || '';
  const file = path.resolve(ASSETS, rel);
  if (!local || !/^[a-z0-9\-\/]+\.(glb|png|md)$/.test(rel) || !file.startsWith(ASSETS + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Só dá pra salvar na pasta Assets, rodando o servidor neste computador.'); req.resume(); return;
  }
  const parts = []; let size = 0;
  req.on('data', d => { size += d.length; if (size > 40e6) req.destroy(); else parts.push(d); });
  req.on('end', () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.concat(parts));
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('ok');
    } catch (e) { res.writeHead(500); res.end(String(e.message)); }
  });
}

function serveFile(file, res) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------------- WebSocket mínimo (RFC 6455) ---------------- */
class Conn {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = []; this.fop = 1; this.open = true;
    this.onmessage = null; this.onclose = null;
    sock.on('data', d => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (this.buf.length < 10) return;
        if (this.buf.readUInt32BE(2) !== 0) { this.close(); return; }
        len = this.buf.readUInt32BE(6); off = 10;
      }
      if (len > 1 << 20) { this.close(); return; }
      const maskOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = Buffer.from(this.buf.subarray(off, off + len));
      if (masked) { const m = this.buf.subarray(maskOff, maskOff + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = this.buf.subarray(off + len);
      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._send(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2) { this.frag = [payload]; this.fop = op; }
      else if (op === 0x0) this.frag.push(payload);
      else continue;
      if (fin) {
        const msg = Buffer.concat(this.frag); this.frag = [];
        if (this.fop === 1 && this.onmessage) { try { this.onmessage(msg.toString('utf8')); } catch (e) { console.error(e); } }
      }
    }
  }
  _send(op, data) {
    if (!this.open) return;
    const len = data.length;
    let h;
    if (len < 126) { h = Buffer.alloc(2); h[1] = len; }
    else if (len < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
    h[0] = 0x80 | op;
    try { this.sock.write(Buffer.concat([h, data])); } catch { /* conexão caiu */ }
  }
  send(obj) { this._send(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8')); }
  close() {
    if (!this.open) return;
    this._send(0x8, Buffer.alloc(0));
    this.open = false;
    try { this.sock.end(); } catch { }
    this._closed();
  }
  _closed() { if (this._done) return; this._done = true; this.open = false; if (this.onclose) this.onclose(); }
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!req.url.startsWith('/ws') || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  onConnection(new Conn(sock));
});

/* ---------------- salas ---------------- */
const rooms = new Map();
let nextId = 1;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)]; } while (rooms.has(c));
  return c;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map(); // id -> { conn, meta, state }
    this.arena = new Arena();
    this.t0 = Date.now();
    this.round = { state: 'playing', endsAt: this.time() + DUEL.roundTime };
    this.scoreTimer = 0;
  }
  time() { return (Date.now() - this.t0) / 1000; }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const [id, p] of this.players) if (id !== except) p.conn.send(s);
  }
}

const num = (v, d = 0, lim = 2000) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : d);
const vec = (v, n = 3) => (Array.isArray(v) && v.length === n ? v.map(x => num(x)) : new Array(n).fill(0));
const str = (v, max, d = '') => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : d) || d;
const r2 = v => Math.round(v * 100) / 100;

function cleanStyle(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    skin: Math.round(num(s.skin, 3, 10)), hair: str(s.hair, 16, 'curto'), hat: str(s.hat, 16, 'nenhum'),
    shirt: Math.round(num(s.shirt, 0, 20)), shorts: Math.round(num(s.shorts, 0, 20)), spool: str(s.spool, 16, 'lata'),
  };
}
function cleanKite(k) {
  k = k && typeof k === 'object' ? k : {};
  return { type: KITE_TYPES.includes(k.type) ? k.type : 'pipa', pat: Math.round(num(k.pat, 0, 20)) };
}
function publicPlayer(id, p) { return { id, name: p.meta.name, style: p.meta.style, kite: p.meta.kite }; }

function onConnection(conn) {
  let room = null, id = null;
  conn.onmessage = raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'join' && !room) {
      const name = str(m.name, 16, 'Moleque');
      let code = str(m.room, 4, '').toUpperCase();
      if (m.create) { code = newCode(); rooms.set(code, new Room(code)); }
      else if (m.random) {
        // sorteia uma sala já criada que ainda tenha vaga
        const open = [...rooms.values()].filter(r => r.players.size > 0 && r.players.size < DUEL.maxPlayers);
        if (!open.length) { conn.send({ t: 'error', msg: 'Nenhuma sala aberta agora. Crie uma e chame a turma!' }); return; }
        code = open[Math.floor(Math.random() * open.length)].code;
      }
      const r = rooms.get(code);
      if (!r) { conn.send({ t: 'error', msg: 'Sala ' + (code || '?') + ' não existe.' }); return; }
      if (r.players.size >= DUEL.maxPlayers) { conn.send({ t: 'error', msg: 'Sala cheia (máx. ' + DUEL.maxPlayers + ').' }); return; }
      room = r; id = 'p' + (nextId++);
      const meta = { name, style: cleanStyle(m.style), kite: cleanKite(m.kite) };
      room.players.set(id, { conn, meta, state: null });
      room.arena.addPlayer(id, meta);
      conn.send({
        t: 'welcome', v: PROTOCOL, id, room: room.code, rt: room.time(), round: room.round,
        players: [...room.players].filter(([pid]) => pid !== id).map(([pid, p]) => publicPlayer(pid, p)),
        scores: room.arena.scores(),
      });
      room.broadcast({ t: 'pjoin', p: publicPlayer(id, room.players.get(id)) }, id);
      console.log(`[${room.code}] ${name} entrou (${room.players.size} na sala)`);
      return;
    }
    if (!room) return;
    const me = room.players.get(id);
    if (!me) return;

    if (m.t === 'state') {
      const s = {
        pos: vec(m.pos), yaw: num(m.yaw, 0, 10), mv: num(m.mv, 0, 20),
        hand: vec(m.hand), k: vec(m.k), q: vec(m.q, 4), L: num(m.L, 10, 200),
        T: num(m.T, 0, 500), breakN: num(m.breakN, 30, 200), st: str(m.st, 12, 'voando'),
        flying: !!m.flying, pull: !!m.pull, give: !!m.give, sta: num(m.sta, 1, 1),
        te: Array.isArray(m.te) ? vec(m.te) : null, n: Math.round(num(m.n, 0, 30)), shake: !!m.shake,
      };
      me.state = s; me.lastAt = Date.now();
      room.arena.setState(id, s);
    } else if (m.t === 'ping') {
      conn.send({ t: 'pong', c: m.c, rt: room.time() });
    }
  };
  conn.onclose = () => {
    if (!room || !id) return;
    const p = room.players.get(id);
    room.players.delete(id);
    room.arena.removePlayer(id);
    room.broadcast({ t: 'pleave', id });
    console.log(`[${room.code}] ${p ? p.meta.name : id} saiu (${room.players.size} na sala)`);
    if (!room.players.size) rooms.delete(room.code);
  };
}

/* ---------------- loop das salas ---------------- */
setInterval(() => {
  for (const room of rooms.values()) {
    const t = room.time();
    // rodadas
    if (t >= room.round.endsAt) {
      if (room.round.state === 'playing') {
        room.round = { state: 'pause', endsAt: t + DUEL.pauseTime };
        room.broadcast({ t: 'round', round: room.round, scores: room.arena.scores() });
      } else {
        room.arena.resetRound();
        room.round = { state: 'playing', endsAt: t + DUEL.roundTime };
        room.broadcast({ t: 'round', round: room.round, scores: room.arena.scores() });
      }
    }
    if (room.round.state === 'playing') {
      const ev = room.arena.update(TICK, t);
      for (const e of ev) room.broadcast({ t: 'ev', e });
      if (ev.some(e => e.type === 'duelEnd' || e.type === 'catch')) room.scoreTimer = 0;
    }
    // quem parou de mandar dados (aba em segundo plano, conexão ruim) não pode ficar congelado disputando
    const now = Date.now();
    for (const p of room.players.values()) {
      p.stale = !!p.state && now - (p.lastAt || 0) > 1500;
      if (p.stale) p.state.flying = false;
    }
    room.scoreTimer -= TICK;
    const snap = {
      t: 'snap', rt: r2(t),
      p: [...room.players].filter(([, p]) => p.state).map(([pid, p]) => {
        const s = p.state;
        // o servidor manda o estado "oficial": laçado (linha arrebentou) vale mesmo se o navegador dele estiver parado
        const st = room.arena.isLost(pid) ? 'arrebentou' : p.stale ? 'ausente' : s.st;
        return { id: pid, pos: s.pos.map(r2), yaw: r2(s.yaw), mv: r2(s.mv), hand: s.hand.map(r2), k: s.k.map(r2), q: s.q.map(v => Math.round(v * 1000) / 1000), L: r2(s.L), st, pull: s.pull, shake: s.shake };
      }),
      s: room.arena.strays.map(s => ({ id: s.id, p: s.p.map(r2), kite: s.kite })),
      d: room.arena.duels.map(d => ({ a: d.a, b: d.b, prog: r2(d.prog), x: d.x.map(r2), kind: d.kind, att: d.att, f: r2(d.f || 0), st: r2(d.stretch || 0) })),
    };
    if (room.scoreTimer <= 0) { snap.sc = room.arena.scores(); room.scoreTimer = 1; }
    room.broadcast(snap);
  }
}, TICK * 1000);

server.listen(PORT, () => {
  console.log('\n  RABIOLA — servidor no ar!\n');
  console.log('  Neste computador:  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log('  Na mesma rede:     http://' + a.address + ':' + PORT);
  }
  console.log('\n  Ctrl+C para desligar.\n');
});
