import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// En Railway, sin NODE_ENV=production la API arrancaría con los usuarios de ejemplo (admin123…),
// una clave JWT conocida y CORS abierto. Se niega a arrancar para que eso no llegue a la nube.
const ON_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_PROJECT_ID);
if (ON_RAILWAY && !IS_PRODUCTION) {
  throw new Error('En Railway hay que definir NODE_ENV=production (si no, se crearían los usuarios de ejemplo).');
}

export const PORT = Number(process.env.PORT ?? 4000);

// Railway borra el disco del contenedor en cada deploy: la base tiene que vivir en un volumen.
// Con un volumen montado, la base va ahí por defecto (RAILWAY_VOLUME_MOUNT_PATH lo define Railway).
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
if (ON_RAILWAY && !VOLUME) {
  throw new Error('Falta un volumen en Railway: sin él la base se borra en cada deploy (ver docs/deploy.md).');
}
export const DB_PATH =
  process.env.DB_PATH ??
  (VOLUME ? path.join(VOLUME, 'app.db') : fileURLToPath(new URL('../data/app.db', import.meta.url)));
if (VOLUME && !path.resolve(DB_PATH).startsWith(path.resolve(VOLUME) + path.sep)) {
  throw new Error(`DB_PATH (${DB_PATH}) tiene que estar dentro del volumen ${VOLUME}.`);
}
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

// Orígenes web habilitados además del propio, separados por coma (p. ej. https://gestion.midominio.com).
// Cuando la API sirve la web (un solo servicio) no hace falta: el navegador no aplica CORS al mismo origen.
// La app móvil tampoco pasa por CORS. En desarrollo se acepta cualquier origen.
export const CORS_ORIGIN = (process.env.CORS_ORIGIN?.trim() || (IS_PRODUCTION ? '' : '*'))
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Web compilada (next build con output: 'export'). Si la carpeta existe, la API la sirve en la raíz.
export const WEB_DIR = process.env.WEB_DIR ?? fileURLToPath(new URL('../../frontend/out', import.meta.url));

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

// Largo mínimo de las contraseñas de usuario.
export const MIN_PASSWORD_LENGTH = 8;

export const MODULES = ['libreria', 'avicola'];
export const ROLES = ['admin', 'vendedor'];
export const PAYMENT_METHODS = ['efectivo', 'debito', 'credito', 'transferencia'];
