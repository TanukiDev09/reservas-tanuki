import 'dotenv/config';
import QRCode from 'qrcode';

const url = process.argv[2] || process.env.SITE_URL;
if (!url) {
  console.error('Define SITE_URL en .env o pasa la URL: npm run qr -- https://avisos.tanukilibros.com');
  process.exit(1);
}

const out = 'qr-avisos-tanuki.png';
await QRCode.toFile(out, url, {
  width: 1200,
  margin: 4,
  errorCorrectionLevel: 'H',
  color: { dark: '#52196f', light: '#ffffff' },
});
console.log(`QR generado: ${out} -> ${url}`);
