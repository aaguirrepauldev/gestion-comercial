import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';
import { migrations } from '../src/migrations.js';

let api, adminA, adminB;
const libreria = (p) => `/modules/libreria${p}`;

before(async () => {
  api = await startServer();
  adminA = await api.login('admin', 'admin123');
});
after(() => api.close());

async function venderUno(token) {
  const prod = await api.request('POST', libreria('/products'), {
    token, body: { code: `N-${Math.random()}`, name: 'Lápiz', price: 100, stock: 10 },
  });
  assert.equal(prod.status, 201, JSON.stringify(prod.body));
  const sale = await api.request('POST', libreria('/sales'), {
    token, body: { payment_method: 'efectivo', items: [{ product_id: prod.body.id, qty: 1 }] },
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  return sale.body;
}

describe('numeración de cajas y ventas por negocio', () => {
  test('el negocio de ejemplo arranca en la caja 1 y la venta 1', async () => {
    const caja = await api.request('POST', libreria('/cash/open'), { token: adminA, body: { opening_amount: 0 } });
    assert.equal(caja.status, 201);
    assert.equal(caja.body.numero, 1);
    assert.equal((await venderUno(adminA)).numero, 1);
    assert.equal((await venderUno(adminA)).numero, 2);
  });

  test('un negocio nuevo también empieza en 1, aunque los ids sean globales', async () => {
    const reg = await api.request('POST', '/auth/registro', {
      body: { negocio: 'Kiosco', modules: ['libreria'], name: 'Kio', username: 'kiosco1', password: 'clave-kiosco-1' },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    adminB = reg.body.token;

    const caja = await api.request('POST', libreria('/cash/open'), { token: adminB, body: { opening_amount: 0 } });
    assert.equal(caja.status, 201);
    assert.equal(caja.body.numero, 1);
    assert.notEqual(caja.body.id, 1);
    const venta = await venderUno(adminB);
    assert.equal(venta.numero, 1);
    assert.equal(venta.session_id, caja.body.id);
  });

  test('cerrar y abrir sigue la numeración del negocio', async () => {
    const close = await api.request('POST', libreria('/cash/close'), { token: adminB, body: { counted_cash: 100 } });
    assert.equal(close.status, 200);
    const caja = await api.request('POST', libreria('/cash/open'), { token: adminB, body: { opening_amount: 0 } });
    assert.equal(caja.body.numero, 2);
    const hist = await api.request('GET', libreria('/cash/history'), { token: adminB });
    assert.deepEqual(hist.body.map((c) => c.numero), [1]);
  });

  test('la anulación nombra la venta por su número', async () => {
    const venta = await venderUno(adminB);
    assert.equal(venta.numero, 2);
    const res = await api.request('POST', libreria(`/sales/${venta.id}/cancel`), { token: adminB });
    assert.equal(res.status, 200);
    const prod = venta.items[0].product_id;
    const movs = await api.request('GET', libreria(`/products/movements?product_id=${prod}`), { token: adminB });
    assert.equal(movs.status, 200);
    assert.ok(movs.body.some((m) => m.note === 'Anulación venta #2'), JSON.stringify(movs.body));
  });
});

describe('migración de una base con varios negocios', () => {
  test('numera las cajas y ventas que ya existían por negocio y rubro', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestion-num-'));
    const file = path.join(dir, 'app.db');
    const version = migrations.findIndex((m) => m.name === 'cajas y ventas: número por negocio');
    const old = new DatabaseSync(file);
    old.function('now_local', () => '2026-01-01 10:00:00');
    migrations.slice(0, version).forEach((m) => m.up(old));
    old.exec(`
      PRAGMA user_version = ${version};
      INSERT INTO negocios (id, nombre, created_at) VALUES (1, 'A', 'x'), (2, 'B', 'x');
      INSERT INTO users (id, negocio_id, username, password_hash, name, role) VALUES (1, 1, 'a', 'x', 'A', 'admin'), (2, 2, 'b', 'x', 'B', 'admin');
      INSERT INTO products (id, negocio_id, module, name, price, stock) VALUES (1, 2, 'kiosco', 'Alfajor', 100, 5);
      INSERT INTO cash_sessions (id, negocio_id, module, status, opened_by) VALUES
        (1, 1, 'libreria', 'cerrada', 1), (2, 2, 'kiosco', 'cerrada', 2), (3, 1, 'avicola', 'cerrada', 1), (4, 2, 'kiosco', 'abierta', 2);
      INSERT INTO sales (id, negocio_id, module, session_id, user_id, total, payment_method) VALUES
        (1, 1, 'libreria', 1, 1, 1, 'efectivo'), (2, 2, 'kiosco', 2, 2, 1, 'efectivo'), (3, 2, 'kiosco', 4, 2, 1, 'efectivo');
      INSERT INTO stock_movements (product_id, type, qty, stock_after, note, sale_id, user_id) VALUES
        (1, 'anulacion', 1, 5, 'Anulación venta #3', 3, 2), (1, 'ajuste', 1, 5, 'Recuento #3', NULL, 2);
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
      const numeros = (table) => db.prepare(`SELECT id, numero FROM ${table} ORDER BY id`).all().map((x) => [x.id, x.numero]);
      assert.deepEqual(numeros('cash_sessions'), [[1, 1], [2, 1], [3, 1], [4, 2]]);
      assert.deepEqual(numeros('sales'), [[1, 1], [2, 1], [3, 2]]);
      const notas = db.prepare('SELECT note FROM stock_movements ORDER BY id').all().map((x) => x.note);
      assert.deepEqual(notas, ['Anulación venta #2', 'Recuento #3']);
      assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.startsWith(`pre-migracion-v${version}`)));
      assert.throws(() => db.exec("UPDATE sales SET numero = 1 WHERE id = 3"), 'el número no se repite en un negocio');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
