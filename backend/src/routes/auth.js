import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, signToken, toPublicUser } from '../auth.js';
import { HttpError } from '../util.js';
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure } from '../loginLimiter.js';

const router = Router();

router.post('/login', (req, res) => {
  checkLoginAllowed(req.ip);
  const { username, password } = req.body ?? {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim());
  if (!row || !bcrypt.compareSync(String(password ?? ''), row.password_hash)) {
    recordLoginFailure(req.ip);
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  clearLoginFailures(req.ip);
  if (!row.active) throw new HttpError(403, 'Usuario desactivado');

  res.json({ token: signToken(row), user: toPublicUser(row) });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

export default router;
