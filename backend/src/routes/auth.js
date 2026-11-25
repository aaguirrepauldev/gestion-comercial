import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { loadSessionUser, requireAuth, signToken } from '../auth.js';
import { SIGNUP_ENABLED, TRIAL_DAYS } from '../config.js';
import { HttpError } from '../util.js';
import { createNegocio } from '../negocios.js';
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
