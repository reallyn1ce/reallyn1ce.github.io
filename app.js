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
  const loadErrors = []; // файлы, которые не удалось загрузить (в отличие от пустых)
  async function loadJSON(path, fallback) {
    try {
      const r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (!Array.isArray(d)) throw new Error('не массив');
      return d;
    } catch { loadErrors.push(path); return fallback; }
  }

  async function loadMeta(path) {
    try {
      const r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('не объект');
      return d;
    } catch { loadErrors.push(path); return {}; }
  }

  const fmtNum = (n) => Math.round(n).toLocaleString('ru-RU');
  const fmtLong = (iso) => new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtShort = (iso) => new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });

  // Должно совпадать с META_COMMIT_INTERVAL_DAYS в scripts/fetch-traffic.js
  const META_COMMIT_INTERVAL_DAYS = 7;
  const STALE_AFTER_DAYS = META_COMMIT_INTERVAL_DAYS + 3;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

  function plural(n, f) {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? f[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? f[1] : f[2];
  }
  // Целые дни от даты (UTC) до сегодняшней UTC-даты — так же, как пишет дату скрипт сбора
  function daysSince(iso) {
    const today = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    return Math.floor((today - Date.parse(iso + 'T00:00:00Z')) / 864e5);
  }
  function fmtAgo(iso) {
    const d = daysSince(iso);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'вчера';
    if (d > 30) return 'более месяца назад';
    return `${d} ${plural(d, ['день', 'дня', 'дней'])} назад`;
  }

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

    const checked = typeof meta.lastChecked === 'string' && ISO.test(meta.lastChecked) ? meta.lastChecked : null;
    if (!checked) {
      status.className = 'data-status is-unknown';
      status.textContent = 'Статус проверки источника пока недоступен.';
      return;
    }

    // lastChecked пишется в файл раз в неделю, поэтому показываем возраст именно этой даты, а не «сегодня»
    const ago = fmtAgo(checked);
    if (daysSince(checked) <= STALE_AFTER_DAYS) {
      status.className = 'data-status is-fresh';
      status.textContent = `Источник проверен ${ago} (${fmtLong(checked)}). Дата в архиве обновляется раз в неделю, реальная проверка могла быть позже.`;
    } else {
      status.className = 'data-status is-stale';
      status.textContent = `Последняя зафиксированная проверка: ${ago} (${fmtLong(checked)}). Данные могут быть устаревшими.`;
    }
  }

  /* ---------- Карточки статистики ---------- */
  function setStat(id, val, sub, mod) {
    const box = document.getElementById('stat-' + id);
    if (!box) return;
    const v = box.querySelector('.stat-val'), s = box.querySelector('.stat-sub');
    v.className = 'stat-val' + (mod ? ' ' + mod : '');
    v.textContent = val;
    s.textContent = sub;
  }

  function renderStats(meta = {}) {
    const n = trafficPts.length;
    const last = trafficPts[n - 1], prev = trafficPts[n - 2];

    setStat('current', last ? fmtNum(last.value) : '—', 'визитов/мес');

    if (last && prev && prev.value > 0) {
      const pct = (last.value - prev.value) / prev.value * 100;
      const txt = Math.abs(pct).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const flat = Math.abs(pct) < 0.05;
      setStat('change', flat ? '0,0%' : `${pct > 0 ? '↑' : '↓'} ${txt}%`, `к замеру ${fmtShort(prev.date)}`, flat ? '' : pct > 0 ? 'up' : 'down');
    } else {
      setStat('change', '—', 'мало замеров');
    }

    if (n) {
      const top = trafficPts.reduce((m, p) => (p.value > m.value ? p : m));
      setStat('max', fmtNum(top.value), 'за период сбора');
      const t = document.getElementById('stat-max');
      if (t) t.title = `Замер от ${fmtLong(top.date)}`;
    } else {
      setStat('max', '—', 'за период сбора');
    }

    const checked = typeof meta.lastChecked === 'string' && ISO.test(meta.lastChecked) ? meta.lastChecked : null;
    setStat('updated', checked ? fmtAgo(checked) : '—', 'проверка источника', checked ? 'is-text' : '');
  }

  function finishLoading() {
    const hero = document.querySelector('.hero');
    hero.classList.remove('is-loading');
    hero.removeAttribute('aria-busy');
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

  const isWayback = (p) => /wayback/i.test(p.source || '');

  // Заглушка: только сетка и оси, без чисел; пунктир — условная иллюстрация, а не данные
  function placeholderChart() {
    const failed = loadErrors.includes('data/traffic.json');
    const box = el('div', 'chart-ph');
    const svg = svgEl('svg', { viewBox: '0 0 600 260', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    for (let i = 1; i <= 4; i++) svg.appendChild(svgEl('line', { class: 'ph-grid', x1: 40, x2: 580, y1: 20 + i * 44, y2: 20 + i * 44 }));
    for (let i = 1; i <= 5; i++) svg.appendChild(svgEl('line', { class: 'ph-grid', x1: 40 + i * 90, x2: 40 + i * 90, y1: 20, y2: 240 }));
    svg.appendChild(svgEl('line', { class: 'ph-axis', x1: 40, x2: 40, y1: 20, y2: 240 }));
    svg.appendChild(svgEl('line', { class: 'ph-axis', x1: 40, x2: 580, y1: 240, y2: 240 }));
    svg.appendChild(svgEl('path', { class: 'ph-line', d: 'M40 200 C120 190 160 120 240 130 S360 190 430 120 S520 70 580 90' }));
    const t = el('div', 'ph-text');
    t.append(
      el('b', null, failed ? 'Данные не загрузились' : 'Ожидание первых данных'),
      el('span', null, failed
        ? 'Не удалось получить файл замеров. Это ошибка загрузки, а не отсутствие данных.'
        : 'График построится автоматически после первого замера HypeStat. Пунктир — условная иллюстрация, это не данные.')
    );
    box.append(svg, t);
    return box;
  }

  let gradSeq = 0;
  function drawChart() {
    chartWrap.textContent = '';
    const pts = visiblePts();
    if (!pts.length) {
      chartWrap.appendChild(placeholderChart());
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

    // Разные источники: живые точки — залитые, снимки Wayback — полые с пунктиром.
    // Если источник один, маркеров нет (вид графика не меняется).
    const mixed = pts.some(isWayback) && pts.some((p) => !isWayback(p));
    if (mixed) {
      pts.forEach((p, i) => svg.appendChild(svgEl('circle', {
        class: isWayback(p) ? 'pt-wb' : 'pt-live', cx: xOf(i), cy: yOf(p.value), r: 3.5
      })));
    }

    // Последнее значение: точка + плашка справа
    svg.appendChild(svgEl('circle', { class: 'last-dot' + (mixed && isWayback(last) ? ' pt-wb' : ''), cx: xOf(n - 1), cy: lastY, r: 4.5 }));
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
      cdot.setAttribute('class', 'cdot' + (mixed && isWayback(p) ? ' wb' : ''));
      tip.textContent = '';
      tip.appendChild(document.createTextNode(fmtNum(p.value)));
      tip.appendChild(el('small', null, fmtLong(p.date)));
      tip.appendChild(el('small', null, p.source));
      const href = safeUrl(p.archiveUrl);
      if (href) {
        const a = el('a', null, 'снимок Wayback ↗');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        tip.appendChild(a);
      }
      tip.classList.toggle('has-link', !!href);
      tip.style.display = 'block';
      const px = x * sr.width / W + (sr.left - wr.left);
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(Math.max(px - tw / 2, 4), wr.width - tw - 4) + 'px';
      tip.style.top = '6px';
      void th;
    };
    svg.addEventListener('pointermove', (e) => showAt(e.clientX));
    svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
    // Мышь может перейти с графика на подсказку со ссылкой — тогда не прячем её
    svg.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !(e.relatedTarget && tip.contains(e.relatedTarget))) hide();
    });
    tip.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !(e.relatedTarget && svg.contains(e.relatedTarget))) hide();
    });

    chartWrap.appendChild(el('div', 'chart-title', 'KOGAMA.COM · визитов в месяц'));
    chartWrap.appendChild(svg);
    chartWrap.appendChild(tip);
    if (mixed) {
      const lg = el('div', 'pt-legend');
      const a = el('span'); a.append(el('i'), document.createTextNode('замер HypeStat'));
      const b = el('span'); b.append(el('i', 'wb'), document.createTextNode('снимок из Wayback Machine'));
      lg.append(a, b);
      chartWrap.appendChild(lg);
    }
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
  const STATUS_LABEL = {
    confirmed: 'Подтверждено',
    indirect: 'Частично подтверждено',
    unverified: 'Требует проверки'
  };
  const CATEGORY_LABEL = {
    start: 'Начало', update: 'Обновление', server: 'Сервер', event: 'Мероприятие', company: 'Компания', platform: 'Платформа', popularity: 'Популярность',
    features: 'Функции', announcement: 'Объявление', archive: 'Архив', other: 'Другое'
  };
  const evKey = (e) => String(e.date || e.year || '');

  const DATE_NOTE = { approx: 'Приблизительная дата', year: 'Известен только год' };

  const YT = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;
  const MEDIA_ICO = { video: '▶', image: '🖼', archive: '🕰', document: '📄' };
  const MEDIA_LABEL = { video: 'Видео', image: 'Изображение', archive: 'Архивная страница', document: 'Документ' };

  function renderMedia(list) {
    const items = (Array.isArray(list) ? list : []).filter((m) => m && m.title && safeUrl(m.url) && MEDIA_LABEL[m.type]);
    if (!items.length) return null;
    const box = el('div', 'tl-media');
    box.appendChild(el('p', 'tl-mh', 'Материалы'));
    items.forEach((m) => {
      const row = el('div', 'tl-m');
      const a = el('a', null, `${MEDIA_ICO[m.type]} ${MEDIA_LABEL[m.type]}: ${m.title} ↗`);
      a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      row.appendChild(a);
      const credit = [m.author && 'Автор: ' + m.author, m.source && 'Источник: ' + m.source].filter(Boolean).join(' · ');
      if (credit) row.appendChild(el('span', 'muted', credit));
      const yt = m.type === 'video' && m.url.match(YT);
      if (yt) {
        // Плеер подгружается только по нажатию: без лишних запросов к сторонним сайтам
        const b = el('button', 'tl-toggle', '▶ Смотреть здесь'); b.type = 'button';
        b.addEventListener('click', () => {
          const f = document.createElement('iframe');
          f.src = 'https://www.youtube-nocookie.com/embed/' + yt[1];
          f.title = m.title; f.loading = 'lazy'; f.allowFullscreen = true;
          f.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen');
          f.className = 'tl-video';
          b.replaceWith(f);
        });
        row.appendChild(b);
      }
      box.appendChild(row);
    });
    return box;
  }

  function eventBlock(e, i) {
    const st = Object.prototype.hasOwnProperty.call(STATUS_LABEL, e.status) ? e.status : 'unverified';
    const card = el('article', 'tl-card ev st-' + st);
    const when = typeof e.dateLabel === 'string' ? e.dateLabel : (ISO.test(e.date || '') ? fmtLong(e.date) : String(e.date || e.year || ''));
    card.appendChild(el('div', 'tl-date', when));
    card.appendChild(el('div', 'tl-label', e.label));
    const tags = el('div', 'tl-tags');
    tags.appendChild(el('span', 'tag st-' + st, STATUS_LABEL[st]));
    if (e.dateType === 'approx') tags.appendChild(el('span', 'tag tg-approx', DATE_NOTE.approx));
    if (CATEGORY_LABEL[e.category]) tags.appendChild(el('span', 'tag', CATEGORY_LABEL[e.category]));
    card.appendChild(tags);
    if (e.note) card.appendChild(el('p', 'tl-note', e.note));
    const det = Array.isArray(e.details) ? e.details.filter((x) => typeof x === 'string') : [];
    if (det.length) { const ul = el('ul', 'tl-det'); det.forEach((x) => ul.appendChild(el('li', null, x))); card.appendChild(ul); }
    const srcs = Array.isArray(e.sources) ? e.sources.filter((x) => x && x.title) : [];
    if (srcs.length) {
      const ul = el('ul', 'tl-src');
      srcs.forEach((x) => {
        const l = el('li');
        if (safeUrl(x.url)) { const a = el('a', null, x.title + ' ↗'); a.href = x.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; l.appendChild(a); }
        else l.appendChild(el('span', 'muted', 'Источник: ' + x.title));
        ul.appendChild(l);
      });
      card.appendChild(ul);
    } else card.appendChild(el('p', 'tl-note muted', 'Источник не указан.'));
    const m = renderMedia(e.media); if (m) card.appendChild(m);
    return card;
  }

  function renderTimeline(events, years) {
    const ol = $('#timeline');
    ol.textContent = '';
    const list = events.filter((e) => e && e.label).map((e) => (e.status === 'partial' ? { ...e, status: 'indirect' } : e));
    // Начало сбора данных берём из самих данных, а не из памяти
    if (trafficPts.length && !list.some((e) => e.category === 'archive')) {
      const f = trafficPts[0];
      list.push({
        year: Number(f.date.slice(0, 4)), date: f.date, dateType: 'exact', category: 'archive', status: 'confirmed',
        label: 'Первый замер посещаемости в архиве',
        note: `Значение ${fmtNum(f.value)} визитов в месяц, источник: ${f.source}. С этой даты ведётся история замеров архива.`
      });
    }
    list.sort((a, b) => evKey(a).localeCompare(evKey(b)) || (Number(a.year) || 0) - (Number(b.year) || 0));
    allEvents = list;
    const titles = new Map((Array.isArray(years) ? years : []).filter((y) => y && y.year).map((y) => [Number(y.year), y.title || '']));
    list.forEach((e) => { const y = Number(e.year); if (y && !titles.has(y)) titles.set(y, ''); });
    [...titles.keys()].sort((a, b) => a - b).forEach((y) => {
      const evs = list.filter((e) => Number(e.year) === y);
      const li = el('li', 'yr-item');
      const d = el('details', 'yr' + (evs.length ? '' : ' yr-empty'));
      const sm = el('summary');
      sm.appendChild(el('span', 'yr-n', String(y)));
      sm.appendChild(el('span', 'yr-t', titles.get(y) || ''));
      sm.appendChild(el('span', 'yr-c', evs.length ? plural(evs.length, ['событие', 'события', 'событий']) : 'нет данных'));
      d.appendChild(sm);
      const body = el('div', 'yr-body');
      if (evs.length) evs.forEach((e, i) => body.appendChild(eventBlock(e, i)));
      else body.appendChild(el('p', 'tl-note muted', 'Архивных сведений пока недостаточно'));
      d.appendChild(body);
      li.appendChild(d);
      ol.appendChild(li);
    });
    $('#tlLegend').hidden = !list.length;
    if (!titles.size) ol.appendChild(el('li', null, 'Событий пока нет'));
  }
  let allEvents = [];

  /* ---------- Документы ---------- */
  function renderDocuments(list) {
    const box = $('#documents');
    box.textContent = '';
    const items = list.filter(d => d && d.title && safeUrl(d.url));
    if (!items.length) {
      box.appendChild(el('div', 'placeholder', 'Раздел наполняется: снимки, объявления, архивы'));
      return;
    }
    items.forEach((d) => {
      const a = el('a', 'card');
      a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const head = el('div', 'card-head');
      const ico = el('span', 'card-ico', '📄');
      ico.setAttribute('aria-hidden', 'true');
      head.append(ico, el('div', 'card-name', d.title));
      a.appendChild(head);
      if (d.desc) a.appendChild(el('p', 'card-desc', d.desc));
      if (d.source || d.date) {
        const meta = el('div', 'card-meta');
        if (d.source) meta.appendChild(el('span', 'badge', d.source));
        if (d.date) meta.appendChild(el('span', null, ISO.test(d.date) ? fmtLong(d.date) : String(d.date)));
        a.appendChild(meta);
      }
      box.appendChild(a);
    });
  }

  /* ---------- Сообщества ---------- */
  const COMM_TYPES = [
    ['official', 'Официальные', 'Сообщества и проекты разработчиков KoGaMa.'],
    ['independent', 'Независимые проекты', 'Игровые платформы и проекты энтузиастов, не связанные с разработчиками.'],
    ['fan', 'Фанатские сообщества', 'Серверы, сайты и группы игроков.']
  ];
  function renderCommunities(list) {
    const box = $('#communities');
    box.textContent = '';
    const items = list.filter((c) => c && c.name && safeUrl(c.url));
    if (!items.length) {
      box.appendChild(el('div', 'placeholder', 'Ссылки на сообщества появятся позже'));
      return;
    }
    const sorted = [...items].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    COMM_TYPES.forEach(([type, title, lead]) => {
      const group = sorted.filter((c) => (c.type || 'fan') === type);
      if (!group.length) return;
      const h = el('h3', 'cm-h', title); box.appendChild(h);
      box.appendChild(el('p', 'cm-lead', lead));
      const cards = el('div', 'cards');
      group.forEach((c) => {
        const a = el('a', 'card cm-card' + (c.pinned ? ' pinned' : '') + (type === 'official' ? ' official' : ''));
        a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        const head = el('div', 'card-head');
        let ico;
        if (typeof c.icon === 'string' && /^img\/[\w./-]+$/.test(c.icon)) { ico = el('img', 'cm-ico'); ico.src = c.icon; ico.alt = ''; ico.loading = 'lazy'; }
        else { ico = el('span', 'cm-ico cm-ico-ph', c.name.trim().charAt(0).toUpperCase()); }
        ico.setAttribute('aria-hidden', 'true');
        head.append(ico, el('div', 'card-name', c.name));
        a.appendChild(head);
        const badges = el('div', 'card-meta');
        if (c.pinned) badges.appendChild(el('span', 'badge cm-pin', '📌 Закреплено'));
        if (type === 'official') badges.appendChild(el('span', 'badge cm-off', 'Официальное'));
        if (c.status && !(type === 'official' && c.status === 'Официальное')) badges.appendChild(el('span', 'badge', c.status));
        a.appendChild(badges);
        if (c.desc) a.appendChild(el('p', 'card-desc', c.desc));
        let host = ''; try { host = new URL(c.url).hostname; } catch {}
        a.appendChild(el('div', 'card-host', host));
        cards.appendChild(a);
      });
      box.appendChild(cards);
    });
  }

  /* ---------- Аналитика ---------- */
  const A = window.KAnalytics;
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const monthName = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  const periodLabel = (k) => (k.length === 4 ? `${k} год` : monthName(k));
  const fmtPct = (p) => (p == null ? '—' : (Math.abs(p) < 0.05 ? '0,0%' : `${p > 0 ? '+' : '−'}${Math.abs(p).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`));
  const pctCls = (p) => (p == null || Math.abs(p) < 0.05 ? '' : p > 0 ? 'up' : 'down');

  function table(heads, rows) {
    const wrap = el('div', 'tbl-wrap'), t = el('table', 'tbl');
    const thead = el('thead'), tr = el('tr');
    heads.forEach((h) => tr.appendChild(el('th', null, h)));
    thead.appendChild(tr); t.appendChild(thead);
    const tb = el('tbody');
    rows.forEach((r) => {
      const row = el('tr');
      r.forEach((c) => {
        const td = el('td', c && c.cls ? c.cls : null, c && typeof c === 'object' ? c.text : c);
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }
  const block = (title) => { const b = el('div', 'an-block'); b.appendChild(el('h3', null, title)); return b; };
  const kpi = (v, l) => { const k = el('div', 'kpi'); k.append(el('b', null, v), el('span', null, l)); return k; };

  let cmpA = null, cmpB = null;

  function renderAnalytics() {
    const root = $('#analyticsBody');
    root.textContent = '';
    const pts = trafficPts;
    if (!A || !pts.length) {
      root.appendChild(el('div', 'notice', 'Данных пока нет — аналитика появится после первого замера.'));
      return;
    }
    const o = A.overall(pts);

    // Сводка
    const sum = block('Сводка по сохранённым замерам');
    const k = el('div', 'kpis');
    k.append(
      kpi(String(o.count), 'замеров в архиве'),
      kpi(`${fmtShort(o.first.date)} – ${fmtShort(o.last.date)}`, 'период наблюдений'),
      kpi(fmtNum(o.avg), 'среднее по замерам'),
      kpi(fmtNum(o.max.value), `максимум · ${fmtShort(o.max.date)}`),
      kpi(fmtNum(o.min.value), `минимум · ${fmtShort(o.min.date)}`)
    );
    sum.appendChild(k);
    sum.appendChild(el('p', 'chart-note', 'Максимум и минимум — среди реально собранных замеров, а не за всю историю KoGaMa.'));
    if (o.mixedSources) sum.appendChild(el('p', 'chart-note', 'В данных смешаны замеры HypeStat и архивные снимки; значения разных источников могут быть несопоставимы.'));
    root.appendChild(sum);

    if (pts.length < 2) {
      root.appendChild(el('div', 'notice', 'Недостаточно данных для анализа динамики: в архиве всего один замер. Сравнение периодов, процентные изменения и периоды роста или снижения станут доступны, когда накопится минимум два замера из разных месяцев. Мы не достраиваем недостающие значения.'));
      return;
    }

    const total = el('p', 'chart-note');
    total.textContent = `Изменение от первого замера к последнему: ${fmtPct(o.pct)} за ${o.spanDays} дн.`;
    sum.appendChild(total);

    // Сравнение двух периодов
    const opts = A.periodOptions(pts);
    const keys = [...opts.years, ...opts.months];
    const cb = block('Сравнение двух периодов');
    if (keys.length < 2) {
      cb.appendChild(el('div', 'notice', 'Для сравнения нужны как минимум два разных периода (года или месяца) с замерами.'));
    } else {
      if (!keys.includes(cmpA) || !keys.includes(cmpB)) {
        cmpB = opts.months[opts.months.length - 1]; cmpA = opts.months[opts.months.length - 2] || keys[0];
      }
      const sel = el('div', 'cmp');
      const mk = (id, label, val, onChange) => {
        const w = el('div'); const l = el('label', null, label); l.htmlFor = id;
        const s = el('select'); s.id = id;
        keys.forEach((kk) => {
          const n = pts.filter((p) => p.date.startsWith(kk)).length;
          const op = el('option', null, `${periodLabel(kk)} · ${n} ${plural(n, ['замер', 'замера', 'замеров'])}`);
          op.value = kk; if (kk === val) op.selected = true; s.appendChild(op);
        });
        s.addEventListener('change', () => onChange(s.value));
        w.append(l, s); return w;
      };
      sel.append(mk('cmpA', 'Период A (база)', cmpA, (v) => { cmpA = v; renderAnalytics(); }), mk('cmpB', 'Период B', cmpB, (v) => { cmpB = v; renderAnalytics(); }));
      cb.appendChild(sel);
      const r = A.comparePeriods(pts, cmpA, cmpB);
      if (!r) {
        cb.appendChild(el('div', 'notice', 'Выберите два разных периода.'));
      } else {
        cb.appendChild(table(['', 'Среднее', 'Замеров', 'Мин.', 'Макс.'], [
          [periodLabel(r.a.key), fmtNum(r.a.avg), r.a.count, fmtNum(r.a.min.value), fmtNum(r.a.max.value)],
          [periodLabel(r.b.key), fmtNum(r.b.avg), r.b.count, fmtNum(r.b.min.value), fmtNum(r.b.max.value)]
        ]));
        const res = el('div', 'li');
        res.appendChild(document.createTextNode(`Среднее изменилось на `));
        res.appendChild(el('b', pctCls(r.pct), fmtPct(r.pct)));
        res.appendChild(document.createTextNode(` (${r.diff >= 0 ? '+' : '−'}${fmtNum(Math.abs(r.diff))} визитов/мес).`));
        const notes = ['Среднее считается по имеющимся замерам, а не по всем дням периода.'];
        [r.a, r.b].forEach((x) => { if (x.key.length === 4 && x.count < 12) notes.push(`За ${x.key} год есть замеров: ${x.count} из 12 — среднее может не отражать год целиком.`); });
        if (r.mixedSources) notes.push('Периоды содержат данные разных источников — сравнение приблизительное.');
        res.appendChild(el('small', null, notes.join(' ')));
        cb.appendChild(res);
      }
    }
    root.appendChild(cb);

    // По годам
    const yb = block('Динамика по годам');
    const yrs = A.byYear(pts);
    yb.appendChild(table(['Год', 'Замеров', 'Среднее', 'Мин.', 'Макс.', 'К пред. году'], yrs.map((y) => [
      y.year, `${y.months}/12`, fmtNum(y.avg), fmtNum(y.min.value), fmtNum(y.max.value), { text: fmtPct(y.yoy), cls: pctCls(y.yoy) }
    ])));
    yb.appendChild(el('p', 'chart-note', yrs.length < 2 ? 'Сравнение с предыдущим годом появится, когда в архиве будут данные минимум за два соседних года.' : 'Сравнение показано только для соседних лет, у которых есть данные.'));
    root.appendChild(yb);

    // По месяцам
    const mb = block('Значения по месяцам');
    const ch = A.changes(pts);
    const rows = pts.map((p, i) => {
      const c = i ? ch[i - 1] : null;
      return [monthName(p.date), fmtNum(p.value), c ? { text: fmtPct(c.pct), cls: pctCls(c.pct) } : '—', c ? `${c.days} дн.` : '—'];
    }).reverse();
    mb.appendChild(table(['Месяц', 'Визитов', 'Изменение', 'Интервал'], rows.slice(0, 12)));
    if (rows.length > 12) {
      const d = el('details', 'more'); d.appendChild(el('summary', null, `Показать ещё ${rows.length - 12}`));
      d.appendChild(table(['Месяц', 'Визитов', 'Изменение', 'Интервал'], rows.slice(12)));
      mb.appendChild(d);
    }
    mb.appendChild(el('p', 'chart-note', 'Интервал — число дней между соседними замерами; если он заметно больше месяца, в данных есть пропуски.'));
    root.appendChild(mb);

    // Заметные изменения
    const nb = block('Наиболее заметные изменения');
    const top = A.topChanges(pts, 3);
    const li = (c) => {
      const d = el('div', 'li');
      d.appendChild(el('b', pctCls(c.pct), fmtPct(c.pct)));
      d.appendChild(document.createTextNode(` ${fmtNum(c.from.value)} → ${fmtNum(c.to.value)}`));
      d.appendChild(el('small', null, `${fmtShort(c.from.date)} → ${fmtShort(c.to.date)} (${c.days} дн.)`));
      return d;
    };
    if (!top.up.length && !top.down.length) nb.appendChild(el('div', 'notice', 'Значения между замерами не менялись.'));
    if (top.up.length) { nb.appendChild(el('p', 'chart-note', 'Рост')); top.up.forEach((c) => nb.appendChild(li(c))); }
    if (top.down.length) { nb.appendChild(el('p', 'chart-note', 'Снижение')); top.down.forEach((c) => nb.appendChild(li(c))); }
    root.appendChild(nb);

    // Устойчивая динамика
    const sb = block('Периоды устойчивого роста и снижения');
    const st = A.streaks(pts, 3);
    if (pts.length < 4) sb.appendChild(el('div', 'notice', 'Недостаточно данных: для вывода нужно минимум 4 замера (три изменения подряд в одну сторону).'));
    else if (!st.length) sb.appendChild(el('div', 'notice', 'Периодов, где значение росло или снижалось три замера подряд, в имеющихся данных нет.'));
    else st.forEach((s) => {
      const d = el('div', 'li');
      d.appendChild(el('b', s.dir, `${s.dir === 'up' ? 'Рост' : 'Снижение'} ${s.changes} замера подряд · ${fmtPct(s.pct)}`));
      d.appendChild(el('small', null, `${fmtShort(s.from.date)} → ${fmtShort(s.to.date)}: ${fmtNum(s.from.value)} → ${fmtNum(s.to.value)}`));
      sb.appendChild(d);
    });
    root.appendChild(sb);
  }

  /* ---------- Источники: что реально есть в данных ---------- */
  function renderInventory() {
    const box = $('#dataInventory');
    box.textContent = '';
    if (!trafficPts.length) { box.appendChild(el('div', 'placeholder', 'Замеров пока нет')); return; }
    const g = new Map();
    trafficPts.forEach((p) => {
      const k = p.source || 'HypeStat';
      const x = g.get(k) || { n: 0, from: p.date, to: p.date };
      x.n++; x.to = p.date; g.set(k, x);
    });
    const rows = [...g.entries()].map(([name, x]) => [name, x.n, fmtShort(x.from), fmtShort(x.to)]);
    box.appendChild(table(['Источник', 'Замеров', 'Первый', 'Последний'], rows));
    const wb = trafficPts.filter((p) => safeUrl(p.archiveUrl));
    if (wb.length) {
      box.appendChild(el('p', 'chart-note', 'Снимки Wayback Machine:'));
      wb.forEach((p) => {
        const d = el('div', 'li'); const a = el('a', null, `снимок на ${fmtLong(p.date)} ↗`);
        a.href = p.archiveUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
        d.append(a, el('small', null, `Значение: ${fmtNum(p.value)}`)); box.appendChild(d);
      });
    }
  }

  /* ---------- Журнал изменений ---------- */
  function renderChangelog(log, meta, ver) {
    const latest = log.find((e) => e && e.version) || null;
    const ok = (d) => typeof d === 'string' && ISO.test(d);
    const dl = $('#clStatus'); dl.textContent = '';
    const add = (label, value, hint) => {
      const w = el('div'); w.append(el('dt', null, label), el('dd', null, value));
      if (hint) w.appendChild(el('dd', 'sm', hint));
      dl.appendChild(w);
    };
    add('Версия сайта', latest ? latest.version : '—');
    add('Сайт обновлён', latest && ok(latest.date) ? fmtLong(latest.date) : '—', 'Дата выхода последней версии сайта.');
    add('Статистика проверена', ok(meta.lastChecked) ? fmtLong(meta.lastChecked) : 'пока не зафиксировано', 'Дата, когда источник был проверен. Запись обновляется не чаще раза в неделю.');
    add('Значения изменились', ok(meta.lastValueUpdated) ? fmtLong(meta.lastValueUpdated) : '—', 'Дата последнего фактического изменения данных посещаемости.');
    const box = $('#clList'); box.textContent = '';
    if (!log.length) { box.appendChild(el('div', 'placeholder', 'Записей пока нет')); return; }
    const sec = [['added', 'Новое'], ['materials', 'Материалы'], ['changed', 'Изменено'], ['fixed', 'Исправлено']];
    log.filter((e) => e && e.version).forEach((e) => {
      const r = el('article', 'rel');
      r.appendChild(el('h3', null, `${e.version}${ok(e.date) ? ' · ' + fmtLong(e.date) : ''}`));
      sec.forEach(([k, t]) => {
        const items = Array.isArray(e[k]) ? e[k].filter((x) => typeof x === 'string') : [];
        if (!items.length) return;
        r.appendChild(el('h4', null, t));
        const ul = el('ul'); items.forEach((x) => ul.appendChild(el('li', null, x))); r.appendChild(ul);
      });
      box.appendChild(r);
    });
  }

  /* ---------- Галерея ---------- */
  const GCAT = { screenshot: 'Скриншоты', interface: 'Интерфейс', world: 'Игровые миры', avatar: 'Аватары', site: 'Архив сайта', event: 'События', other: 'Другое' };
  const IMG_OK = /^img\/[\w./-]+$/; // только свои файлы: без внешних картинок и хотлинков
  let gallery = [], galView = [], gYear = 'all', gCat = 'all', lbIdx = 0;
  const gYearOf = (g) => String(g.year || (g.date || '').slice(0, 4) || '');
  const gDate = (g) => (ISO.test(g.date || '') ? fmtLong(g.date) : String(g.date || g.year || 'дата неизвестна'));

  function cleanGallery(raw) {
    return raw.filter((g) => g && g.title && typeof g.image === 'string' && IMG_OK.test(g.image) && (!g.thumb || IMG_OK.test(g.thumb)))
      .map((g) => ({ ...g, status: Object.prototype.hasOwnProperty.call(STATUS_LABEL, g.status) ? g.status : 'unverified' }));
  }

  function renderGallery() {
    const grid = $('#galleryGrid'), fb = $('#galFilters');
    grid.textContent = '';
    if (!gallery.length) {
      fb.hidden = true;
      const e = el('div', 'empty-state');
      e.append(el('b', null, 'Архив пополняется'), el('p', null, 'Подтверждённых изображений пока нет. Мы публикуем только реальные скриншоты и архивные материалы KoGaMa с указанием источника. Если у вас есть такие материалы, их можно предложить в разделе «Источники».'));
      grid.appendChild(e);
      return;
    }
    fb.hidden = false; fb.textContent = '';
    const years = [...new Set(gallery.map(gYearOf).filter(Boolean))].sort();
    const cats = [...new Set(gallery.map((g) => g.category || 'other'))];
    const yw = el('div'); const yl = el('label', null, 'Год'); yl.htmlFor = 'gYear';
    const ys = el('select'); ys.id = 'gYear';
    [['all', 'Все годы'], ...years.map((y) => [y, y])].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; if (v === gYear) o.selected = true; ys.appendChild(o); });
    ys.addEventListener('change', () => { gYear = ys.value; renderGallery(); });
    yw.append(yl, ys);
    const chips = el('div', 'chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Категория');
    [['all', 'Все'], ...cats.map((c) => [c, GCAT[c] || GCAT.other])].forEach(([v, t]) => {
      const b = el('button', 'chip', t); b.type = 'button'; b.setAttribute('aria-pressed', String(v === gCat));
      b.addEventListener('click', () => { gCat = v; renderGallery(); });
      chips.appendChild(b);
    });
    fb.append(yw, chips);
    galView = gallery.filter((g) => (gYear === 'all' || gYearOf(g) === gYear) && (gCat === 'all' || (g.category || 'other') === gCat));
    if (!galView.length) { grid.appendChild(el('div', 'empty-state', 'По выбранным фильтрам материалов нет.')); return; }
    galView.forEach((g, i) => {
      const b = el('button', 'g-card'); b.type = 'button'; b.setAttribute('aria-label', 'Открыть: ' + g.title);
      const img = el('img'); img.src = g.thumb || g.image; img.alt = g.alt || g.title; img.loading = 'lazy'; img.decoding = 'async';
      if (g.width && g.height) { img.width = g.width; img.height = g.height; }
      const body = el('div', 'g-body'); body.append(el('b', null, g.title), el('span', null, `${gDate(g)} · ${STATUS_LABEL[g.status]}`));
      b.append(img, body);
      b.addEventListener('click', () => openLightbox(i));
      grid.appendChild(b);
    });
  }

  const lb = $('#lightbox');
  function showLb() {
    const g = galView[lbIdx]; if (!g) return;
    $('#lbImg').src = g.image; $('#lbImg').alt = g.alt || g.title;
    const cap = $('#lbCap'); cap.textContent = '';
    cap.appendChild(el('b', null, g.title));
    if (g.description) cap.appendChild(el('div', null, g.description));
    cap.appendChild(el('div', 'muted', `${gDate(g)} · ${GCAT[g.category] || GCAT.other} · Достоверность: ${STATUS_LABEL[g.status]}`));
    const sl = el('div'); sl.appendChild(document.createTextNode('Источник: '));
    if (safeUrl(g.sourceUrl)) { const a = el('a', null, (g.source || g.sourceUrl) + ' ↗'); a.href = g.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; sl.appendChild(a); }
    else sl.appendChild(document.createTextNode(g.source || 'не указан'));
    cap.appendChild(sl);
    $('#lbPrev').hidden = $('#lbNext').hidden = galView.length < 2;
  }
  function openLightbox(i) { lbIdx = i; showLb(); if (lb.showModal) lb.showModal(); else lb.setAttribute('open', ''); }
  const lbStep = (d) => { lbIdx = (lbIdx + d + galView.length) % galView.length; showLb(); };
  if (lb) {
    $('#lbClose').addEventListener('click', () => lb.close());
    $('#lbPrev').addEventListener('click', () => lbStep(-1));
    $('#lbNext').addEventListener('click', () => lbStep(1));
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); }); // клик по фону
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') lbStep(-1); if (e.key === 'ArrowRight') lbStep(1); });
  }

  /* ---------- Тогда и сейчас ---------- */
  let pairsData = [], cmpYA = null, cmpYB = null;

  function renderPairs() {
    const box = $('#pairs'); box.textContent = '';
    const items = pairsData.filter((p) => p && p.title && p.before && p.after && IMG_OK.test(p.before.image || '') && IMG_OK.test(p.after.image || ''));
    if (!items.length) {
      const e = el('div', 'empty-state');
      e.append(el('b', null, 'Архив пополняется'), el('p', null, 'Сравнений интерфейсов и миров пока нет: для них нужны подтверждённые изображения из разных периодов. Ниже можно сопоставить периоды по событиям и статистике.'));
      box.appendChild(e); return;
    }
    items.forEach((p) => {
      const w = el('article', 'pair'); w.appendChild(el('h3', 'sub', p.title));
      if (p.description) w.appendChild(el('p', 'lead', p.description));
      const seg = el('div', 'seg'); seg.setAttribute('role', 'group');
      const img = el('img'); img.loading = 'lazy'; img.decoding = 'async';
      const cap = el('p', 'chart-note');
      const sides = [['before', p.before], ['after', p.after]];
      const show = (k) => {
        const d = p[k]; img.src = d.image; img.alt = d.alt || `${p.title}: ${d.label || k}`;
        cap.textContent = `${d.label || ''} ${d.date ? '· ' + d.date : ''} ${d.source ? '· Источник: ' + d.source : ''} · Достоверность: ${STATUS_LABEL[d.status] || STATUS_LABEL.unverified}`;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
      };
      sides.forEach(([k, d]) => { const b = el('button', null, d.label || (k === 'before' ? 'Тогда' : 'Сейчас')); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', () => show(k)); seg.appendChild(b); });
      w.append(seg, img, cap); box.appendChild(w); show('before');
    });
  }

  function renderPeriodCmp() {
    const box = $('#periodCmp'); box.textContent = '';
    const evYears = allEvents.map((e) => String(e.year || '')).filter(Boolean);
    const years = [...new Set([...evYears, ...trafficPts.map((p) => p.date.slice(0, 4))])].sort();
    box.appendChild(el('h3', 'sub', 'Сопоставление периодов'));
    if (years.length < 2) { box.appendChild(el('div', 'notice', 'Для сопоставления нужны сведения как минимум за два разных года. Пока их недостаточно.')); return; }
    if (!years.includes(cmpYA) || !years.includes(cmpYB)) { cmpYA = years[0]; cmpYB = years[years.length - 1]; }
    const sel = el('div', 'cmp');
    const mk = (id, label, val, cb) => {
      const w = el('div'); const l = el('label', null, label); l.htmlFor = id; const s2 = el('select'); s2.id = id;
      years.forEach((y) => { const o = el('option', null, y); o.value = y; if (y === val) o.selected = true; s2.appendChild(o); });
      s2.addEventListener('change', () => { cb(s2.value); renderPeriodCmp(); }); w.append(l, s2); return w;
    };
    sel.append(mk('pyA', 'Год A', cmpYA, (v) => { cmpYA = v; }), mk('pyB', 'Год B', cmpYB, (v) => { cmpYB = v; }));
    box.appendChild(sel);
    const cols = el('div', 'pcols');
    [cmpYA, cmpYB].forEach((y) => {
      const c = el('div', 'pcol'); c.appendChild(el('h4', null, y));
      const evs = allEvents.filter((e) => String(e.year) === y);
      if (evs.length) { const ul = el('ul', 'tl-det'); evs.forEach((e) => ul.appendChild(el('li', null, `${e.label} — ${STATUS_LABEL[e.status] || STATUS_LABEL.unverified}`))); c.appendChild(ul); }
      else c.appendChild(el('p', 'chart-note', 'Событий за этот год в архиве нет.'));
      const st = A && A.periodStats(trafficPts, y);
      if (st) c.appendChild(el('p', 'chart-note', `Посещаемость (оценка HypeStat): среднее ${fmtNum(st.avg)} визитов/мес по ${st.count} ${plural(st.count, ['замеру', 'замерам', 'замерам'])}.`));
      else c.appendChild(el('p', 'chart-note', 'Замеров посещаемости за этот год нет.'));
      cols.appendChild(c);
    });
    box.appendChild(cols);
    const r = A && A.comparePeriods(trafficPts, cmpYA, cmpYB);
    if (r) box.appendChild(el('div', 'li', `Среднее изменилось на ${fmtPct(r.pct)} (оценка по имеющимся замерам, без выводов о причинах).`));
    else box.appendChild(el('p', 'chart-note', 'Статистическое сравнение недоступно: нужны замеры за оба года.'));
  }

  /* ---------- Главная ---------- */
  function renderHome(docs, commCount) {
    const t = $('#homeTiles'); t.textContent = '';
    const mk = (href, title, n, text) => {
      const a = el('a', 'tile'); a.href = href;
      a.append(el('b', null, title));
      if (n != null) a.appendChild(el('span', 'tile-n', String(n)));
      a.appendChild(el('span', null, text)); t.appendChild(a);
    };
    const nEv = allEvents.length, nPts = trafficPts.length;
    mk('#history', 'История платформы', nEv || null, nEv ? plural(nEv, ['событие', 'события', 'событий']) + ' в хронологии' : 'События появятся позже');
    mk('#stats', 'Архив статистики', nPts || null, nPts ? plural(nPts, ['замер', 'замера', 'замеров']) + ' посещаемости' : 'Ожидание первых данных');
    mk('#communities', 'Сообщества', commCount || null, commCount ? plural(commCount, ['сообщество', 'сообщества', 'сообществ']) + ' в каталоге' : 'Каталог пополняется');
    mk('#gallery', 'Исторические материалы', gallery.length || null, gallery.length ? plural(gallery.length, ['изображение', 'изображения', 'изображений']) : 'Архив пополняется');
    mk('#sources', 'Источники информации', docs.length || null, docs.length ? plural(docs.length, ['документ', 'документа', 'документов']) + ' и 5 категорий достоверности' : '5 категорий достоверности');
    // Фон: только настоящий архивный материал, помеченный в gallery.json как hero и подтверждённый
    const h = gallery.find((g) => g.hero === true && g.status === 'confirmed');
    const bg = $('#landingBg'), cr = $('#landingCredit');
    if (h) {
      bg.classList.add('has-img'); bg.style.backgroundImage = `url("${h.image}")`;
      cr.hidden = false; cr.textContent = `Фон: ${h.title}${h.source ? ' · источник: ' + h.source : ''}`;
    }
  }

  /* ---------- Навигация между разделами ---------- */
  const VIEWS = ['home', 'stats', 'history', 'communities', 'gallery', 'compare', 'analytics', 'sources', 'changelog'];
  const TITLES = { home: 'История и статистика KoGaMa', stats: 'Статистика', history: 'История KoGaMa', gallery: 'Галерея', compare: 'KoGaMa тогда и сейчас', analytics: 'Аналитика', sources: 'Источники', changelog: 'Журнал изменений' };
  let firstRoute = true;
  function route() {
    let h = (location.hash || '').slice(1);
    const anchor = h === 'about';
    if (anchor) h = 'home';
    if (!VIEWS.includes(h)) h = 'home';
    VIEWS.forEach((v) => { document.getElementById('view-' + v).hidden = v !== h; });
    document.querySelectorAll('#nav a').forEach((a) => {
      const on = a.getAttribute('href') === '#' + h;
      if (on) { a.setAttribute('aria-current', 'page'); if (a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest' }); } else a.removeAttribute('aria-current');
    });
    document.title = h === 'home' ? 'KOGAMA ARCHIVE — История и статистика KoGaMa' : `${TITLES[h]} — KOGAMA ARCHIVE`;
    if (anchor) { const t = document.getElementById('about'); if (t) t.scrollIntoView(); }
    else if (!firstRoute) window.scrollTo(0, 0);
    firstRoute = false;
    if (h === 'stats') requestAnimationFrame(drawChart); // график нельзя измерить, пока блок скрыт
  }
  window.addEventListener('hashchange', route);

  /* ---------- Старт ---------- */
  (async () => {
    const [traffic, events, communities, documents, changelog, galleryRaw, pairsRaw, meta, ver, years] = await Promise.all([
      loadJSON('data/traffic.json', []),
      loadJSON('data/events.json', []),
      loadJSON('data/communities.json', []),
      loadJSON('data/documents.json', []),
      loadJSON('data/changelog.json', []),
      loadJSON('data/gallery.json', []),
      loadJSON('data/compare.json', []),
      loadMeta('data/meta.json'),
      loadMeta('version.json'),
      loadJSON('data/years.json', [])
    ]);
    try {
      trafficPts = cleanTraffic(traffic);
      renderHero(meta);
      renderStats(meta);
      syncRange();
      route();
      renderTimeline(events, years);
      renderAnalytics();
      renderInventory();
      renderDocuments(documents);
      renderCommunities(communities);
      renderChangelog(changelog, meta, ver);
      gallery = cleanGallery(galleryRaw); pairsData = pairsRaw;
      renderGallery(); renderPairs(); renderPeriodCmp();
      renderHome(documents.filter((d) => d && d.title && safeUrl(d.url)), communities.filter((c) => c && c.name && safeUrl(c.url)).length);
      const lv = changelog.find((e) => e && e.version);
      $('#footVer').textContent = lv ? `Версия сайта ${lv.version}` : '';
      showLoadErrors();
    } finally {
      finishLoading(); // скелетоны не должны зависнуть, даже если рендер упал
    }
    checkBuild(ver);
  })();

  // Ошибка загрузки — это не то же самое, что «данных пока нет»
  function showLoadErrors() {
    if (!loadErrors.length) return;
    const b = $('#loadBanner');
    b.hidden = false;
    b.textContent = location.protocol === 'file:'
      ? 'Данные не загрузились: страница открыта как локальный файл (file://), а браузер запрещает ему читать JSON. Запустите локальный сервер (например, «python -m http.server» в папке проекта) или откройте опубликованный сайт.'
      : `Не удалось загрузить часть данных (${[...new Set(loadErrors)].join(', ')}). Проверьте подключение и обновите страницу; сайт покажет последние сохранённые данные, если они есть.`;
    if (!trafficPts.length) drawChart();
  }

  /* ---------- Обновление сайта ---------- */
  // Версия этой страницы сравнивается с version.json (всегда берётся из сети).
  // Один автоматический перезапуск на версию: sessionStorage защищает от бесконечных циклов.
  const BUILD = (document.querySelector('meta[name="archive-build"]') || {}).content;
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  };
  let swReg = null;
  async function checkBuild(ver) {
    const target = ver && typeof ver.version === 'string' ? ver.version : null;
    if (!target || !BUILD || BUILD === 'dev' || target === BUILD) return;
    if (swReg) swReg.update().catch(() => {}); // новый sw.js сам обновит оболочку и перезагрузит страницу
    if (sess.get('archive-reload-target') === target) return; // уже перезагружали ради этой версии
    sess.set('archive-reload-target', target);
    try { await fetch('./index.html', { cache: 'reload' }); } catch { return; } // обновить HTTP-кэш HTML
    location.reload();
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Первая установка (контроллера не было) — перезагрузка не нужна. Иначе не чаще раза в 30 с.
      if (!hadController) return;
      const last = Number(sess.get('archive-sw-reload') || 0);
      if (Date.now() - last < 30000) return;
      sess.set('archive-sw-reload', String(Date.now()));
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      swReg = reg;
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  }
})();
