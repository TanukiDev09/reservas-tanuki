import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { Book } from '../models/Book.js';
import { Signup } from '../models/Signup.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-\s.]{7,25}$/;

router.get('/config', (_req, res) => {
  res.json({ termsUrl: config.termsUrl, privacyUrl: config.privacyUrl });
});

router.get('/books', async (_req, res, next) => {
  try {
    const books = await Book.find({ active: true }).sort({ order: 1, title: 1 }).select('title author cover color');
    res.json(books);
  } catch (e) {
    next(e);
  }
});

const signupLimiter = rateLimit({
  windowMs: config.rateLimitWindowMin * 60 * 1000,
  limit: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Has enviado varias veces seguidas. Inténtalo de nuevo más tarde.' },
});

router.post('/signups', signupLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};

    // Campo trampa: las personas no lo ven; los bots sí lo llenan. Se responde "ok" sin guardar.
    if (typeof b.website === 'string' && b.website.trim() !== '') {
      return res.json({ ok: true });
    }

    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const name = str(b.name);
    const city = str(b.city);
    const email = str(b.email).toLowerCase();
    const phone = str(b.phone);
    const ids = Array.isArray(b.books) ? [...new Set(b.books.map(String))] : [];

    const errors = {};
    if (!name) errors.name = 'Cuéntanos tu nombre.';
    if (!city) errors.city = 'Cuéntanos de qué ciudad eres.';
    if (!EMAIL_RE.test(email)) errors.email = 'Revisa tu correo, parece que le falta algo.';
    if (phone && !PHONE_RE.test(phone)) errors.phone = 'Revisa tu teléfono.';
    if (!ids.length || !ids.every((id) => mongoose.isValidObjectId(id))) {
      errors.books = 'Elige al menos un libro.';
    }
    if (b.termsAccepted !== true) errors.termsAccepted = 'Necesitamos que aceptes los términos y condiciones.';
    if (b.dataAuthorized !== true) errors.dataAuthorized = 'Necesitamos tu autorización para avisarte.';
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const valid = await Book.find({ _id: { $in: ids }, active: true }).select('_id');
    if (!valid.length) {
      return res.status(400).json({ errors: { books: 'Esos libros ya no están en la lista. Elige de nuevo.' } });
    }

    // Si el correo ya existe: actualiza datos, suma libros nuevos y renueva la autorización.
    await Signup.updateOne(
      { email },
      {
        $set: {
          name,
          city,
          phone,
          consent: {
            termsAccepted: true,
            dataAuthorized: true,
            textVersion: config.authTextVersion,
            acceptedAt: new Date(),
          },
        },
        $addToSet: { books: { $each: valid.map((v) => v._id) } },
        $setOnInsert: { email },
      },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (e) {
    // Dos envíos simultáneos con el mismo correo: el segundo choca con el índice único.
    if (e?.code === 11000) return res.json({ ok: true });
    next(e);
  }
});

export default router;
