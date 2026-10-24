(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  /* ---------- Тема ---------- */
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 22c-5.5 0-10-4.5-10-10 0-4.8 3.4-8.9 8-9.8.4-.1.8.1 1 .5.2.4.1.8-.2 1.1-1.8 1.7-2.8 4-2.8 6.5 0 4.9 4 8.9 8.9 8.9 1 0 2-.2 2.9-.5.4-.1.8 0 1 .3.2.3.2.7 0 1-1.8 2.4-4.7 3.9-7.8 3.9z"/></svg>';
  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a1 1 0 0 1-1-1V1a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1zm0 19a1 1 0 0 1-1-1v-2a1 1 0 0 1 2 0v2a1 1 0 0 1-1 1zm9-11a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2h-2a1 1 0 0 1-1-1zM1 12a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1zm17.66-6.66a1 1 0 0 1 0-1.41l1.41-1.42a1 1 0 1 1 1.42 1.42l-1.42 1.41a1 1 0 0 1-1.41 0zM3.51 20.49a1 1 0 0 1 0-1.41l1.42-1.42a1 1 0 0 1 1.41 1.42l-1.41 1.41a1 1 0 0 1-1.42 0zm15.56 0a1 1 0 0 1-1.42 0l-1.41-1.41a1 1 0 0 1 1.41-1.42l1.42 1.42a1 1 0 0 1 0 1.41zM4.93 5.93a1 1 0 0 1-1.42 0L2.1 4.51a1 1 0 1 1 1.41-1.42l1.42 1.42a1 1 0 0 1 0 1.41zM12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg>';
  const themeBtn = $('#themeToggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(light) {
    document.body.classList.toggle('light', light);
    themeBtn.innerHTML = light ? SUN : MOON;
    if (themeMeta) themeMeta.content = light ? '#f8f9fa' : '#0c0d12';
  }
  applyTheme(store.get('archive-theme') === 'light');
  themeBtn.addEventListener('click', () => {
    const light = !document.body.classList.contains('light');
    applyTheme(light);
    store.set('archive-theme', light ? 'light' : 'dark');
  });

  /* ---------- Данные ---------- */
  async function loadJSON(path, fallback) {
    try {
      const r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return Array.isArray(d) ? d : fallback;
    } catch { return fallback; }
  }

  const fmtNum = (n) => Math.round(n).toLocaleString('ru-RU');
  const fmtLong = (iso) => new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtShort = (iso) => new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });

  function cleanTraffic(raw) {
    const byDate = new Map();
    for (const p of raw) {
      if (!p || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) continue;
      const v = Number(p.value);
      if (!Number.isFinite(v) || v < 0 || Number.isNaN(Date.parse(p.date))) continue;
      byDate.set(p.date, { date: p.date, value: v, source: p.source || 'HypeStat' });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------- Hero + график ---------- */
  let trafficPts = [];
  const chartWrap = $('#chart');
  const rangeBox = $('#range');
  let range = store.get('archive-range');
  if (!['30', '365', 'all'].includes(range)) range = 'all';

  // Период считается от последнего замера, чтобы график не пустел, если данные давно не обновлялись
  function visiblePts() {
    if (range === 'all' || !trafficPts.length) return trafficPts;
    const from = Date.parse(trafficPts[trafficPts.length - 1].date) - Number(range) * 864e5;
    return trafficPts.filter((p) => Date.parse(p.date) >= from);
  }

  function syncRange() {
    rangeBox.hidden = trafficPts.length < 2;
    rangeBox.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.range === range;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  rangeBox.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-range]');
    if (!b) return;
    range = b.dataset.range;
    store.set('archive-range', range);
    syncRange();
    drawChart();
  });

  function renderHero() {
    const last = trafficPts[trafficPts.length - 1];
    if (!last) {
      $('#heroNum').textContent = '—';
      $('#heroMeta').textContent = 'Данных пока нет';
      return;
    }
    $('#heroNum').textContent = fmtNum(last.value);
    $('#heroMeta').textContent = `Последний замер: ${fmtLong(last.date)} · источник: ${last.source}`;
  }

  const fmtY = (v, fine) => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M'
    : v >= 1000 ? (v / 1000).toFixed(fine ? 1 : 0) + 'K' : String(Math.round(v));

  function drawChart() {
    chartWrap.textContent = '';
    const pts = visiblePts();
    if (!pts.length) {
      chartWrap.appendChild(el('div', 'chart-empty', 'График появится после первого замера'));
      return;
    }
    const W = Math.max(chartWrap.clientWidth - 8, 240);
    const H = W < 420 ? 220 : 260;
    const pad = { l: W < 420 ? 40 : 48, r: 16, t: 16, b: 30 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = pts.length;

    const vals = pts.map(p => p.value);
    let lo, hi;
    if (n < 3) { lo = 0; hi = Math.max(...vals) * 1.25 || 1; }
    else {
      const mn = Math.min(...vals), mx = Math.max(...vals);
      const range = mx - mn || mx * 0.1 || 1;
      lo = Math.max(0, mn - range * 0.2); hi = mx + range * 0.2;
    }
    const times = pts.map(p => Date.parse(p.date));
    const t0 = times[0], t1 = times[n - 1];
    const xOf = (i) => n === 1 ? pad.l + iw / 2 : pad.l + (times[i] - t0) / (t1 - t0) * iw;
    const yOf = (v) => pad.t + ih - (v - lo) / (hi - lo) * ih;

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'График месячных визитов kogama.com' });

    for (let k = 0; k <= 3; k++) {
      const v = lo + (hi - lo) * k / 3, y = yOf(v);
      svg.appendChild(svgEl('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      const tx = svgEl('text', { class: 'tick', x: pad.l - 6, y: y + 3, 'text-anchor': 'end' });
      tx.textContent = fmtY(v, hi - lo < 4000);
      svg.appendChild(tx);
    }

    const xi = [...new Set(n === 1 ? [0] : [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1])];
    xi.forEach((i) => {
      const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      const tx = svgEl('text', { class: 'tick', x: xOf(i), y: H - 8, 'text-anchor': anchor });
      tx.textContent = fmtShort(pts[i].date);
      svg.appendChild(tx);
    });

    if (n >= 2) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');
      if (n >= 3) svg.appendChild(svgEl('path', { class: 'area', d: `${d} L${xOf(n - 1).toFixed(1)} ${pad.t + ih} L${xOf(0).toFixed(1)} ${pad.t + ih} Z` }));
      svg.appendChild(svgEl('path', { class: 'line', d }));
    }

    const tip = el('div', 'tip');
    const show = (g, p, x, y) => {
      tip.textContent = '';
      tip.appendChild(document.createTextNode(fmtNum(p.value)));
      tip.appendChild(el('small', null, fmtLong(p.date)));
      tip.style.display = 'block';
      const sr = svg.getBoundingClientRect(), wr = chartWrap.getBoundingClientRect();
      const px = x * sr.width / W + (sr.left - wr.left);
      const py = y * sr.height / H + (sr.top - wr.top);
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(Math.max(px - tw / 2, 4), wr.width - tw - 4) + 'px';
      tip.style.top = Math.max(py - th - 12, 4) + 'px';
    };
    const hide = () => { tip.style.display = 'none'; };

    pts.forEach((p, i) => {
      const x = xOf(i), y = yOf(p.value);
      const g = svgEl('g', { class: 'pt', tabindex: '0', 'aria-label': `${fmtLong(p.date)}: ${fmtNum(p.value)} визитов` });
      g.appendChild(svgEl('circle', { class: 'hit', cx: x, cy: y, r: 16 }));
      g.appendChild(svgEl('circle', { class: 'dot', cx: x, cy: y, r: 4 }));
      g.addEventListener('pointerenter', () => show(g, p, x, y));
      g.addEventListener('pointerdown', () => show(g, p, x, y));
      g.addEventListener('focus', () => show(g, p, x, y));
      g.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
      g.addEventListener('blur', hide);
      svg.appendChild(g);
    });

    chartWrap.appendChild(svg);
    if (n === 1) chartWrap.appendChild(el('p', 'chart-note', 'Пока есть только один месячный замер. Линия динамики появится после следующего обновления HypeStat.'));
    chartWrap.appendChild(tip);
  }

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.pt')) {
      const t = chartWrap.querySelector('.tip');
      if (t) t.style.display = 'none';
    }
  });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawChart, 120); });

  /* ---------- Хронология ---------- */
  function renderTimeline(events) {
    const ol = $('#timeline');
    ol.textContent = '';
    events
      .filter(e => e && e.label)
      .sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0))
      .forEach((e) => {
        const li = el('li');
        li.appendChild(el('div', 'tl-year', String(e.year ?? '')));
        li.appendChild(el('div', 'tl-label', e.label));
        if (e.note) li.appendChild(el('p', 'tl-note', e.note));
        ol.appendChild(li);
      });
  }

  /* ---------- Сообщества ---------- */
  function renderCommunities(list) {
    const box = $('#communities');
    box.textContent = '';
    const items = list.filter(c => c && c.name && /^https?:\/\//i.test(c.url || ''));
    if (!items.length) {
      box.appendChild(el('div', 'placeholder', 'Ссылки на сообщества появятся позже'));
      return;
    }
    items.forEach((c) => {
      const a = el('a', 'card');
      a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.appendChild(el('div', 'card-name', c.name));
      if (c.desc) a.appendChild(el('p', 'card-desc', c.desc));
      let host = '';
      try { host = new URL(c.url).hostname; } catch {}
      a.appendChild(el('div', 'card-host', host));
      box.appendChild(a);
    });
  }

  /* ---------- Старт ---------- */
  (async () => {
    const [traffic, events, communities] = await Promise.all([
      loadJSON('data/traffic.json', []),
      loadJSON('data/events.json', []),
      loadJSON('data/communities.json', [])
    ]);
    trafficPts = cleanTraffic(traffic);
    renderHero();
    syncRange();
    drawChart();
    renderTimeline(events);
    renderCommunities(communities);
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
