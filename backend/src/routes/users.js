import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { MODULES, ROLES } from '../config.js';
import { toPublicUser } from '../auth.js';
import { HttpError } from '../util.js';

const router = Router();

function parseModules(modules) {
  if (!Array.isArray(modules)) return '';
  return modules.filter((m) => MODULES.includes(m)).join(',');
}

function checkPassword(password) {
  if (String(password).length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
}

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY name').all().map(toPublicUser));
});

router.post('/', (req, res) => {
  const { username, password, name, role, modules } = req.body ?? {};
  const cleanUsername = String(username ?? '').trim().toLowerCase();
  if (!cleanUsername || !String(name ?? '').trim()) throw new HttpError(400, 'Usuario y nombre son obligatorios');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido');
  checkPassword(password ?? '');
  const mods = parseModules(modules);
  if (role !== 'admin' && !mods) throw new HttpError(400, 'Asigná al menos un módulo');

  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (username, password_hash, name, role, modules, created_at) VALUES (?, ?, ?, ?, ?, now_local())')
    .run(cleanUsername, bcrypt.hashSync(String(password), 10), String(name).trim(), role, mods);
  res.status(201).json(toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!current) throw new HttpError(404, 'Usuario no encontrado');

  const body = req.body ?? {};
  const name = body.name !== undefined ? String(body.name).trim() : current.name;
  const role = body.role ?? current.role;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : current.active;
  const modules = body.modules !== undefined ? parseModules(body.modules) : current.modules;

  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido');
  if (role !== 'admin' && !modules) throw new HttpError(400, 'Asigná al menos un módulo');
  if (id === req.user.id && (!active || role !== 'admin')) {
    throw new HttpError(400, 'No podés desactivarte ni quitarte el rol de administrador');
  }

  db.prepare('UPDATE users SET name = ?, role = ?, modules = ?, active = ? WHERE id = ?').run(
    name, role, modules, active, id
  );
  if (body.password) {
    checkPassword(body.password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(body.password), 10), id);
  }
  res.json(toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});

export default router;
