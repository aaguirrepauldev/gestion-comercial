import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';
import { migrations } from '../src/migrations.js';
import { addDays, addMonths, todayLocal } from '../src/time.js';
import { outbox } from '../src/email.js';

let api, adminA, superadmin, adminB, negocioB;
const today = todayLocal();

const registrar = (body) =>
  api.request('POST', '/auth/registro', {
    body: {
      negocio: 'Librería Sur', modules: ['libreria'], name: 'Ana', username: 'ana', password: 'clave-ana-1', email: 'ana@example.com', ...body,
    },
  });
const setNegocio = (id, body) => api.request('PUT', `/plataforma/negocios/${id}`, { token: superadmin, body });

before(async () => {
  api = await startServer();
  adminA = await api.login('admin', 'admin123');
  superadmin = await api.login('superadmin', 'superadmin123');
});
after(() => api.close());

describe('registro de un negocio nuevo', () => {
  test('crea el negocio en prueba y, al confirmar el email, deja la sesión iniciada', async () => {
    const alta = await registrar();
    assert.equal(alta.status, 201);
    assert.equal(alta.body.verificacion_pendiente, true);
    const token = /token=([\w-]+)/.exec(outbox.at(-1).text)[1];
    const res = await api.request('POST', '/auth/verificar-email', { body: { token } });
    assert.equal(res.status, 200);
    adminB = res.body.token;
    negocioB = res.body.user.negocio.id;
    assert.equal(res.body.user.role, 'admin');
    assert.deepEqual(res.body.user.modules, ['libreria']);
    assert.equal(res.body.user.negocio.estado, 'prueba');
    assert.equal(res.body.user.negocio.vence_el, addDays(today, 14));
    assert.equal(res.body.user.negocio.dias_restantes, 14);
  });

  test('el nombre de usuario es único en toda la plataforma', async () => {
    const res = await registrar({ username: 'admin', email: 'otro@example.com' });
    assert.equal(res.status, 409);
    assert.equal((await registrar({ username: 'superadmin', email: 'otro@example.com' })).status, 409);
  });

  test('valida los datos', async () => {
    assert.equal((await registrar({ username: 'otro', email: 'otro@example.com', negocio: '' })).status, 400);
    assert.equal((await registrar({ username: 'otro', email: 'otro@example.com', modules: [] })).status, 400);
    assert.equal((await registrar({ username: 'otro', email: 'otro@example.com', password: 'corta' })).status, 400);
    assert.equal((await registrar({ username: 'con espacio', email: 'otro@example.com' })).status, 400);
  });
});

describe('aislamiento entre negocios', () => {
  test('el negocio nuevo arranca vacío y no ve productos de otro', async () => {
    const { body } = await api.request('GET', '/modules/libreria/products?all=1', { token: adminB });
    assert.deepEqual(body, []);
    const ajeno = await api.request('PUT', '/modules/libreria/products/1', { token: adminB, body: { price: 1 } });
    assert.equal(ajeno.status, 404);
    const stock = await api.request('POST', '/modules/libreria/products/1/stock', {
      token: adminB,
      body: { type: 'ingreso', qty: 5 },
    });
    assert.equal(stock.status, 404);
  });

  test('no entra a un rubro que su negocio no tiene', async () => {
    assert.equal((await api.request('GET', '/modules/avicola/products', { token: adminB })).status, 403);
  });

  test('cada negocio puede usar los mismos códigos de producto', async () => {
    const res = await api.request('POST', '/modules/libreria/products', {
      token: adminB,
      body: { code: 'LIB-001', name: 'Cuaderno', price: 100, stock: 10 },
    });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.id, 1);
    const otra = await api.request('POST', '/modules/libreria/products', {
      token: adminB,
      body: { code: 'LIB-001', name: 'Repetido', price: 100 },
    });
    assert.equal(otra.status, 409, 'dentro del mismo negocio sigue siendo único');
  });

  test('cada negocio tiene su propia caja y sus ventas', async () => {
    assert.equal((await api.request('POST', '/modules/libreria/cash/open', { token: adminA, body: {} })).status, 201);
    assert.equal(
      (await api.request('GET', '/modules/libreria/cash/current', { token: adminB })).body,
      null,
      'la caja abierta de otro negocio no aparece'
    );
    assert.equal((await api.request('POST', '/modules/libreria/cash/open', { token: adminB, body: {} })).status, 201);

    const ventaA = await api.request('POST', '/modules/libreria/sales', {
      token: adminA,
      body: { payment_method: 'efectivo', items: [{ product_id: 1, qty: 1 }] },
    });
    assert.equal(ventaA.status, 201);
    // B no puede vender un producto de A ni ver su venta
    const robo = await api.request('POST', '/modules/libreria/sales', {
      token: adminB,
      body: { payment_method: 'efectivo', items: [{ product_id: 1, qty: 1 }] },
    });
    assert.equal(robo.status, 404);
    assert.equal((await api.request('GET', `/modules/libreria/sales/${ventaA.body.id}`, { token: adminB })).status, 404);
    assert.deepEqual((await api.request('GET', '/modules/libreria/sales', { token: adminB })).body, []);
    assert.equal(
      (await api.request('POST', `/modules/libreria/sales/${ventaA.body.id}/cancel`, { token: adminB })).status,
      404
    );
    const dash = await api.request('GET', '/modules/libreria/dashboard', { token: adminB });
    assert.equal(dash.body.today.count, 0);
  });

  test('los usuarios de cada negocio están separados', async () => {
    const { body } = await api.request('GET', '/users', { token: adminB });
    assert.deepEqual(body.map((u) => u.username), ['ana']);
    assert.equal((await api.request('PUT', '/users/3', { token: adminB, body: { active: false } })).status, 404);

    const nuevo = await api.request('POST', '/users', {
      token: adminB,
      body: { username: 'caja.sur', name: 'Caja', password: 'clave-caja-1', role: 'vendedor', modules: ['libreria', 'avicola'] },
    });
    assert.equal(nuevo.status, 201);
    assert.deepEqual(nuevo.body.modules, ['libreria'], 'no recibe rubros que el negocio no tiene');
  });
});

describe('panel de plataforma', () => {
  test('solo el superadmin entra', async () => {
    assert.equal((await api.request('GET', '/plataforma/negocios', { token: adminA })).status, 403);
    const { status, body } = await api.request('GET', '/plataforma/negocios', { token: superadmin });
    assert.equal(status, 200);
    assert.deepEqual(body.map((n) => n.id).sort(), [1, negocioB]);
    const b = body.find((n) => n.id === negocioB);
    assert.equal(b.admin_username, 'ana');
    assert.equal(b.usuarios, 2);
  });

  test('el superadmin no ve datos de los negocios desde la app', async () => {
    assert.equal((await api.request('GET', '/modules/libreria/products', { token: superadmin })).status, 403);
    assert.equal((await api.request('GET', '/users', { token: superadmin })).status, 403);
  });

  test('puede dar de alta un negocio a mano', async () => {
    const res = await api.request('POST', '/plataforma/negocios', {
      token: superadmin,
      body: {
        nombre: 'Avícola Norte',
        modules: ['avicola'],
        admin: { username: 'norte', name: 'Juan', password: 'clave-norte-1' },
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, 'prueba');
    assert.equal(res.body.admin_username, 'norte');
  });
});

describe('suscripción', () => {
  test('el negocio ve su estado y cómo pagar', async () => {
    const { body } = await api.request('GET', '/suscripcion', { token: adminB });
    assert.equal(body.estado, 'prueba');
    assert.deepEqual(body.pagos, []);
  });

  test('en el período de gracia sigue funcionando con aviso', async () => {
    await setNegocio(negocioB, { vence_el: addDays(today, -1) });
    const me = await api.request('GET', '/auth/me', { token: adminB });
    assert.equal(me.body.negocio.estado, 'gracia');
    assert.equal(me.body.negocio.solo_lectura, false);
    const mov = await api.request('POST', '/modules/libreria/cash/movements', {
      token: adminB,
      body: { type: 'ingreso', amount: 10, description: 'cambio' },
    });
    assert.equal(mov.status, 201);
  });

  test('vencida pasa a solo lectura', async () => {
    await setNegocio(negocioB, { vence_el: addDays(today, -10) });
    const me = await api.request('GET', '/auth/me', { token: adminB });
    assert.equal(me.body.negocio.estado, 'vencido');
    assert.equal(me.body.negocio.solo_lectura, true);

    assert.equal((await api.request('GET', '/modules/libreria/products', { token: adminB })).status, 200);
    assert.equal((await api.request('GET', '/users', { token: adminB })).status, 200);
    const venta = await api.request('POST', '/modules/libreria/products', {
      token: adminB,
      body: { name: 'X', price: 1 },
    });
    assert.equal(venta.status, 402);
    assert.match(venta.body.error, /venció/);
    const user = await api.request('POST', '/users', {
      token: adminB,
      body: { username: 'otro.sur', name: 'Otro', password: 'clave-otro-1', role: 'admin' },
    });
    assert.equal(user.status, 402);
  });

  test('registrar un pago la reactiva y extiende desde hoy si ya había vencido', async () => {
    const res = await api.request('POST', `/plataforma/negocios/${negocioB}/pagos`, {
      token: superadmin,
      body: { monto: 15000, meses: 1, referencia: 'Transferencia Banco Nación' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, 'activo');
    assert.equal(res.body.vence_el, addMonths(today, 1));
    assert.equal(res.body.ultimo_pago.monto, 15000);

    const prod = await api.request('POST', '/modules/libreria/products', { token: adminB, body: { name: 'X', price: 1 } });
    assert.equal(prod.status, 201);

    const { body } = await api.request('GET', '/suscripcion', { token: adminB });
    assert.equal(body.pagos.length, 1);
    assert.equal(body.pagos[0].referencia, 'Transferencia Banco Nación');
  });

  test('un pago antes del vencimiento suma desde la fecha de vencimiento', async () => {
    const vence = (await api.request('GET', `/plataforma/negocios/${negocioB}`, { token: superadmin })).body.vence_el;
    const res = await api.request('POST', `/plataforma/negocios/${negocioB}/pagos`, {
      token: superadmin,
      body: { monto: 30000, meses: 2 },
    });
    assert.equal(res.body.vence_el, addMonths(vence, 2));
  });

  test('suspendido no puede entrar', async () => {
    await setNegocio(negocioB, { estado: 'suspendido' });
    assert.equal((await api.request('GET', '/auth/me', { token: adminB })).status, 403);
    const login = await api.request('POST', '/auth/login', { body: { username: 'ana', password: 'clave-ana-1' } });
    assert.equal(login.status, 403);
    assert.match(login.body.error, /suspendida/);

    await setNegocio(negocioB, { estado: 'activo' });
    assert.equal((await api.request('GET', '/auth/me', { token: adminB })).status, 200);
  });

  test('los demás negocios no se ven afectados', async () => {
    const me = await api.request('GET', '/auth/me', { token: adminA });
    assert.equal(me.body.negocio.id, 1);
    assert.equal(me.body.negocio.solo_lectura, false);
  });
});

describe('addMonths', () => {
  test('respeta el último día del mes', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2026-11-25', 2), '2027-01-25');
  });
});

describe('migración de una base existente', () => {
  test('los datos que había pasan al negocio 1, activo y sin vencimiento', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestion-mig-'));
    const file = path.join(dir, 'app.db');
    // Base en la versión 2 (antes de los negocios) con un usuario, un producto, una caja y una venta.
    const old = new DatabaseSync(file);
    migrations.slice(0, 2).forEach((m) => m.up(old));
    old.exec(`
      PRAGMA user_version = 2;
      INSERT INTO users (username, password_hash, name, role, modules) VALUES ('admin', 'x', 'Admin', 'admin', 'libreria,avicola');
      INSERT INTO products (module, code, name, price, stock) VALUES ('libreria', 'A1', 'Lápiz', 100, 5);
      INSERT INTO cash_sessions (module, opened_by) VALUES ('libreria', 1);
      INSERT INTO sales (module, session_id, user_id, total, payment_method) VALUES ('libreria', 1, 1, 100, 'efectivo');
      INSERT INTO sale_items (sale_id, product_id, product_name, unit, qty, unit_price, subtotal) VALUES (1, 1, 'Lápiz', 'unidad', 1, 100, 100);
      INSERT INTO stock_movements (product_id, type, qty, stock_after, user_id) VALUES (1, 'inicial', 5, 5, 1);
    `);
    old.close();

    const r = spawnSync(process.execPath, ['-e', "await import('./src/db.js')", '--input-type=module'], {
      cwd: new URL('..', import.meta.url),
      env: { PATH: process.env.PATH, DB_PATH: file, BACKUP_DIR: path.join(dir, 'backups') },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);

    const db = new DatabaseSync(file);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, migrations.length);
      const negocio = db.prepare('SELECT * FROM negocios').get();
      assert.equal(negocio.id, 1);
      assert.equal(negocio.estado, 'activo');
      assert.equal(negocio.vence_el, null);
      for (const table of ['users', 'products', 'cash_sessions', 'sales']) {
        assert.equal(db.prepare(`SELECT negocio_id FROM ${table}`).get().negocio_id, 1, table);
      }
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      // La venta y el kardex siguen apuntando al mismo producto.
      assert.equal(db.prepare('SELECT p.name FROM sale_items i JOIN products p ON p.id = i.product_id').get().name, 'Lápiz');
      assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.startsWith('pre-migracion-v2')));
      // Un INSERT que se olvide del negocio falla en vez de caer en otro negocio.
      db.exec('PRAGMA foreign_keys = ON');
      assert.throws(() => db.exec("INSERT INTO sales (module, session_id, user_id, total, payment_method) VALUES ('libreria', 1, 1, 1, 'efectivo')"));
      assert.throws(() => db.exec("INSERT INTO users (username, password_hash, name, role) VALUES ('x', 'x', 'x', 'admin')"));
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
