// Una sola vez: quita el índice único de correo que tenía la colección (ahora cada envío es una inscripción nueva).
import { initStore } from './db.js';
import mongoose from 'mongoose';

await initStore();
const col = mongoose.connections.at(-1).collection('signups');
const idx = (await col.indexes()).find((i) => i.name === 'email_1');
if (idx?.unique) {
  await col.dropIndex('email_1');
  await col.createIndex({ email: 1 });
  console.log('Índice único de correo eliminado (se dejó uno normal).');
} else {
  console.log('No había índice único de correo: nada que hacer.');
}
process.exit(0);
