// Genera client/books.snapshot.json con los libros activos de la base de datos.
// Se corre en cada build (Vercel incluido): la lista queda incrustada en el HTML y se sirve desde el CDN.
// Si la base no responde, el build NO falla: se conserva la copia anterior.
import fs from 'node:fs';
import { config } from '../server/config.js';
import { openMongo } from '../server/store/mongoRepo.js';

const out = new URL('../client/books.snapshot.json', import.meta.url);
const legal = { termsUrl: config.termsUrl, privacyUrl: config.privacyUrl };

try {
  const repo = await openMongo(config.mongoUri, 10000);
  const books = (await repo.listBooks({ activeOnly: true })).map(({ _id, title, author, cover, color }) => ({
    _id, title, author, cover, color,
  }));
  if (!books.length) throw new Error('no hay libros activos en la base');
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), config: legal, books }, null, 1));
  console.log(`snapshot: ${books.length} libros incrustados.`);
} catch (e) {
  console.warn(`snapshot: no se pudo actualizar (${e.message}). Se usa la copia existente.`);
  if (fs.existsSync(out)) {
    // Los enlaces legales sí se refrescan, porque salen de variables de entorno.
    const prev = JSON.parse(fs.readFileSync(out, 'utf8'));
    fs.writeFileSync(out, JSON.stringify({ ...prev, config: legal }, null, 1));
  } else {
    fs.writeFileSync(out, JSON.stringify({ generatedAt: null, config: legal, books: [] }));
  }
}
process.exit(0);
