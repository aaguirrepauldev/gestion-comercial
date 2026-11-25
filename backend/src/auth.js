import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { JWT_EXPIRES_IN, JWT_SECRET, MODULES } from './config.js';
import { HttpError } from './util.js';
import { getNegocio, negocioStatus } from './negocios.js';

// `negocio` es el estado de la suscripción (negocioStatus) o null para el superadmin.
export function toPublicUser(row, negocio = null) {
  const negocioModules = negocio ? negocio.modules : MODULES;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    superadmin: Boolean(row.superadmin),
    // Un admin ve todos los rubros de su negocio; un vendedor, los que tenga asignados dentro de esos.
    modules: row.superadmin
      ? []
      : row.role === 'admin'
        ? [...negocioModules]
        : row.modules.split(',').filter((m) => negocioModules.includes(m)),
    active: Boolean(row.active),
    created_at: row.created_at,
    negocio,
  };
}

// Usuario + estado de su negocio, o error si el negocio está suspendido.
export function loadSessionUser(row) {
  if (row.superadmin) return toPublicUser(row);
  const negocio = negocioStatus(getNegocio(row.negocio_id));
  if (negocio.bloqueado) {
    throw new HttpError(403, 'La cuenta de este negocio está suspendida. Comunicate con nosotros para reactivarla.');
  }
  return toPublicUser(row, negocio);
}

// El negocio NO viaja como dato de confianza en el token: se relee de la base en cada pedido,
// así un cambio de negocio, de estado o de suscripción se aplica enseguida.
export const signToken = (row) =>
  jwt.sign({ sub: row.id, ver: row.token_version, neg: row.negocio_id ?? null }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'No autenticado');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Sesión expirada o inválida');
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.sub);
  if (!row) throw new HttpError(401, 'Usuario inexistente o inactivo');
  // Tokens emitidos antes del último cambio de contraseña (los viejos no traen `ver`).
  if ((payload.ver ?? 0) !== row.token_version) throw new HttpError(401, 'Sesión expirada o inválida');
  req.user = loadSessionUser(row);
  // Todas las consultas de datos de un negocio filtran por este id.
  req.negocioId = row.negocio_id ?? null;
  next();
}

// Rutas con datos de un negocio: el superadmin no tiene negocio propio y no entra.
export function requireNegocio(req, _res, next) {
  if (!req.negocioId) throw new HttpError(403, 'Esta cuenta no pertenece a ningún negocio');
  next();
}

// Con la suscripción vencida se puede consultar todo, pero no modificar nada.
export function requireWritable(req, _res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.user.negocio?.solo_lectura) {
    throw new HttpError(
      402,
      `La suscripción venció el ${formatDay(req.user.negocio.vence_el)}. Podés consultar tus datos, pero para cargar ventas o cambios hay que renovarla (ver "Mi suscripción").`
    );
  }
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Requiere rol administrador');
  next();
}

export function requireSuperadmin(req, _res, next) {
  if (!req.user?.superadmin) throw new HttpError(403, 'Solo para el administrador de la plataforma');
  next();
}

export function requireModule(req, _res, next) {
  const { module } = req.params;
  if (!MODULES.includes(module)) throw new HttpError(404, 'Módulo inexistente');
  if (!req.user.modules.includes(module)) throw new HttpError(403, 'Sin acceso a este módulo');
  next();
}

const formatDay = (day) => day.split('-').reverse().join('/');
