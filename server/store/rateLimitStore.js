import { getRepo } from '../db.js';

// Almacén de express-rate-limit sobre MongoDB: el conteo se comparte entre todas las instancias
// (en Vercel el conteo en memoria se pierde en cada arranque en frío y no se comparte).
export class MongoRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const { totalHits, resetTime } = await getRepo().rateHit(`${this.prefix}:${key}`, this.windowMs);
    return { totalHits, resetTime };
  }

  async decrement(key) {
    await getRepo().rateUnhit(`${this.prefix}:${key}`);
  }

  async resetKey(key) {
    await getRepo().rateReset(`${this.prefix}:${key}`);
  }
}
