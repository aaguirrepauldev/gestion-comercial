import { fileURLToPath } from 'node:url';

export const PORT = Number(process.env.PORT ?? 4000);
export const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL('../data/app.db', import.meta.url));
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-cambiar-en-produccion';
export const JWT_EXPIRES_IN = '12h';
export const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',') ?? true;

// Zona horaria del negocio: define qué es "hoy" y la hora que se guarda en cada registro.
export const TIME_ZONE = process.env.TIME_ZONE ?? 'America/Argentina/Buenos_Aires';

export const MODULES = ['libreria', 'avicola'];
export const ROLES = ['admin', 'vendedor'];
export const PAYMENT_METHODS = ['efectivo', 'debito', 'credito', 'transferencia'];
