import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { JWT_EXPIRES_IN, JWT_SECRET, MODULES } from './config.js';
import { HttpError } from './util.js';

export function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    modules: row.role === 'admin' ? [...MODULES] : row.modules.split(',').filter(Boolean),
    active: Boolean(row.active),
    created_at: row.created_at,
  };
}

export const signToken = (row) => jwt.sign({ sub: row.id, ver: row.token_version }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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
  req.user = toPublicUser(row);
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Requiere rol administrador');
  next();
}

export function requireModule(req, _res, next) {
  const { module } = req.params;
  if (!MODULES.includes(module)) throw new HttpError(404, 'Módulo inexistente');
  if (!req.user.modules.includes(module)) throw new HttpError(403, 'Sin acceso a este módulo');
  next();
}
