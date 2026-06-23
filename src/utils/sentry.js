import * as Sentry from '@sentry/browser';

export function initClientSentry() {
  const cfg = window.__VIBES_SENTRY__ || {};
  if (!cfg.dsn) return;

  Sentry.init({
    dsn: cfg.dsn,
    environment: cfg.environment || 'development',
    tracesSampleRate: Number(cfg.tracesSampleRate || 0.1),
  });
}

export function captureClientError(error, context = {}) {
  if (!error) return;
  Sentry.captureException(error, { extra: context });
}
