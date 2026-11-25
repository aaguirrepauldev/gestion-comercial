import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import {
  ADMIN_PASSWORD, BACKUP_DIR, DB_PATH, IS_PRODUCTION, MIN_PASSWORD_LENGTH, SUPERADMIN_PASSWORD, SUPERADMIN_USERNAME,
} from './config.js';
import { migrations } from './migrations.js';
import { addDays, fileStamp, nowLocal, todayLocal } from './time.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

// Reemplazan a datetime('now','localtime') / date('now','localtime'), que usan la zona del servidor.
// Los DEFAULT de las tablas no se pueden cambiar en bases ya creadas, por eso cada INSERT pasa la fecha.
db.function('now_local', { deterministic: false }, () => nowLocal());
db.function('today_local', { deterministic: false }, () => todayLocal());

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
`);

// Copia consistente de la base a `file` (VACUUM INTO funciona aunque la app esté en uso).
export function copyDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  return file;
}

function migrate() {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > migrations.length) {
    throw new Error(`La base está en la versión ${current}, más nueva que este código (${migrations.length}).`);
  }
  const pending = migrations.slice(current);
  if (pending.length === 0) return;

  // Antes de tocar una base con datos, guarda una copia aparte (fuera de la rotación de backups).
  const hasData = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (hasData) {
    const file = copyDatabase(path.join(BACKUP_DIR, `pre-migracion-v${current}-${fileStamp()}.db`));
    console.log(`Copia previa a la migración: ${file}`);
  }

  pending.forEach((migration, i) => {
    const version = current + i + 1;
    // Para reconstruir tablas SQLite pide apagar las claves foráneas (no se puede dentro de una transacción)
    // y verificarlas antes de confirmar.
    if (migration.foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF');
    try {
      tx(() => {
        migration.up(db);
        if (migration.foreignKeysOff) {
          const broken = db.prepare('PRAGMA foreign_key_check').all();
          if (broken.length > 0) throw new Error(`Migración ${version}: claves foráneas rotas ${JSON.stringify(broken.slice(0, 5))}`);
        }
        db.exec(`PRAGMA user_version = ${version}`);
      });
    } finally {
      if (migration.foreignKeysOff) db.exec('PRAGMA foreign_keys = ON');
    }
    console.log(`Migración ${version} aplicada: ${migration.name}`);
  });
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function recordStockMovement({ productId, type, qty, stockAfter, note = null, saleId = null, userId }) {
  db.prepare(
    `INSERT INTO stock_movements (product_id, type, qty, stock_after, note, sale_id, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, now_local())`
  ).run(productId, type, qty, stockAfter, note, saleId, userId);
}

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) return;

  // En producción solo se crea el negocio 1 con su admin (si hay ADMIN_PASSWORD), sin datos de ejemplo.
  // Con solo SUPERADMIN_PASSWORD arranca vacía y los negocios se registran desde la web.
  if (IS_PRODUCTION) {
    if (!ADMIN_PASSWORD && SUPERADMIN_PASSWORD) return;
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Base vacía: definí ADMIN_PASSWORD o SUPERADMIN_PASSWORD (mínimo ${MIN_PASSWORD_LENGTH} caracteres).`
      );
    }
    tx(() => {
      db.prepare(
        "INSERT INTO negocios (id, nombre, modules, estado, vence_el, created_at) VALUES (1, 'Negocio principal', 'libreria,avicola', 'activo', NULL, now_local())"
      ).run();
      db.prepare(
        "INSERT INTO users (negocio_id, username, password_hash, name, role, modules, created_at) VALUES (1, 'admin', ?, 'Administrador', 'admin', 'libreria,avicola', now_local())"
      ).run(bcrypt.hashSync(ADMIN_PASSWORD, 10));
    });
    console.log('Base de datos inicializada con el usuario admin.');
    return;
  }

  tx(() => {
    // Negocio de ejemplo con suscripción activa por 30 días.
    db.prepare(
      "INSERT INTO negocios (id, nombre, modules, estado, vence_el, created_at) VALUES (1, 'Negocio de ejemplo', 'libreria,avicola', 'activo', ?, now_local())"
    ).run(addDays(todayLocal(), 30));
    const insertUser = db.prepare(
      'INSERT INTO users (negocio_id, username, password_hash, name, role, modules, created_at) VALUES (1, ?, ?, ?, ?, ?, now_local())'
    );
    const adminId = Number(
      insertUser.run('admin', bcrypt.hashSync('admin123', 10), 'Administrador', 'admin', 'libreria,avicola')
        .lastInsertRowid
    );
    insertUser.run('libreria', bcrypt.hashSync('libreria123', 10), 'Vendedor Librería', 'vendedor', 'libreria');
    insertUser.run('avicola', bcrypt.hashSync('avicola123', 10), 'Vendedor Avícola', 'vendedor', 'avicola');
    db.prepare(
      "INSERT INTO users (negocio_id, superadmin, username, password_hash, name, role, created_at) VALUES (NULL, 1, 'superadmin', ?, 'Dueño de la plataforma', 'admin', now_local())"
    ).run(bcrypt.hashSync('superadmin123', 10));

    // [module, code, name, category, unit, cost, price, stock, min_stock]
    const products = [
      ['libreria', 'LIB-001', 'Cuaderno Rivadavia ABC 50 hojas', 'Cuadernos', 'unidad', 2100, 3500, 40, 10],
      ['libreria', 'LIB-002', 'Cuaderno universitario rayado 80 hojas', 'Cuadernos', 'unidad', 3200, 5200, 25, 8],
      ['libreria', 'LIB-003', 'Birome BIC azul', 'Escritura', 'unidad', 350, 700, 120, 30],
      ['libreria', 'LIB-004', 'Lápiz negro HB', 'Escritura', 'unidad', 200, 450, 80, 20],
      ['libreria', 'LIB-005', 'Resma A4 75g 500 hojas', 'Papelería', 'unidad', 5800, 8900, 15, 5],
      ['libreria', 'LIB-006', 'Goma de borrar', 'Escritura', 'unidad', 150, 350, 6, 10],
      ['libreria', 'LIB-007', 'Regla 30 cm', 'Geometría', 'unidad', 400, 900, 30, 10],
      ['libreria', 'LIB-008', 'Carpeta N°3 con anillos', 'Carpetas', 'unidad', 2900, 4800, 12, 5],
      ['libreria', 'LIB-009', 'Repuesto hojas N°3 x 96', 'Papelería', 'unidad', 1800, 3000, 3, 8],
      ['libreria', 'LIB-010', 'Caja de lápices de colores x12', 'Arte', 'unidad', 2500, 4200, 18, 6],
      ['avicola', 'AVI-001', 'Pollo entero', 'Pollo fresco', 'kg', 2300, 3600, 85.5, 20],
      ['avicola', 'AVI-002', 'Pechuga sin hueso', 'Cortes', 'kg', 4800, 7200, 32.25, 10],
      ['avicola', 'AVI-003', 'Pata muslo', 'Cortes', 'kg', 2600, 4100, 40, 10],
      ['avicola', 'AVI-004', 'Alitas', 'Cortes', 'kg', 1800, 2900, 7.5, 8],
      ['avicola', 'AVI-005', 'Milanesas de pollo', 'Elaborados', 'kg', 5200, 7900, 18, 5],
      ['avicola', 'AVI-006', 'Menudos', 'Cortes', 'kg', 900, 1600, 12, 4],
      ['avicola', 'AVI-007', 'Huevos blancos maple x30', 'Huevos', 'unidad', 4200, 6000, 40, 10],
      ['avicola', 'AVI-008', 'Huevos color docena', 'Huevos', 'unidad', 1900, 2800, 25, 10],
      ['avicola', 'AVI-009', 'Hamburguesas de pollo x4', 'Elaborados', 'unidad', 2100, 3400, 30, 10],
      ['avicola', 'AVI-010', 'Alimento balanceado ponedoras 25 kg', 'Alimento animal', 'unidad', 16000, 21500, 9, 3],
    ];
    const insertProduct = db.prepare(
      `INSERT INTO products (negocio_id, module, code, name, category, unit, cost, price, stock, min_stock, created_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, now_local())`
    );
    for (const p of products) {
      const id = Number(insertProduct.run(...p).lastInsertRowid);
      recordStockMovement({ productId: id, type: 'inicial', qty: p[7], stockAfter: p[7], userId: adminId });
    }
  });
  console.log('Base de datos inicializada con datos de ejemplo.');
}

// El dueño de la plataforma (ve todos los negocios y registra pagos). Se crea al arrancar si está definida
// SUPERADMIN_PASSWORD y todavía no hay ningún superadmin; después la contraseña se cambia desde el panel.
function ensureSuperadmin() {
  if (!SUPERADMIN_PASSWORD) return;
  if (db.prepare('SELECT 1 FROM users WHERE superadmin = 1').get()) return;
  if (SUPERADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SUPERADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(SUPERADMIN_USERNAME)) {
    console.error(`No se creó el superadmin: ya existe un usuario "${SUPERADMIN_USERNAME}". Definí otro SUPERADMIN_USERNAME.`);
    return;
  }
  db.prepare(
    "INSERT INTO users (negocio_id, superadmin, username, password_hash, name, role, created_at) VALUES (NULL, 1, ?, ?, 'Dueño de la plataforma', 'admin', now_local())"
  ).run(SUPERADMIN_USERNAME, bcrypt.hashSync(SUPERADMIN_PASSWORD, 10));
  console.log(`Usuario superadmin "${SUPERADMIN_USERNAME}" creado.`);
}

migrate();
seedIfEmpty();
ensureSuperadmin();
