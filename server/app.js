import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { Book } from './models/Book.js';
import { Signup } from './models/Signup.js';
import { seedBooks } from './booksSeed.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

// Una sola conexión por proceso. En serverless (Vercel) se reutiliza entre invocaciones.
let ready;
export function connectDb() {
  ready ??= (async () => {
    await mongoose.connect(config.mongoUri);
    if ((await Book.estimatedDocumentCount()) === 0) {
      console.log(`Base vacía: sembrando libros (${await seedBooks()}).`);
    }
    await Promise.all([Book.init(), Signup.init()]);
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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));

app.use('/api', (_req, _res, next) => connectDb().then(() => next(), next));
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
