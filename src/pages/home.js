import { api } from '../services/api.js';

export async function renderHome() {
  const stats = await api.get('/api/public-stats').catch(() => ({ outings: 0, users: 0 }));
  return `
    <section>
      <h1>Plan Team Outings Faster</h1>
      <p>Modern modular frontend with lazy-loaded routes.</p>
      <div class="stats">
        <div><strong>${stats.outings || 0}</strong><span>Outings</span></div>
        <div><strong>${stats.users || 0}</strong><span>Users</span></div>
      </div>
    </section>
  `;
}
