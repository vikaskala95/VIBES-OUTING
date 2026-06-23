function calculateWalletBalance(transactions = []) {
  return transactions.reduce((sum, tx) => {
    const amount = Number(tx.amount || 0);
    if (tx.type === 'credit') return sum + amount;
    if (tx.type === 'debit') return sum - amount;
    return sum;
  }, 0);
}

function walletRedeemCap(totalAmount) {
  return Math.max(0, Math.floor(Number(totalAmount || 0) * 0.9));
}

module.exports = {
  calculateWalletBalance,
  walletRedeemCap,
};
