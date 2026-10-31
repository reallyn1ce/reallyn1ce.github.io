/* Чистые функции аналитики: работают только с реально собранными замерами.
   Ничего не прогнозируют и не достраивают пропущенные месяцы. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KAnalytics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 864e5;
  const ts = (iso) => Date.parse(iso + 'T00:00:00Z');
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  // Процент изменения; если база нулевая или нет данных — null, а не выдуманное число
  const pct = (from, to) => (Number.isFinite(from) && Number.isFinite(to) && from > 0 ? (to - from) / from * 100 : null);

  function extremes(pts) {
    if (!pts.length) return null;
    let max = pts[0], min = pts[0];
    for (const p of pts) { if (p.value > max.value) max = p; if (p.value < min.value) min = p; }
    return { max: { value: max.value, date: max.date }, min: { value: min.value, date: min.date } };
  }

  // key: 'YYYY' или 'YYYY-MM'
  function periodStats(pts, key) {
    const s = pts.filter((p) => p.date.startsWith(key));
    if (!s.length) return null;
    const e = extremes(s);
    return {
      key, count: s.length, avg: mean(s.map((p) => p.value)), min: e.min, max: e.max,
      first: s[0].date, last: s[s.length - 1].date,
      sources: [...new Set(s.map((p) => p.source || 'HypeStat'))]
    };
  }

  function periodOptions(pts) {
    const years = [...new Set(pts.map((p) => p.date.slice(0, 4)))].sort();
    const months = [...new Set(pts.map((p) => p.date.slice(0, 7)))].sort();
    return { years, months };
  }

  function comparePeriods(pts, keyA, keyB) {
    const a = periodStats(pts, keyA), b = periodStats(pts, keyB);
    if (!a || !b || keyA === keyB) return null;
    return { a, b, diff: b.avg - a.avg, pct: pct(a.avg, b.avg), mixedSources: new Set([...a.sources, ...b.sources]).size > 1 };
  }

  // Статистика по годам. Сравнение с прошлым годом — только если прошлый год идёт сразу перед текущим.
  function byYear(pts) {
    const years = periodOptions(pts).years;
    return years.map((y) => {
      const st = periodStats(pts, y);
      const prev = years.includes(String(+y - 1)) ? periodStats(pts, String(+y - 1)) : null;
      return { ...st, year: y, months: new Set(pts.filter((p) => p.date.startsWith(y)).map((p) => p.date.slice(0, 7))).size, yoy: prev ? pct(prev.avg, st.avg) : null };
    });
  }

  function changes(pts) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      out.push({ from: a, to: b, days: Math.round((ts(b.date) - ts(a.date)) / DAY), diff: b.value - a.value, pct: pct(a.value, b.value) });
    }
    return out;
  }

  function topChanges(pts, k = 3) {
    const c = changes(pts).filter((x) => x.pct != null);
    return {
      up: c.filter((x) => x.pct > 0).sort((x, y) => y.pct - x.pct).slice(0, k),
      down: c.filter((x) => x.pct < 0).sort((x, y) => x.pct - y.pct).slice(0, k)
    };
  }

  // Устойчивая динамика: минимум minChanges изменений подряд в одну сторону (минимум minChanges+1 замеров)
  function streaks(pts, minChanges = 3) {
    const c = changes(pts), out = [];
    let i = 0;
    while (i < c.length) {
      const dir = Math.sign(c[i].diff);
      if (!dir) { i++; continue; }
      let j = i;
      while (j + 1 < c.length && Math.sign(c[j + 1].diff) === dir) j++;
      const len = j - i + 1;
      if (len >= minChanges) {
        const from = c[i].from, to = c[j].to;
        out.push({ dir: dir > 0 ? 'up' : 'down', changes: len, from, to, pct: pct(from.value, to.value) });
      }
      i = j + 1;
    }
    return out;
  }

  function overall(pts) {
    if (!pts.length) return null;
    const first = pts[0], last = pts[pts.length - 1];
    const e = extremes(pts);
    return {
      count: pts.length, first, last, avg: mean(pts.map((p) => p.value)), ...e,
      spanDays: Math.round((ts(last.date) - ts(first.date)) / DAY),
      pct: pts.length > 1 ? pct(first.value, last.value) : null,
      mixedSources: new Set(pts.map((p) => p.source || 'HypeStat')).size > 1
    };
  }

  return { pct, extremes, periodStats, periodOptions, comparePeriods, byYear, changes, topChanges, streaks, overall };
});
