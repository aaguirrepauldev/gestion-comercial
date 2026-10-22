# Deploy en la nube

La API y la web corren juntas en **un solo servicio**: al compilar se genera la web como sitio estático (`frontend/out`) y la API la sirve en la misma dirección. No hace falta Vercel ni configurar CORS. La base SQLite y sus backups viven en un **disco persistente** (volumen), que es lo único que no se borra en cada deploy.

Hay configuración lista para dos plataformas. Las dos toman el código de este repositorio de GitHub y vuelven a desplegar solas cada vez que se mergea algo en `main`:

- **Render**, con [`render.yaml`](../render.yaml). Es la opción recomendada por ahora.
- **Railway**, con [`railway.json`](../railway.json).

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

### Otra opción: web aparte

Si algún día preferís la web en otro lado (por ejemplo Vercel), compilala con `NEXT_PUBLIC_API_URL=https://<tu-api>/api` y agregá esa dirección de la web en `CORS_ORIGIN` de la API.
