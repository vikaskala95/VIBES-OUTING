const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'DATABASE_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
];

function validateRequiredSecrets(env = process.env) {
  const missing = REQUIRED_SECRETS.filter((name) => !String(env[name] || '').trim());
  if (missing.length) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    const err = new Error(message);
    err.code = 'MISSING_REQUIRED_SECRETS';
    throw err;
  }
}

module.exports = {
  validateRequiredSecrets,
  REQUIRED_SECRETS,
};
