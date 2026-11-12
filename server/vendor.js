// Bibliotecas e fontes que o jogo usa, guardadas DENTRO do projeto (pasta vendor/).
// Assim o jogo não depende de CDN: funciona offline e pode ser enviado a portais.
//
//   node server/vendor.js    -> baixa tudo que estiver faltando
//   (o servidor também baixa sozinho na primeira vez que o jogo pedir um arquivo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = path.resolve(__dirname, '..', 'vendor');

const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0';
export const VENDOR = {
  'three/three.module.js': `${THREE}/build/three.module.js`,
  'three/LICENSE': `${THREE}/LICENSE`,
  'ammo/ammo.wasm.js': `${THREE}/examples/jsm/libs/ammo.wasm.js`,
  'ammo/ammo.wasm.wasm': `${THREE}/examples/jsm/libs/ammo.wasm.wasm`,
  'fonts/bungee-400.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource/bungee@5/files/bungee-latin-400-normal.woff2',
  'fonts/nunito-400.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource/nunito@5/files/nunito-latin-400-normal.woff2',
  'fonts/nunito-700.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource/nunito@5/files/nunito-latin-700-normal.woff2',
  'fonts/nunito-900.woff2': 'https://cdn.jsdelivr.net/npm/@fontsource/nunito@5/files/nunito-latin-900-normal.woff2',
};

const pending = new Map();

/** garante que vendor/<rel> exista (baixa se faltar). Devolve o caminho no disco. */
export function ensureVendor(rel) {
  const file = path.join(VENDOR_DIR, rel);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return Promise.resolve(file);
  const url = VENDOR[rel];
  if (!url) return Promise.reject(new Error('arquivo desconhecido: ' + rel));
  if (pending.has(rel)) return pending.get(rel);
  const p = (async () => {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`download falhou (${r.status}) ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', buf);
    fs.renameSync(file + '.tmp', file);
    console.log(`  baixado: vendor/${rel} (${(buf.length / 1024).toFixed(0)} KB)`);
    return file;
  })().finally(() => pending.delete(rel));
  pending.set(rel, p);
  return p;
}

export async function ensureAllVendor() {
  const falhas = [];
  for (const rel of Object.keys(VENDOR)) {
    try { await ensureVendor(rel); } catch (e) { falhas.push(rel + ': ' + e.message); }
  }
  return falhas;
}

// rodando direto: baixa tudo
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('\n  Baixando bibliotecas para vendor/ ...');
  const falhas = await ensureAllVendor();
  if (falhas.length) { console.log('\n  Não consegui baixar:\n   - ' + falhas.join('\n   - ') + '\n  Confira a internet e rode de novo.'); process.exit(1); }
  console.log('  Tudo pronto em vendor/.\n');
}
