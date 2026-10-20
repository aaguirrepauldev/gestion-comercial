import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import cors from 'cors';
import { CORS_ORIGIN, TRUST_PROXY, WEB_DIR } from './config.js';
import './db.js';
import { requireAdmin, requireAuth, requireModule } from './auth.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import cashRoutes from './routes/cash.js';
import dashboardRoutes from './routes/dashboard.js';
import backupRoutes from './routes/backup.js';

// La app Express sin arrancar el servidor, para poder usarla también en los tests.
const app = express();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');
if (CORS_ORIGIN.length > 0) app.use(cors({ origin: CORS_ORIGIN.includes('*') ? true : CORS_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, requireAdmin, userRoutes);
app.use('/api/backup', requireAuth, requireAdmin, backupRoutes);

// Todo lo que es propio de un negocio cuelga de /api/modules/:module (libreria | avicola)
const moduleRouter = Router({ mergeParams: true });
moduleRouter.use(requireAuth, requireModule);
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
