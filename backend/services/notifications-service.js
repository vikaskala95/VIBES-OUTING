function buildNotification(type, title, message) {
  return {
    type: String(type || 'general'),
    title: String(title || ''),
    message: String(message || ''),
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  buildNotification,
};
