import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/avisos-tanuki',
  siteUrl: env.SITE_URL || '',
  adminUser: env.ADMIN_USER || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  termsUrl: env.TERMS_URL || 'https://tanukilibros.com/',
  privacyUrl: env.PRIVACY_URL || 'https://tanukilibros.com/',
  authTextVersion: env.AUTH_TEXT_VERSION || '1',
  rateLimitMax: Number(env.RATE_LIMIT_MAX) || 8,
  rateLimitWindowMin: Number(env.RATE_LIMIT_WINDOW_MIN) || 60,
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,
};

if (!config.adminUser || !config.adminPassword) {
  console.error('Falta ADMIN_USER o ADMIN_PASSWORD en .env: /admin queda deshabilitado.');
}
