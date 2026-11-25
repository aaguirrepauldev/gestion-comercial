import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { ROLES } from '../config.js';
import { signToken, toPublicUser } from '../auth.js';
import { HttpError } from '../util.js';
import { checkPassword, cleanUsername } from '../negocios.js';

// Usuarios del negocio del admin que hace el pedido (nunca de otro).
const router = Router();

// Un vendedor solo puede tener rubros que el negocio tenga habilitados.
function parseUserModules(req, modules) {
  if (!Array.isArray(modules)) return '';
  return modules.filter((m) => req.user.negocio.modules.includes(m)).join(',');
}

const getUser = (req, id) => db.prepare('SELECT * FROM users WHERE id = ? AND negocio_id = ?').get(id, req.negocioId);

router.get('/', (req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM users WHERE negocio_id = ? ORDER BY name')
      .all(req.negocioId)
      .map((row) => toPublicUser(row, req.user.negocio))
  );
});

router.post('/', (req, res) => {
  const { username, password, name, role, modules } = req.body ?? {};
  const clean = cleanUsername(username);
  if (!String(name ?? '').trim()) throw new HttpError(400, 'Usuario y nombre son obligatorios');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido');
  checkPassword(password);
  const mods = parseUserModules(req, modules);
  if (role !== 'admin' && !mods) throw new HttpError(400, 'Asigná al menos un módulo');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(clean)) {
    // Los nombres de usuario son únicos en toda la plataforma (el login no pide el negocio).
    throw new HttpError(409, `El usuario "${clean}" ya existe. Probá con otro, por ejemplo agregándole el nombre del negocio.`);
  }

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO users (negocio_id, username, password_hash, name, role, modules, created_at) VALUES (?, ?, ?, ?, ?, ?, now_local())'
    )
    .run(req.negocioId, clean, bcrypt.hashSync(String(password), 10), String(name).trim(), role, mods);
  res.status(201).json(toPublicUser(getUser(req, lastInsertRowid), req.user.negocio));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = getUser(req, id);
  if (!current) throw new HttpError(404, 'Usuario no encontrado');

  const body = req.body ?? {};
  const name = body.name !== undefined ? String(body.name).trim() : current.name;
  const role = body.role ?? current.role;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : current.active;
  const modules = body.modules !== undefined ? parseUserModules(req, body.modules) : current.modules;

  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido');
  if (role !== 'admin' && !modules) throw new HttpError(400, 'Asigná al menos un módulo');
  if (id === req.user.id && (!active || role !== 'admin')) {
    throw new HttpError(400, 'No podés desactivarte ni quitarte el rol de administrador');
  }

  if (body.password) checkPassword(body.password);

  db.prepare('UPDATE users SET name = ?, role = ?, modules = ?, active = ? WHERE id = ?').run(
    name, role, modules, active, id
  );
  if (body.password) {
    // Cierra las sesiones abiertas de ese usuario con la contraseña anterior.
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(
      bcrypt.hashSync(String(body.password), 10), id
    );
  }
  const row = getUser(req, id);
  // Si el admin cambió su propia contraseña, recibe un token nuevo para no quedar afuera.
  const token = body.password && id === req.user.id ? signToken(row) : undefined;
  res.json({ ...toPublicUser(row, req.user.negocio), token });
});

export default router;
