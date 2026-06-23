const Sentry = require('@sentry/node');

function initSentry() {
  const dsn = process.env.SENTRY_DSN || '';
  if (!dsn) return null;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || 'local',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.2),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE || 0.0),
  });

  return Sentry;
}

function getSentryBrowserConfig() {
  return {
    dsn: process.env.SENTRY_BROWSER_DSN || process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_BROWSER_TRACES_SAMPLE_RATE || 0.1),
  };
}

module.exports = {
  initSentry,
  getSentryBrowserConfig,
  Sentry,
};
