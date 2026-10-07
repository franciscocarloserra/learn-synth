// Optional browser-only capture. Inclusive CPU timings are not device latency.
const FLUSH_MS = 10000;
const MAX_WINDOWS = 60;
const MAX_DIAGNOSTICS = 100;
const LIMITS_MS = [0.1, 0.5, 1, 2, 4, 8, 16, 33, 50, 100, 200, Infinity];
const VERSION = 'frontend-1';
const metrics = new Map();
const windows = [];
const diagnostics = [];
let enabled = new URLSearchParams(globalThis.location?.search || '').has('profile');
let lastFrame = 0;
let started = performance.now();
export function diagnostic(kind, detail) {
  if (diagnostics.length === MAX_DIAGNOSTICS) diagnostics.shift();
  diagnostics.push({ time: new Date().toISOString(), kind, detail: String(detail).slice(0, 1500) });
}
export function record(name, ms) {
  if (!enabled || !Number.isFinite(ms) || ms < 0) return;
  let m = metrics.get(name);
  if (!m) metrics.set(name, m = { count: 0, totalMs: 0, maxMs: 0, bins: LIMITS_MS.map(() => 0) });
  m.count++;
  m.totalMs += ms;
  m.maxMs = Math.max(m.maxMs, ms);
  m.bins[LIMITS_MS.findIndex(limit => ms <= limit)]++;
}
export function measure(name, fn, args) {
  if (!enabled) return fn(...args);
  const start = performance.now();
  try { return fn(...args); }
  finally { record(name, performance.now() - start); }
}
export function frame(now) {
  if (lastFrame && !document.hidden) record('browser.rafGap', now - lastFrame);
  lastFrame = document.hidden ? 0 : now;
}
function flush() {
  if (!metrics.size) return;
  const now = performance.now();
  if (windows.length === MAX_WINDOWS) windows.shift();
  windows.push({ time: new Date().toISOString(), intervalMs: now - started,
    visible: !document.hidden, metrics: Object.fromEntries(metrics) });
  metrics.clear();
  started = now;
}
export function snapshot() {
  flush();
  return JSON.parse(JSON.stringify({ version: VERSION,
    limitsMs: LIMITS_MS.map(n => Number.isFinite(n) ? n : 'Infinity'), windows, diagnostics }));
}
export function start() {
  metrics.clear(); windows.length = 0; lastFrame = 0;
  started = performance.now(); enabled = true;
}
export function stop() { flush(); enabled = false; lastFrame = 0; }
export function download() {
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'learn-synth-profile.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.synthProfile = { start, stop, snapshot, download };
setInterval(flush, FLUSH_MS);
for (const type of ['keydown', 'pointerdown', 'input']) {
  document.addEventListener(type, event => {
    if (enabled && Number.isFinite(event.timeStamp))
      record('input.' + type + 'Dispatch', Math.max(0, performance.now() - event.timeStamp));
  }, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => { lastFrame = 0; });
const Observer = window.PerformanceObserver;
if (Observer) {
  for (const type of ['longtask', 'long-animation-frame']) {
    if (!Observer.supportedEntryTypes.includes(type)) continue;
    new Observer(list => {
      for (const entry of list.getEntries()) {
        record('browser.' + type, entry.duration);
        if (type === 'long-animation-frame')
          record('browser.forcedLayout', (entry.scripts || []).reduce((sum, script) => sum + (script.forcedStyleAndLayoutDuration || 0), 0));
      }
    }).observe({ type, buffered: false });
  }
}

// Only profiling sessions add UI; normal playing stays uncluttered.
if (enabled) {
  const button = document.createElement('button');
  button.className = 'profile-export';
  button.textContent = 'Export profile';
  button.addEventListener('click', download);
  document.body.append(button);
}
