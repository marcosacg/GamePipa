// Gera a "versão portal": uma pasta + um .zip só com o jogo (sem servidor), pronto para enviar
// ao CrazyGames, Poki, itch.io ou para hospedar como site estático.
//
//   node server/build-portal.js --ads=crazygames --server=wss://seu-servidor.onrender.com/ws
//
// --ads      nenhum | teste | crazygames | poki | adsense   (padrão: nenhum)
// --server   endereço wss:// do servidor online hospedado (vazio = sem modo online)
// --adsense  seu código ca-pub-... (só com --ads=adsense)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { VENDOR, VENDOR_DIR, ensureAllVendor } from './vendor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'rabiola-portal');
const ZIP = path.join(ROOT, 'dist', 'rabiola-portal.zip');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2]] : [a, '']; }));
const ADS = ['nenhum', 'teste', 'crazygames', 'poki', 'adsense'].includes(args.ads) ? args.ads : 'nenhum';
const SERVER = (args.server || '').trim();
const ADSENSE = (args.adsense || '').trim();

if (SERVER && !/^wss?:\/\//.test(SERVER)) { console.log('\n  O endereço do servidor precisa começar com wss:// (ex.: wss://rabiola.onrender.com/ws)\n'); process.exit(1); }
if (SERVER.startsWith('ws://')) console.log('  Atenção: portais usam https; o servidor online precisa ser wss:// (com cadeado), senão o navegador bloqueia.');

console.log('\n  Gerando versão portal...');
console.log(`  anúncios: ${ADS}   online: ${SERVER || 'desligado'}`);

// 1) bibliotecas locais
const falhas = await ensureAllVendor();
const essenciais = ['three/three.module.js', 'ammo/ammo.wasm.js', 'ammo/ammo.wasm.wasm'];
const faltam = essenciais.filter(rel => !fs.existsSync(path.join(VENDOR_DIR, rel)));
if (faltam.length) {
  console.log('\n  Faltam bibliotecas essenciais (precisa de internet uma vez):\n   - ' + faltam.join('\n   - '));
  console.log('  ' + falhas.join('\n  '));
  process.exit(1);
}
if (falhas.length) console.log('  (fontes não baixadas: o jogo usa as fontes do sistema)');

// 2) copia os arquivos do jogo
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copyDir = (src, dst, filter = () => true) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!filter(s, e)) continue;
    if (e.isDirectory()) copyDir(s, d, filter); else fs.copyFileSync(s, d);
  }
};
// js/tools e js/models.js só servem às ferramentas (vitrine/exportar Assets): ficam fora do pacote
copyDir(path.join(ROOT, 'js'), path.join(OUT, 'js'), (s, e) => !(e.isDirectory() && e.name === 'tools') && e.name !== 'models.js');
copyDir(path.join(ROOT, 'css'), path.join(OUT, 'css'));
copyDir(VENDOR_DIR, path.join(OUT, 'vendor'), (s, e) => e.isDirectory() || Object.keys(VENDOR).some(rel => s.endsWith(path.join(...rel.split('/')))));
let html = fs.readFileSync(path.join(ROOT, 'rabiola.html'), 'utf8');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// 3) configurações do pacote
fs.writeFileSync(path.join(OUT, 'js', 'settings.js'), `// Gerado por server/build-portal.js em ${new Date().toISOString()}
export const PORTAL = true;
export const ONLINE_SERVER = ${JSON.stringify(SERVER)};
export const ADS_PROVIDER = ${JSON.stringify(ADS)};
export const ADSENSE_CLIENT = ${JSON.stringify(ADSENSE)};
`);

// 4) confere se sobrou alguma dependência externa
const externos = [];
const scan = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') scan(f); continue; }
    if (!/\.(html|css|js)$/.test(e.name) || f.endsWith('platform.js')) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)|url\(['"]?(https?:\/\/[^)'"]+)|from\s+['"](https?:\/\/[^'"]+)|import\(['"](https?:\/\/[^'"]+)/g)) {
      const u = m[1] || m[2] || m[3] || m[4];
      if (!/nodejs\.org/.test(u)) externos.push(path.relative(OUT, f) + ' -> ' + u);
    }
  }
};
scan(OUT);

// 5) zip
const files = [];
const walk = (dir, base = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(dir, e.name), name = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(f, name); else files.push({ name, data: fs.readFileSync(f) });
  }
};
walk(OUT);
fs.writeFileSync(ZIP, makeZip(files));

const total = files.reduce((n, f) => n + f.data.length, 0);
console.log(`\n  Pronto!`);
console.log(`  Pasta: dist/rabiola-portal/  (${files.length} arquivos, ${(total / 1048576).toFixed(1)} MB)`);
console.log(`  Zip:   dist/rabiola-portal.zip  (${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB)`);
console.log(externos.length ? '  Dependências externas encontradas:\n   - ' + externos.join('\n   - ') : '  Sem dependências externas (fora o SDK do portal, carregado só quando ativado).');
if (!SERVER) console.log('  Modo online: desligado nesta versão (passe --server=wss://... para ligar).');
console.log('');

/* ---------------- zip simples (deflate), sem dependências ---------------- */
function makeZip(entries) {
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
