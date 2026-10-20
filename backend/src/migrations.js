// Migraciones del esquema. Cada una corre una sola vez y en orden; el número de la última
// aplicada queda en PRAGMA user_version de la base.
//
// Para cambiar tablas, agregá una migración nueva AL FINAL y nunca modifiques una ya publicada.
// Ejemplo:
//   {
//     name: 'productos: código de barras',
//     up: (db) => db.exec('ALTER TABLE products ADD COLUMN barcode TEXT'),
//   },
export const migrations = [
  {
    // Usa IF NOT EXISTS para que las bases creadas antes de tener migraciones la pasen sin cambios.
    name: 'esquema inicial',
    up: (db) =>
      db.exec(`
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
      `),
  },  {
    // Se incrementa al cambiar la contraseña: los tokens emitidos antes dejan de valer.
    name: 'usuarios: versión de sesión',
    up: (db) => db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0'),
  },
];
