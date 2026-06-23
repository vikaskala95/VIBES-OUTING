import { api } from '../services/api.js';

export async function renderOutings() {
  const outings = await api.get('/api/outings').catch(() => []);
  const cards = outings.slice(0, 20).map((outing) => `
    <article class="card">
      <h3>${outing.title}</h3>
      <p>${outing.location}</p>
      <p>INR ${outing.cost}</p>
    </article>
  `).join('');

  return `<section><h1>Outings</h1><div class="grid">${cards}</div></section>`;
}
