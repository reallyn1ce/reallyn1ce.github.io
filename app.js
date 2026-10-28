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

  async function loadMeta(path) {
    try {
      const r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    } catch { return {}; }
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
      byDate.set(p.date, { date: p.date, value: v, source: p.source || 'HypeStat', ...(typeof p.archiveUrl === 'string' ? { archiveUrl: p.archiveUrl } : {}) });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------- Hero + график ---------- */
  let trafficPts = [];
  const chartWrap = $('#chart');
  const rangeBox = $('#range');
  let range = store.get('archive-range');
  if (!['30', '182', '365', 'all'].includes(range)) range = 'all';

  // Период считается от последнего замера, чтобы график не пустел, если данные давно не обновлялись
  function visiblePts() {
    if (range === 'all' || !trafficPts.length) return trafficPts;
    const from = Date.parse(trafficPts[trafficPts.length - 1].date) - Number(range) * 864e5;
    const f = trafficPts.filter((p) => Date.parse(p.date) >= from);
    return f.length < 2 ? trafficPts.slice(-2) : f; // замеры раз в месяц — короткий период не должен давать пустоту
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

  function renderHero(meta = {}) {
    const last = trafficPts[trafficPts.length - 1];
    const heroNum = $('#heroNum');
    const heroMeta = $('#heroMeta');
    const status = $('#dataStatus');

    if (!last) {
      heroNum.textContent = '—';
      heroMeta.textContent = 'Данных пока нет';
    } else {
      heroNum.textContent = fmtNum(last.value);
      heroMeta.textContent = `Последний сохранённый замер: ${fmtLong(last.date)} · источник: ${last.source}`;
    }

    const checked = typeof meta.lastChecked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.lastChecked)
      ? meta.lastChecked : null;
    if (!checked) {
      status.className = 'data-status is-unknown';
      status.textContent = 'Статус проверки источника пока недоступен.';
      return;
    }

    const ageDays = Math.floor((Date.now() - Date.parse(checked + 'T00:00:00Z')) / 864e5);
    if (ageDays <= 3) {
      status.className = 'data-status is-fresh';
      status.textContent = `Источник проверен успешно: ${fmtLong(checked)}.`;
    } else {
      status.className = 'data-status is-stale';
      status.textContent = `Последняя успешная проверка: ${fmtLong(checked)}. Данные могут быть устаревшими — проверьте GitHub Actions.`;
    }
  }

  const fmtY = (v) => v >= 1e6 ? +(v / 1e6).toFixed(2) + 'M'
    : v >= 1000 ? +(v / 1000).toFixed(1) + 'K' : String(Math.round(v));

  function niceScale(max, ticks) {
    const raw = (max || 1) / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    return { step, top: Math.ceil(max / step - 1e-9) * step };
  }

  // Вертикальные линии сетки: годы / месяцы / недели в зависимости от охвата
  function timeMarks(t0, t1) {
    const days = (t1 - t0) / 864e5, out = [];
    if (days < 1) return out;
    const d0 = new Date(t0);
    if (days > 400) {
      for (let y = d0.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y++)
        out.push({ t: Date.UTC(y, 0, 1), label: String(y) });
    } else if (days > 50) {
      let y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1;
      for (;; m++) {
        const t = Date.UTC(y, m, 1);
        if (t > t1) break;
        const mm = new Date(t);
        out.push({ t, label: mm.getUTCMonth() === 0 ? String(mm.getUTCFullYear())
          : mm.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', '') });
      }
      if (out.length > 6) return out.filter((_, i) => i % 2 === 0);
    } else {
      const step = 7 * 864e5;
      for (let t = t0 + step; t <= t1; t += step)
        out.push({ t, label: fmtShort(new Date(t).toISOString().slice(0, 10)).slice(0, 5) });
    }
    return out;
  }

  let gradSeq = 0;
  function drawChart() {
    chartWrap.textContent = '';
    const pts = visiblePts();
    if (!pts.length) {
      chartWrap.appendChild(el('div', 'chart-empty', 'График появится после первого замера'));
      return;
    }
    const W = Math.max(chartWrap.clientWidth - 8, 260);
    const narrow = W < 420;
    const pad = { l: 8, r: narrow ? 52 : 62, t: 34, b: 26 };
    const volH = 26, gap = 10;
    const H = (narrow ? 250 : 300);
    const ih = H - pad.t - pad.b - volH - gap, iw = W - pad.l - pad.r;
    const n = pts.length;
    const baseY = pad.t + ih;

    const vals = pts.map((p) => p.value);
    const sc = niceScale(Math.max(...vals) * 1.05, 4);
    const times = pts.map((p) => Date.parse(p.date));
    const t0 = times[0], t1 = times[n - 1];
    const xOf = (i) => n === 1 || t1 === t0 ? pad.l + iw / 2 : pad.l + (times[i] - t0) / (t1 - t0) * iw;
    const yOf = (v) => baseY - v / sc.top * ih;

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'График месячных визитов kogama.com' });
    const gid = 'g' + (++gradSeq);
    const defs = svgEl('defs', {});
    const lg = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
    const s1 = svgEl('stop', { offset: '0%' }); s1.setAttribute('style', 'stop-color:var(--accent);stop-opacity:.38');
    const s2 = svgEl('stop', { offset: '100%' }); s2.setAttribute('style', 'stop-color:var(--accent);stop-opacity:.03');
    lg.append(s1, s2); defs.appendChild(lg); svg.appendChild(defs);

    // Горизонтальная сетка + подписи справа
    const last = pts[n - 1], lastY = yOf(last.value);
    for (let v = 0; v <= sc.top + 1e-9; v += sc.step) {
      const y = yOf(v);
      svg.appendChild(svgEl('line', { class: 'grid', x1: pad.l, x2: pad.l + iw, y1: y, y2: y }));
      if (Math.abs(y - lastY) < 15) continue;
      svg.appendChild(svgEl('rect', { class: 'ylab', x: pad.l + iw + 8, y: y - 10, width: pad.r - 10, height: 20, rx: 3 }));
      const tx = svgEl('text', { class: 'tick', x: pad.l + iw + 8 + (pad.r - 10) / 2, y: y + 3.5, 'text-anchor': 'middle' });
      tx.textContent = fmtY(v);
      svg.appendChild(tx);
    }

    // Вертикальная сетка + подписи времени
    timeMarks(t0, t1).forEach((m) => {
      const x = pad.l + (m.t - t0) / (t1 - t0) * iw;
      svg.appendChild(svgEl('line', { class: 'grid', x1: x, x2: x, y1: pad.t - 10, y2: baseY + gap + volH }));
      const tx = svgEl('text', { class: 'tick', x, y: H - 6, 'text-anchor': 'middle' });
      tx.textContent = m.label;
      svg.appendChild(tx);
    });
    if (n === 1) {
      const tx = svgEl('text', { class: 'tick', x: xOf(0), y: H - 6, 'text-anchor': 'middle' });
      tx.textContent = fmtShort(pts[0].date);
      svg.appendChild(tx);
    }

    // Мини-столбики изменения к прошлому замеру (зелёный — рост, красный — спад)
    if (n >= 2) {
      const diffs = pts.map((p, i) => i ? p.value - pts[i - 1].value : 0);
      const md = Math.max(...diffs.map(Math.abs)) || 1;
      const bw = Math.max(2, Math.min(10, iw / n * 0.6));
      const vb = baseY + gap + volH;
      diffs.forEach((d, i) => {
        if (!i) return;
        const h = Math.max(2, Math.abs(d) / md * volH);
        svg.appendChild(svgEl('rect', { class: d >= 0 ? 'vol up' : 'vol down', x: xOf(i) - bw / 2, y: vb - h, width: bw, height: h, rx: 1 }));
      });
    }

    // Линия + заливка
    if (n >= 2) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)}`).join(' ');
      svg.appendChild(svgEl('path', { class: 'area', fill: `url(#${gid})`, d: `${d} L${xOf(n - 1).toFixed(1)} ${baseY} L${xOf(0).toFixed(1)} ${baseY} Z` }));
      svg.appendChild(svgEl('path', { class: 'line', d }));
    }

    // Последнее значение: точка + плашка справа
    svg.appendChild(svgEl('circle', { class: 'last-dot', cx: xOf(n - 1), cy: lastY, r: 4.5 }));
    svg.appendChild(svgEl('rect', { class: 'last-pill', x: pad.l + iw + 4, y: lastY - 12, width: pad.r - 4, height: 24, rx: 3 }));
    const lt = svgEl('text', { class: 'last-txt', x: pad.l + iw + 4 + (pad.r - 4) / 2, y: lastY + 4, 'text-anchor': 'middle' });
    lt.textContent = fmtY(last.value);
    svg.appendChild(lt);

    // Курсор: вертикальная линия + точка + подсказка
    const cross = svgEl('line', { class: 'cross', y1: pad.t - 10, y2: baseY + gap + volH, style: 'display:none' });
    const cdot = svgEl('circle', { class: 'cdot', r: 5, style: 'display:none' });
    svg.append(cross, cdot);
    const tip = el('div', 'tip');
    const hide = () => { tip.style.display = 'none'; cross.style.display = 'none'; cdot.style.display = 'none'; };
    const showAt = (clientX) => {
      const sr = svg.getBoundingClientRect(), wr = chartWrap.getBoundingClientRect();
      const mx = (clientX - sr.left) * W / sr.width;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const dd = Math.abs(xOf(i) - mx); if (dd < bd) { bd = dd; bi = i; } }
      const p = pts[bi], x = xOf(bi), y = yOf(p.value);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.style.display = '';
      cdot.setAttribute('cx', x); cdot.setAttribute('cy', y); cdot.style.display = '';
      tip.textContent = '';
      tip.appendChild(document.createTextNode(fmtNum(p.value)));
      tip.appendChild(el('small', null, fmtLong(p.date)));
      tip.style.display = 'block';
      const px = x * sr.width / W + (sr.left - wr.left);
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(Math.max(px - tw / 2, 4), wr.width - tw - 4) + 'px';
      tip.style.top = '6px';
      void th;
    };
    svg.addEventListener('pointermove', (e) => showAt(e.clientX));
    svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });

    chartWrap.appendChild(el('div', 'chart-title', 'KOGAMA.COM · визитов в месяц'));
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tip);
  }

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.chart')) {
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
    const [traffic, events, communities, meta] = await Promise.all([
      loadJSON('data/traffic.json', []),
      loadJSON('data/events.json', []),
      loadJSON('data/communities.json', []),
      loadMeta('data/meta.json')
    ]);
    trafficPts = cleanTraffic(traffic);
    renderHero(meta);
    syncRange();
    drawChart();
    renderTimeline(events);
    renderCommunities(communities);
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
