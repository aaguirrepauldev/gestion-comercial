import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import cors from 'cors';
import { CORS_ORIGIN, TRUST_PROXY, WEB_DIR } from './config.js';
import './db.js';
import { requireAdmin, requireAuth, requireModule, requireNegocio, requireSuperadmin, requireWritable } from './auth.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import cashRoutes from './routes/cash.js';
import dashboardRoutes from './routes/dashboard.js';
import backupRoutes from './routes/backup.js';
import suscripcionRoutes from './routes/suscripcion.js';
import plataformaRoutes from './routes/plataforma.js';

// La app Express sin arrancar el servidor, para poder usarla también en los tests.
const app = express();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');
if (CORS_ORIGIN.length > 0) app.use(cors({ origin: CORS_ORIGIN.includes('*') ? true : CORS_ORIGIN }));
// Holgado para que entre la importación de un catálogo completo.
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
// Cada negocio (cliente) solo ve sus datos: requireAuth deja en req.negocioId el negocio del usuario y
// todas las consultas filtran por él. Con la suscripción vencida, requireWritable deja solo lectura.
const tenant = [requireAuth, requireNegocio, requireWritable];
app.use('/api/users', ...tenant, requireAdmin, userRoutes);
app.use('/api/suscripcion', requireAuth, requireNegocio, suscripcionRoutes);

// Panel del dueño de la plataforma. La copia completa de la base tiene los datos de todos los negocios,
// así que solo la descarga el superadmin.
app.use('/api/plataforma', requireAuth, requireSuperadmin, plataformaRoutes);
app.use('/api/backup', requireAuth, requireSuperadmin, backupRoutes);

// Todo lo que es propio de un rubro del negocio cuelga de /api/modules/:module (libreria, avicola, almacen… ver MODULES en config.js)
const moduleRouter = Router({ mergeParams: true });
moduleRouter.use(...tenant, requireModule);
moduleRouter.use('/dashboard', dashboardRoutes);
moduleRouter.use('/products', productRoutes);
moduleRouter.use('/sales', salesRoutes);
moduleRouter.use('/cash', cashRoutes);
app.use('/api/modules/:module', moduleRouter);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

// La web compilada (frontend/out), si existe: así API y web corren como un solo servicio.
if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));
  app.use((_req, res) => res.status(404).sendFile(path.join(WEB_DIR, '404.html')));
}
app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (/UNIQUE constraint failed/.test(err.message)) {
    return res.status(409).json({ error: 'Ya existe un registro con ese código o nombre de usuario' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
