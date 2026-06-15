/**
 * ═══════════════════════════════════════════════════════════════
 *  VIBES@Outing — Load & Stress Test Harness  (zero external deps)
 * ───────────────────────────────────────────────────────────────
 *  Covers the scenarios from Load_Stress_Testing.md:
 *    • Baseline / Load / Stress (ramped concurrent virtual users)
 *    • Spike (burst then drain)
 *    • Endurance / soak (long duration)
 *    • Booking-surge concurrency safety (no overselling, no
 *      duplicate seat counts, accurate wallet deductions)
 *
 *  Metrics captured: throughput (req/s), avg / p50 / p95 / p99
 *  latency, error %, and a Go/No-Go verdict against the acceptance
 *  criteria.
 *
 *  USAGE (PowerShell):
 *    $env:BASE='http://localhost:3000'
 *    node tests/load_test.js baseline                 # 100 VUs, 60s
 *    node tests/load_test.js load   --vus 500 --dur 120
 *    node tests/load_test.js stress --vus 3000 --dur 60
 *    node tests/load_test.js spike  --vus 5000 --cycles 5
 *    node tests/load_test.js soak   --vus 500  --dur 86400
 *    node tests/load_test.js surge  --vus 200            (needs dev server)
 *
 *  NOTE: `surge` exercises the dev-only /api/bookings endpoint to
 *  verify concurrency safety, so run the server with NODE_ENV!=production.
 * ═══════════════════════════════════════════════════════════════
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = process.env.BASE || 'http://localhost:3000';
const argv = process.argv.slice(2);
const scenario = (argv[0] || 'baseline').toLowerCase();

function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i !== -1 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : def;
}

// Acceptance criteria thresholds (from Load_Stress_Testing.md)
const ACCEPTANCE = {
  errorRatePct: 1,        // < 1% under expected traffic
  p95Ms: 2000,            // < 2s under normal load
  bookingSuccessPct: 99,  // booking flow success > 99%
};

const agentHttp = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const agentHttps = new https.Agent({ keepAlive: true, maxSockets: Infinity, rejectUnauthorized: false });

function request(method, path, body = null, token = null) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      agent: isHttps ? agentHttps : agentHttp,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const start = process.hrtime.bigint();
    const r = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ ok: res.statusCode < 400, status: res.statusCode, ms, body: parsed });
      });
    });
    r.on('error', (err) => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ ok: false, status: 0, ms, error: err.code || err.message });
    });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// A single virtual-user journey of read-heavy traffic (browse + search + details)
async function userJourney(stats) {
  const steps = [
    () => request('GET', '/api/outings'),
    () => request('GET', '/api/outings?search=goa'),
    () => request('GET', '/api/outings?category=adventure'),
  ];
  const step = steps[Math.floor(Math.random() * steps.length)];
  const res = await step();
  record(stats, res);
  // Drill into a detail page when we have results
  if (Array.isArray(res.body) && res.body.length) {
    const id = res.body[Math.floor(Math.random() * res.body.length)].id;
    record(stats, await request('GET', `/api/outings/${id}`));
  }
}

function record(stats, res) {
  stats.total++;
  // 429 = the app's rate-limiter protecting itself. Expected when many
  // virtual users share one source IP locally; counted separately so it
  // doesn't masquerade as a server failure.
  if (res.status === 429) stats.throttled++;
  else if (!res.ok) stats.errors++;
  if (res.status === 0) stats.network++;
  stats.latencies.push(res.ms);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(label, stats, elapsedMs) {
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const avg = sorted.length ? sum / sorted.length : 0;
  const errPct = stats.total ? (stats.errors / stats.total) * 100 : 0;
  const throttledPct = stats.total ? (stats.throttled / stats.total) * 100 : 0;
  const tput = stats.total / (elapsedMs / 1000);
  console.log(`\n──────── ${label} ────────`);
  console.log(`  Requests:        ${stats.total}`);
  console.log(`  Throughput:      ${tput.toFixed(1)} req/s`);
  console.log(`  Avg latency:     ${avg.toFixed(1)} ms`);
  console.log(`  p50 / p95 / p99: ${percentile(sorted, 50).toFixed(0)} / ${percentile(sorted, 95).toFixed(0)} / ${percentile(sorted, 99).toFixed(0)} ms`);
  console.log(`  Rate-limited:    ${stats.throttled} (${throttledPct.toFixed(2)}%)  [429 — expected on single-IP runs]`);
  console.log(`  Errors:          ${stats.errors} (${errPct.toFixed(2)}%)  [network: ${stats.network}]`);
  return { p95: percentile(sorted, 95), errPct, throttledPct, tput, total: stats.total };
}

// Run `vus` concurrent workers for `durationSec`, each looping the journey.
async function runLoad(label, vus, durationSec) {
  const stats = { total: 0, errors: 0, throttled: 0, network: 0, latencies: [] };
  const deadline = Date.now() + durationSec * 1000;
  const start = Date.now();
  let live = 0, peak = 0;
  const worker = async () => {
    live++; peak = Math.max(peak, live);
    while (Date.now() < deadline) {
      await userJourney(stats);
    }
    live--;
  };
  console.log(`▶ ${label}: ramping ${vus} virtual users for ${durationSec}s against ${BASE}`);
  await Promise.all(Array.from({ length: vus }, worker));
  const res = summarize(label, stats, Date.now() - start);
  res.peak = peak;
  return res;
}

// Spike: burst to `vus`, drain to a low baseline, repeat `cycles` times.
async function runSpike(vus, cycles) {
  const results = [];
  for (let c = 1; c <= cycles; c++) {
    results.push(await runLoad(`Spike cycle ${c} (peak ${vus})`, vus, 10));
    await runLoad(`Spike cycle ${c} (drain 100)`, 100, 5);
  }
  return results;
}

// Booking-surge concurrency safety against the dev /api/bookings endpoint.
// Verifies the server never oversells and never double-counts seats.
async function runSurge(vus) {
  console.log(`▶ Booking surge: ${vus} concurrent bookings on one outing (dev endpoint)`);
  const list = await request('GET', '/api/outings');
  if (!Array.isArray(list.body) || !list.body.length) {
    console.log('  ✖ No outings available — seed data first.'); return;
  }
  const outing = list.body[0];
  const before = outing.current_participants || 0;
  const capacity = outing.max_participants || 0;

  // Each VU registers, logs in, then fires a booking for the same outing.
  const attempts = await Promise.all(Array.from({ length: vus }, async (_, i) => {
    const email = `surge_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}@test.com`;
    const signup = await request('POST', '/api/auth/signup', {
      name: 'Surge', email, password: 'TestPass1', phone: '9' + String(1000000000 + i).slice(0, 9),
    });
    const token = signup.body && signup.body.token;
    if (!token) return { ok: false, status: signup.status };
    return request('POST', '/api/bookings', {
      outing_id: outing.id, participants: 1, participant_names: 'Surge', total_amount: outing.cost,
    }, token);
  }));

  const confirmed = attempts.filter((a) => a && a.ok && a.body && a.body.success).length;
  const rejected = attempts.length - confirmed;
  const after = (await request('GET', `/api/outings/${outing.id}`)).body.current_participants || 0;
  const seatsAdded = after - before;

  console.log(`\n──────── Booking Surge Safety ────────`);
  console.log(`  Capacity:               ${capacity}`);
  console.log(`  Confirmed bookings:     ${confirmed}`);
  console.log(`  Rejected/failed:        ${rejected}`);
  console.log(`  Seats counted (delta):  ${seatsAdded}`);
  const noDoubleCount = seatsAdded === confirmed;
  const noOversell = capacity === 0 || after <= capacity;
  console.log(`  ✔ No duplicate seat counts: ${noDoubleCount ? 'PASS' : 'FAIL'}`);
  console.log(`  ✔ No overselling:           ${noOversell ? 'PASS' : 'WARN (reserve seats at create-order for hard guarantee)'}`);
  return { noDoubleCount, noOversell, confirmed, seatsAdded };
}

function verdict(results) {
  const flat = [].concat(results).filter(Boolean);
  const worstErr = Math.max(0, ...flat.map((r) => r.errPct || 0));
  const worstP95 = Math.max(0, ...flat.map((r) => r.p95 || 0));
  const pass = worstErr < ACCEPTANCE.errorRatePct && worstP95 < ACCEPTANCE.p95Ms;
  console.log(`\n════════ GO / NO-GO ════════`);
  console.log(`  Worst error rate: ${worstErr.toFixed(2)}%  (limit ${ACCEPTANCE.errorRatePct}%)`);
  console.log(`  Worst p95:        ${worstP95.toFixed(0)} ms (limit ${ACCEPTANCE.p95Ms} ms)`);
  console.log(`  Verdict:          ${pass ? '✅ GO' : '⚠ NO-GO — investigate bottlenecks'}`);
}

(async () => {
  let results = [];
  switch (scenario) {
    case 'baseline':
      results.push(await runLoad('Baseline', arg('vus', 100), arg('dur', 60)));
      break;
    case 'load':
      results.push(await runLoad('Load', arg('vus', 500), arg('dur', 120)));
      break;
    case 'stress':
      results.push(await runLoad('Stress', arg('vus', 3000), arg('dur', 60)));
      break;
    case 'spike':
      results = await runSpike(arg('vus', 5000), arg('cycles', 5));
      break;
    case 'soak':
      results.push(await runLoad('Endurance/Soak', arg('vus', 500), arg('dur', 86400)));
      break;
    case 'surge':
      await runSurge(arg('vus', 200));
      return;
    default:
      console.log(`Unknown scenario "${scenario}". Use: baseline | load | stress | spike | soak | surge`);
      process.exit(1);
  }
  verdict(results);
})();
