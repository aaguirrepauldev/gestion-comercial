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
  {
    // Varios negocios (clientes) en la misma base: cada usuario, producto, caja y venta pertenece a uno.
    // Los datos que ya existían pasan al negocio 1, activo y sin vencimiento.
    // Corre con las claves foráneas apagadas porque hay que reconstruir la tabla de productos
    // (el código pasa a ser único por negocio) y agregar columnas con REFERENCES.
    name: 'negocios y suscripciones',
    foreignKeysOff: true,
    up: (db) => {
      db.exec(`
      CREATE TABLE negocios (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre     TEXT NOT NULL,
        modules    TEXT NOT NULL DEFAULT 'libreria,avicola',
        plan       TEXT NOT NULL DEFAULT 'mensual',
        estado     TEXT NOT NULL DEFAULT 'prueba' CHECK (estado IN ('prueba','activo','suspendido')),
        vence_el   TEXT,            -- 'YYYY-MM-DD' inclusive; NULL = sin vencimiento
        contacto   TEXT,            -- teléfono o email del dueño, para cobrar
        notas      TEXT,
        created_at TEXT NOT NULL
      );

      -- Pagos recibidos. Hoy se cargan a mano (transferencia); más adelante un webhook de
      -- Mercado Pago puede insertar acá con metodo = 'mercadopago' y external_id = id del pago.
      CREATE TABLE pagos (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        negocio_id    INTEGER NOT NULL REFERENCES negocios(id),
        monto         REAL NOT NULL,
        metodo        TEXT NOT NULL DEFAULT 'transferencia',
        referencia    TEXT,
        external_id   TEXT UNIQUE,
        fecha         TEXT NOT NULL,  -- día en que se recibió el pago
        desde         TEXT,           -- vencimiento anterior
        hasta         TEXT NOT NULL,  -- nuevo vencimiento
        registrado_por INTEGER REFERENCES users(id),
        created_at    TEXT NOT NULL
      );
      CREATE INDEX ix_pagos_negocio ON pagos(negocio_id, id);

      -- negocio_id NULL solo para el superadmin de la plataforma (ver trigger).
      ALTER TABLE users ADD COLUMN negocio_id INTEGER REFERENCES negocios(id);
      ALTER TABLE users ADD COLUMN superadmin INTEGER NOT NULL DEFAULT 0;
      CREATE TRIGGER users_negocio_obligatorio BEFORE INSERT ON users
        WHEN NEW.negocio_id IS NULL AND NEW.superadmin = 0
        BEGIN SELECT RAISE(ABORT, 'users.negocio_id es obligatorio'); END;

      -- DEFAULT 0 no existe en negocios: un INSERT que se olvide del negocio falla por clave foránea.
      ALTER TABLE cash_sessions ADD COLUMN negocio_id INTEGER NOT NULL DEFAULT 0 REFERENCES negocios(id);
      ALTER TABLE sales ADD COLUMN negocio_id INTEGER NOT NULL DEFAULT 0 REFERENCES negocios(id);

      CREATE TABLE products_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        negocio_id INTEGER NOT NULL REFERENCES negocios(id),
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
        UNIQUE (negocio_id, module, code)
      );
      INSERT INTO products_new (id, negocio_id, module, code, name, category, unit, cost, price, stock, min_stock, active, created_at)
        SELECT id, 1, module, code, name, category, unit, cost, price, stock, min_stock, active, created_at FROM products;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;

      DROP INDEX IF EXISTS ux_cash_open;
      CREATE UNIQUE INDEX ux_cash_open ON cash_sessions(negocio_id, module) WHERE status = 'abierta';
      DROP INDEX IF EXISTS ix_sales_module_date;
      CREATE INDEX ix_sales_negocio_date ON sales(negocio_id, module, created_at);
      CREATE INDEX ix_users_negocio ON users(negocio_id);
      `);

      const hasData = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
      if (hasData) {
        db.prepare(
          "INSERT INTO negocios (id, nombre, modules, estado, vence_el, created_at) VALUES (1, 'Negocio principal', 'libreria,avicola', 'activo', NULL, now_local())"
        ).run();
        db.exec('UPDATE users SET negocio_id = 1; UPDATE cash_sessions SET negocio_id = 1; UPDATE sales SET negocio_id = 1;');
      }
    },
  },
  {
    // Más rubros: el CHECK (module IN ('libreria','avicola')) de productos, cajas y ventas no deja guardar
    // los nuevos. Se reconstruyen las tablas sin ese CHECK; qué rubros existen lo valida la API (MODULES en config.js).
    name: 'rubros sin lista fija en la base',
    foreignKeysOff: true,
    up: (db) => {
      for (const table of ['products', 'cash_sessions', 'sales']) {
        const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        const sinCheck = sql.replace(/\s*CHECK\s*\(\s*module\s+IN\s*\([^)]*\)\s*\)/i, '');
        if (sinCheck === sql) continue;
        const indexes = db
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL")
          .all(table)
          .map((r) => r.sql);
        const tmp = `${table}_rubros`;
        db.exec(sinCheck.replace(/^CREATE TABLE\s+("?\w+"?)/i, `CREATE TABLE ${tmp}`));
        db.exec(`INSERT INTO ${tmp} SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${tmp} RENAME TO ${table};`);
        for (const index of indexes) db.exec(index);
      }
    },
  },
  {
    // El superadmin puede blanquear la contraseña de un usuario: queda una clave temporal y,
    // hasta que el usuario elija una nueva, no puede usar el resto de la app.
    name: 'usuarios: cambiar contraseña al entrar',
    up: (db) => db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0'),
  },
  {
    // Número visible de cajas y ventas: antes se mostraba el id, que es global y lo comparten todos los
    // negocios (la primera caja de un negocio nuevo salía "Caja #2"). Ahora cada negocio y rubro tiene su
    // propia numeración desde 1. Las filas existentes se numeran en el orden en que se crearon.
    name: 'cajas y ventas: número por negocio',
    up: (db) => {
      for (const table of ['cash_sessions', 'sales']) {
        db.exec(`
        ALTER TABLE ${table} ADD COLUMN numero INTEGER;
        UPDATE ${table} SET numero = (
          SELECT n FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY negocio_id, module ORDER BY id) AS n FROM ${table}) r
          WHERE r.id = ${table}.id
        );
        CREATE UNIQUE INDEX ux_${table}_numero ON ${table}(negocio_id, module, numero);
        `);
      }
      // La nota de las anulaciones nombraba la venta por su id.
      db.exec(`
      UPDATE stock_movements
      SET note = 'Anulación venta #' || (SELECT numero FROM sales WHERE sales.id = stock_movements.sale_id)
      WHERE type = 'anulacion' AND sale_id IS NOT NULL AND note = 'Anulación venta #' || sale_id;
      `);
    },
  },
];
