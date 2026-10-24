'use strict';
// Checks HypeStat daily, but keeps only one point per calendar month.
// A failure exits non-zero so GitHub Actions cannot report a false green run.
const https = require('https');
const fs = require('fs');
const path = require('path');

const PAGE = 'https://hypestat.com/info/kogama.com';
const FILE = path.join(__dirname, '..', 'data', 'traffic.json');
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

function parseMonthlyVisits(html) {
  // Prefer a value explicitly associated with the Monthly Visits label.
  const text = decodeText(html);
  const patterns = [
    /monthly\s+visits\s*[:\-]?\s*(?:is\s*)?([\d,]+(?:\.\d+)?\s*[kmb]?)/i,
    /([\d,]+(?:\.\d+)?\s*[kmb]?)\s+monthly\s+visits\b/i,
    /monthly\s+visits[^\d]{0,180}(\d[\d,.]*\s*[kmb]?)/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const raw = m[1].replace(/\s/g, '').toLowerCase();
    const suffix = raw.slice(-1);
    const number = Number(raw.replace(/[kmb]$/, '').replace(/,/g, ''));
    const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
    const value = Math.round(number * multiplier);
    if (Number.isFinite(value) && value > 0 && value < 1e9) return value;
  }
  throw new Error('Не удалось найти Monthly Visits на странице HypeStat. Источник мог изменить разметку; старые данные оставлены без изменений.');
}

function monthKey(date) { return date.slice(0, 7); }

(async () => {
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

  // Migrate/dedupe to one point per month, retaining the most recent record for each month.
  const byMonth = new Map();
  data.sort((a, b) => a.date.localeCompare(b.date));
  for (const p of data) byMonth.set(monthKey(p.date), { date: p.date, value: Number(p.value), source: p.source || 'HypeStat' });

  const existing = byMonth.get(month);
  if (existing && existing.value === value) {
    console.log(`Без изменений: ${month}, ${value} monthly visits. Одна точка за месяц сохранена.`);
    return;
  }
  byMonth.set(month, { date, value, source: 'HypeStat' });
  const result = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(FILE, JSON.stringify(result, null, 2) + '\n');
  console.log(`${existing ? 'Обновлена' : 'Добавлена'} точка за ${month}: ${value} monthly visits.`);
})().catch(err => {
  console.error('ОШИБКА сбора статистики:', err.message);
  process.exitCode = 1;
});
