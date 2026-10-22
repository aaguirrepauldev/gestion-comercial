# Deploy en la nube

La API y la web corren juntas en **un solo servicio**: al compilar se genera la web como sitio estático (`frontend/out`) y la API la sirve en la misma dirección. No hace falta Vercel ni configurar CORS. La base SQLite y sus backups viven en un **disco persistente** (volumen), que es lo único que no se borra en cada deploy.

Hay configuración lista para tres lugares:

- **Render**, con [`render.yaml`](../render.yaml). Pago (unos USD 7,25 por mes), sin mantenimiento.
- **Google Cloud**, en una VM gratis, con los scripts de [`deploy/gce`](../deploy/gce). Gratis, pero la máquina la administrás vos.
- **Railway**, con [`railway.json`](../railway.json).

Render y Railway toman el código de este repositorio de GitHub y vuelven a desplegar solos cada vez que se mergea algo en `main`. En Google Cloud se actualiza a mano con un comando.

## Render

**Costo.** Hace falta el plan **Starter** (USD 7 por mes) más el disco (USD 0,25 por GB por mes; con 1 GB alcanza). El plan **Free** no sirve: no admite discos, así que cada deploy o reinicio borraría todas las ventas, y además el servicio se duerme cuando no se usa. Con disco, cada deploy corta el servicio unos segundos (Render no puede tener dos copias usando el mismo disco).

### 1. Crear el servicio desde el blueprint

1. Creá una cuenta en [render.com](https://render.com) entrando con tu cuenta de GitHub.
2. **New → Blueprint** y elegí el repo `gestion-comercial`. Si no aparece, dale acceso a Render al repo desde **Configure account**.
3. Render lee el `render.yaml` y muestra lo que va a crear: el servicio `gestion-comercial` (plan Starter) con el disco `datos` en `/var/data`.
4. Te pide un valor para `ADMIN_PASSWORD`: escribí la contraseña que vas a usar para entrar como admin (mínimo 8 caracteres). Solo se usa la primera vez, con la base vacía, para crear el usuario `admin`.
5. Tocá **Deploy Blueprint** (o **Apply**) y cargá la tarjeta si te la pide.

El resto de las variables ya viene en el blueprint: `NODE_ENV=production`, `VOLUME_PATH=/var/data` (le dice a la API dónde está el disco) y `JWT_SECRET`, que Render genera solo. `PORT` lo pone Render.

### 2. Dirección y primer ingreso

1. Esperá a que el deploy termine en verde (el primero tarda unos minutos). La dirección aparece arriba en el servicio, algo como `https://gestion-comercial.onrender.com` (si el nombre está tomado, Render le agrega letras).
2. `https://<tu-dirección>/api/health` tiene que mostrar `{"ok":true}`.
3. Abrí `https://<tu-dirección>`, entrá con `admin` y la contraseña de `ADMIN_PASSWORD`, y creá desde **Usuarios** a los demás.

### Si algo no funciona

Mirá **Logs** en el servicio de Render. Los errores de arranque dicen qué falta:

- `En Render hay que definir NODE_ENV=production`: falta esa variable en **Environment**.
- `Falta un volumen en Render`: falta `VOLUME_PATH=/var/data` en **Environment**.
- `El disco /var/data no está montado`: el servicio no tiene disco (por ejemplo, porque está en el plan Free). Agregalo en **Disks** con mount path `/var/data`.
- `Falta la variable de entorno JWT_SECRET` o algo sobre `ADMIN_PASSWORD`: falta la variable o es demasiado corta.

## Google Cloud (VM gratis)

Google Cloud regala para siempre una VM **e2-micro** (2 vCPU compartidas, 1 GB de RAM) con un disco de 30 GB, que alcanza para este negocio. La base queda en el disco de la VM, que no se borra al actualizar. Un script instala todo: Node, la app como servicio (arranca sola si la VM se reinicia) y **Caddy**, que saca el certificado HTTPS solo.

**Para que sea gratis**, todo esto tiene que cumplirse:

- Región **us-east1**, **us-central1** o **us-west1** (us-east1 es la más cercana a Argentina).
- Tipo de máquina **e2-micro**, y una sola VM.
- Disco **Standard persistent disk** de hasta 30 GB. El que viene por defecto (Balanced) **se cobra**.
- Hasta 1 GB por mes de datos que salen de la VM hacia los usuarios. Con pocos usuarios sobra, porque la web pesa poco y el navegador la guarda; descargar copias de la base también cuenta.

Hace falta una **cuenta de facturación con tarjeta** aunque no se cobre nada. Conviene crear un **presupuesto con alertas** (Facturación → Presupuestos y alertas, por ejemplo de USD 1) y mirar la facturación a los dos o tres días para confirmar que está en cero.

### 1. Crear la VM

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com), creá un proyecto y activá la facturación cuando te lo pida.
2. **Compute Engine → Instancias de VM → Crear instancia** (la primera vez te pide habilitar la API de Compute Engine).
3. Completá:
   - **Región**: `us-east1`.
   - **Tipo de máquina**: `e2-micro`.
   - **Disco de arranque → Cambiar**: **Ubuntu 24.04 LTS** (x86/64), tipo **Disco persistente estándar**, **30 GB**.
   - **Firewall**: tildá **Permitir tráfico HTTP** y **Permitir tráfico HTTPS**.
4. **Crear**. Cuando termine, anotá la **IP externa** (por ejemplo `34.123.45.67`).
5. Para que la IP no cambie si la VM se reinicia: **Red de VPC → Direcciones IP**, buscá la IP de la VM y tocá **Promover a dirección IP estática**.

### 2. Instalar la app

1. En la lista de VMs, tocá **SSH** al lado de la tuya. Se abre una terminal en el navegador.
2. Pegá esto, cambiando la IP por la tuya con guiones en vez de puntos:

   ```
   curl -fsSLO https://raw.githubusercontent.com/aaguirrepauldev/gestion-comercial/main/deploy/gce/instalar.sh
   sudo bash instalar.sh 34-123-45-67.sslip.io
   ```

   `34-123-45-67.sslip.io` es una dirección gratis que apunta a tu IP, para tener HTTPS sin comprar un dominio. Si tenés un dominio propio, apuntalo a la IP y usalo en su lugar.
3. Te pide la contraseña del admin (mínimo 8 caracteres) y después compila; en la e2-micro tarda varios minutos. Al final dice **Listo**.
4. Abrí `https://34-123-45-67.sslip.io`, entrá con `admin` y esa contraseña, y creá desde **Usuarios** a los demás.

Las variables quedan en `/etc/gestion-comercial.env` (ahí se generó `JWT_SECRET`) y la base en `/var/lib/gestion-comercial/app.db`, con los backups diarios en `/var/lib/gestion-comercial/backups`.

### Actualizar

Cada vez que se mergea algo en `main`, entrá por **SSH** y corré:

```
sudo bash /opt/gestion-comercial/deploy/gce/actualizar.sh
```

### Si algo no funciona

- Logs de la app: `sudo journalctl -u gestion-comercial -n 50`.
- Logs del HTTPS: `sudo journalctl -u caddy -n 50`. Si no saca el certificado, revisá que estén tildados HTTP y HTTPS en el firewall de la VM.
- Si el build se corta por memoria, volvé a correr el mismo comando: el script deja 2 GB de swap para eso.

## Railway

**Costo.** El trial de Railway trae un crédito único de USD 5 y un volumen de hasta 0,5 GB, que alcanza de sobra para probar. Si se termina el trial sin pasar a un plan pago, Railway borra el volumen 30 días después.

### 1. Crear el servicio

1. Creá una cuenta en [railway.com](https://railway.com) entrando con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** y elegí `gestion-comercial`. Si no aparece, dale acceso a Railway al repo desde el botón que te ofrece.
3. En **Settings** del servicio dejá el **Root Directory** vacío (la raíz del repo). Railway encuentra solo el `railway.json`.

### 2. Volumen

Clic derecho sobre el servicio en el canvas → **Attach volume**, con **Mount path** `/data`.

Con el volumen montado, la base va a `/data/app.db` y los backups a `/data/backups` sin configurar nada más. **Sin volumen la API no arranca**, a propósito: si arrancara, cada deploy borraría todas las ventas.

### 3. Variables

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

### 4. Dirección y primer ingreso

1. En **Settings → Networking**, tocá **Generate Domain**. Te queda una dirección como `https://gestion-comercial-production.up.railway.app`.
2. Esperá a que el deploy termine en verde. `https://<tu-dominio>/api/health` tiene que mostrar `{"ok":true}`.
3. Abrí `https://<tu-dominio>`, entrá con `admin` y la contraseña de `ADMIN_PASSWORD`, y creá desde **Usuarios** a los demás.

### Si algo no funciona

Mirá los logs del deploy en Railway. Los errores de arranque dicen qué falta:

- `En Railway hay que definir NODE_ENV=production`: falta esa variable.
- `Falta un volumen en Railway`: falta el paso 2.
- `Falta la variable de entorno JWT_SECRET` o algo sobre `ADMIN_PASSWORD`: falta la variable o es demasiado corta.

## Backups

La API guarda una copia diaria en la carpeta `backups`, junto a la base (conserva las últimas 14), pero está **en el mismo disco que la base**: si se pierde el disco, se pierden las dos. Por eso, en **Usuarios** el admin tiene el botón **Descargar copia de la base**, que baja una copia en el momento. Conviene hacerlo al menos una vez por semana y guardarla en otro lado (Drive, un pendrive).

Para restaurar una copia hay que reemplazar `app.db` con el servicio detenido (y borrar `app.db-wal` y `app.db-shm` si existen). La base está en `/var/data` en Render, en `/var/lib/gestion-comercial` en Google Cloud (entrando por **SSH** y frenando antes con `sudo systemctl stop gestion-comercial`) y en `/data` en Railway. Así también se pasan los datos de una plataforma a otra.

## Otra opción: web aparte

Si algún día preferís la web en otro lado (por ejemplo Vercel), compilala con `NEXT_PUBLIC_API_URL=https://<tu-api>/api` y agregá esa dirección de la web en `CORS_ORIGIN` de la API.
