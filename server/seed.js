import { initStore, getRepo } from './db.js';
import { seedBooks } from './booksSeed.js';

await initStore();
console.log(`Libros sembrados: ${await seedBooks(getRepo())} nuevos.`);
process.exit(0);
