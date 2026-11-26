# Deploy en Railway

La API y la web corren juntas en **un solo servicio de Railway**: al compilar se genera la web como sitio estático (`frontend/out`) y la API la sirve en la misma dirección. No hace falta Vercel ni configurar CORS. La base SQLite y sus backups viven en un **volumen**, que es lo único que no se borra en cada deploy.

Railway toma el código de este repositorio de GitHub y vuelve a desplegar solo cada vez que se mergea algo en `main`. La configuración de build y arranque está en [`railway.json`](../railway.json), en la raíz del repo.

**Costo.** El trial de Railway trae un crédito único de USD 5 y un volumen de hasta 0,5 GB, que alcanza de sobra para probar. Si se termina el trial sin pasar a un plan pago, Railway borra el volumen 30 días después.

## 1. Crear el servicio

1. Creá una cuenta en [railway.com](https://railway.com) entrando con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** y elegí `gestion-comercial`. Si no aparece, dale acceso a Railway al repo desde el botón que te ofrece.
3. En **Settings** del servicio dejá el **Root Directory** vacío (la raíz del repo). Railway encuentra solo el `railway.json`.

## 2. Volumen

Clic derecho sobre el servicio en el canvas → **Attach volume**, con **Mount path** `/data`.

Con el volumen montado, la base va a `/data/app.db` y los backups a `/data/backups` sin configurar nada más. **Sin volumen la API no arranca**, a propósito: si arrancara, cada deploy borraría todas las ventas.

## 3. Variables

En **Variables** cargá estas (con **Raw Editor** podés pegarlas todas juntas):

```
NODE_ENV=production
JWT_SECRET=<clave larga, ver abajo>
ADMIN_PASSWORD=<la contraseña que vas a usar para entrar como admin>
```

- `NODE_ENV=production` es obligatoria: **sin ella la API no arranca en Railway**, porque crearía los usuarios de ejemplo con contraseñas conocidas (`admin123`…).
- `JWT_SECRET`: al menos 32 caracteres. Generala en tu computadora con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`, o usá un generador de contraseñas largas.
- `ADMIN_PASSWORD`: mínimo 8 caracteres. Solo se usa la primera vez, con la base vacía, para crear el usuario `admin`. No se crean usuarios ni productos de ejemplo.
- `PORT` no hace falta: lo pone Railway. `CORS_ORIGIN` tampoco, porque la web sale de la misma dirección.

## 4. Dirección y primer ingreso

1. En **Settings → Networking**, tocá **Generate Domain**. Te queda una dirección como `https://gestion-comercial-production.up.railway.app`.
2. Esperá a que el deploy termine en verde. `https://<tu-dominio>/api/health` tiene que mostrar `{"ok":true}`.
3. Abrí `https://<tu-dominio>`, entrá con `admin` y la contraseña de `ADMIN_PASSWORD`, y creá desde **Usuarios** a los demás.

## Clientes y suscripciones

Agregá en **Variables**:

```
SUPERADMIN_PASSWORD=<contraseña para tu usuario de dueño de la plataforma>
DATOS_TRANSFERENCIA=Alias: tu.alias\nCBU: 0000000000000000000000\nTitular: Tu Nombre
PRECIO_MENSUAL=15000
```

- Al arrancar se crea el usuario `superadmin` (o el de `SUPERADMIN_USERNAME`) con esa contraseña. Entrá con él para ver **Plataforma**. Después podés cambiarle la contraseña desde ahí; la variable ya no se vuelve a usar.
- Si ya tenías datos, la migración los pasa al "Negocio principal", activo y **sin vencimiento**, así que no se corta nada. Antes de migrar guarda una copia `pre-migracion-…db` en `/data/backups`.
- Los clientes nuevos se registran solos en `https://<tu-dominio>/registro` con 14 días de prueba. Para cerrar el registro público: `SIGNUP_ENABLED=false` (y los das de alta vos desde Plataforma).

### Confirmación de email (obligatoria para el registro público)

Cada cuenta nueva queda inactiva hasta que el dueño abre el link que le llega por email. Los emails salen por [Resend](https://resend.com):

1. Creá una cuenta en Resend, agregá tu dominio en **Domains** y cargá los registros DNS que te muestra (hasta que el dominio figure como *Verified* solo podés mandarte emails a vos mismo).
2. En **API Keys** creá una con permiso *Sending access*.
3. En Railway agregá:

```
RESEND_API_KEY=re_...
EMAIL_FROM=Gestión Comercial <no-responder@tudominio.com>
APP_URL=https://<tu-dominio>
```

- Sin `RESEND_API_KEY` el registro público queda **cerrado** en producción (el resto de la app funciona igual). En desarrollo el link se escribe en el log de la API.
- `APP_URL` es la dirección que va en el link; si falta se usa el dominio público de Railway.
- Las cuentas que no confirman en 48 horas (`EMAIL_VERIFY_HOURS`) se borran solas y liberan el usuario y el email.
- Además, cada IP puede registrar como máximo 3 negocios por hora (`SIGNUP_MAX_PER_HOUR`).

Todos los negocios comparten la misma base SQLite del volumen. Alcanza para decenas de negocios chicos en un solo servicio; si crece mucho o querés más de una instancia, el paso siguiente es PostgreSQL (Railway lo ofrece como servicio aparte).

## Backups

La API guarda una copia diaria en `/data/backups` (conserva las últimas 14), pero está **en el mismo volumen que la base**: si se pierde el volumen, se pierden las dos. Por eso, en **Plataforma** el superadmin tiene el botón **Descargar copia de la base**, que baja una copia en el momento. Conviene hacerlo al menos una vez por semana y guardarla en otro lado (Drive, un pendrive).

Para restaurar una copia hay que reemplazar `/data/app.db` con el servicio detenido (y borrar `app.db-wal` y `app.db-shm` si existen).

## Si algo no funciona

Mirá los logs del deploy en Railway. Los errores de arranque dicen qué falta:

- `En Railway hay que definir NODE_ENV=production`: falta esa variable.
- `Falta un volumen en Railway`: falta el paso 2.
- `Falta la variable de entorno JWT_SECRET` o algo sobre `ADMIN_PASSWORD`: falta la variable o es demasiado corta.

## Otra opción: web aparte

Si algún día preferís la web en otro lado (por ejemplo Vercel), compilala con `NEXT_PUBLIC_API_URL=https://<tu-api>/api` y agregá esa dirección de la web en `CORS_ORIGIN` de la API.
