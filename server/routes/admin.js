import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { getRepo } from '../db.js';
import { booksCache } from '../cache.js';
import { MongoRateLimitStore } from '../store/rateLimitStore.js';

const router = Router();

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Frena los intentos de adivinar la contraseña. El conteo vive en MongoDB (compartido entre instancias)
// y solo cuentan los intentos fallidos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore('admin-login'),
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});

// Sesión: cookie firmada (HMAC-SHA256) con vencimiento. HttpOnly: el JavaScript de la página no puede leerla;
// SameSite=Strict: el navegador no la envía desde otros sitios. No se guarda nada en el navegador aparte de ella.
const sessionKey = crypto
  .createHash('sha256')
  .update(config.sessionSecret || `${config.adminUser}\n${config.adminPassword}\n${config.mongoUri}`)
  .digest();
const sign = (payload) => crypto.createHmac('sha256', sessionKey).update(payload).digest('base64url');
const cookieName = (secure) => (secure ? '__Host-tanuki_admin' : 'tanuki_admin');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function hasSession(req) {
  const [payload, mac] = readCookie(req, cookieName(req.secure)).split('.');
  if (!payload || !mac) return false;
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now();
  } catch {
    return false;
  }
}

function setSession(req, res) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + config.sessionHours * 3600_000 })).toString('base64url');
  res.cookie(cookieName(req.secure), `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionHours * 3600_000,
  });
}

// Respuestas del panel con datos personales: nunca se guardan en cachés (navegador, CDN, proxies).
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const disabled = (res) =>
  res.status(503).json({ error: 'Admin deshabilitado: falta configurar ADMIN_USER y ADMIN_PASSWORD.' });

router.post('/login', loginLimiter, (req, res) => {
  if (!config.adminUser || !config.adminPassword) return disabled(res);
  const { user, pass } = req.body || {};
  // Se evalúan ambos a propósito (sin &&) para no revelar cuál de los dos falló por el tiempo de respuesta.
  const okUser = typeof user === 'string' && safeEqual(user, config.adminUser);
  const okPass = typeof pass === 'string' && safeEqual(pass, config.adminPassword);
  if (!(okUser & okPass)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  setSession(req, res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(cookieName(req.secure), { httpOnly: true, secure: req.secure, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});

function requireAdmin(req, res, next) {
  if (!config.adminUser || !config.adminPassword) return disabled(res);
  if (!hasSession(req)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  // Defensa extra contra CSRF: los cambios solo se aceptan desde nuestro propio JavaScript.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'tanuki') {
    return res.status(403).json({ error: 'Solicitud no permitida.' });
  }
  next();
}

router.use(requireAdmin);

router.get('/me', (_req, res) => res.json({ ok: true }));

// Publicar: recompila el sitio (Vercel) para refrescar la lista de libros incrustada en el HTML.
router.get('/publish', (_req, res) => res.json({ enabled: Boolean(config.deployHook) }));

router.post('/publish', async (_req, res, next) => {
  try {
    if (!config.deployHook) return res.status(400).json({ error: 'Falta VERCEL_DEPLOY_HOOK_URL.' });
    const r = await fetch(config.deployHook, { method: 'POST', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(502).json({ error: `Vercel respondió ${r.status}.` });
    res.json({ ok: true, at: new Date() });
  } catch (e) {
    next(e);
  }
});

// Resumen: total de inscritos y conteo por libro (todos los libros, también inactivos).
router.get('/summary', async (_req, res, next) => {
  try {
    const { total, books } = await getRepo().summary();
    res.json({
      total,
      books: books.map(({ _id, title, author, cover, color, active, count }) => ({ _id, title, author, cover, color, active, count })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/signups', async (_req, res, next) => {
  try {
    res.json(await getRepo().listSignups());
  } catch (e) {
    next(e);
  }
});

// Evita que Excel interprete una celda como fórmula (=, +, -, @).
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

router.get('/export.csv', async (_req, res, next) => {
  try {
    const signups = (await getRepo().listSignups()).sort((a, b) => a.createdAt - b.createdAt);
    const head = [
      'Fecha de inscripción', 'Última actualización', 'Nombre', 'Ciudad', 'Correo', 'Teléfono',
      'Libros', 'Aceptó términos', 'Autorizó datos', 'Versión del texto', 'Fecha de autorización',
    ];
    const rows = signups.map((s) => [
      s.createdAt.toISOString(),
      s.updatedAt.toISOString(),
      s.name,
      s.city,
      s.email,
      s.phone,
      s.books.map((b) => b.title).join(' | '),
      s.consent.termsAccepted ? 'Sí' : 'No',
      s.consent.dataAuthorized ? 'Sí' : 'No',
      s.consent.textVersion,
      s.consent.acceptedAt.toISOString(),
    ]);
    const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inscripciones-tanuki.csv"');
    res.send(csv);
  } catch (e) {
    next(e);
  }
});

const COVER_RE = /^\/covers\/[A-Za-z0-9._-]{1,100}\.(webp|png|jpe?g|avif)$/;
const COVER_ERROR = 'La portada debe ser una imagen de la carpeta covers, por ejemplo /covers/mi-libro.webp.';

const bookFields = (body) => {
  const out = {};
  if (typeof body.title === 'string') out.title = body.title.trim().slice(0, 200);
  if (typeof body.author === 'string') out.author = body.author.trim().slice(0, 120);
  // Solo imágenes propias del sitio (/covers/…): una URL externa le avisaría a un tercero de cada visita.
  if (typeof body.cover === 'string') {
    const cover = body.cover.trim();
    if (cover && !COVER_RE.test(cover)) out.invalidCover = true;
    else out.cover = cover;
  }
  if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color.trim())) out.color = body.color.trim();
  if (typeof body.active === 'boolean') out.active = body.active;
  if (body.order !== undefined && Number.isFinite(Number(body.order))) out.order = Number(body.order);
  return out;
};

router.post('/books', async (req, res, next) => {
  try {
    const data = bookFields(req.body || {});
    if (data.invalidCover) return res.status(400).json({ error: COVER_ERROR });
    if (!data.title) return res.status(400).json({ error: 'El título es obligatorio.' });
    if (data.order === undefined) {
      data.order = (await getRepo().lastBookOrder()) + 10;
    }
    const created = await getRepo().createBook(data);
    booksCache.clear();
    res.status(201).json(created);
  } catch (e) {
    if (e?.code === 'DUPLICATE') return res.status(409).json({ error: 'Ya existe un libro con ese título.' });
    next(e);
  }
});

router.patch('/books/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const data = bookFields(req.body || {});
    if (data.invalidCover) return res.status(400).json({ error: COVER_ERROR });
    if ('title' in data && !data.title) return res.status(400).json({ error: 'El título es obligatorio.' });
    const book = await getRepo().updateBook(req.params.id, data);
    if (!book) return res.status(404).json({ error: 'No encontrado.' });
    booksCache.clear();
    res.json(book);
  } catch (e) {
    if (e?.code === 'DUPLICATE') return res.status(409).json({ error: 'Ya existe un libro con ese título.' });
    next(e);
  }
});

export default router;
