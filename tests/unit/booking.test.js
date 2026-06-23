const test = require('node:test');
const assert = require('node:assert/strict');
const { availableSeats, canBook } = require('../../backend/services/booking-service');

test('available seats are computed safely', () => {
  assert.equal(availableSeats(20, 5), 15);
  assert.equal(availableSeats(20, 30), 0);
});

test('booking can only proceed when seats are available', () => {
  assert.equal(canBook(10, 8, 2), true);
  assert.equal(canBook(10, 8, 3), false);
});
