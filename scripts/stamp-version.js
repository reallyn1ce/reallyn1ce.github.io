'use strict';
// Проставляет версию ресурсов (хеш содержимого) в index.html, sw.js и version.json.
// Запуск:  node scripts/stamp-version.js          — проставить
//          node scripts/stamp-version.js --check  — только проверить (exit 1, если версия устарела)
// Файлы данных (data/*.json) в хеш НЕ входят: они обновляются отдельно и всегда берутся из сети.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CHECK = process.argv.includes('--check');

const normIndex = (s) => s
  .replace(/(\.(?:css|js))\?v=[A-Za-z0-9]+/g, '$1?v=X')
  .replace(/(<meta name="archive-build" content=")[^"]*(")/, '$1X$2');
const normSw = (s) => s.replace(/const VERSION = '[^']*';/, "const VERSION = 'X';");

function computeHash() {
  const h = crypto.createHash('sha256');
  const add = (name, buf) => { h.update(name + '\0'); h.update(buf); h.update('\0'); };
  add('index.html', normIndex(read('index.html')));
  add('sw.js', normSw(read('sw.js')));
  for (const f of ['style.css', 'app.js', 'analytics.js', 'manifest.json']) add(f, fs.readFileSync(path.join(ROOT, f)));
  for (const f of fs.readdirSync(path.join(ROOT, 'icons')).sort()) add('icons/' + f, fs.readFileSync(path.join(ROOT, 'icons', f)));
  return h.digest('hex').slice(0, 12);
}

const hash = computeHash();
const idx = read('index.html'), sw = read('sw.js');
const idxNew = idx
  .replace(/(\.(?:css|js))\?v=[A-Za-z0-9]+/g, `$1?v=${hash}`)
  .replace(/(<meta name="archive-build" content=")[^"]*(")/, `$1${hash}$2`);
const swNew = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${hash}';`);

let ver = null;
try { ver = JSON.parse(read('version.json')); } catch {}
const verOk = ver && ver.version === hash;

if (idxNew === idx && swNew === sw && verOk) {
  console.log(`Версия ресурсов актуальна: ${hash}`);
  process.exit(0);
}
if (CHECK) {
  console.error(`Версия ресурсов НЕ проставлена (ожидается ${hash}). Выполните: node scripts/stamp-version.js`);
  process.exit(1);
}
fs.writeFileSync(path.join(ROOT, 'index.html'), idxNew);
fs.writeFileSync(path.join(ROOT, 'sw.js'), swNew);
fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify({ version: hash, builtAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log(`Проставлена версия ресурсов: ${hash}`);
