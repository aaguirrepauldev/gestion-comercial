import express, { Router } from 'express';
import cors from 'cors';
import { CORS_ORIGIN, PORT, TRUST_PROXY } from './config.js';
import './db.js';
import { requireAdmin, requireAuth, requireModule } from './auth.js';
import { HttpError } from './util.js';
import { startBackupSchedule } from './backup.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import cashRoutes from './routes/cash.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');
app.use(cors({ origin: CORS_ORIGIN.includes('*') ? true : CORS_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, requireAdmin, userRoutes);

// Todo lo que es propio de un negocio cuelga de /api/modules/:module (libreria | avicola)
const moduleRouter = Router({ mergeParams: true });
moduleRouter.use(requireAuth, requireModule);
moduleRouter.use('/dashboard', dashboardRoutes);
moduleRouter.use('/products', productRoutes);
moduleRouter.use('/sales', salesRoutes);
moduleRouter.use('/cash', cashRoutes);
app.use('/api/modules/:module', moduleRouter);

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

startBackupSchedule();
app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}/api`));
