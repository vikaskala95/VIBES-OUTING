export function renderLayout(root, contentHtml) {
  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <a href="/app/" data-link class="brand">VIBES@Outing</a>
        <nav>
          <a href="/app/" data-link>Home</a>
          <a href="/app/outings" data-link>Outings</a>
          <a href="/app/wallet" data-link>Wallet</a>
          <a href="/app/blogs" data-link>Blogs</a>
        </nav>
      </header>
      <main id="page-root">${contentHtml}</main>
    </div>
  `;
}
