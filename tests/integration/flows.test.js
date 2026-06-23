const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function isServerReachable() {
  try {
    const response = await fetch(`${BASE}/api/health`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

test('booking flow smoke endpoint is reachable', async (t) => {
  if (!(await isServerReachable())) {
    t.skip('Server is not running at BASE_URL');
    return;
  }
  const response = await fetch(`${BASE}/api/health`);
  const body = await safeJson(response);
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
});

test('payment flow endpoint contract is protected', async (t) => {
  if (!(await isServerReachable())) {
    t.skip('Server is not running at BASE_URL');
    return;
  }
  const response = await fetch(`${BASE}/api/bookings/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outing_id: 1, participants: 1 }),
  });

  assert.ok(response.status === 401 || response.status === 400);
});

test('google login flow endpoint exists', async (t) => {
  if (!(await isServerReachable())) {
    t.skip('Server is not running at BASE_URL');
    return;
  }
  const response = await fetch(`${BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: 'invalid-token-for-contract-test' }),
  });

  assert.ok(response.status >= 400);
});
