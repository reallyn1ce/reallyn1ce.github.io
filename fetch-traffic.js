'use strict';
// Node 20, только стандартная библиотека. Всегда завершается с кодом 0.
const https = require('https');
const fs = require('fs');
const path = require('path');

const PAGE = 'https://hypestat.com/info/kogama.com';
const FILE = path.join(__dirname, '..', 'data', 'traffic.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function get(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'identity' },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function parseMonthlyVisits(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const patterns = [
    /monthly\s+visits[^0-9]{0,120}?(\d{1,3}(?:,\d{3})+|\d+)/i,
    /(\d{1,3}(?:,\d{3})+)\s+(?:monthly\s+)?visits\s+(?:per|a|each)\s+month/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0 && n < 1e9) return n;
    }
  }
  return null;
}

(async () => {
  try {
    const html = await get(PAGE);
    const value = parseMonthlyVisits(html);
    if (value == null) { console.log('Не удалось найти Monthly Visits — пропускаю.'); return; }

    let data = [];
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
    if (!Array.isArray(data)) data = [];
    data.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const last = data[data.length - 1];
    if (last && Number(last.value) === value) { console.log('Значение не изменилось (' + value + ') — пропускаю.'); return; }

    const date = new Date().toISOString().slice(0, 10);
    data = data.filter((p) => p.date !== date);
    data.push({ date, value, source: 'HypeStat' });

    fs.writeFileSync(FILE, '[\n' + data.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n]\n');
    console.log('Добавлено: ' + date + ' → ' + value);
  } catch (err) {
    console.log('Ошибка (не критично): ' + err.message);
  }
})();
