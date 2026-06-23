const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNotification } = require('../../backend/services/notifications-service');

test('notification payload contains expected fields', () => {
  const notification = buildNotification('wallet', 'Credited', 'You got INR 100');

  assert.equal(notification.type, 'wallet');
  assert.equal(notification.title, 'Credited');
  assert.equal(notification.message, 'You got INR 100');
  assert.ok(notification.createdAt);
});
