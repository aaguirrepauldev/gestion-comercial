import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, tx } from '../db.js';
import { signToken } from '../auth.js';
import { NEGOCIO_ESTADOS } from '../config.js';
import { HttpError, round2, toNumber } from '../util.js';
import { addMonths, todayLocal } from '../time.js';
import { checkPassword, checkSlug, checkTrialModules, createNegocio, getNegocio, isDay, negocioStatus, parseModules } from '../negocios.js';

// Panel del dueño de la plataforma (solo superadmin): todos los negocios, sus suscripciones y pagos.
const router = Router();

function negocioDetail(row) {
  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE negocio_id = ? AND active = 1) AS usuarios,
         (SELECT COUNT(*) FROM products WHERE negocio_id = ? AND active = 1) AS productos,
         (SELECT MAX(created_at) FROM sales WHERE negocio_id = ?) AS ultima_venta,
         (SELECT username FROM users WHERE negocio_id = ? AND role = 'admin' ORDER BY id LIMIT 1) AS admin_username`
    )
    .get(row.id, row.id, row.id, row.id);
  const ultimoPago = db
    .prepare('SELECT fecha, monto, hasta FROM pagos WHERE negocio_id = ? ORDER BY id DESC LIMIT 1')
    .get(row.id);
  return {
    ...negocioStatus(row),
    contacto: row.contacto,
    notas: row.notas,
    created_at: row.created_at,
    ...stats,
    ultimo_pago: ultimoPago ?? null,
  };
}

function findNegocio(id) {
  const row = getNegocio(Number(id));
  if (!row) throw new HttpError(404, 'Negocio no encontrado');
  return row;
}

router.get('/negocios', (_req, res) => {
  res.json(db.prepare('SELECT * FROM negocios ORDER BY id DESC').all().map(negocioDetail));
});

router.get('/negocios/:id', (req, res) => {
  const row = findNegocio(req.params.id);
  const pagos = db
    .prepare(
      `SELECT p.*, u.name AS registrado_por_name FROM pagos p
       LEFT JOIN users u ON u.id = p.registrado_por WHERE p.negocio_id = ? ORDER BY p.id DESC`
    )
    .all(row.id);
  res.json({ ...negocioDetail(row), pagos });
});

// Alta manual (por ejemplo, un cliente que se sumó por teléfono). Mismo flujo que el registro público.
router.post('/negocios', (req, res) => {
  const { nombre, slug, modules, contacto, admin, vence_el } = req.body ?? {};
  if (vence_el !== undefined && vence_el !== null && !isDay(vence_el)) throw new HttpError(400, 'Fecha de vencimiento inválida');
  const { negocioId } = createNegocio({ nombre, slug, modules, contacto, admin, vence_el });
  res.status(201).json(negocioDetail(getNegocio(negocioId)));
});

// Editar datos y estado: suspender/reactivar, corregir el vencimiento, cambiar rubros o plan.
router.put('/negocios/:id', (req, res) => {
  const row = findNegocio(req.params.id);
  const body = req.body ?? {};
  const nombre = body.nombre !== undefined ? String(body.nombre).trim() : row.nombre;
  if (!nombre) throw new HttpError(400, 'El nombre del negocio es obligatorio');
  const estado = body.estado ?? row.estado;
  if (!NEGOCIO_ESTADOS.includes(estado)) throw new HttpError(400, 'Estado inválido');
  let venceEl = row.vence_el;
  if (body.vence_el !== undefined) {
    if (body.vence_el !== null && body.vence_el !== '' && !isDay(body.vence_el)) throw new HttpError(400, 'Fecha de vencimiento inválida');
    venceEl = body.vence_el || null;
  }
  // El código cambia el link de entrada del negocio: el anterior deja de funcionar.
  const slug = body.slug !== undefined && body.slug !== row.slug ? checkSlug(body.slug, { exceptId: row.id }) : row.slug;
  const modules = body.modules !== undefined ? parseModules(body.modules) : row.modules;
  // Solo se valida si cambian los rubros o el estado, para no trabar la edición de negocios viejos.
  if (body.modules !== undefined || body.estado !== undefined) checkTrialModules(estado, modules);
  const text = (key) => (body[key] !== undefined ? String(body[key] ?? '').trim() || null : row[key]);

  db.prepare(
    'UPDATE negocios SET nombre = ?, slug = ?, estado = ?, vence_el = ?, modules = ?, plan = ?, contacto = ?, notas = ? WHERE id = ?'
  ).run(nombre, slug, estado, venceEl, modules, text('plan') ?? row.plan, text('contacto'), text('notas'), row.id);
  res.json(negocioDetail(getNegocio(row.id)));
});

// Registrar un pago recibido (hoy, por transferencia). Extiende el vencimiento `meses` meses desde el
// vencimiento actual (o desde hoy si ya venció), o hasta la fecha `hasta` si se indica. Pasa el negocio a activo.
// Un webhook de Mercado Pago podría llamar a esta misma lógica con metodo = 'mercadopago' y external_id.
export function registrarPago(negocioId, { monto, meses, hasta, fecha, metodo = 'transferencia', referencia, external_id, userId }) {
  const row = findNegocio(negocioId);
  const today = todayLocal();
  const amount = round2(toNumber(monto ?? 0, 'Monto'));
  if (amount < 0) throw new HttpError(400, 'El monto no puede ser negativo');
  const paidOn = fecha || today;
  if (!isDay(paidOn)) throw new HttpError(400, 'Fecha de pago inválida');

  const desde = row.vence_el && row.vence_el >= today ? row.vence_el : today;
  let nuevoVence;
  if (hasta) {
    if (!isDay(hasta)) throw new HttpError(400, 'Fecha "hasta" inválida');
    nuevoVence = hasta;
  } else {
    const n = toNumber(meses ?? 1, 'Meses');
    if (!Number.isInteger(n) || n < 1 || n > 36) throw new HttpError(400, 'Meses debe ser un número entero entre 1 y 36');
    nuevoVence = addMonths(desde, n);
  }
  if (nuevoVence < today) throw new HttpError(400, 'El nuevo vencimiento no puede ser anterior a hoy');

  return tx(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO pagos (negocio_id, monto, metodo, referencia, external_id, fecha, desde, hasta, registrado_por, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now_local())`
      )
      .run(row.id, amount, metodo, String(referencia ?? '').trim() || null, external_id ?? null, paidOn, row.vence_el, nuevoVence, userId ?? null);
    db.prepare("UPDATE negocios SET estado = 'activo', vence_el = ? WHERE id = ?").run(nuevoVence, row.id);
    return Number(lastInsertRowid);
  });
}

router.post('/negocios/:id/pagos', (req, res) => {
  const body = req.body ?? {};
  registrarPago(req.params.id, { ...body, metodo: 'transferencia', external_id: null, userId: req.user.id });
  const row = findNegocio(req.params.id);
  res.status(201).json(negocioDetail(row));
});

// Usuarios de un negocio, para soporte: quién está cargado, con qué rol y si está activo.
router.get('/negocios/:id/usuarios', (req, res) => {
  const row = findNegocio(req.params.id);
  res.json(
    db
      .prepare(
        `SELECT id, username, name, role, active, must_change_password, created_at FROM users
         WHERE negocio_id = ? ORDER BY role = 'admin' DESC, name`
      )
      .all(row.id)
      .map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        active: Boolean(u.active),
        debe_cambiar_clave: Boolean(u.must_change_password),
        created_at: u.created_at,
      }))
  );
});

// Sin letras ni números que se confundan al dictarla (0/O, 1/l/I).
const CLAVE_ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
const claveTemporal = (largo = 10) => Array.from({ length: largo }, () => CLAVE_ALFABETO[crypto.randomInt(CLAVE_ALFABETO.length)]).join('');

// Blanquear la contraseña de un usuario que se la olvidó: se genera una temporal que se muestra una sola
// vez (no se guarda en claro), se cierran sus sesiones abiertas y al entrar tiene que elegir una nueva.
router.post('/negocios/:id/usuarios/:userId/blanquear', (req, res) => {
  const negocio = findNegocio(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND negocio_id = ?').get(Number(req.params.userId), negocio.id);
  if (!user) throw new HttpError(404, 'Usuario no encontrado');
  const password = claveTemporal();
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?'
  ).run(bcrypt.hashSync(password, 10), user.id);
  console.log(
    `[plataforma] ${req.user.username} blanqueó la contraseña de "${user.username}" (usuario ${user.id}, negocio ${negocio.id})`
  );
  res.json({ username: user.username, password });
});

// Cambiar la contraseña del propio superadmin.
router.put('/password', (req, res) => {
  const { password } = req.body ?? {};
  checkPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(
    bcrypt.hashSync(String(password), 10), req.user.id
  );
  res.json({ token: signToken(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

export default router;
