// HUD: painéis, avisos, enroscada e placar
import { S, G } from './state.js';
import { MISSIONS, MAX_LINE, LINE_STRENGTH, BREAK_HOLD } from './config.js';
import { clamp } from './utils.js';
import { sunElev } from './scene.js';
import { RESPAWN } from './config.js';

export const $ = id => document.getElementById(id);

let toastT = 0;
export function toast(t, sub = '', cls = '', dur = 2) {
  const el = $('toast');
  el.className = 'show ' + cls;
  el.innerHTML = '';
  el.append(t);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.append(s); }
  toastT = dur;
}

const TIPS = [
  'Vento fraco? Corra pra trás (↓) ou dê puxadas com W.',
  'A rabiola endireita a pipa sozinha. Solte A/D e ela volta pro prumo.',
  'Perto das árvores o vento embola. Suba alto antes de passear.',
  'Cuidado com os fios do poste do lado direito do campo!',
  'Pipa no canto da janela de vento perde força. Traga ela de volta pro meio.',
  'Linha bamba é pipa sem comando: recolha (Espaço) pra esticar.',
];
const TIPS_DUEL = [
  'Cruze a sua linha na linha do outro para enroscar.',
  'Na enroscada: W puxa (gasta fôlego), S dá linha. Pipa por cima leva vantagem.',
  'Não puxe com a tensão no vermelho: a sua linha arrebenta primeiro!',
  'Pipa laçada vira avoada: encoste a linha nela para aparar (+50).',
  'Passe a linha na rabiola do outro: você começa a enroscada na frente e puxa mais forte.',
  'Pegaram sua rabiola? Sacuda com A/D alternado: dar linha quase não adianta.',
];

let hudT = 0, tipT = 0, tipI = 0;
let lineWarned = false;
export function updateHUD(dt, camYaw) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').className = ''; }
  // contagem para soltar outra pipa
  const waiting = S.running && (S.state === 'enroscou' || S.state === 'caiu' || S.state === 'arrebentou');
  $('launchHint').classList.toggle('hidden', !(S.running && S.state === 'costas'));
  $('respawn').classList.toggle('hidden', !waiting);
  if (waiting) {
    const left = Math.max(0, RESPAWN - S.stateTimer);
    $('respawnNum').textContent = Math.max(1, Math.ceil(left));
    $('respawnRing').style.setProperty('--p', (left / RESPAWN * 100).toFixed(1));
  }
  if (!S.running) return;
  hudT -= dt; if (hudT > 0) return; hudT = .1;
  const kt = G.kite.kt;
  const disputa = S.mode === 'disputa' || S.mode === 'online';

  $('hAlt').textContent = Math.max(0, S.kitePos.y).toFixed(0) + ' m';
  $('hLine').textContent = S.L.toFixed(0) + ' / ' + MAX_LINE + ' m';
  $('hScore').textContent = disputa ? myScore() : S.score;
  const stTxt = { voando: S.tension < .25 ? 'Linha bamba' : (S.pulling ? 'Puxando' : 'Voando'), costas: 'Nas costas', lancando: 'Soltando…', enroscou: 'Enroscou', caiu: 'Caiu', arrebentou: S.hideKite ? 'Laçada!' : 'Avoou!' }[S.state];
  $('hState').textContent = stTxt;
  // a barra mostra o esforço da linha até o limite; no vermelho, pisca e avisa antes de arrebentar
  const tr = clamp(Math.max(S.stress || 0, S.tension * .85) / (kt.breakN * LINE_STRENGTH), 0, 1);
  const bar = $('tensionBar').firstElementChild;
  bar.style.width = (tr * 100).toFixed(0) + '%';
  const danger = S.state === 'voando' && S.overT > 0;
  bar.style.background = danger || tr > .9 ? '#e63946' : tr > .65 ? '#ffd166' : '#06d6a0';
  $('tensionBar').classList.toggle('perigo', danger);
  if (danger && S.overT > BREAK_HOLD * .25 && !lineWarned && S.running) {
    lineWarned = true;
    toast('A linha vai arrebentar!', 'Dê linha ou pare de puxar', 'bad', 1.6);
  }
  if (!danger) lineWarned = false;
  $('hTen').textContent = S.tension.toFixed(1) + ' N';
  $('hWind').textContent = (S.windSpeed * 3.6).toFixed(0);
  $('hGust').textContent = S.windSpeed > S.windBase * 1.25 ? 'RAJADA' : S.windSpeed < S.windBase * .7 ? 'calmaria' : '';
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  const wf = S.windDirH.x * fx + S.windDirH.z * fz, wr = S.windDirH.x * rx + S.windDirH.z * rz;
  $('windSvg').style.transform = 'rotate(' + (Math.atan2(wr, wf) * 180 / Math.PI).toFixed(0) + 'deg)';

  $('mission').classList.toggle('hidden', disputa);
  $('board').classList.toggle('hidden', !disputa);
  if (disputa) updateDisputaHUD();
  else {
    $('duel').classList.add('hidden');
    const mm = Math.floor(S.minutes), hh = Math.floor(mm / 60) % 24, mi = mm % 60;
    const phase = sunElev > 15 ? 'tarde' : sunElev > 3 ? 'sol baixando' : sunElev > -4 ? 'pôr do sol' : 'noite';
    $('clock').innerHTML = String(hh).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + '<small>' + phase + (S.mode === 'desafios' ? ' · janta às 19:00' : '') + '</small>';
    const m = S.mode === 'desafios' ? MISSIONS[S.mi] : null;
    const pb = $('mProg').firstElementChild;
    if (m) {
      $('mTitle').textContent = (S.mi + 1) + '/' + MISSIONS.length + ' · ' + m.title;
      $('mDesc').textContent = m.desc;
      pb.style.width = ((S.missionDone ? 1 : clamp(S.mp / m.goal, 0, 1)) * 100).toFixed(0) + '%';
      $('mLeft').textContent = S.missionDone ? 'Feito!' : Math.floor(S.mp) + ' / ' + m.goal + (m.unit ? ' ' + m.unit : '');
    } else {
      $('mTitle').textContent = 'Modo livre';
      $('mDesc').textContent = 'Argolas valem 100, pipas aparadas 150. Voar alto rende pontos.';
      pb.style.width = '0%';
      $('mLeft').textContent = '';
    }
    const ring = S.rings[0];
    $('mRight').textContent = ring ? 'Argola a ' + ring.pos.distanceTo(S.hand).toFixed(0) + ' m de linha' : (S.strays.length ? S.strays.length + ' avoada(s) no céu' : '');
  }

  tipT -= .1;
  if (tipT <= 0) { tipT = 9; const list = disputa ? TIPS_DUEL : TIPS; $('hint').textContent = 'Dica: ' + list[tipI++ % list.length]; }
}

function myScore() {
  const ss = G.session;
  const me = ss && ss.scores.find(s => s.id === ss.myId);
  return me ? me.score : 0;
}

function updateDisputaHUD() {
  const ss = G.session;
  if (!ss) return;
  const left = Math.max(0, ss.round.endsAt - ss.time());
  const mm = Math.floor(left / 60), sec = Math.floor(left % 60);
  $('clock').innerHTML = (ss.round.state === 'playing' ? '' : 'Próxima em ') + mm + ':' + String(sec).padStart(2, '0') +
    '<small>' + ss.label + (ss.room ? ' · chame a turma com esse código' : '') + '</small>';
  // placar
  const list = $('boardList');
  list.innerHTML = '';
  ss.scores.slice(0, 8).forEach((s, i) => {
    const li = document.createElement('li');
    if (s.id === ss.myId) li.className = 'me';
    const n = document.createElement('span'); n.textContent = (i + 1) + '. ' + (s.id === ss.myId ? 'Você' : s.name);
    const d = document.createElement('span'); d.textContent = s.score + ' · ' + s.lacadas + 'L ' + s.aparadas + 'A';
    li.append(n, d); list.append(li);
  });
  $('boardTitle').textContent = ss.round.state === 'playing' ? 'Placar da rodada' : 'Fim da rodada!';

  // enroscada
  const d = ss.duels.find(x => x.a === ss.myId || x.b === ss.myId);
  $('duel').classList.toggle('hidden', !d);
  if (d) {
    const mine = d.a === ss.myId ? d.prog : -d.prog; // -1..1, positivo = ganhando
    const other = d.a === ss.myId ? d.b : d.a;
    const name = ss.nameOf(other);
    if (d.kind === 'rabiola' && d.att === ss.myId) { $('duelTitle').textContent = 'Rabiola presa na sua linha:'; $('duelKeys').innerHTML = 'Encoste a <b>sua linha</b> na linha dele pra disputar'; }
    else if (d.kind === 'rabiola') { $('duelTitle').textContent = 'Sua rabiola prendeu na linha de'; $('duelKeys').innerHTML = '<kbd>A</kbd>/<kbd>D</kbd> afaste a pipa pra esticar · sacudir ajuda · <b>não encoste a linha</b>'; }
    else { $('duelTitle').textContent = d.att === ss.myId ? 'ENROSCADA (na rabiola dele!) com' : d.att ? 'ENROSCADA (ele pegou sua rabiola) com' : 'ENROSCADA com'; $('duelKeys').innerHTML = '<kbd>W</kbd> puxa · <kbd>S</kbd> dá linha'; }
    $('duelName').textContent = name;
    $('duel').classList.toggle('tail', d.kind === 'rabiola');
    if (d.kind === 'rabiola') {
      // barra = quanto a rabiola já escorregou (verde = perto de soltar, do ponto de vista de quem foi preso)
      const f = d.f || 0, vic = d.att !== ss.myId;
      $('duelBar').firstElementChild.style.width = ((vic ? f : 1 - f) * 100).toFixed(0) + '%';
      $('legL').textContent = vic ? 'escorregando' : 'segurando'; $('legR').textContent = vic ? 'presa' : 'escapando';
      $('duelBar').classList.toggle('taut', (d.st || d.stretch || 0) > .05);
    } else {
      $('duelBar').firstElementChild.style.width = ((mine + 1) * 50).toFixed(0) + '%';
      $('legL').textContent = 'você'; $('legR').textContent = 'ele(a)';
      $('duelBar').classList.remove('taut');
    }
    $('staBar').firstElementChild.style.width = (S.stamina * 100).toFixed(0) + '%';
  }
}
