const MAX_SAMPLES = 1000;

const state = {
  apiLatencyMs: [],
  dbLatencyMs: [],
  apiRequests: 0,
  apiFailures: 0,
  paymentFailures: 0,
  bookingFailures: 0,
  walletFailures: 0,
  startedAt: Date.now(),
};

function pushLatency(list, ms) {
  if (!Number.isFinite(ms)) return;
  list.push(ms);
  if (list.length > MAX_SAMPLES) list.shift();
}

function percentile(list, p) {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(2));
}

function average(list) {
  if (!list.length) return 0;
  return Number((list.reduce((sum, item) => sum + item, 0) / list.length).toFixed(2));
}

function markApiRequest(statusCode, durationMs, path) {
  state.apiRequests += 1;
  pushLatency(state.apiLatencyMs, durationMs);
  if (Number(statusCode) >= 400) state.apiFailures += 1;

  const normalizedPath = String(path || '').toLowerCase();
  if (Number(statusCode) >= 400 && normalizedPath.includes('/payments')) state.paymentFailures += 1;
  if (Number(statusCode) >= 400 && normalizedPath.includes('/bookings')) state.bookingFailures += 1;
  if (Number(statusCode) >= 400 && normalizedPath.includes('/wallet')) state.walletFailures += 1;
}

function markDbQuery(durationMs) {
  pushLatency(state.dbLatencyMs, durationMs);
}

function snapshot() {
  const mem = process.memoryUsage();
  const uptimeSeconds = Math.round((Date.now() - state.startedAt) / 1000);
  return {
    uptimeSeconds,
    cpu: process.cpuUsage(),
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externalBytes: mem.external,
    },
    api: {
      totalRequests: state.apiRequests,
      failedRequests: state.apiFailures,
      avgLatencyMs: average(state.apiLatencyMs),
      p95LatencyMs: percentile(state.apiLatencyMs, 95),
      p99LatencyMs: percentile(state.apiLatencyMs, 99),
    },
    database: {
      avgLatencyMs: average(state.dbLatencyMs),
      p95LatencyMs: percentile(state.dbLatencyMs, 95),
      p99LatencyMs: percentile(state.dbLatencyMs, 99),
    },
    failures: {
      paymentFailures: state.paymentFailures,
      bookingFailures: state.bookingFailures,
      walletFailures: state.walletFailures,
    },
  };
}

module.exports = {
  markApiRequest,
  markDbQuery,
  snapshot,
};
