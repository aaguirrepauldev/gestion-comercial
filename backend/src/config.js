import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const PORT = Number(process.env.PORT ?? 4000);
export const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL('../data/app.db', import.meta.url));
// Backups automáticos: copia de la base cada BACKUP_INTERVAL_HOURS (0 los desactiva), guardando las últimas BACKUP_KEEP.
export const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(path.dirname(DB_PATH), 'backups');
export const BACKUP_INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);
export const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 14);

// En producción la API no arranca sin estas variables (ver backend/.env.example).
function required(name, devDefault) {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (IS_PRODUCTION) throw new Error(`Falta la variable de entorno ${name} (obligatoria en producción).`);
  return devDefault;
}

export const JWT_SECRET = required('JWT_SECRET', 'dev-secret-solo-para-desarrollo');
if (IS_PRODUCTION && JWT_SECRET.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
export const JWT_EXPIRES_IN = '12h';

// Orígenes web habilitados, separados por coma (p. ej. https://gestion.midominio.com).
// La app móvil no pasa por CORS, así que no hace falta agregarla.
export const CORS_ORIGIN = required('CORS_ORIGIN', '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Detrás de un proxy o balanceador (lo habitual en la nube) hace falta para ver la IP real del cliente.
// Valores: cantidad de proxies (1), true/false, o IPs/subredes separadas por coma.
function parseTrustProxy(value) {
  if (value === undefined) return IS_PRODUCTION ? 1 : false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true' || value === 'false') return value === 'true';
  return value;
}
export const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY);

// Límite de intentos fallidos de login por IP.
export const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 10);
export const LOGIN_WINDOW_MINUTES = Number(process.env.LOGIN_WINDOW_MINUTES ?? 15);

// Contraseña del admin inicial cuando la base se crea vacía en producción.
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Zona horaria del negocio: define qué es "hoy" y la hora que se guarda en cada registro.
export const TIME_ZONE = process.env.TIME_ZONE ?? 'America/Argentina/Buenos_Aires';

export const MODULES = ['libreria', 'avicola'];
export const ROLES = ['admin', 'vendedor'];
export const PAYMENT_METHODS = ['efectivo', 'debito', 'credito', 'transferencia'];
