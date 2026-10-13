import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { DB_PATH } from './config.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','vendedor')),
  modules       TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  module     TEXT NOT NULL CHECK (module IN ('libreria','avicola')),
  code       TEXT,
  name       TEXT NOT NULL,
  category   TEXT,
  unit       TEXT NOT NULL DEFAULT 'unidad' CHECK (unit IN ('unidad','kg')),
  cost       REAL NOT NULL DEFAULT 0,
  price      REAL NOT NULL,
  stock      REAL NOT NULL DEFAULT 0,
  min_stock  REAL NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (module, code)
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  module         TEXT NOT NULL CHECK (module IN ('libreria','avicola')),
  status         TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada')),
  opened_by      INTEGER NOT NULL REFERENCES users(id),
  opened_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  opening_amount REAL NOT NULL DEFAULT 0,
  closed_by      INTEGER REFERENCES users(id),
  closed_at      TEXT,
  expected_cash  REAL,
  counted_cash   REAL,
  difference     REAL,
  notes          TEXT
);
-- Solo una caja abierta por módulo
CREATE UNIQUE INDEX IF NOT EXISTS ux_cash_open ON cash_sessions(module) WHERE status = 'abierta';

CREATE TABLE IF NOT EXISTS cash_movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES cash_sessions(id),
  type        TEXT NOT NULL CHECK (type IN ('ingreso','egreso')),
  amount      REAL NOT NULL,
  description TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  module         TEXT NOT NULL CHECK (module IN ('libreria','avicola')),
  session_id     INTEGER NOT NULL REFERENCES cash_sessions(id),
  user_id        INTEGER NOT NULL REFERENCES users(id),
  total          REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo','debito','credito','transferencia')),
  status         TEXT NOT NULL DEFAULT 'completada' CHECK (status IN ('completada','anulada')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cancelled_by   INTEGER REFERENCES users(id),
  cancelled_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_sales_module_date ON sales(module, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL REFERENCES sales(id),
  product_id   INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit         TEXT NOT NULL,
  qty          REAL NOT NULL,
  unit_price   REAL NOT NULL,
  subtotal     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  type        TEXT NOT NULL CHECK (type IN ('inicial','ingreso','egreso','ajuste','venta','anulacion')),
  qty         REAL NOT NULL,
  stock_after REAL NOT NULL,
  note        TEXT,
  sale_id     INTEGER REFERENCES sales(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

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
    `INSERT INTO stock_movements (product_id, type, qty, stock_after, note, sale_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(productId, type, qty, stockAfter, note, saleId, userId);
}

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) return;

  tx(() => {
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, name, role, modules) VALUES (?, ?, ?, ?, ?)'
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
      `INSERT INTO products (module, code, name, category, unit, cost, price, stock, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of products) {
      const id = Number(insertProduct.run(...p).lastInsertRowid);
      recordStockMovement({ productId: id, type: 'inicial', qty: p[7], stockAfter: p[7], userId: adminId });
    }
  });
  console.log('Base de datos inicializada con datos de ejemplo.');
}

seedIfEmpty();
