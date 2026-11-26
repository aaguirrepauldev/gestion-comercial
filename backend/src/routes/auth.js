import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { loadSessionUser, requireAuth, signToken } from '../auth.js';
import { SIGNUP_ENABLED, TRIAL_DAYS } from '../config.js';
import { HttpError } from '../util.js';
import { checkPassword, createNegocio } from '../negocios.js';
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure, signupLimiter } from '../loginLimiter.js';

const router = Router();

router.post('/login', (req, res) => {
  checkLoginAllowed(req.ip);
  const { username, password } = req.body ?? {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim().toLowerCase());
  if (!row || !bcrypt.compareSync(String(password ?? ''), row.password_hash)) {
    recordLoginFailure(req.ip);
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  clearLoginFailures(req.ip);
  if (!row.active) throw new HttpError(403, 'Usuario desactivado');

  res.json({ token: signToken(row), user: loadSessionUser(row) });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// Cambiar la propia contraseña sabiendo la actual. Es el paso obligatorio después de un blanqueo.
router.put('/password', requireAuth, (req, res) => {
  checkLoginAllowed(req.ip);
  const { actual, nueva } = req.body ?? {};
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(actual ?? ''), row.password_hash)) {
    recordLoginFailure(req.ip);
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }
  checkPassword(nueva);
  if (String(nueva) === String(actual)) throw new HttpError(400, 'La contraseña nueva tiene que ser distinta de la actual');
  // Cierra las otras sesiones abiertas y devuelve un token nuevo para esta.
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?'
  ).run(bcrypt.hashSync(String(nueva), 10), row.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
  res.json({ token: signToken(updated), user: loadSessionUser(updated) });
});

// Para que la web sepa si mostrar "Crear cuenta" y cuántos días de prueba ofrecer.
router.get('/registro', (_req, res) => res.json({ habilitado: SIGNUP_ENABLED, dias_prueba: TRIAL_DAYS }));

// Alta pública de un negocio nuevo con prueba gratis. Devuelve la sesión del admin ya iniciada.
router.post('/registro', (req, res) => {
  if (!SIGNUP_ENABLED) throw new HttpError(403, 'El registro de negocios nuevos no está habilitado');
  signupLimiter.check(req.ip);
  const { negocio, modules, contacto, name, username, password } = req.body ?? {};
  const { userId } = createNegocio({ nombre: negocio, modules, contacto, admin: { name, username, password } });
  signupLimiter.record(req.ip);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({ token: signToken(row), user: loadSessionUser(row) });
});

export default router;
