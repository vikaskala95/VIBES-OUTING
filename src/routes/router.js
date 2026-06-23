const routes = {
  '/app/': () => import('../pages/home.js').then((m) => m.renderHome()),
  '/app/outings': () => import('../pages/outings.js').then((m) => m.renderOutings()),
  '/app/wallet': () => import('../pages/wallet.js').then((m) => m.renderWallet()),
  '/app/blogs': () => import('../pages/blogs.js').then((m) => m.renderBlogs()),
};

function normalize(pathname) {
  if (!pathname.startsWith('/app')) return '/app/';
  if (pathname === '/app') return '/app/';
  return pathname;
}

export async function renderCurrentRoute(container) {
  const route = normalize(window.location.pathname);
  const loader = routes[route] || routes['/app/'];
  container.innerHTML = '<p>Loading...</p>';
  container.innerHTML = await loader();
}

export function startRouter(container) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-link]');
    if (!link) return;
    event.preventDefault();
    history.pushState({}, '', link.getAttribute('href'));
    renderCurrentRoute(container);
  });

  window.addEventListener('popstate', () => renderCurrentRoute(container));
}
