import { api } from '../services/api.js';

export async function renderBlogs() {
  const blogs = await api.get('/api/blogs').catch(() => []);
  const rows = blogs.slice(0, 10).map((blog) => `<li>${blog.title}</li>`).join('');
  return `<section><h1>Blogs</h1><ul>${rows}</ul></section>`;
}
