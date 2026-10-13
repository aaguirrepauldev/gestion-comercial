# Gestión Comercial — POC

Control de stock, ventas, cierre de caja y usuarios para dos negocios en una misma aplicación:

- **📚 Librería**: productos por unidad.
- **🐔 Avícola**: pollo, cortes y elaborados por **kg** (hasta 3 decimales), y huevos, alimento balanceado, etc. por unidad.

Cada negocio es un **módulo separado**: tiene su propio stock, sus ventas y su caja. Los usuarios pueden tener acceso a uno o a ambos.

## Stack

| Capa     | Tecnología                                                   |
|----------|--------------------------------------------------------------|
| Frontend | Next.js 16 (App Router, SPA con componentes cliente), React 19 |
| Backend  | Node.js 24 + Express 5, API REST con JWT                      |
| Base     | SQLite embebida (`node:sqlite`, sin dependencias nativas)     |

## Cómo correrlo

Requisitos: Node.js 22.13+ (probado con 24).

```bash
npm run setup     # instala dependencias de raíz, backend y frontend
npm run dev       # API en http://localhost:4000/api · Web en http://localhost:2000
```

La primera vez se crea `backend/data/app.db` con datos de ejemplo. Para volver a empezar: `npm run seed:reset`.

### Tests

`npm test --prefix backend` corre los tests del backend (flujo de caja y ventas, anulaciones, stock y permisos) contra una base temporal, sin tocar `backend/data/app.db`. También corren solos en GitHub en cada PR.

### Producción (servidor en la nube)

Para un deploy de prueba en Railway (API) y Vercel (web), seguí la guía [docs/deploy.md](docs/deploy.md).

Copiá `backend/.env.example` como `backend/.env` y completalo; `npm start` lo lee solo. Con `NODE_ENV=production` la API no arranca si falta alguna de estas variables:

- `JWT_SECRET`: clave de al menos 32 caracteres para firmar las sesiones.
- `CORS_ORIGIN`: dirección de la web, separadas por coma si hay varias. La app móvil no pasa por CORS y no hace falta agregarla.
- `ADMIN_PASSWORD`: solo la primera vez, con la base vacía. En producción se crea únicamente el usuario `admin`, sin los usuarios ni productos de ejemplo.

El login se bloquea por 15 minutos después de 10 intentos fallidos desde la misma IP (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`). Si la API está detrás de un proxy, `TRUST_PROXY` (por defecto `1` en producción) hace que se use la IP real del cliente.

### Backups

La API guarda una copia de la base en `backend/data/backups/` al arrancar (si la última tiene más de un día) y después una vez por día, y conserva las últimas 14. Para hacer una copia en el momento: `npm run backup --prefix backend`.

Se configura con variables de entorno: `BACKUP_DIR` (carpeta), `BACKUP_INTERVAL_HOURS` (cada cuántas horas; `0` los desactiva) y `BACKUP_KEEP` (cuántas conservar). Para restaurar, frená la API y reemplazá `backend/data/app.db` por la copia elegida (borrando `app.db-wal` y `app.db-shm`).

En un servidor en la nube conviene que `BACKUP_DIR` apunte a un disco o volumen distinto del de la base, o copiar esa carpeta a otro lugar, para no perder ambos a la vez.

### Cambios en la base (migraciones)

El esquema se arma con migraciones en `backend/src/migrations.js`, que corren solas al arrancar la API y quedan registradas en la base (`PRAGMA user_version`). Antes de aplicar una migración sobre una base con datos se guarda una copia `pre-migracion-…db` en la carpeta de backups. Para cambiar una tabla, agregá una migración nueva al final de la lista; nunca modifiques una que ya se haya aplicado.

### Zona horaria

Las fechas (ventas, cajas, movimientos) se guardan en la hora del negocio, no en la del servidor, así "hoy" es el mismo día aunque la API corra en la nube en UTC. Por defecto es `America/Argentina/Buenos_Aires`; se puede cambiar con la variable de entorno `TIME_ZONE` (por ejemplo `TIME_ZONE=America/Argentina/Cordoba`).

### Usuarios de prueba

| Usuario    | Contraseña    | Rol      | Módulos          |
|------------|---------------|----------|------------------|
| `admin`    | `admin123`    | admin    | Librería + Avícola |
| `libreria` | `libreria123` | vendedor | Librería         |
| `avicola`  | `avicola123`  | vendedor | Avícola          |

## Funcionalidades

- **Ventas (POS)**: búsqueda de productos, ticket con cantidades editables (decimales para kg), 4 medios de pago, valida stock y requiere caja abierta. Listado de ventas del día con detalle. Anulación (solo admin, y solo si la caja sigue abierta) que repone stock.
- **Stock**: alta/edición/desactivación de productos (admin), ingresos de mercadería, egresos por merma/vencimiento, ajuste por recuento (admin), alerta de stock mínimo e historial de movimientos (kardex).
- **Caja**: apertura con monto inicial, ingresos/retiros de efectivo, resumen por medio de pago, cierre con efectivo contado y cálculo de diferencia, historial de cierres con detalle.
- **Usuarios** (admin): alta, edición, roles (`admin` / `vendedor`), módulos habilitados, desactivación y cambio de contraseña.
- **Inicio**: ventas del día, estado de caja, stock bajo, valor del inventario, últimos 7 días y más vendidos.

## Estructura

```
backend/
  src/
    index.js          # app Express y montaje de rutas
    db.js             # esquema SQLite + datos de ejemplo
    auth.js           # JWT, roles y acceso por módulo
    routes/           # auth, users, products, sales, cash, dashboard
frontend/
  app/
    login/            # pantalla de ingreso
    (app)/            # layout autenticado con sidebar
      [module]/       # libreria | avicola → inicio, ventas, stock, caja
      usuarios/
  components/ lib/    # cliente API, auth context, formatos
```

## API

Todas las rutas (salvo login) requieren `Authorization: Bearer <token>`.

```
POST /api/auth/login                     { username, password } → { token, user }
GET  /api/auth/me
GET|POST /api/users        PUT /api/users/:id                       (admin)

/api/modules/:module/...    (:module = libreria | avicola)
  GET  dashboard
  GET  products?q=&low=1&all=1      POST products      PUT products/:id
  POST products/:id/stock           { type: ingreso|egreso|ajuste, qty, note }
  GET  products/movements?product_id=&limit=
  GET  sales?date=YYYY-MM-DD | ?session_id=      GET sales/:id
  POST sales                        { items: [{ product_id, qty }], payment_method }
  POST sales/:id/cancel                                             (admin)
  GET  cash/current   GET cash/history   GET cash/:id
  POST cash/open { opening_amount }   POST cash/movements { type, amount, description }
  POST cash/close { counted_cash, notes }
```

Como el backend es una API REST independiente con JWT, la futura **app móvil** (p. ej. React Native/Expo) puede consumir exactamente los mismos endpoints.

## Próximos pasos sugeridos (fuera del POC)

- Migrar a PostgreSQL (con Prisma o Drizzle) y TypeScript en ambos lados.
- Lector de código de barras y balanza para productos por kg.
- Proveedores, compras y costo promedio; listas de precios y descuentos.
- Facturación electrónica (AFIP/ARCA) e impresión de tickets.
- Reportes por período/vendedor y exportación a Excel.
- Refresh tokens, auditoría y tests automatizados.
- App móvil con Expo reutilizando la API.
