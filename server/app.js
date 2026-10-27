import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initStore } from './db.js';
import { seedBooks } from './booksSeed.js';
import { booksCache } from './cache.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

// Una sola conexión por proceso. En serverless (Vercel) se reutiliza entre invocaciones.
let ready;
export function connectDb() {
  ready ??= (async () => {
    const repo = await initStore();
    // Base vacía: se siembran los libros. En serverless no se revisa en cada arranque (usa npm run seed).
    if (!process.env.VERCEL && !(await repo.listBooks()).length) await seedBooks(repo);
  })().catch((e) => {
    ready = undefined; // permite reintentar en la próxima petición
    throw e;
  });
  return ready;
}

export const app = express();
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');

if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));

// Atajo sin base de datos: la lista de libros en caché se responde al instante.
app.get('/api/books', (_req, res, next) => {
  const cached = booksCache.get();
  if (!cached) return next();
  res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600').json(cached);
});
// /api/config no necesita la base: no se espera la conexión para responderlo.
app.use('/api', (req, _res, next) => (req.path === '/config' ? next() : connectDb().then(() => next(), next)));
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado.' }));

// En un hosting Node, el mismo servidor entrega la página ya compilada.
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud no válida.' });
  res.status(500).json({ error: 'Algo salió mal. Inténtalo de nuevo en un momento.' });
});
