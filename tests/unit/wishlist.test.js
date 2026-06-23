const test = require('node:test');
const assert = require('node:assert/strict');
const { toggleWishlistEntry } = require('../../backend/services/wishlist-service');

test('wishlist add and remove works', () => {
  const first = toggleWishlistEntry(new Set(), 11);
  assert.equal(first.added, true);
  assert.equal(first.items.has(11), true);

  const second = toggleWishlistEntry(first.items, 11);
  assert.equal(second.added, false);
  assert.equal(second.items.has(11), false);
});
