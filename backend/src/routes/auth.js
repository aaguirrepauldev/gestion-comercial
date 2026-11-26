import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { loadSessionUser, requireAuth, signToken } from '../auth.js';
import { SIGNUP_ENABLED, TRIAL_DAYS } from '../config.js';
import { HttpError } from '../util.js';
import { createNegocio } from '../negocios.js';
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure, resendLimiter, signupLimiter } from '../loginLimiter.js';
import { cleanEmail, confirmToken, discardAccount, purgeUnverified, sendVerification } from '../verificacion.js';

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
  if (!row.email_verificado) {
    throw new HttpError(403, `Falta confirmar tu email: te mandamos un link a ${row.email}. Si no te llegó, pedí que te lo reenviemos.`);
  }

  res.json({ token: signToken(row), user: loadSessionUser(row) });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// Para que la web sepa si mostrar "Crear cuenta" y cuántos días de prueba ofrecer.
router.get('/registro', (_req, res) => res.json({ habilitado: SIGNUP_ENABLED, dias_prueba: TRIAL_DAYS }));

const requestOrigin = (req) => `${req.protocol}://${req.get('host')}`;

// Alta pública de un negocio nuevo con prueba gratis. La cuenta queda inactiva hasta que el admin
// confirma su email con el link que le mandamos.
router.post('/registro', async (req, res) => {
  if (!SIGNUP_ENABLED) throw new HttpError(403, 'El registro de negocios nuevos no está habilitado');
  signupLimiter.check(req.ip);
  const { negocio, modules, contacto, name, username, password } = req.body ?? {};
  const email = cleanEmail(req.body?.email);
  purgeUnverified();
  const existing = db.prepare('SELECT email_verificado FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new HttpError(
      409,
      existing.email_verificado
        ? 'Ya hay una cuenta con ese email. Ingresá con tu usuario y contraseña.'
        : 'Ya hay una cuenta con ese email esperando confirmación. Revisá tu correo o pedí que te reenviemos el link.'
    );
  }
  const { userId } = createNegocio({
    nombre: negocio,
    modules,
    contacto: String(contacto ?? '').trim() || email,
    admin: { name, username, password, email },
    emailVerificado: false,
  });
  signupLimiter.record(req.ip);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  try {
    await sendVerification(user, requestOrigin(req));
  } catch (err) {
    // Sin email no hay forma de activarla: se descarta para que pueda registrarse de nuevo.
    discardAccount(user);
    throw err;
  }
  res.status(201).json({ verificacion_pendiente: true, email });
});

// Link del email: activa la cuenta y deja la sesión iniciada.
router.post('/verificar-email', (req, res) => {
  const row = confirmToken(req.body?.token);
  res.json({ token: signToken(row), user: loadSessionUser(row) });
});

// Manda un link nuevo. Responde lo mismo exista o no la cuenta, para no revelar qué emails están registrados.
router.post('/reenviar-verificacion', async (req, res) => {
  resendLimiter.check(req.ip);
  const email = cleanEmail(req.body?.email);
  resendLimiter.record(req.ip);
  purgeUnverified();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND email_verificado = 0').get(email);
  if (user) await sendVerification(user, requestOrigin(req));
  res.json({ ok: true });
});

export default router;
