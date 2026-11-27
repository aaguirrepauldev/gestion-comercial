import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { loadSessionUser, requireAuth, signToken } from '../auth.js';
import { SIGNUP_ENABLED, TRIAL_DAYS } from '../config.js';
import { HttpError } from '../util.js';
import { checkPassword, checkSlug, createNegocio, suggestSlug } from '../negocios.js';
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure, signupLimiter } from '../loginLimiter.js';

const router = Router();

const findNegocioBySlug = (slug) => db.prepare('SELECT * FROM negocios WHERE slug = ?').get(String(slug ?? '').trim().toLowerCase());

// Qué usuario quiere entrar. Los usuarios son únicos dentro de cada negocio, así que hace falta el código
// del negocio (viene del link tuapp.com/<código> o lo escribe la persona). Sin código:
//   - el superadmin de la plataforma entra como siempre;
//   - si el usuario existe en un solo negocio, también entra (así los usuarios de antes del cambio no
//     quedan afuera); la respuesta trae el código para que el navegador lo recuerde.
function findLoginUser(negocioSlug, username) {
  if (String(negocioSlug ?? '').trim()) {
    const negocio = findNegocioBySlug(negocioSlug);
    if (!negocio) throw new HttpError(404, 'No encontramos un negocio con ese código. Revisá el link que te pasaron.');
    return db.prepare('SELECT * FROM users WHERE negocio_id = ? AND username = ?').get(negocio.id, username);
  }
  const superadmin = db.prepare('SELECT * FROM users WHERE negocio_id IS NULL AND username = ?').get(username);
  if (superadmin) return superadmin;
  const matches = db.prepare('SELECT * FROM users WHERE negocio_id IS NOT NULL AND username = ? LIMIT 2').all(username);
  if (matches.length > 1) throw new HttpError(400, 'Escribí el código de tu negocio para entrar (está en el link que te pasaron).');
  return matches[0];
}

// Para mostrar el nombre del negocio en su pantalla de entrada.
router.get('/negocio/:slug', (req, res) => {
  const negocio = findNegocioBySlug(req.params.slug);
  if (!negocio) throw new HttpError(404, 'No encontramos un negocio con ese código');
  res.json({ nombre: negocio.nombre, slug: negocio.slug });
});

router.post('/login', (req, res) => {
  checkLoginAllowed(req.ip);
  const { negocio, username, password } = req.body ?? {};
  const row = findLoginUser(negocio, String(username ?? '').trim().toLowerCase());
  if (!row || !bcrypt.compareSync(String(password ?? ''), row.password_hash)) {
    recordLoginFailure(req.ip);
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  clearLoginFailures(req.ip);
  if (!row.active) throw new HttpError(403, 'Usuario desactivado');
  db.prepare('UPDATE users SET last_login_at = now_local() WHERE id = ?').run(row.id);

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

// Mientras se completa el registro: si la dirección elegida está libre o, si no, cuál sugerir.
// Con solo `nombre` devuelve la primera dirección libre a partir de él.
router.get('/registro/direccion', (req, res) => {
  const { nombre, slug } = req.query;
  if (!slug) return res.json({ slug: suggestSlug(String(nombre ?? '')), disponible: true });
  try {
    res.json({ slug: checkSlug(slug), disponible: true });
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    res.json({ slug: String(slug), disponible: false, error: err.message, sugerencia: err.sugerencia ?? null });
  }
});

// Alta pública de un negocio nuevo con prueba gratis. Devuelve la sesión del admin ya iniciada.
router.post('/registro', (req, res) => {
  if (!SIGNUP_ENABLED) throw new HttpError(403, 'El registro de negocios nuevos no está habilitado');
  signupLimiter.check(req.ip);
  const { negocio, slug, modules, contacto, name, username, password } = req.body ?? {};
  // El código lo elige quien se registra (la web le propone uno a partir del nombre); sin él se usa el primero libre.
  const { userId } = createNegocio({ nombre: negocio, slug, modules, contacto, admin: { name, username, password } });
  signupLimiter.record(req.ip);
  db.prepare('UPDATE users SET last_login_at = now_local() WHERE id = ?').run(userId);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.status(201).json({ token: signToken(row), user: loadSessionUser(row) });
});

export default router;
