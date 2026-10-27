import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { Book } from '../models/Book.js';
import { Signup } from '../models/Signup.js';

const router = Router();

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Frena los intentos de adivinar la contraseña.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});

function requireAdmin(req, res, next) {
  if (!config.adminUser || !config.adminPassword) {
    return res.status(503).json({ error: 'Admin deshabilitado: falta configurar ADMIN_USER y ADMIN_PASSWORD.' });
  }
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Basic' && token) {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i > -1) {
      const user = decoded.slice(0, i);
      const pass = decoded.slice(i + 1);
      if (safeEqual(user, config.adminUser) && safeEqual(pass, config.adminPassword)) return next();
    }
  }
  // Sin WWW-Authenticate a propósito: el login es del formulario React, no del navegador.
  res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
}

router.use(authLimiter, requireAdmin);

router.get('/me', (_req, res) => res.json({ ok: true }));

// Resumen: total de inscritos y conteo por libro (todos los libros, también inactivos).
router.get('/summary', async (_req, res, next) => {
  try {
    const [total, counts, books] = await Promise.all([
      Signup.countDocuments(),
      Signup.aggregate([{ $unwind: '$books' }, { $group: { _id: '$books', count: { $sum: 1 } } }]),
      Book.find().sort({ order: 1, title: 1 }),
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.count]));
    res.json({
      total,
      books: books.map((b) => ({ _id: b._id, title: b.title, author: b.author, cover: b.cover, color: b.color, active: b.active, count: byId.get(String(b._id)) || 0 })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/signups', async (_req, res, next) => {
  try {
    const signups = await Signup.find().sort({ updatedAt: -1 }).populate('books', 'title');
    res.json(signups);
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
    const signups = await Signup.find().sort({ createdAt: 1 }).populate('books', 'title');
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

const bookFields = (body) => {
  const out = {};
  if (typeof body.title === 'string') out.title = body.title.trim();
  if (typeof body.author === 'string') out.author = body.author.trim();
  if (typeof body.cover === 'string') out.cover = body.cover.trim();
  if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color.trim())) out.color = body.color.trim();
  if (typeof body.active === 'boolean') out.active = body.active;
  if (body.order !== undefined && Number.isFinite(Number(body.order))) out.order = Number(body.order);
  return out;
};

router.post('/books', async (req, res, next) => {
  try {
    const data = bookFields(req.body || {});
    if (!data.title) return res.status(400).json({ error: 'El título es obligatorio.' });
    if (data.order === undefined) {
      const last = await Book.findOne().sort({ order: -1 }).select('order');
      data.order = (last?.order || 0) + 10;
    }
    res.status(201).json(await Book.create(data));
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Ya existe un libro con ese título.' });
    next(e);
  }
});

router.patch('/books/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const data = bookFields(req.body || {});
    if ('title' in data && !data.title) return res.status(400).json({ error: 'El título es obligatorio.' });
    const book = await Book.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!book) return res.status(404).json({ error: 'No encontrado.' });
    res.json(book);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Ya existe un libro con ese título.' });
    next(e);
  }
});

export default router;
