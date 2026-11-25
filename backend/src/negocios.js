import bcrypt from 'bcryptjs';
import { db, tx } from './db.js';
import { GRACE_DAYS, MIN_PASSWORD_LENGTH, MODULES, SUPERADMIN_USERNAME, TRIAL_DAYS } from './config.js';
import { addDays, daysBetween, todayLocal } from './time.js';
import { HttpError } from './util.js';

export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Estado de la suscripción tal como lo ve la app. El estado guardado (prueba/activo/suspendido) más
// la fecha de vencimiento definen el estado real; "vencido" no se guarda: se calcula, así no hace falta un cron.
//   prueba | activo   → todo habilitado (vence_el NULL = sin vencimiento)
//   gracia            → venció hace menos de GRACE_DAYS días: todo habilitado, con aviso
//   vencido           → solo lectura: se pueden ver los datos pero no cargar ventas ni cambios
//   suspendido        → no se puede entrar (lo decide el dueño de la plataforma)
export function negocioStatus(row, today = todayLocal()) {
  const base = {
    id: row.id,
    nombre: row.nombre,
    modules: row.modules.split(',').filter(Boolean),
    plan: row.plan,
    estado_guardado: row.estado,
    vence_el: row.vence_el,
  };
  if (row.estado === 'suspendido') return { ...base, estado: 'suspendido', dias_restantes: null, solo_lectura: true, bloqueado: true };
  if (!row.vence_el) return { ...base, estado: row.estado, dias_restantes: null, solo_lectura: false, bloqueado: false };

  const dias = daysBetween(today, row.vence_el);
  let estado = row.estado;
  if (dias < 0) estado = -dias <= GRACE_DAYS ? 'gracia' : 'vencido';
  return {
    ...base,
    estado,
    dias_restantes: dias,
    solo_lectura: estado === 'vencido',
    bloqueado: false,
    // Último día en que se puede seguir cargando datos.
    limite_gracia: addDays(row.vence_el, GRACE_DAYS),
  };
}

export const getNegocio = (id) => db.prepare('SELECT * FROM negocios WHERE id = ?').get(id);

export function parseModules(modules, { required = true } = {}) {
  const list = Array.isArray(modules) ? modules : String(modules ?? '').split(',');
  const clean = MODULES.filter((m) => list.includes(m));
  if (required && clean.length === 0) throw new HttpError(400, 'Elegí al menos un rubro (librería o avícola)');
  return clean.join(',');
}

export function checkPassword(password) {
  if (String(password ?? '').length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
}

export function cleanUsername(username) {
  const u = String(username ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(u)) {
    throw new HttpError(400, 'El usuario debe tener entre 3 y 40 letras, números, puntos o guiones (sin espacios)');
  }
  if (u === SUPERADMIN_USERNAME) throw new HttpError(409, 'Ese nombre de usuario no está disponible');
  return u;
}

// Crea un negocio nuevo con su primer usuario administrador. Por defecto arranca en prueba por TRIAL_DAYS días.
export function createNegocio({ nombre, modules, contacto, admin, estado = 'prueba', vence_el }) {
  const name = String(nombre ?? '').trim();
  if (!name) throw new HttpError(400, 'El nombre del negocio es obligatorio');
  if (name.length > 80) throw new HttpError(400, 'El nombre del negocio es demasiado largo');
  const mods = parseModules(modules);
  const username = cleanUsername(admin?.username);
  const adminName = String(admin?.name ?? '').trim() || 'Administrador';
  checkPassword(admin?.password);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    throw new HttpError(409, `El usuario "${username}" ya existe. Probá con otro (por ejemplo ${username}.${name.split(/\s+/)[0].toLowerCase()}).`);
  }
  const vence = vence_el === undefined ? addDays(todayLocal(), TRIAL_DAYS) : vence_el;

  return tx(() => {
    const negocioId = Number(
      db
        .prepare('INSERT INTO negocios (nombre, modules, estado, vence_el, contacto, created_at) VALUES (?, ?, ?, ?, ?, now_local())')
        .run(name, mods, estado, vence, String(contacto ?? '').trim() || null).lastInsertRowid
    );
    const userId = Number(
      db
        .prepare(
          "INSERT INTO users (negocio_id, username, password_hash, name, role, modules, created_at) VALUES (?, ?, ?, ?, 'admin', ?, now_local())"
        )
        .run(negocioId, username, bcrypt.hashSync(String(admin.password), 10), adminName, mods).lastInsertRowid
    );
    return { negocioId, userId };
  });
}
