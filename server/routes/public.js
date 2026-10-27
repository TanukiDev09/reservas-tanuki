import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { getRepo } from '../db.js';
import { booksCache } from '../cache.js';
import { MongoRateLimitStore } from '../store/rateLimitStore.js';
import { issueFormToken, checkFormToken, emailKey, sameOrigin, looksLikeSpam } from '../antispam.js';

// El CDN (Vercel) guarda estas respuestas un rato: la mayoría de visitas no toca la base.
export const cdn = (res, s) => res.set('Cache-Control', `public, s-maxage=${s}, stale-while-revalidate=600`);

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-\s.]{7,25}$/;

router.get('/config', (_req, res) => {
  cdn(res, 300);
  res.json({ termsUrl: config.termsUrl, privacyUrl: config.privacyUrl });
});

router.get('/books', async (_req, res, next) => {
  try {
    const rows = await getRepo().listBooks({ activeOnly: true });
    const books = rows.map(({ _id, title, author, cover, color }) => ({ _id, title, author, cover, color }));
    booksCache.set(books);
    cdn(res, 60);
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
  store: new MongoRateLimitStore('signup'),
  message: { error: 'Has enviado varias veces seguidas. Inténtalo de nuevo más tarde.' },
});

// Token con la hora de carga del formulario (ver antispam.js). Nunca se guarda en cachés.
router.get('/form-token', (_req, res) => res.set('Cache-Control', 'no-store').json({ token: issueFormToken() }));

const EMAIL_MAX = 5; // inscripciones por correo cada 24 h
const GLOBAL_MAX = 500; // tope de seguridad por hora para todo el formulario
const tooMany = (res) =>
  res.status(429).json({ error: 'Has enviado varias veces seguidas. Inténtalo de nuevo más tarde.' });

router.post('/signups', signupLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};

    // Solo desde nuestra propia página.
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Solicitud no permitida.' });

    // Campo trampa: las personas no lo ven; los bots sí lo llenan. Se responde "ok" sin guardar.
    if (typeof b.website === 'string' && b.website.trim() !== '') {
      return res.json({ ok: true });
    }

    // Token de carga del formulario: sin él, o alterado, se rechaza; si llega demasiado rápido, se descarta en silencio.
    const tokenState = checkFormToken(b.formToken);
    if (tokenState === 'invalid') {
      return res.status(400).json({ error: 'La página se quedó abierta mucho tiempo. Recárgala e inténtalo de nuevo.' });
    }
    if (tokenState === 'fast') return res.json({ ok: true });

    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const name = str(b.name);
    const city = str(b.city);
    const email = str(b.email).toLowerCase();
    const phone = str(b.phone);
    const ids = Array.isArray(b.books) ? [...new Set(b.books.map(String))] : [];

    const errors = {};
    if (!name || looksLikeSpam(name)) errors.name = 'Cuéntanos tu nombre.';
    if (!city || looksLikeSpam(city)) errors.city = 'Cuéntanos de qué ciudad eres.';
    if (!EMAIL_RE.test(email)) errors.email = 'Revisa tu correo, parece que le falta algo.';
    if (phone && !PHONE_RE.test(phone)) errors.phone = 'Revisa tu teléfono.';
    if (!ids.length || !ids.every((id) => mongoose.isValidObjectId(id))) {
      errors.books = 'Elige al menos un libro.';
    }
    if (b.termsAccepted !== true) errors.termsAccepted = 'Necesitamos que aceptes los términos y condiciones.';
    if (b.dataAuthorized !== true) errors.dataAuthorized = 'Necesitamos tu autorización para avisarte.';
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const repo = getRepo();
    const valid = await repo.activeBookIds(ids);
    if (!valid.length) {
      return res.status(400).json({ errors: { books: 'Esos libros ya no están en la lista. Elige de nuevo.' } });
    }

    // Topes que no dependen de la IP (un bot con muchas IP los salta): por correo y global. Va después de validar
    // para que un error del formulario no gaste el cupo.
    const day = 24 * 3600_000;
    if ((await repo.rateHit(emailKey(email), day)).totalHits > EMAIL_MAX) return tooMany(res);
    if ((await repo.rateHit('signup-global', 3600_000)).totalHits > GLOBAL_MAX) return tooMany(res);

    // Cada envío crea una inscripción nueva (sin deduplicar por correo).
    await repo.createSignup({
      name,
      city,
      email,
      phone,
      bookIds: valid,
      submissionId: /^[\w-]{8,64}$/.test(b.submissionId) ? b.submissionId : undefined,
      consent: {
        termsAccepted: true,
        dataAuthorized: true,
        textVersion: config.authTextVersion,
        acceptedAt: new Date(),
      },
    });

    res.json({ ok: true });
  } catch (e) {
    // Reintento del mismo envío (mismo submissionId): ya está guardado.
    if (e?.code === 11000 && e?.keyPattern?.submissionId) return res.json({ ok: true });
    next(e);
  }
});

export default router;
