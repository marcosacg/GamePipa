// Configurações do jogo: pipas, estampas, missões e opções de personagem.
// Para ajustar a "sensação" do voo, mexa nos números de KITES.

export const THREE_VERSION = '0.160.0';
export const AMMO_BASE = 'vendor/ammo/'; // bibliotecas locais (pasta vendor/, ver server/vendor.js)

export const H = 1 / 120;                 // passo fixo da física
export const RESPAWN = 2;                 // segundos até soltar uma pipa nova depois de perder
export const MAX_LINE = 150, MIN_LINE = 4;
/* resistência da linha: arrebenta quando a tensão MÉDIA passa de breakN × LINE_STRENGTH
   por BREAK_HOLD segundos seguidos (trancos rápidos de rajada não arrebentam) */
export const LINE_STRENGTH = 1.45;
export const BREAK_HOLD = .9;

// grupos de colisão (Ammo)
export const G_GROUND = 1, G_STATIC = 2, G_KITE = 4, G_TAIL = 8, G_STRAY = 16, G_BALL = 32;

/*
  lift  = sustentação (sobe)          push  = pressão na face (estica a linha)
  drag  = arrasto                      mass  = peso (kg)
  stab  = estabilidade (volta ao prumo) turn = agilidade ao embicar
  tail  = nº de laços da rabiola (0 = sem rabiola)
  breakN = tensão (N) que arrebenta a linha
*/
export const KITES = {
  pipa:      { name: 'Pipa',          desc: 'Equilibrada, a clássica.',             lift: .46, push: .45, drag: .08, mass: .30, stab: 1.4, turn: 2.6, tail: 12, tailStyle: 'bows',  breakN: 30, size: 1.0,  shape: 'diamond',  bridle: false },
  raia:      { name: 'Raia',          desc: 'Grande e estável, puxa forte.',        lift: .60, push: .58, drag: .10, mass: .42, stab: 1.9, turn: 2.0, tail: 14, tailStyle: 'bows',  breakN: 40, size: 1.25, shape: 'hex',      bridle: false },
  capucheta: { name: 'Capucheta',     desc: 'Pequena, ligeira e arisca.',           lift: .34, push: .33, drag: .05, mass: .18, stab: .7,  turn: 3.7, tail: 6,  tailStyle: 'bows',  breakN: 22, size: .78,  shape: 'square',   bridle: false },
  bico:      { name: 'Bico Listrado', desc: 'Faixa na diagonal e rabiola de fitas.',lift: .50, push: .50, drag: .09, mass: .33, stab: 1.6, turn: 2.5, tail: 9,  tailStyle: 'fitas', breakN: 32, size: 1.05, shape: 'bico',     bridle: true },
  quadrada:  { name: 'Quadrada',      desc: 'Firme no estirante, rabiola de laços.', lift: .58, push: .56, drag: .10, mass: .38, stab: 1.8, turn: 2.2, tail: 10, tailStyle: 'bows',  breakN: 36, size: 1.1,  shape: 'quadrada', bridle: true },
};
export const KITE_ORDER = ['pipa', 'raia', 'capucheta', 'bico', 'quadrada'];

const PAIRS = [['#e63946', '#ffd166'], ['#06d6a0', '#ffffff'], ['#118ab2', '#ffd166'], ['#8338ec', '#ff006e'], ['#1b1b1f', '#f1c40f'], ['#ff7b00', '#2ec4b6']];

// estampas de cada pipa. c = cores; fitas = cores das fitas da rabiola
const PATTERNS = {
  pipa: PAIRS.map(c => ({ kind: 'split', c, name: '' })),
  raia: PAIRS.map(c => ({ kind: 'quad', c, name: '' })),
  capucheta: PAIRS.map(c => ({ kind: 'quad', c, name: '' })),
  bico: [
    { kind: 'faixa', name: 'Rosa e roxo',    c: ['#ff2f92', '#7b3fe4', '#ffffff', '#141414'], fitas: ['#c03ad1', '#ff73c6', '#f2f2f2'] },
    { kind: 'faixa', name: 'Vermelho e lima', c: ['#e8262a', '#b8e639', '#ffffff', '#141414'], fitas: ['#e8262a', '#33b249', '#ffd23f', '#2a6fdb'] },
    { kind: 'faixa', name: 'Azulzinha',      c: ['#1e8fe0', '#1e8fe0', '#ffffff', '#141414'], fitas: ['#2a6fdb', '#ffd23f', '#5bc0eb'] },
    { kind: 'faixa', name: 'Laranja e verde', c: ['#ff7b00', '#06d6a0', '#ffffff', '#141414'], fitas: ['#ff7b00', '#06d6a0', '#ffffff'] },
  ],
  quadrada: [
    { kind: 'lisa',      name: 'Azul lisa',  c: ['#1f4fd6'] },
    { kind: 'losango',   name: 'Losangos',   c: ['#a0158f', '#f5d90a', '#151515'] },
    { kind: 'triangulo', name: 'Triângulo',  c: ['#3ec6e0', '#141414', '#c4148f'] },
    { kind: 'lisa',      name: 'Vermelha',   c: ['#d62828'] },
  ],
};
// estampas "premiadas": liberadas assistindo um anúncio (só quando o jogo roda com anúncios)
const PREMIUM = { pipa: [5], raia: [5], capucheta: [5], bico: [3], quadrada: [2] };
for (const [type, list] of Object.entries(PREMIUM)) for (const i of list) if (PATTERNS[type][i]) PATTERNS[type][i].premium = true;
export function getPatterns(type) { return PATTERNS[type] || PATTERNS.pipa; }

export const MISSIONS = [
  { title: 'Primeiro voo',     desc: 'Suba a pipa até 25 m de altura.',                               type: 'altura',       goal: 25, unit: 'm' },
  { title: 'Dá linha!',        desc: 'Com 60 m de linha ou mais, segure a pipa no ar por 20 s.',      type: 'linha',        goal: 20, unit: 's' },
  { title: 'Argolas de nuvem', desc: 'Passe a pipa por 4 argolas douradas.',                           type: 'argolas',      goal: 4,  unit: '' },
  { title: 'Aparador',         desc: 'Apare 3 pipas avoadas encostando nelas com a sua linha.',        type: 'aparar',       goal: 3,  unit: '' },
  { title: 'Ventania',         desc: 'Aguente 40 s no ar com rajadas fortes, sem cair nem enroscar.',  type: 'ventania',     goal: 40, unit: 's' },
  { title: 'Rei da várzea',    desc: 'Passe por 4 argolas lá no alto, acima de 45 m.',                 type: 'argolasAltas', goal: 4,  unit: '' },
];

/* ---------------- personagem ---------------- */
export const SKINS = ['#f3cfa6', '#d9a273', '#b07a4f', '#8d5a3b', '#5e3a24'];
export const HAIRS = [
  { id: 'curto', name: 'Curto' }, { id: 'raspado', name: 'Raspado' }, { id: 'blackpower', name: 'Black power' },
  { id: 'trancas', name: 'Trancinhas' }, { id: 'moicano', name: 'Moicano' },
];
export const HATS = [
  { id: 'nenhum', name: 'Nenhum' }, { id: 'bone', name: 'Boné' }, { id: 'bonetras', name: 'Boné pra trás' }, { id: 'palha', name: 'Chapéu de palha' },
];
export const SHIRTS = [
  { name: 'Amarela',    a: '#f2c200', b: '#0b7a3b', mode: 'faixa' },
  { name: 'Listrada',   a: '#d62828', b: '#1b1b1f', mode: 'listras' },
  { name: 'Branca',     a: '#f4f4f4', b: '#9aa0a6', mode: 'lisa' },
  { name: 'Azul',       a: '#1d6fd1', b: '#ffffff', mode: 'faixa' },
  { name: 'Regata',     a: '#ff7b00', b: '#ffffff', mode: 'regata' },
  { name: 'Sem camisa', a: null,      b: null,      mode: 'sem' },
];
export const SHORTS = ['#1d4fa3', '#1b1b1f', '#2a9d8f', '#9b2226', '#6c757d'];
export const SPOOLS = [{ id: 'lata', name: 'Lata' }, { id: 'papelao', name: 'Papelão' }, { id: 'carretilha', name: 'Carretilha' }];

export const PRESETS = [
  { name: 'Moleque da laje', style: { skin: 3, hair: 'curto',      hat: 'nenhum',   shirt: 0, shorts: 0, spool: 'lata' } },
  { name: 'Boné pra trás',   style: { skin: 2, hair: 'curto',      hat: 'bonetras', shirt: 3, shorts: 1, spool: 'carretilha' } },
  { name: 'Black power',     style: { skin: 4, hair: 'blackpower', hat: 'nenhum',   shirt: 1, shorts: 1, spool: 'papelao' } },
  { name: 'Chapéu de palha', style: { skin: 1, hair: 'curto',      hat: 'palha',    shirt: 2, shorts: 3, spool: 'lata' } },
  { name: 'Trancinhas',      style: { skin: 3, hair: 'trancas',    hat: 'nenhum',   shirt: 4, shorts: 2, spool: 'carretilha' } },
  { name: 'Sem camisa',      style: { skin: 2, hair: 'raspado',    hat: 'bone',     shirt: 5, shorts: 0, spool: 'papelao' } },
];

export function normalizeStyle(s = {}) {
  const d = PRESETS[0].style;
  const ok = (list, id, def) => (list.some(o => o.id === id) ? id : def);
  const idx = (v, n, def) => (Number.isInteger(v) && v >= 0 && v < n ? v : def);
  return {
    skin: idx(s.skin, SKINS.length, d.skin), hair: ok(HAIRS, s.hair, d.hair), hat: ok(HATS, s.hat, d.hat),
    shirt: idx(s.shirt, SHIRTS.length, d.shirt), shorts: idx(s.shorts, SHORTS.length, d.shorts), spool: ok(SPOOLS, s.spool, d.spool),
  };
}

/* ---------------- disputa ---------------- */
export const DISPUTA_WIND = { base: 6.2, gust: 0.45 };
export const BOT_NAMES = ['Zé da Laje', 'Biel', 'Tatá', 'Juninho', 'Cabeção', 'Duda'];
