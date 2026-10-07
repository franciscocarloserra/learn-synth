// Aggregate inclusive timings from an exported capture, without DOM dependencies.
export function summarize(capture) {
  if (!Array.isArray(capture.windows) || !Array.isArray(capture.limitsMs))
    throw new Error('Choose a Learn Synth profile JSON file.');
  const rows = new Map();
  for (const window of capture.windows) {
    for (const [name, metric] of Object.entries(window.metrics || {})) {
      if (!Number.isFinite(metric.count) || metric.count <= 0 || !Number.isFinite(metric.totalMs)
        || !Number.isFinite(metric.maxMs) || !Array.isArray(metric.bins)
        || metric.bins.length !== capture.limitsMs.length
        || !metric.bins.every(n => Number.isFinite(n) && n >= 0))
        throw new Error('Invalid profile metrics.');
      let row = rows.get(name);
      if (!row) rows.set(name, row = { name, count: 0, totalMs: 0, maxMs: 0, bins: metric.bins.map(() => 0) });
      row.count += metric.count;
      row.totalMs += metric.totalMs;
      row.maxMs = Math.max(row.maxMs, metric.maxMs);
      row.bins = row.bins.map((n, i) => n + metric.bins[i]);
    }
  }
  return [...rows.values()].map(row => {
    let sum = 0;
    const index = row.bins.findIndex(n => (sum += n) >= row.count * 0.95);
    return { ...row, meanMs: row.totalMs / row.count, p95: capture.limitsMs[index] ?? 'Unknown' };
  }).sort((a, b) => b.totalMs - a.totalMs);
}
