import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// Incrusta en el HTML la lista de libros (client/books.snapshot.json, generada por `npm run snapshot`):
// el formulario se pinta sin esperar a ninguna función ni base de datos.
const booksSnapshot = () => ({
  name: 'books-snapshot',
  transformIndexHtml() {
    let snap;
    try {
      snap = JSON.parse(fs.readFileSync(new URL('./books.snapshot.json', import.meta.url), 'utf8'));
    } catch {
      return;
    }
    // "<" escapado para que ningún texto pueda cerrar la etiqueta <script>.
    const json = JSON.stringify({ books: snap.books, config: snap.config }).replace(/</g, '\\u003c');
    const tags = [{ tag: 'script', children: `window.__DATA__=${json}`, injectTo: 'head-prepend' }];
    for (const b of snap.books.slice(0, 3)) {
      if (b.cover) tags.push({ tag: 'link', attrs: { rel: 'preload', as: 'image', href: b.cover, fetchpriority: 'high' }, injectTo: 'head' });
    }
    return tags;
  },
});

export default defineConfig({
  plugins: [react(), booksSnapshot()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
