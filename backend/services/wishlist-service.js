function toggleWishlistEntry(existingSet, outingId) {
  const next = new Set(existingSet || []);
  if (next.has(outingId)) {
    next.delete(outingId);
    return { added: false, items: next };
  }
  next.add(outingId);
  return { added: true, items: next };
}

module.exports = {
  toggleWishlistEntry,
};
