import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { ADMIN_PASSWORD, BACKUP_DIR, DB_PATH, IS_PRODUCTION, MIN_PASSWORD_LENGTH } from './config.js';
import { migrations } from './migrations.js';
import { fileStamp, nowLocal, todayLocal } from './time.js';

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
    tx(() => {
      migration.up(db);
      db.exec(`PRAGMA user_version = ${version}`);
    });
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

  // En producción solo se crea el admin, con la contraseña de ADMIN_PASSWORD y sin datos de ejemplo.
  if (IS_PRODUCTION) {
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Base vacía: definí ADMIN_PASSWORD (mínimo ${MIN_PASSWORD_LENGTH} caracteres) para crear el usuario admin.`);
    }
    db.prepare(
      "INSERT INTO users (username, password_hash, name, role, modules, created_at) VALUES ('admin', ?, 'Administrador', 'admin', 'libreria,avicola', now_local())"
    ).run(bcrypt.hashSync(ADMIN_PASSWORD, 10));
    console.log('Base de datos inicializada con el usuario admin.');
    return;
  }

  tx(() => {
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, name, role, modules, created_at) VALUES (?, ?, ?, ?, ?, now_local())'
    );
    const adminId = Number(
      insertUser.run('admin', bcrypt.hashSync('admin123', 10), 'Administrador', 'admin', 'libreria,avicola')
        .lastInsertRowid
    );
    insertUser.run('libreria', bcrypt.hashSync('libreria123', 10), 'Vendedor Librería', 'vendedor', 'libreria');
    insertUser.run('avicola', bcrypt.hashSync('avicola123', 10), 'Vendedor Avícola', 'vendedor', 'avicola');

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
      `INSERT INTO products (module, code, name, category, unit, cost, price, stock, min_stock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now_local())`
    );
    for (const p of products) {
      const id = Number(insertProduct.run(...p).lastInsertRowid);
      recordStockMovement({ productId: id, type: 'inicial', qty: p[7], stockAfter: p[7], userId: adminId });
    }
  });
  console.log('Base de datos inicializada con datos de ejemplo.');
}

migrate();
seedIfEmpty();
