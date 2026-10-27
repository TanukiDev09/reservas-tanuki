# Avisos Tanuki

Página pequeña para que las personas se inscriban y reciban un aviso cuando un libro de Tanuki Libros vuelva a estar disponible. Pensada para celular (QR en ferias).

Stack: MongoDB + Express + React (Vite) + Node, en un solo repositorio.

## Correr en local

Requisitos: Node 18+ y MongoDB corriendo en `127.0.0.1:27017`.

```bash
cp .env.example .env     # en Windows: copy .env.example .env
npm install              # instala servidor y cliente
npm run dev
```

- Formulario: http://localhost:5173
- Administración: http://localhost:5173/admin (usuario y contraseña de `.env`)

La primera vez que arranca con la base vacía, siembra los 11 libros. También puedes correr `npm run seed`: agrega los títulos que falten y completa autor, portada y color solo si están vacíos. No lo corras si renombraste un libro desde `/admin`: volvería a crear el título original.

Las portadas están en `client/public/covers` (WebP de 360 px). Para un libro nuevo, súbela ahí o pega la URL de una imagen en `/admin`, y elige su color.

## Variables de entorno (`.env`)

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto del servidor (3000) |
| `MONGODB_URI` | Conexión a MongoDB |
| `SITE_URL` | URL pública final; la usa el QR |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Acceso a `/admin` (obligatorias) |
| `TERMS_URL`, `PRIVACY_URL` | Enlaces de las dos casillas del formulario |
| `AUTH_TEXT_VERSION` | Versión del texto de autorización. Cámbiala cuando modifiques ese texto; se guarda con cada inscripción junto con la fecha |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MIN` | Límite de envíos por IP (8 por 60 min por defecto) |
| `TRUST_PROXY` | `1` si el hosting usa proxy (casi siempre), para leer la IP real |

## Desplegar en un hosting Node con MongoDB

1. Crea una base en MongoDB (por ejemplo Atlas) y copia su cadena de conexión.
2. Sube el repositorio al hosting y define las variables de entorno de arriba en su panel.
3. Comando de build: `npm install && npm run build`
4. Comando de inicio: `npm start`
5. Apunta el subdominio (por ejemplo `avisos.tanukilibros.com`) al servicio y activa HTTPS.

El mismo servidor entrega la API y el formulario ya compilado (`client/dist`).

## Código QR

```bash
npm run qr                                   # usa SITE_URL de .env
npm run qr -- https://avisos.tanukilibros.com  # o pasa la URL
```

Genera `qr-avisos-tanuki.png`. Si cambia la URL, cambia `SITE_URL` y vuelve a correrlo.

## Administración (`/admin`)

- Total de inscritos y conteo por libro.
- Agregar y editar libros, y activarlos o desactivarlos (los desactivados no aparecen en el formulario).
- Lista de inscripciones con la versión y fecha de la autorización.
- Botón **Exportar CSV**.

## Notas

- Si el correo ya existe, se actualizan los datos, se suman los libros nuevos y se renueva la autorización.
- Antispam: campo trampa oculto y límite de envíos por IP.
- `/admin` se protege con usuario y contraseña de `.env`. Úsalo siempre con HTTPS.
