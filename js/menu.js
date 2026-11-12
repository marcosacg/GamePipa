// Menu: modo de jogo, sala online, personagem e pipa
import { S } from './state.js';
import { KITES, KITE_ORDER, getPatterns, SKINS, HAIRS, HATS, SHIRTS, SHORTS, SPOOLS, PRESETS, normalizeStyle } from './config.js';
import { kiteThumb } from './kite.js';
import { $ } from './hud.js';
import { Ads } from './platform.js';

const UNLOCK_KEY = 'rabiola:liberadas';
function unlocked() { try { return new Set(JSON.parse(localStorage.getItem(UNLOCK_KEY)) || []); } catch { return new Set(); } }
function unlock(id) { const u = unlocked(); u.add(id); try { localStorage.setItem(UNLOCK_KEY, JSON.stringify([...u])); } catch { } }
/** estampa trancada? (só existe cadeado quando o jogo tem anúncios) */
export function isLocked(type, i) {
  const p = getPatterns(type)[i];
  return !!(p && p.premium && Ads.hasRewarded() && !unlocked().has(type + ':' + i));
}

const PREF_KEY = 'rabiola:prefs';
export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* sem armazenamento */ } }

let prefs = {};
let A = null; // ações vindas do main
let selMode = 'livre';

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function selectIn(row, node) { row.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); node.classList.add('sel'); }

export function buildMenu(actions) {
  A = actions;
  prefs = loadPrefs();
  S.style = normalizeStyle(prefs.style || PRESETS[0].style);
  S.name = (prefs.name || 'Moleque' + Math.floor(Math.random() * 90 + 10)).slice(0, 16);
  if (prefs.kite && KITES[prefs.kite.type]) { S.kiteType = prefs.kite.type; S.patIdx = prefs.kite.pat | 0; }
  if (isLocked(S.kiteType, S.patIdx)) S.patIdx = 0;
  selMode = ['livre', 'desafios', 'disputa', 'online'].includes(prefs.mode) ? prefs.mode : 'livre';
  S.fxTail = prefs.fxTail === true; // animação da rabiola presa (começa desligada)
  const fxBtn = $('fxTailBtn');
  const fxTxt = () => { fxBtn.textContent = 'Animação da rabiola presa: ' + (S.fxTail ? 'ligada' : 'desligada'); fxBtn.classList.toggle('sel', S.fxTail); };
  fxTxt();
  fxBtn.onclick = () => { S.fxTail = !S.fxTail; fxTxt(); persist(); };

  // abas
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  // modos
  document.querySelectorAll('#modeRow .opt').forEach(b => {
    if (b.dataset.mode === selMode) selectIn($('modeRow'), b);
    b.onclick = () => {
      if (b.classList.contains('off')) { setNetMsg('O modo online não está disponível nesta versão.', true); return; } selectIn($('modeRow'), b); selMode = b.dataset.mode; persist(); refreshMode(); };
  });
  $('nameIn').value = S.name;
  $('nameIn').oninput = () => { S.name = $('nameIn').value.replace(/[<>]/g, '').slice(0, 16); persist(); };
  $('codeIn').oninput = () => { $('codeIn').value = $('codeIn').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); };
  $('codeIn').onkeydown = e => { if (e.key === 'Enter') joinRoom(false); };
  $('createBtn').onclick = () => joinRoom(true);
  $('joinBtn').onclick = () => joinRoom(false);
  $('randomBtn').onclick = () => { setNetMsg('Procurando uma sala aberta…'); persist(); A.online(false, '', true); };
  $('playBtn').onclick = () => A.start(selMode);
  $('toCharBtn').onclick = () => showTab('personagem');
  refreshMode();

  buildCharacterTab();
  buildKiteTab();
}

function persist() {
  prefs = { style: S.style, name: S.name, kite: { type: S.kiteType, pat: S.patIdx }, mode: selMode, fxTail: !!S.fxTail };
  savePrefs(prefs);
}

const TABS = ['jogar', 'personagem', 'pipa'];
let curTab = 'jogar';
function showTab(tab) {
  const from = TABS.indexOf(curTab), to = TABS.indexOf(tab);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab));
  $('tabs').style.setProperty('--i', to);
  for (const t of TABS) {
    const sec = $('tab-' + t);
    sec.classList.toggle('hidden', t !== tab);
    sec.classList.remove('enter');
  }
  if (tab !== curTab) {
    const sec = $('tab-' + tab);
    sec.style.setProperty('--from', (to > from ? 26 : -26) + 'px'); // desliza do lado da aba escolhida
    void sec.offsetWidth; // reinicia a animação
    sec.classList.add('enter');
    $('menu').querySelector('.menu-card').scrollTop = 0;
  }
  curTab = tab;
  A.view(tab);
}

function refreshMode() {
  const online = selMode === 'online';
  $('onlineBox').classList.toggle('hidden', !online);
  $('playBtn').classList.toggle('hidden', online);
  $('netMsg').textContent = '';
  buildQuickPresets();
}

function joinRoom(create) {
  const code = $('codeIn').value.trim();
  if (!create && code.length !== 4) { setNetMsg('Digite o código da sala (4 letras).', true); $('codeIn').focus(); return; }
  setNetMsg(create ? 'Criando sala…' : 'Entrando na sala ' + code + '…');
  persist();
  A.online(create, code);
}
export function setNetMsg(msg, bad = false) {
  $('netMsg').textContent = msg;
  $('netMsg').classList.toggle('bad', bad);
}
export function enablePlay(ok, msg = '') {
  $('playBtn').disabled = !ok; $('createBtn').disabled = !ok; $('joinBtn').disabled = !ok; $('randomBtn').disabled = !ok;
  $('loadMsg').textContent = msg;
}

/* ---------------- personagem ---------------- */
function applyStyle(patch) {
  S.style = normalizeStyle({ ...S.style, ...patch });
  persist();
  A.styleChanged(S.style);
  syncCharacterTab();
  buildQuickPresets();
}

function presetChip(p) {
  const b = el('button', 'chip', p.name);
  b.onclick = () => applyStyle(p.style);
  b.dataset.key = JSON.stringify(p.style);
  return b;
}
function buildQuickPresets() {
  const row = $('quickPresets');
  row.innerHTML = '';
  for (const p of PRESETS) row.append(presetChip(p));
  markPresets(row);
}
function markPresets(row) {
  const cur = JSON.stringify(normalizeStyle(S.style));
  row.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', JSON.stringify(normalizeStyle(JSON.parse(c.dataset.key))) === cur));
}

function buildCharacterTab() {
  const pr = $('presetRow');
  for (const p of PRESETS) pr.append(presetChip(p));

  SKINS.forEach((c, i) => {
    const b = el('button', 'dot'); b.style.background = c; b.title = 'Tom ' + (i + 1); b.dataset.v = i;
    b.onclick = () => applyStyle({ skin: i }); $('skinRow').append(b);
  });
  const chips = (rowId, list, key) => list.forEach(o => {
    const b = el('button', 'chip', o.name); b.dataset.v = o.id;
    b.onclick = () => applyStyle({ [key]: o.id }); $(rowId).append(b);
  });
  chips('hairRow', HAIRS, 'hair');
  chips('hatRow', HATS, 'hat');
  chips('spoolRow', SPOOLS, 'spool');
  SHIRTS.forEach((s, i) => {
    const b = el('button', 'swatch'); b.title = s.name; b.dataset.v = i;
    if (s.mode === 'sem') b.style.background = 'repeating-linear-gradient(45deg,#b07a4f 0 6px,#8d5a3b 6px 12px)';
    else if (s.mode === 'listras') b.style.background = `repeating-linear-gradient(180deg,${s.a} 0 7px,${s.b} 7px 12px)`;
    else b.style.background = `linear-gradient(180deg,${s.a} 55%,${s.b} 55% 70%,${s.a} 70%)`;
    b.onclick = () => applyStyle({ shirt: i }); $('shirtRow').append(b);
  });
  SHORTS.forEach((c, i) => {
    const b = el('button', 'dot'); b.style.background = c; b.dataset.v = i;
    b.onclick = () => applyStyle({ shorts: i }); $('shortsRow').append(b);
  });
  syncCharacterTab();
}
function syncCharacterTab() {
  const st = S.style;
  const mark = (rowId, v) => $(rowId).querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === String(v)));
  mark('skinRow', st.skin); mark('hairRow', st.hair); mark('hatRow', st.hat); mark('shirtRow', st.shirt); mark('shortsRow', st.shorts); mark('spoolRow', st.spool);
  markPresets($('presetRow'));
}

/* ---------------- pipa ---------------- */
function buildKiteTab() {
  const kr = $('kiteRow');
  for (const type of KITE_ORDER) {
    const v = KITES[type];
    const b = el('button', 'opt kite-opt' + (type === S.kiteType ? ' sel' : ''));
    b.append(kiteThumb(type, type === S.kiteType ? S.patIdx : 0, 56));
    const info = el('div');
    info.append(el('b', null, v.name), el('small', null, v.desc));
    const bar = (label, x) => { const r = el('div', 'stat'); r.append(el('span', null, label)); const bb = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(Math.min(1, x) * 100) + '%'; bb.append(i); r.append(bb); return r; };
    info.append(bar('Força', v.lift / .6), bar('Estab.', v.stab / 2), bar('Agilid.', v.turn / 3.8));
    b.append(info);
    b.onclick = () => { selectIn(kr, b); S.kiteType = type; S.patIdx = 0; persist(); buildPatterns(); A.kiteChanged(S.kiteType, S.patIdx); };
    kr.append(b);
  }
  buildPatterns();
}
function buildPatterns() {
  const row = $('patRow');
  row.innerHTML = '';
  getPatterns(S.kiteType).forEach((p, i) => {
    const b = el('button', 'pat' + (i === S.patIdx ? ' sel' : ''));
    b.title = p.name || 'Estampa ' + (i + 1);
    b.append(kiteThumb(S.kiteType, i, 52));
    const choose = () => { selectIn(row, b); S.patIdx = i; persist(); A.kiteChanged(S.kiteType, S.patIdx); };
    if (isLocked(S.kiteType, i)) {
      b.classList.add('locked');
      const tag = document.createElement('span'); tag.className = 'lock'; tag.textContent = '▶ anúncio'; b.append(tag);
      b.title = 'Assista um anúncio para liberar esta estampa';
      b.onclick = async () => {
        if (await Ads.rewarded('estampa')) { unlock(S.kiteType + ':' + i); buildPatterns(); const nb = $('patRow').children[i]; if (nb) nb.click(); }
      };
    } else b.onclick = choose;
    row.append(b);
  });
}
