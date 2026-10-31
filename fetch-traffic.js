'use strict';
// Checks HypeStat daily, but keeps only one point per calendar month.
// A failure exits non-zero so GitHub Actions cannot report a false green run.
const https = require('https');
const fs = require('fs');
const path = require('path');

const PAGE = 'https://hypestat.com/info/kogama.com';
const FILE = path.join(__dirname, '..', 'data', 'traffic.json');
const META_FILE = path.join(__dirname, '..', 'data', 'meta.json');
// meta.lastChecked пишем в файл не чаще, чем раз в N дней (или сразу при смене значения),
// иначе workflow делал бы коммит каждый день только ради метаданных.
const META_COMMIT_INTERVAL_DAYS = 7;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, redirects = 4) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'identity' },
      timeout: 25000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HypeStat вернул HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; if (body.length > 8_000_000) req.destroy(new Error('Ответ HypeStat слишком большой')); });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('Тайм-аут запроса к HypeStat')));
    req.on('error', reject);
  });
}

function decodeText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2c;|&#44;/gi, ',')
    .replace(/\s+/g, ' ');
}

function toCount(raw) {
  const s = String(raw).replace(/\s/g, '').toLowerCase().replace(/[.,]+$/, '');
  const suffix = s.slice(-1);
  const number = Number(s.replace(/[kmb]$/, '').replace(/,/g, ''));
  const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
  const value = Math.round(number * multiplier);
  return Number.isFinite(value) && value > 0 && value < 1e9 ? value : null;
}

// Число рядом с подписью `label`. `otherLabel` — подпись соседнего поля: если она попала
// между нашей подписью и числом, число принадлежит соседу и мы его не берём.
function findCount(text, label, otherLabel) {
  const NUM = '([\\d,]+(?:\\.\\d+)?\\s*[kmb]?)(?![\\w])';
  const direct = text.match(new RegExp(label + '\\s*[:\\-]?\\s*(?:is\\s*)?' + NUM, 'i'));
  if (direct && toCount(direct[1])) return toCount(direct[1]);
  const before = text.match(new RegExp(NUM + '\\s+' + label + '\\b', 'i'));
  if (before && toCount(before[1])) return toCount(before[1]);
  const loose = text.match(new RegExp(label + '([^\\d]{0,180})(\\d[\\d,.]*\\s*[kmb]?)(?![\\w])', 'i'));
  if (loose && !new RegExp(otherLabel, 'i').test(loose[1]) && toCount(loose[2])) return toCount(loose[2]);
  return null;
}

function parseMonthlyVisits(html) {
  const text = decodeText(html);
  const monthly = findCount(text, 'monthly\\s+visits', 'unique\\s+visitors');
  const unique = findCount(text, 'unique\\s+visitors', 'monthly\\s+visits');
  console.log(`Разобрано со страницы: Monthly Visits = ${monthly ?? 'не найдено'}; Unique Visitors = ${unique ?? 'не найдено'}.`);
  if (monthly == null) {
    throw new Error('Не удалось найти Monthly Visits на странице HypeStat. Источник мог изменить разметку; старые данные оставлены без изменений.');
  }
  // Визитов обычно не меньше, чем уникальных посетителей. Иначе, скорее всего, взято не то число.
  if (unique != null && monthly < unique) {
    throw new Error(`parse sanity check failed: Monthly Visits (${monthly}) < Unique Visitors (${unique}). Точка не записана.`);
  }
  return monthly;
}

function monthKey(date) { return date.slice(0, 7); }

function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5);
}

async function main() {
  const html = await get(PAGE);
  if (!/hypestat/i.test(html) || /captcha|verify you are human|access denied/i.test(html.slice(0, 5000))) {
    throw new Error('HypeStat вернул страницу проверки доступа вместо статистики.');
  }
  const value = parseMonthlyVisits(html);
  const date = new Date().toISOString().slice(0, 10);
  const month = monthKey(date);

  let data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { data = []; }
  if (!Array.isArray(data)) data = [];
  data = data.filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') && Number.isFinite(Number(p.value)) && Number(p.value) > 0);

  // Keep one point per month, retaining the latest valid record for each month.
  const byMonth = new Map();
  data.sort((a, b) => a.date.localeCompare(b.date));
  for (const p of data) byMonth.set(monthKey(p.date), { date: p.date, value: Number(p.value), source: p.source || 'HypeStat', ...(typeof p.archiveUrl === 'string' ? { archiveUrl: p.archiveUrl } : {}) });

  const existing = byMonth.get(month);
  const changed = !existing || existing.value !== value;
  if (changed) {
    byMonth.set(month, { date, value, source: 'HypeStat' });
    const result = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(FILE, JSON.stringify(result, null, 2) + '\n');
    console.log(`${existing ? 'Обновлена' : 'Добавлена'} точка за ${month}: ${value} monthly visits.`);
  } else {
    console.log(`Без изменений: ${month}, ${value} monthly visits. Точка за месяц сохранена.`);
  }

  // meta.json описывает только успешные проверки. lastChecked пишем редко (см. META_COMMIT_INTERVAL_DAYS),
  // а сайт показывает возраст проверки по этой дате честно, без подмены на «сегодня».
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch {}
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};
  const before = JSON.stringify(meta);

  meta.source = 'HypeStat';
  if (!('lastChecked' in meta)) meta.lastChecked = null;
  if (!('lastValueUpdated' in meta)) meta.lastValueUpdated = null;

  const prevChecked = typeof meta.lastChecked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.lastChecked) ? meta.lastChecked : null;
  const age = prevChecked ? daysBetween(prevChecked, date) : Infinity;
  const writeChecked = changed || age >= META_COMMIT_INTERVAL_DAYS || age < 0;
  if (writeChecked) meta.lastChecked = date;
  if (changed) meta.lastValueUpdated = date;
  if (!meta.lastValueUpdated && existing) meta.lastValueUpdated = existing.date;

  if (JSON.stringify(meta) !== before) fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2) + '\n');
  console.log(writeChecked
    ? `Успешная проверка источника: ${date}. lastChecked записан в meta.json.`
    : `Успешная проверка источника: ${date}. lastChecked не записан (последняя запись ${prevChecked}, прошло ${age} дн. < ${META_COMMIT_INTERVAL_DAYS}), чтобы не плодить ежедневные коммиты.`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('ОШИБКА сбора статистики:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { parseMonthlyVisits, findCount, daysBetween };
