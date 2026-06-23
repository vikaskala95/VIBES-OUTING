import { initClientSentry, captureClientError } from './utils/sentry.js';
import { renderLayout } from './components/layout.js';
import { renderCurrentRoute, startRouter } from './routes/router.js';

async function bootstrapSentryConfig() {
  try {
    const response = await fetch('/api/monitoring/sentry-config', { credentials: 'include' });
    if (!response.ok) return;
    const payload = await response.json();
    window.__VIBES_SENTRY__ = payload;
  } catch (_) {
    // Observability must not block app startup.
  }
}

bootstrapSentryConfig().finally(() => {
  initClientSentry();

  const root = document.getElementById('app');
  renderLayout(root, '<p>Loading...</p>');

  const pageRoot = document.getElementById('page-root');
  startRouter(pageRoot);
  renderCurrentRoute(pageRoot).catch((error) => {
    captureClientError(error, { scope: 'initial-render' });
    pageRoot.innerHTML = '<p>Unable to load page.</p>';
  });
});
