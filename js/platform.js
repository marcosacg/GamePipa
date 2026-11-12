// Pontos de anúncio e eventos de plataforma (portais de jogos).
// O jogo só chama Ads.*; aqui dentro cada provedor faz do seu jeito:
//   'nenhum'     sem anúncios (jogo local / itch.io)
//   'teste'      simula anúncios na tela (para ver o fluxo sem conta em portal)
//   'crazygames' SDK v3 do CrazyGames
//   'poki'       SDK v2 do Poki
//   'adsense'    Google H5 Games Ads (Ad Placement API), para o seu próprio site
import { ADS_PROVIDER, ADSENSE_CLIENT } from './settings.js';

const urlAds = new URLSearchParams(location.search).get('ads');
const PROVIDERS = ['nenhum', 'teste', 'crazygames', 'poki', 'adsense'];
const provider = PROVIDERS.includes(urlAds) ? urlAds : (PROVIDERS.includes(ADS_PROVIDER) ? ADS_PROVIDER : 'nenhum');

// intervalo mínimo entre anúncios de intervalo (Poki e CrazyGames também controlam isso do lado deles)
const MIN_BREAK_MS = provider === 'poki' ? 0 : 120000;

// CrazyGames/AdSense: o primeiro intervalo só depois de 2 min de jogo (no Poki quem decide é o SDK; no teste aparece logo)
let lastBreak = provider === 'poki' || provider === 'teste' ? -1e12 : Date.now(), inAd = false, playing = false;
let pauseHook = () => {}, resumeHook = () => {};

function loadScript(src, attrs = {}) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = res; s.onerror = () => rej(new Error('não carregou ' + src));
    document.head.appendChild(s);
  });
}

function begin() { inAd = true; pauseHook(); }
function end() { inAd = false; resumeHook(); }

/* ---------- anúncio de teste (overlay na própria página) ---------- */
function testOverlay(text, seconds, withChoice) {
  return new Promise(res => {
    const o = document.createElement('div');
    o.className = 'ad-test';
    o.innerHTML = `<div class="ad-box"><small>ANÚNCIO DE TESTE</small><b>${text}</b><span class="ad-count"></span><div class="ad-btns"></div></div>`;
    document.body.appendChild(o);
    const count = o.querySelector('.ad-count'), btns = o.querySelector('.ad-btns');
    const play = () => {
      btns.innerHTML = '';
      let left = seconds;
      count.textContent = left + ' s';
      const iv = setInterval(() => {
        left--; count.textContent = left + ' s';
        if (left <= 0) { clearInterval(iv); o.remove(); res(true); }
      }, 1000);
    };
    if (!withChoice) { play(); return; }
    count.textContent = '';
    const ok = document.createElement('button'); ok.className = 'btn'; ok.textContent = 'Assistir';
    const no = document.createElement('button'); no.className = 'btn alt'; no.textContent = 'Agora não';
    ok.onclick = play;
    no.onclick = () => { o.remove(); res(false); };
    btns.append(ok, no);
  });
}

/* ---------- Google AdSense H5 ---------- */
function adBreak(o) { (window.adsbygoogle = window.adsbygoogle || []).push(o); }

export const Ads = {
  provider,
  get inAd() { return inAd; },
  /** tem anúncio premiado? (sem anúncios, nada fica trancado) */
  hasRewarded() { return this.provider !== 'nenhum'; },
  /** o jogo informa como pausar/retomar (som e jogo) durante o anúncio */
  setHooks(onPause, onResume) { pauseHook = onPause; resumeHook = onResume; },

  async init() {
    try {
      if (provider === 'crazygames') {
        await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
        await window.CrazyGames.SDK.init();
        if (window.CrazyGames.SDK.environment === 'disabled') throw new Error('SDK desabilitado fora do CrazyGames');
      } else if (provider === 'poki') {
        await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
        await window.PokiSDK.init();
      } else if (provider === 'adsense') {
        const attrs = { 'data-ad-client': ADSENSE_CLIENT, 'data-ad-frequency-hint': '120s' };
        if (/localhost|127\.0\.0\.1/.test(location.hostname) || urlAds === 'adsense') attrs['data-adbreak-test'] = 'on';
        await loadScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', attrs);
        adBreak({ preloadAdBreaks: 'on', sound: 'on' }); // adConfig
      }
    } catch (e) {
      console.warn('[anúncios] seguindo sem SDK:', e.message);
      this.provider = 'nenhum';
    }
  },

  loadingStart() {
    if (this.provider === 'crazygames') window.CrazyGames.SDK.game.loadingStart();
  },
  loadingFinished() {
    if (this.provider === 'crazygames') window.CrazyGames.SDK.game.loadingStop();
    if (this.provider === 'poki') window.PokiSDK.gameLoadingFinished();
  },
  gameplayStart() {
    if (playing) return; playing = true;
    if (this.provider === 'crazygames') window.CrazyGames.SDK.game.gameplayStart();
    if (this.provider === 'poki') window.PokiSDK.gameplayStart();
  },
  gameplayStop() {
    if (!playing) return; playing = false;
    if (this.provider === 'crazygames') window.CrazyGames.SDK.game.gameplayStop();
    if (this.provider === 'poki') window.PokiSDK.gameplayStop();
  },
  /** momento de alegria (CrazyGames): vitória, missão cumprida */
  happy() { if (this.provider === 'crazygames') window.CrazyGames.SDK.game.happytime(); },
  /** sala online atual (CrazyGames mostra convite); null = saiu da sala */
  room(code) {
    if (this.provider !== 'crazygames') return;
    try { if (code) window.CrazyGames.SDK.game.updateRoom({ roomId: code }); else window.CrazyGames.SDK.game.leftRoom(); } catch { }
  },

  /** anúncio de intervalo (fim de rodada, voltar ao menu, jogar de novo). Sempre resolve. */
  async commercialBreak(name = 'intervalo') {
    const p = this.provider;
    if (p === 'nenhum' || inAd) return;
    const now = Date.now();
    if (now - lastBreak < MIN_BREAK_MS) return;
    lastBreak = now;
    const wasPlaying = playing;
    this.gameplayStop();
    try {
      if (p === 'teste') { begin(); await testOverlay('Intervalo: ' + name, 3, false); end(); }
      else if (p === 'crazygames') {
        await new Promise(res => window.CrazyGames.SDK.ad.requestAd('midgame', {
          adStarted: begin, adFinished: () => { end(); res(); }, adError: () => { if (inAd) end(); res(); },
        }));
      } else if (p === 'poki') {
        await window.PokiSDK.commercialBreak(begin); if (inAd) end();
      } else if (p === 'adsense') {
        await new Promise(res => adBreak({ type: 'next', name, beforeAd: begin, afterAd: end, adBreakDone: res }));
      }
    } catch { if (inAd) end(); }
    if (wasPlaying) this.gameplayStart();
  },

  /** anúncio premiado: resolve true só se o jogador assistiu até o fim */
  async rewarded(name = 'premio') {
    const p = this.provider;
    if (p === 'nenhum' || inAd) return false;
    const wasPlaying = playing;
    this.gameplayStop();
    let ok = false;
    try {
      if (p === 'teste') {
        begin(); ok = await testOverlay('Prêmio: ' + name, 3, true); end();
      } else if (p === 'crazygames') {
        ok = await new Promise(res => window.CrazyGames.SDK.ad.requestAd('rewarded', {
          adStarted: begin, adFinished: () => { end(); res(true); }, adError: () => { if (inAd) end(); res(false); },
        }));
      } else if (p === 'poki') {
        ok = !!(await window.PokiSDK.rewardedBreak(begin)); if (inAd) end();
      } else if (p === 'adsense') {
        ok = await new Promise(res => {
          let viewed = false;
          adBreak({
            type: 'reward', name, beforeAd: begin, afterAd: end,
            beforeReward: showAdFn => showAdFn(),
            adDismissed: () => { viewed = false; }, adViewed: () => { viewed = true; },
            adBreakDone: () => res(viewed),
          });
        });
      }
    } catch { if (inAd) end(); ok = false; }
    if (wasPlaying) this.gameplayStart();
    return ok;
  },
};
