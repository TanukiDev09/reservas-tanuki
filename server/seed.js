import mongoose from 'mongoose';
import { config } from './config.js';
import { seedBooks } from './booksSeed.js';

await mongoose.connect(config.mongoUri);
const created = await seedBooks();
console.log(`Libros sembrados: ${created} nuevos.`);
await mongoose.disconnect();
