import mongoose from 'mongoose';

// Contador de peticiones por clave (IP). Mongo borra solo los documentos vencidos (TTL sobre expireAt).
export const rateHitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    hits: { type: Number, required: true },
    expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { versionKey: false }
);
