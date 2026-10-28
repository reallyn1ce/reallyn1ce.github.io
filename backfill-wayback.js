#!/usr/bin/env node
'use strict';

// Manual backfill from archived HypeStat snapshots.
// Dry-run by default. Pass --write to merge candidates into data/traffic.json.
// Snapshot coverage is sparse; only explicit Monthly Visits values are accepted.
const https = require('https');
const fs = require('fs');
const path = require('path');

const CDX = 'https://web.archive.org/cdx/search/cdx?url=hypestat.com%2Finfo%2Fkogama.com&output=json&filter=statuscode%3A200&filter=mimetype%3Atext%2Fhtml&fl=timestamp%2Coriginal%2Cstatuscode&collapse=timestamp%3A6';
const FILE = path.join(__dirname, '..', 'data', 'traffic.json');
const UA = 'KOGAMA-ARCHIVE-Wayback-Backfill/1.1 (manual historical data import)';
const WRITE = process.argv.includes('--write');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Math.min(500, Number(LIMIT_ARG.split('=')[1]) || 120)) : 120;
const DELAY_MS = 500;
const MAX_RETRIES = 3;
const JUMP_FACTOR = 5;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getOnce(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'identity'
      },
      timeout: 30000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(getWithRetry(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) {
        const err = new Error(`HTTP ${res.statusCode} для ${url}`);
        err.statusCode = res.statusCode;
        err.retryAfter = res.headers['retry-after'];
        res.resume();
        return reject(err);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 12_000_000) req.destroy(new Error('Ответ слишком большой'));
      });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error(`Тайм-аут: ${url}`)));
    req.on('error', reject);
  });
}

function retryDelay(err, attempt) {
  const retryAfter = Number(err && err.retryAfter);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30000);
  return Math.min(1000 * (2 ** attempt), 8000); // 1s, 2s, 4s
}

async function getWithRetry(url, redirects = 5) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await getOnce(url, redirects);
    } catch (err) {
      lastError = err;
      const status = Number(err && err.statusCode);
      const retryable = !status || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === MAX_RETRIES) break;
      const delay = retryDelay(err, attempt);
      console.log(`  Временная ошибка (${err.message}); повтор ${attempt + 1}/${MAX_RETRIES} через ${Math.ceil(delay / 1000)} с.`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function decodeText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2c;|&#44;/gi, ',')
    .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ');
}

function parseMonthlyVisits(html) {
  const text = decodeText(html);
  const patterns = [
    /monthly\s+visits\s*[:\-]?\s*(?:is\s*)?([\d,]+(?:\.\d+)?\s*[kmb]?)(?![\w])/i,
    /([\d,]+(?:\.\d+)?\s*[kmb]?)\s+monthly\s+visits\b/i,
    /monthly\s+visits[^\d]{0,180}(\d[\d,.]*\s*[kmb]?)(?![\w])/i
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (!match) continue;
    const raw = match[1].replace(/\s/g, '').toLowerCase();
    const suffix = raw.slice(-1);
    const numeric = raw.replace(/[kmb]$/, '').replace(/,/g, '');
    const n = Number(numeric);
    const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1;
    const value = Math.round(n * multiplier);
    // Sanity bounds; values are still printed for human review before any write.
    if (Number.isFinite(value) && value >= 100 && value < 1e9) return value;
  }
  return null;
}

function readExisting() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') && Number.isFinite(Number(p.value)))
      .map(p => ({ ...p, value: Number(p.value) }));
  } catch {
    return [];
  }
}

function fmt(value) {
  return Number(value).toLocaleString('en-US');
}

function findLargeJumps(points) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const warnings = new Map();
  for (let i = 1; i < sorted.length; i++) {
    const previous = Number(sorted[i - 1].value);
    const current = Number(sorted[i].value);
    if (previous > 0 && current > 0) {
      const factor = Math.max(previous, current) / Math.min(previous, current);
      if (factor > JUMP_FACTOR) {
        warnings.set(`${sorted[i].date}|${current}`, `скачок >${JUMP_FACTOR}× относительно ${sorted[i - 1].date} (${fmt(previous)})`);
      }
    }
  }
  return warnings;
}

function printTable(points, existing) {
  const combined = [...existing, ...points].sort((a, b) => a.date.localeCompare(b.date));
  const jumps = findLargeJumps(combined);
  console.log('\nНайденные значения (проверь снимки перед сохранением):');
  console.log('Дата       | Monthly Visits | Решение / предупреждение');
  console.log('-----------|----------------|--------------------------');
  if (!points.length) {
    console.log('Подходящие значения не найдены.');
    return;
  }
  for (const point of points.sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${point.date}|${Number(point.value)}`;
    const jump = jumps.get(key);
    const month = point.date.slice(0, 7);
    const live = existing.find(p => p.date.slice(0, 7) === month && !String(p.source || '').includes('Wayback'));
    let decision = live ? `пропуск: уже есть текущая точка за ${month}` : 'кандидат';
    if (jump) decision += `; ⚠ ${jump}`;
    console.log(`${point.date} | ${fmt(point.value).padStart(14)} | ${decision}`);
    console.log(`           |                | ${point.archiveUrl}`);
  }
  if (jumps.size) {
    console.log(`\nВНИМАНИЕ: найдено ${jumps.size} возможных скачков больше чем в ${JUMP_FACTOR} раз. Это предупреждения для ручной проверки, точки не отбрасываются автоматически.`);
  }
}

async function main() {
  console.log('Запрашиваю список снимков HypeStat в Wayback Machine…');
  const raw = await getWithRetry(CDX);
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length < 2) {
    console.log('Wayback Machine не вернула подходящих снимков. traffic.json не изменён.');
    return;
  }

  const captures = rows.slice(1)
    .map(row => ({ timestamp: String(row[0]), original: String(row[1]) }))
    .filter(row => /^\d{14}$/.test(row.timestamp) && /^https?:\/\//i.test(row.original))
    .slice(-LIMIT);

  const existing = readExisting();
  const parsedSnapshots = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < captures.length; i++) {
    const cap = captures[i];
    const date = `${cap.timestamp.slice(0, 4)}-${cap.timestamp.slice(4, 6)}-${cap.timestamp.slice(6, 8)}`;
    const archiveUrl = `https://web.archive.org/web/${cap.timestamp}id_/${cap.original}`;
    try {
      const html = await getWithRetry(archiveUrl);
      const value = parseMonthlyVisits(html);
      if (!value) {
        skipped++;
        console.log(`[${i + 1}/${captures.length}] ${date}: Monthly Visits не найдено, пропуск.`);
      } else {
        parsedSnapshots.push({ date, value, source: 'HypeStat (Wayback Machine)', archiveUrl });
        console.log(`[${i + 1}/${captures.length}] ${date}: найдено ${fmt(value)}.`);
      }
    } catch (err) {
      skipped++;
      errors++;
      console.log(`[${i + 1}/${captures.length}] ${date}: ошибка после повторов (${err.message}), пропуск.`);
    }
    if (i < captures.length - 1) await sleep(DELAY_MS);
  }

  // One archived point per month: keep the latest successfully parsed snapshot.
  const candidateByMonth = new Map();
  for (const point of parsedSnapshots) candidateByMonth.set(point.date.slice(0, 7), point);
  const candidates = [...candidateByMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
  printTable(candidates, existing);

  const byMonth = new Map();
  for (const point of existing) byMonth.set(point.date.slice(0, 7), point);
  let added = 0;
  for (const point of candidates) {
    const month = point.date.slice(0, 7);
    const current = byMonth.get(month);
    // Preserve non-Wayback values; only replace an older Wayback point with a newer snapshot.
    if (current && !String(current.source || '').includes('Wayback')) continue;
    byMonth.set(month, point);
    added++;
  }

  const merged = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
  console.log(`\nСнимков проверено: ${captures.length}; снимков с распознанным значением: ${parsedSnapshots.length}; уникальных месяцев-кандидатов: ${candidates.length}; точек, которые будут добавлены/обновлены: ${added}; пропусков: ${skipped}; ошибок после повторов: ${errors}.`);
  if (!WRITE) {
    console.log('\nПРЕДВАРИТЕЛЬНЫЙ РЕЖИМ: traffic.json не изменён. Проверь таблицу и archiveUrl. Для сохранения повтори запуск с --write.');
    return;
  }
  fs.writeFileSync(FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Сохранено ${merged.length} точек в ${FILE}. Проверь значения и ссылки на снимки перед публикацией.`);
}

main().catch(err => {
  console.error('Ошибка Wayback backfill:', err.message);
  process.exitCode = 1;
});
