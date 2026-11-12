// Controles de toque (celular/tablet): joystick para andar + botões da pipa
import { S, keys } from './state.js';

export const isTouch = typeof matchMedia === 'function' &&
  (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

const $ = id => document.getElementById(id);

/** tela cheia e paisagem (só funciona a partir de um toque do jogador) */
export function goFullscreen() {
  if (!isTouch) return;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
  } catch { /* navegador sem tela cheia (ex.: iPhone) */ }
}

function press(code) {
  // tecla "de toque único" (E, R, Esc): simula apertar e soltar
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

export function initTouch() {
  if (!isTouch) return;
  document.body.classList.add('touch');
  const root = $('touch');

  // ---------- joystick (andar) ----------
  const joy = $('joy'), knob = $('joyKnob');
  let jid = null, cx = 0, cy = 0;
  const move = e => {
    const R = joy.clientWidth * .38;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    S.joy.x = dx / R; S.joy.y = -dy / R; // pra cima = pra frente
  };
  joy.addEventListener('pointerdown', e => {
    e.preventDefault();
    jid = e.pointerId; joy.setPointerCapture(jid);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    joy.classList.add('on');
    move(e);
  });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) move(e); });
  const endJoy = e => {
    if (e.pointerId !== jid) return;
    jid = null; S.joy.x = 0; S.joy.y = 0; knob.style.transform = ''; joy.classList.remove('on');
  };
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);

  // ---------- botões que ficam apertados (A, D, W, S, Espaço) ----------
  for (const b of root.querySelectorAll('[data-key]')) {
    const code = b.dataset.key;
    const on = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { } keys[code] = true; b.classList.add('on'); };
    const off = () => { keys[code] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
  }
  // ---------- botões de um toque (E, R, Esc) ----------
  for (const b of root.querySelectorAll('[data-tap]')) {
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); press(b.dataset.tap); });
    const off = () => b.classList.remove('on');
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
  }
  // nada de menu de contexto / seleção ao segurar o dedo
  root.addEventListener('contextmenu', e => e.preventDefault());
}

/** mostra os botões certos para o momento (chamado todo quadro) */
let lastMode = '';
export function updateTouch() {
  if (!isTouch) return;
  const playing = S.running && !S.pauseOpen;
  const mode = !playing ? 'off' : S.state === 'costas' ? 'costas' : S.state === 'voando' || S.state === 'lancando' ? 'voando' : 'espera';
  if (mode === lastMode) return;
  lastMode = mode;
  document.body.classList.toggle('playing', S.running);
  $('touch').classList.toggle('hidden', mode === 'off');
  $('tLaunch').classList.toggle('hidden', mode !== 'costas');
  $('tBtns').classList.toggle('hidden', mode !== 'voando');
  if (mode !== 'voando') for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space']) keys[k] = false;
}
