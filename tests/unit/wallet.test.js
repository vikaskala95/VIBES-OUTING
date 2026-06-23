const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateWalletBalance, walletRedeemCap } = require('../../backend/services/wallet-service');

test('wallet balance computes credits and debits', () => {
  const balance = calculateWalletBalance([
    { type: 'credit', amount: 500 },
    { type: 'debit', amount: 120 },
    { type: 'credit', amount: 50 },
  ]);

  assert.equal(balance, 430);
});

test('wallet redeem cap is 90 percent', () => {
  assert.equal(walletRedeemCap(1000), 900);
});
