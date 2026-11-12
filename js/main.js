// Ponto de entrada: carrega o Ammo.js, monta o mundo e roda o loop
import { S, G, keys } from './state.js';
import { AMMO_BASE, H, KITES } from './config.js';
import { PH, initPhysics } from './physics.js';
import { renderer, scene, camera, updateSky, followCamera } from './scene.js';
import { buildWorld, updateEnvironment } from './world.js';
import { buildKite, resetKite, kitePhysicsStep, syncKiteVisual, lastApparent, putOnBack, launchKite } from './kite.js';
import { updateHUD, $ } from './hud.js';
import { buildMenu, enablePlay, setNetMsg } from './menu.js';
import { Snd } from './audio.js';
import { updateFx } from './fx.js';
import { initNPCs, updateNPCs } from './npcs.js';
import { isTouch, initTouch, updateTouch, goFullscreen } from './touch.js';
import { LocalSession } from './bots.js';
import { NetSession, serverURL } from './net.js';
import { Ads } from './platform.js';
import {
  cam, updateWind, updatePlayer, updateCamera, updateLogic, strayForces, setPlayerStyle, setKite,
  startGame, toMenu, setPause, continueFree, advanceClockKey,
} from './game.js';

/* ---------------- menu ---------------- */
let ready = false;
buildMenu({
  async start(mode) {
    if (!ready) return;
    goFullscreen();
    await Ads.commercialBreak('inicio'); // o Poki pede um intervalo antes de começar a jogar
    if (mode === 'disputa') startGame('disputa', new LocalSession({ name: S.name, style: S.style, kite: { type: S.kiteType, pat: S.patIdx } }));
    else startGame(mode);
  },
  online(create, code, random = false) {
    if (!ready) return;
    goFullscreen();
    const join = { create, random, room: code, name: S.name, style: S.style, kite: { type: S.kiteType, pat: S.patIdx } };
    new NetSession(join, {
      onWelcome: ss => { setNetMsg(''); ss.onTick = backgroundTick; startGame('online', ss); },
      onError: msg => setNetMsg(msg, true),
    });
  },
  styleChanged(style) { if (ready) setPlayerStyle(style); },
  kiteChanged(type, pat) { if (ready) setKite(type, pat); },
  view(tab) { cam.menuView = tab; },
});

$('resumeBtn').onclick = () => setPause(false);
$('menuBtn1').onclick = $('menuBtn2').onclick = () => toMenu();
$('againBtn').onclick = async () => { await Ads.commercialBreak('jogar-de-novo'); startGame(S.mode === 'desafios' ? 'desafios' : 'livre'); };

/* ---------------- anúncios: durante o anúncio o jogo pausa (fora do online) e fica mudo ---------------- */
Ads.setHooks(
  () => { S.adPause = S.mode !== 'online'; for (const k in keys) keys[k] = false; if (Snd.ctx) Snd.ctx.suspend(); },
  () => { S.adPause = false; if (Snd.ctx) Snd.ctx.resume(); },
);
const adsReady = Ads.init().then(() => Ads.loadingStart());
$('freeBtn').onclick = () => continueFree();

/* ---------------- teclado ---------------- */
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') setPause(!S.pauseOpen);
  if (!S.running || S.paused) return;
  if (e.code === 'KeyE' && launchKite()) Snd.beep(520, .15, 'triangle', .1);  // soltar a pipa das costas
  if (e.code === 'KeyR' && S.state !== 'lancando') putOnBack();              // guardar a pipa nas costas
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
  if (e.code === 'KeyT') advanceClockKey();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ---------------- loop ---------------- */
let last = performance.now(), acc = 0;

/** simulação (sem desenhar): física, regras, rede */
function step(now) {
  const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!S.paused && !S.adPause) {
    S.clock += dt;
    if (S.running && (S.mode === 'livre' || S.mode === 'desafios')) S.minutes = Math.min(S.minutes + dt * .2, S.mode === 'livre' ? 19.6 * 60 : 19 * 60);
    updateWind();
    updatePlayer(dt);
    if (!S.running && S.state === 'voando') S.L += (30 - S.L) * dt * .3; // no menu a pipa sobe sozinha
    acc += dt; let n = 0;
    while (acc >= H && n < 8) { kitePhysicsStep(H, strayForces); acc -= H; n++; }
    if (n >= 8) acc = 0;
    syncKiteVisual();
    updateLogic(dt);
    updateFx(dt);
    updateNPCs(dt, S.clock);
  }
  return dt;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = step(now);
  updateSky(S.minutes, G.player.g.position);
  updateEnvironment(dt, S.clock, S.windDirH, S.windSpeed);
  followCamera();
  updateCamera(dt);
  updateHUD(dt, cam.yaw);
  updateTouch();
  Snd.update(S.paused, S.windSpeed, lastApparent.v, S.state === 'voando', S.tension);
  renderer.render(scene, camera);
}

/*
  Aba em segundo plano: o navegador para o requestAnimationFrame, e no online isso deixaria
  o seu personagem "ausente" para os outros. As mensagens do servidor continuam chegando
  (20 por segundo), então elas passam a tocar a simulação enquanto a aba estiver escondida.
*/
function backgroundTick() {
  if (!document.hidden || S.mode !== 'online' || !S.running) return;
  step(performance.now());
}

initTouch();

/* ---------------- boot ---------------- */
function loadAmmo() {
  return new Promise((res, rej) => {
    if (typeof window.Ammo !== 'function') { rej(new Error('Ammo.js não carregou (pasta vendor/ incompleta)')); return; }
    window.Ammo({ locateFile: p => AMMO_BASE + p }).then(lib => res({ lib }));
  });
}

loadAmmo().then(({ lib }) => {
  initPhysics(lib);
  buildWorld();
  initNPCs();
  setPlayerStyle(S.style);
  updateWind();
  updatePlayer(0);
  if (!KITES[S.kiteType]) S.kiteType = 'pipa';
  buildKite();
  resetKite();
  ready = true;
  enablePlay(true);
  adsReady.then(() => Ads.loadingFinished());
  if (!serverURL()) $('modeRow').querySelector('[data-mode=online]')?.classList.add('off'); // sem servidor online nesta versão
  requestAnimationFrame(frame);
}).catch(err => {
  enablePlay(false, 'Erro: ' + err.message + '. Rode "npm run vendor" (ou abra o iniciar-servidor.bat com internet uma vez).');
  console.error(err);
});
