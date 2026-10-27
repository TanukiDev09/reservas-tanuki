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
| `VERCEL_DEPLOY_HOOK_URL` | Hook de Vercel para el botón **Publicar cambios** de `/admin` (opcional) |
| `DNS_SERVERS` | DNS alterno si tu red no resuelve `mongodb+srv://` (ej. `8.8.8.8,1.1.1.1`) |
| `TRUST_PROXY` | `1` si el hosting usa proxy (casi siempre), para leer la IP real |

## Desplegar en un hosting Node con MongoDB

1. Crea una base en MongoDB (por ejemplo Atlas) y copia su cadena de conexión.
2. Sube el repositorio al hosting y define las variables de entorno de arriba en su panel.
3. Comando de build: `npm install && npm run build`
4. Comando de inicio: `npm start`
5. Apunta el subdominio (por ejemplo `avisos.tanukilibros.com`) al servicio y activa HTTPS.

El mismo servidor entrega la API y el formulario ya compilado (`client/dist`).

### Desplegar en Vercel

Hay que desplegar **la raíz del repositorio**, no la carpeta `client`. Si solo subes `client`, la página carga pero `/api/*` da 404, porque la API no está ahí.

1. En Vercel, importa el repositorio. En *Root Directory* deja la raíz (donde está `package.json` y `vercel.json`). El framework puede quedar en "Other".
2. En *Settings → Environment Variables* define: `MONGODB_URI`, `ADMIN_USER`, `ADMIN_PASSWORD`, `TERMS_URL`, `PRIVACY_URL`, `AUTH_TEXT_VERSION`, `SITE_URL` y `TRUST_PROXY=1`. No definas `DNS_SERVERS`.
3. En MongoDB Atlas, *Network Access*: Vercel no tiene IP fija, así que hay que permitir `0.0.0.0/0` (el acceso sigue protegido por usuario y contraseña).
4. Despliega. `vercel.json` ya sirve `client/dist` y envía `/api/*` a `api/index.js`.

Nota: en Vercel el límite de envíos por IP funciona por instancia, así que es una protección básica, no estricta.

#### Por qué carga tan rápido (Vercel)

- **Los libros van dentro del HTML.** En cada build, `npm run snapshot` lee los libros activos de Atlas y los incrusta en la página (`client/books.snapshot.json`). El formulario se pinta al instante, sin llamar a ninguna función ni a la base de datos. Si Atlas no responde durante el build, se usa la copia anterior y el build no falla.
- **Se actualiza en segundo plano.** Tras pintar, la página pide `/api/books` (con caché de 1 min en el CDN). Eso también deja lista la función y la conexión a Atlas para cuando la persona envíe el formulario.
- **Para fijar cambios de libros en la página:** en `/admin` pulsa **Publicar cambios**. Requiere `VERCEL_DEPLOY_HOOK_URL` (Vercel → Settings → Git → Deploy Hooks → crear uno para esta rama).
- **Redes flojas:** las portadas se bajan a medida que se acercan a la pantalla, y el envío reintenta hasta 3 veces con tiempo límite (no duplica contactos).
- **Mide antes de decidir:** con Lighthouse en 4G lenta simulada, el contenido principal aparece en ~2,5 s y con buena conexión en ~0,5 s (216 KB transferidos).
- **Región:** en Vercel → Settings → Functions, elige la región más cercana a tu clúster de Atlas.

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

- Cada envío del formulario crea una inscripción nueva (no se deduplica por correo). Un identificador por envío evita duplicados por reintentos con señal floja.
- Si vienes de la versión con índice único de correo, corre una vez `npm run drop-email-index` con el `MONGODB_URI` de producción.
- Antispam: campo trampa oculto y límite de envíos por IP.
- `/admin` se protege con usuario y contraseña de `.env`. Úsalo siempre con HTTPS.
