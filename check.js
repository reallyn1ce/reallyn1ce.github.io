'use strict';
// Проверка проекта перед публикацией: node scripts/check.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const A = require('../analytics.js');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) failed++; };

// 1. JSON и синтаксис JS
for (const f of [...fs.readdirSync(path.join(ROOT, 'data')).map((x) => 'data/' + x), 'manifest.json', 'version.json']) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); ok(true, 'JSON ' + f); } catch (e) { ok(false, 'JSON ' + f + ': ' + e.message); }
}
for (const f of ['scripts/smoke.js', 'app.js', 'analytics.js', 'sw.js', 'scripts/fetch-traffic.js', 'scripts/backfill-wayback.js', 'scripts/stamp-version.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)]); ok(true, 'JS ' + f); } catch (e) { ok(false, 'JS ' + f); }
}

// 2. Структура данных
const traffic = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/traffic.json'), 'utf8'));
ok(Array.isArray(traffic) && traffic.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.value > 0), 'traffic.json: даты и значения корректны');
const dates = traffic.map((p) => p.date);
ok(dates.length === new Set(dates).size && dates.every((d, i) => !i || d > dates[i - 1]), 'traffic.json: даты уникальны и по возрастанию');

// 2b. Галерея и сравнения: только свои файлы img/, существующие на диске, с источником и датой
for (const f of ['data/gallery.json', 'data/compare.json']) {
  const arr = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  ok(Array.isArray(arr), f + ': массив');
  const imgs = f.includes('gallery') ? arr.map((g) => g.image) : arr.flatMap((p) => [p.before && p.before.image, p.after && p.after.image]);
  ok(imgs.every((i) => typeof i === 'string' && /^img\/[\w./-]+$/.test(i) && fs.existsSync(path.join(ROOT, i))), f + ': все изображения существуют в img/');
  if (f.includes('gallery')) ok(arr.every((g) => g.title && g.source && g.date && g.status), f + ': у каждого материала есть название, источник, дата и статус');
}

// 2c. Летопись и сообщества (Stage 7)
{
  const evs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
  const yrs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/years.json'), 'utf8'));
  const STs = ['confirmed', 'indirect', 'unverified'];
  ok(evs.every((e) => e.year && e.date && e.label && STs.includes(e.status)), 'events.json: у каждого события год, дата, заголовок и допустимый статус');
  ok(evs.every((e) => (e.sources || []).every((s) => s.title && (!s.url || /^https?:\/\//.test(s.url)))), 'events.json: источники с названием, ссылки http(s)');
  ok(evs.every((e) => (e.media || []).every((m) => ['video', 'image', 'archive', 'document'].includes(m.type) && m.title && /^https?:\/\//.test(m.url))), 'events.json: материалы имеют тип, название и ссылку');
  ok(evs.every((e) => /^\d{4}$/.test(String(e.year)) && String(e.date).startsWith(String(e.year))), 'events.json: год события совпадает с датой');
  ok(yrs.length === 16 && yrs[0].year === 2011 && yrs[15].year === 2026, 'years.json: годы 2011–2026');
  const comm = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/communities.json'), 'utf8'));
  ok(comm.every((c) => c.id && c.name && /^https?:\/\//.test(c.url) && ['official', 'independent', 'fan'].includes(c.type)), 'communities.json: id, название, ссылка и тип');
  ok(new Set(comm.map((c) => c.id)).size === comm.length, 'communities.json: id уникальны');
  ok(comm.every((c) => !c.icon || (/^img\/[\w./-]+$/.test(c.icon) && fs.existsSync(path.join(ROOT, c.icon)))), 'communities.json: иконки существуют в img/');
  ok(comm[0] && comm[0].pinned && comm[0].url === 'https://discord.gg/kogama', 'communities.json: первым закреплён официальный Discord');
}
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(idxHtml.includes('href="https://github.com/reallyn1ce/reallyn1ce.github.io"'), 'footer: ссылка на репозиторий');
ok(/<a class="logo" href="#home"/.test(idxHtml), 'логотип ведёт на главную');

// 3. Версия ресурсов проставлена
try { execFileSync(process.execPath, [path.join(__dirname, 'stamp-version.js'), '--check'], { stdio: 'pipe' }); ok(true, 'версия ресурсов проставлена'); }
catch { ok(false, 'версия ресурсов не проставлена (node scripts/stamp-version.js)'); }
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const v = (html.match(/archive-build" content="([^"]+)"/) || [])[1];
ok(v && v !== 'dev' && sw.includes(`const VERSION = '${v}'`) && html.includes(`app.js?v=${v}`) && html.includes(`style.css?v=${v}`) && html.includes(`analytics.js?v=${v}`), 'index.html и sw.js ссылаются на одну версию');

// 4. Аналитика на синтетических данных (НЕ данные проекта)
const mk = (d, value, source) => ({ date: d, value, source: source || 'HypeStat' });
const t = [mk('2025-01-10', 100), mk('2025-02-10', 110), mk('2025-03-10', 121), mk('2025-04-10', 130), mk('2025-05-10', 100), mk('2026-01-10', 90)];
ok(Math.abs(A.pct(100, 110) - 10) < 1e-9 && A.pct(0, 5) === null, 'pct: рост 10%, нулевая база даёт null');
ok(A.extremes(t).max.value === 130 && A.extremes(t).min.value === 90, 'extremes: максимум/минимум среди замеров');
const cmp = A.comparePeriods(t, '2025', '2026');
ok(cmp && Math.abs(cmp.a.avg - 112.2) < 1e-9 && Math.abs(cmp.pct - (90 - 112.2) / 112.2 * 100) < 1e-9, 'comparePeriods: среднее по годам и процент');
ok(A.comparePeriods(t, '2025', '2025') === null && A.comparePeriods(t, '2025', '2030') === null, 'comparePeriods: нет сравнения без второго периода');
const st = A.streaks(t, 3);
ok(st.length === 1 && st[0].dir === 'up' && st[0].changes === 3 && st[0].from.date === '2025-01-10' && st[0].to.date === '2025-04-10', 'streaks: найден рост из 3 изменений подряд');
ok(A.streaks(t.slice(0, 3), 3).length === 0, 'streaks: мало данных — вывода нет');
const by = A.byYear(t);
ok(by.length === 2 && by[0].yoy === null && by[1].yoy !== null, 'byYear: сравнение с прошлым годом только для соседних лет');
ok(A.byYear([mk('2024-01-01', 10), mk('2026-01-01', 20)])[1].yoy === null, 'byYear: пропущенный год не даёт выдуманного сравнения');
const tc = A.topChanges(t, 1);
ok(tc.up[0].pct > 9.9 && tc.down[0].to.date === '2025-05-10', 'topChanges: наибольший рост и снижение');
ok(A.overall([mk('2026-10-18', 5)]).pct === null, 'overall: один замер — без процента изменения');

console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
