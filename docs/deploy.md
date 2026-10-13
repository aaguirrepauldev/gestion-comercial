# Deploy de prueba: Railway (API) + Vercel (web)

La API corre en **Railway**, con un volumen donde viven la base SQLite y sus backups. La web corre en **Vercel**. Las dos plataformas toman el código de este repositorio de GitHub y se vuelven a desplegar solas cada vez que se mergea algo en `main`.

**Costo.** El trial de Railway trae un crédito único de USD 5 y un volumen de hasta 0,5 GB, que alcanza de sobra para probar. Si se termina el trial sin pasar a un plan pago, Railway borra el volumen 30 días después. Vercel es gratis con el plan Hobby.

Se hace en este orden: primero la API (para tener su dirección), después la web, y por último se vuelve a Railway para habilitar la dirección de la web.

## 1. API en Railway

1. Creá una cuenta en [railway.com](https://railway.com) entrando con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** y elegí `gestion-comercial`. Si no aparece, dale acceso a Railway al repo desde el botón que te ofrece.
3. Entrá al servicio que se creó y, en **Settings**:
   - **Root Directory:** `/backend`
   - **Config file path** (en la sección *Config-as-code*): `/backend/railway.json`. Hay que poner la ruta completa, porque Railway no la busca dentro del Root Directory.
4. Agregá un volumen al servicio: clic derecho sobre el servicio en el canvas → **Attach volume**, con **Mount path** `/data`.
5. En **Variables** cargá estas (con **Raw Editor** podés pegarlas todas juntas):

   ```
   NODE_ENV=production
   JWT_SECRET=<clave larga, ver abajo>
   ADMIN_PASSWORD=<la contraseña que vas a usar para entrar como admin>
   CORS_ORIGIN=https://example.com
   DB_PATH=/data/app.db
   BACKUP_DIR=/data/backups
   ```

   - `JWT_SECRET`: tiene que tener al menos 32 caracteres. Generá una en tu computadora con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`, o usá un generador de contraseñas largas.
   - `ADMIN_PASSWORD`: mínimo 8 caracteres. Solo se usa la primera vez, cuando la base está vacía, para crear el usuario `admin`. No se crean usuarios ni productos de ejemplo.
   - `CORS_ORIGIN`: por ahora dejá ese valor provisorio y lo reemplazás en el paso 3, cuando tengas la dirección de Vercel.
   - `PORT` no hace falta: lo pone Railway.
6. En **Settings → Networking**, tocá **Generate Domain**. Te queda una dirección como `https://gestion-comercial-production.up.railway.app`.
7. Esperá a que el deploy termine en verde y abrí `https://<tu-dominio>.up.railway.app/api/health`. Tiene que mostrar `{"ok":true}`.

## 2. Web en Vercel

1. Creá una cuenta en [vercel.com](https://vercel.com) con tu cuenta de GitHub (plan Hobby).
2. **Add New → Project**, importá `gestion-comercial`.
3. Antes de desplegar:
   - **Root Directory:** `frontend` (Vercel detecta solo que es Next.js).
   - **Environment Variables:** `NEXT_PUBLIC_API_URL` = `https://<tu-dominio>.up.railway.app/api`, la dirección del paso 1.6 seguida de `/api`.
4. **Deploy**. Al terminar te da la dirección de la web, por ejemplo `https://gestion-comercial.vercel.app`.

## 3. Conectar la web con la API

1. En Railway, cambiá `CORS_ORIGIN` por la dirección de Vercel, sin `/` al final (por ejemplo `https://gestion-comercial.vercel.app`). Railway vuelve a desplegar solo.
2. Abrí la web, entrá con `admin` y la contraseña de `ADMIN_PASSWORD`, y creá desde **Usuarios** a los otros dos usuarios.

## Si algo no funciona

- **El deploy de Railway falla al arrancar:** mirá los logs del deploy. Si dice `Falta la variable de entorno …` o algo sobre `ADMIN_PASSWORD`, falta esa variable o es demasiado corta.
- **La web dice "No se pudo conectar con el servidor":** revisá que `NEXT_PUBLIC_API_URL` termine en `/api` y que `CORS_ORIGIN` sea exactamente la dirección de la web. Si cambiás `NEXT_PUBLIC_API_URL`, tenés que hacer **Redeploy** en Vercel, porque se fija al compilar.
- **Las previews de Vercel** (las direcciones que se generan para cada PR) no van a poder entrar, porque no están en `CORS_ORIGIN`. Para probar, usá la dirección principal.

## Backups

Los backups diarios quedan en `/data/backups`, dentro del mismo volumen que la base. Para una prueba alcanza, pero no protege si se pierde el volumen entero. Antes de usarlo en serio conviene copiar esos archivos a otro lugar.
