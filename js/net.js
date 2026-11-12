// Disputa online: conversa com o servidor (server/server.js) por WebSocket
import { DISPUTA_WIND } from './config.js';
import { PROTOCOL } from './shared/duel.js';
import { PORTAL, ONLINE_SERVER } from './settings.js';

export function serverURL() {
  if (ONLINE_SERVER) return ONLINE_SERVER;   // servidor hospedado (versão portal)
  if (PORTAL) return null;                   // portal sem servidor configurado: sem online
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

export class NetSession {
  /** join = { create, room, name, style, kite } */
  constructor(join, { onWelcome, onError }) {
    this.myId = null; this.label = ''; this.room = '';
    this.wind = DISPUTA_WIND;
    this.others = new Map();
    this.strays = []; this.duels = []; this.scores = [];
    this.round = { state: 'playing', endsAt: 0 };
    this.events = [];
    this.rtOffset = 0; this.synced = false;
    this.sendT = 0; this.closed = false;
    const url = serverURL();
    if (!url) { setTimeout(() => onError('Abra o jogo pelo servidor (iniciar-servidor.bat) para jogar online.'), 0); return; }
    let ws;
    try { ws = new WebSocket(url); } catch (e) { setTimeout(() => onError('Não consegui conectar ao servidor.'), 0); return; }
    this.ws = ws;
    let welcomed = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', ...join }));
    ws.onerror = () => { if (!welcomed) onError('Não consegui conectar ao servidor. Ele está ligado?'); };
    ws.onclose = () => {
      if (this.closed) return;
      if (welcomed) this.events.push({ type: 'disconnected' });
      else onError('Conexão encerrada pelo servidor.');
    };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      switch (m.t) {
        case 'welcome':
          welcomed = true;
          this.myId = m.id; this.room = m.room; this.label = 'Sala ' + m.room;
          this.sync(m.rt); this.round = m.round; this.scores = m.scores || [];
          for (const p of m.players) this.others.set(p.id, { meta: p, state: null });
          if (m.v !== PROTOCOL) this.events.push({ type: 'oldServer' });
          onWelcome(this);
          break;
        case 'error':
          // servidor antigo não conhece "sala aleatória" e responde "Sala ? não existe"
          onError(join.random && /Sala \? não existe/.test(m.msg)
            ? 'O servidor aberto é a versão antiga. Feche a janela preta do servidor e abra o iniciar-servidor.bat de novo.'
            : m.msg);
          this.close(); break;
        case 'pjoin': this.others.set(m.p.id, { meta: m.p, state: null }); this.events.push({ type: 'pjoin', name: m.p.name }); break;
        case 'pleave': {
          const o = this.others.get(m.id);
          this.others.delete(m.id);
          if (o) this.events.push({ type: 'pleave', name: o.meta.name });
          break;
        }
        case 'snap':
          this.sync(m.rt);
          for (const p of m.p) { if (p.id === this.myId) continue; const o = this.others.get(p.id); if (o) o.state = p; }
          this.strays = m.s; this.duels = m.d;
          if (m.sc) this.scores = m.sc;
          if (this.onTick) this.onTick();
          break;
        case 'ev': this.events.push(m.e); break;
        case 'round': this.round = m.round; this.scores = m.scores; this.events.push({ type: 'round', round: m.round, scores: m.scores }); break;
      }
    };
  }
  /** acerta o relógio da sala (vento e rodada usam esse tempo) */
  sync(rt) {
    const off = rt - performance.now() / 1000;
    if (!this.synced) { this.rtOffset = off; this.synced = true; }
    else this.rtOffset += (off - this.rtOffset) * (off > this.rtOffset ? .5 : .05); // aceita rápido quando atrasou
  }
  time() { return performance.now() / 1000 + this.rtOffset; }
  sendState(st) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const now = performance.now();
    if (now - this.sendT < 60) return; // ~16 por segundo
    this.sendT = now;
    this.ws.send(JSON.stringify({ t: 'state', ...st }));
  }
  update() { }
  drainEvents() { const e = this.events; this.events = []; return e; }
  nameOf(id) { return id === this.myId ? 'Você' : (this.others.get(id)?.meta.name || '?'); }
  close() { this.closed = true; try { this.ws && this.ws.close(); } catch { } }
}
