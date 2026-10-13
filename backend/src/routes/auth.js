import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config.js';
import { requireAuth, toPublicUser } from '../auth.js';
import { HttpError } from '../util.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim());
  if (!row || !bcrypt.compareSync(String(password ?? ''), row.password_hash)) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  if (!row.active) throw new HttpError(403, 'Usuario desactivado');

  const token = jwt.sign({ sub: row.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: toPublicUser(row) });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

export default router;
