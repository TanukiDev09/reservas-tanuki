import { config } from './config.js';
import { openMongo } from './store/mongoRepo.js';

let repo;

export const getRepo = () => repo;

export async function initStore() {
  repo ??= await openMongo(config.mongoUri);
  return repo;
}
