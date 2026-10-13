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
npm run dev       # API en http://localhost:4000/api · Web en http://localhost:3000
```

La primera vez se crea `backend/data/app.db` con datos de ejemplo. Para volver a empezar: `npm run seed:reset`.

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
