# Changelog

Todos los cambios importantes de este proyecto se registran aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con [SemVer](https://semver.org/lang/es/).

## [1.0.0] - 2026-10-27

Primera versión: página de avisos de disponibilidad de Tanuki Libros, pensada para celular (QR en ferias).

### Formulario público
- Inscripción en dos pasos: elegir libros (por portada) y dejar los datos.
- Datos: nombre, ciudad y correo obligatorios; teléfono opcional.
- Dos autorizaciones obligatorias (términos y tratamiento de datos), con enlaces configurables. De cada una se guarda la versión del texto y la fecha.
- Cada envío crea una inscripción nueva. Un identificador por envío evita duplicados cuando el formulario reintenta por señal floja.
- Carga rápida: la lista de libros va incrustada en el HTML al compilar y se actualiza en segundo plano; las portadas se cargan a medida que se acercan a la pantalla.
- Reintenta el envío hasta 3 veces con tiempo límite en redes flojas.
- Accesible: manejo de foco entre pasos, mensajes de error asociados a cada campo, botón "atrás" del celular.

### Administración (`/admin`)
- Acceso solo para administradores, con usuario y contraseña definidos en variables de entorno.
- Total de inscripciones y conteo por libro (incluye libros inactivos).
- Alta y edición de libros (título, autor, portada, color) y activación o desactivación para el formulario.
- Lista de inscripciones con la versión y fecha de la autorización.
- Exportación a CSV, con protección contra fórmulas de Excel.
- Botón **Publicar cambios**: recompila el sitio en Vercel (Deploy Hook) para fijar la lista de libros en la página.

### Herramientas
- `npm run seed`: siembra los 11 libros iniciales.
- `npm run qr`: genera el código QR de la página (`qr-avisos-tanuki.png`).
- `npm run snapshot`: incrusta los libros activos en el HTML en cada compilación.
- `npm run drop-email-index`: quita el índice único de correo de bases anteriores (ejecutar una vez).

### Despliegue
- Funciona en Vercel (función serverless + sitio estático) o en un hosting Node con MongoDB (Atlas o local).

### Seguridad
- **Sesión de administración:** cookie firmada y con vencimiento (2 h por defecto), inaccesible para JavaScript (`HttpOnly`) y no enviada desde otros sitios (`SameSite=Strict`); cabecera anti-CSRF en los cambios. No se guarda ninguna credencial en el navegador.
- **Límite de intentos de login:** 10 fallidos cada 15 minutos por IP, contado en MongoDB para que valga entre instancias.
- **Contraseña mínima:** `/admin` se deshabilita si la contraseña tiene menos de 16 caracteres o es la de ejemplo.
- **Cabeceras:** política de seguridad de contenido (CSP) estricta, HSTS, `Permissions-Policy`, `X-Frame-Options`, `Referrer-Policy: no-referrer` y políticas de origen cruzado.
- **Respuestas del panel** con `Cache-Control: no-store`.
- **Antispam del formulario:**
  - campo trampa oculto;
  - límite por IP (8 envíos por hora por defecto);
  - token firmado de carga con tiempo mínimo de 4 segundos;
  - límite por correo (5 por día) y tope global (500 por hora), sin guardar el correo en el contador;
  - verificación de origen;
  - rechazo de enlaces en nombre y ciudad.
- **Datos:** nadie puede modificar los datos de otra persona al enviar su correo; los logs no incluyen correos ni nombres; las portadas solo pueden ser imágenes de `/covers/`.

### Pendiente para próximas versiones
- Captcha (Cloudflare Turnstile).
- Segundo factor para el administrador.
- Cifrado de campos sensibles en MongoDB.
- Actualizar Vite (aviso de `esbuild` que solo afecta al servidor de desarrollo).
