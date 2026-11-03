'use strict';
// Дымовой тест: запускает app.js в заглушке DOM с реальными файлами data/*.json.
// Ловит ошибки выполнения при старте (ReferenceError, TypeError на данных). Это НЕ замена проверке в браузере.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const mkEl = () => {
  const store = { children: [], dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, hidden: false };
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k in store) return store[k];
      if (['clientWidth', 'offsetWidth', 'offsetHeight'].includes(k)) return 800;
      if (k === 'querySelector') return () => mkEl();
      if (k === 'querySelectorAll') return () => [];
      if (k === 'closest') return () => null;
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 800 });
      if (k === 'then') return undefined;
      return (...a) => (k === 'appendChild' || k === 'append' ? undefined : mkEl());
    },
    set(_, k, v) { store[k] = v; return true; }
  });
  return p;
};
const ids = {};
const doc = {
  querySelector: (s) => (s.includes('archive-build') ? { content: 'dev' } : s.startsWith('#') ? (ids[s] = ids[s] || mkEl()) : mkEl()),
  querySelectorAll: () => [], getElementById: (i) => (ids['#' + i] = ids['#' + i] || mkEl()),
  createElement: () => mkEl(), createElementNS: () => mkEl(), createTextNode: () => mkEl(),
  addEventListener() {}, body: mkEl(), visibilityState: 'visible'
};
const errs = [];
const win = {
  document: doc, KAnalytics: require('../analytics.js'), location: { hash: process.argv[2] || '', protocol: 'https:', hostname: 'x.github.io', pathname: '/' },
  addEventListener() {}, setTimeout, clearTimeout, requestAnimationFrame: (f) => f(), scrollTo() {},
  localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
  navigator: {}, console: { ...console, error: (...a) => errs.push(a.join(' ')) },
  fetch: async (u) => {
    const f = path.join(ROOT, String(u).split('?')[0]);
    if (!fs.existsSync(f)) return { ok: false, status: 404 };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
  },
  Date, Math, JSON, Promise, Number, String, Array, Object, Set, Map, URL, Response: function () {}, Request: function () {}
};
win.window = win;
const ctx = vm.createContext(win);
process.on('unhandledRejection', (e) => { errs.push('unhandledRejection: ' + (e && e.stack || e)); });
try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), ctx); }
catch (e) { errs.push('sync: ' + (e.stack || e)); }
setTimeout(() => {
  if (errs.length) { console.error('FAIL smoke:\n' + errs.join('\n')); process.exit(1); }
  console.log('OK   smoke: app.js отработал при старте без исключений (заглушка DOM)'); process.exit(0);
}, 400);
