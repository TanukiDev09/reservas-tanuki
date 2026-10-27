import crypto from 'node:crypto';
import { config } from './config.js';

const key = crypto
  .createHash('sha256')
  .update(`antispam\n${config.sessionSecret || config.adminPassword}\n${config.mongoUri}`)
  .digest();
const hmac = (s) => crypto.createHmac('sha256', key).update(s).digest('base64url');

const MIN_AGE_MS = 4_000; // una persona tarda más que esto en elegir libros y llenar los datos
const MAX_AGE_MS = 6 * 3600_000;

// Token firmado con la hora en que se cargó el formulario. No se guarda nada en el servidor.
export const issueFormToken = () => {
  const ts = String(Date.now());
  return `${ts}.${hmac(`form:${ts}`)}`;
};

// 'ok' | 'fast' (envío sospechosamente rápido) | 'invalid' (falta, alterado o vencido)
export function checkFormToken(token) {
  if (typeof token !== 'string') return 'invalid';
  const [ts, mac] = token.split('.');
  if (!/^\d{10,15}$/.test(ts || '') || !mac) return 'invalid';
  const expected = hmac(`form:${ts}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return 'invalid';
  const age = Date.now() - Number(ts);
  if (age > MAX_AGE_MS || age < 0) return 'invalid';
  return age < MIN_AGE_MS ? 'fast' : 'ok';
}

// El correo nunca se guarda en el contador: solo su huella con clave secreta.
export const emailKey = (email) => `signup-email:${hmac(`email:${email}`)}`;

// La petición debe venir de nuestra propia página (los navegadores envían Origin en los POST).
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // clientes que no son navegadores: los frenan los demás controles
  try {
    const host = new URL(origin).host;
    const allowed = new Set([req.get('host')]);
    if (config.siteUrl) allowed.add(new URL(config.siteUrl).host);
    return allowed.has(host);
  } catch {
    return false;
  }
}

// Spam típico: enlaces o etiquetas dentro de nombre y ciudad.
export const looksLikeSpam = (s) => /https?:|:\/\/|www\.|[<>]|\.(com|net|org|ru|xyz)\b/i.test(s);
