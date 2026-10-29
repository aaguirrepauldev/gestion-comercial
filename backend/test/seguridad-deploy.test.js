import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers.js';

let api, admin, vendedor;
before(async () => {
  api = await startServer();
  admin = await api.login('admin', 'admin123');
  vendedor = await api.login('avicola', 'avicola123');
});
after(() => api.close());

describe('costo de los productos', () => {
  test('el admin ve el costo', async () => {
    const { body } = await api.request('GET', '/modules/avicola/products', { token: admin });
    assert.ok(body.every((p) => typeof p.cost === 'number'));
    const dash = await api.request('GET', '/modules/avicola/dashboard', { token: admin });
    assert.equal(typeof dash.body.inventory.cost_value, 'number');
  });

  test('el vendedor no ve el costo ni el inventario a costo', async () => {
    const { body } = await api.request('GET', '/modules/avicola/products', { token: vendedor });
    assert.ok(body.length > 0);
    assert.ok(body.every((p) => !('cost' in p)));
    const dash = await api.request('GET', '/modules/avicola/dashboard', { token: vendedor });
    assert.equal(dash.body.inventory.cost_value, undefined);
    assert.equal(typeof dash.body.inventory.retail_value, 'number');
  });
});

describe('contraseñas y sesiones', () => {
  const VENDEDOR_ID = 3; // avicola en los datos de ejemplo

  test('exige al menos 8 caracteres', async () => {
    const res = await api.request('PUT', `/users/${VENDEDOR_ID}`, { token: admin, body: { password: 'corta12' } });
    assert.equal(res.status, 400);
  });

  test('cambiar la contraseña cierra las sesiones anteriores', async () => {
    const res = await api.request('PUT', `/users/${VENDEDOR_ID}`, { token: admin, body: { password: 'nueva-clave-1' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.token, undefined, 'solo recibe token quien cambia su propia contraseña');

    const viejo = await api.request('GET', '/auth/me', { token: vendedor });
    assert.equal(viejo.status, 401);
    const nuevo = await api.login('avicola', 'nueva-clave-1');
    assert.equal((await api.request('GET', '/auth/me', { token: nuevo })).status, 200);
  });

  test('el admin que cambia su propia contraseña recibe un token nuevo', async () => {
    const res = await api.request('PUT', '/users/1', { token: admin, body: { password: 'admin-nueva-1' } });
    assert.equal(res.status, 200);
    assert.equal((await api.request('GET', '/auth/me', { token: admin })).status, 401);
    admin = res.body.token;
    assert.equal((await api.request('GET', '/auth/me', { token: admin })).status, 200);
  });
});

describe('copia de la base', () => {
  test('el admin la descarga', async () => {
    const res = await api.raw('GET', '/backup', { token: admin });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /gestion-comercial-.*\.db/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 15)), 'SQLite format 3');
  });

  test('un vendedor no', async () => {
    const vendedor2 = await api.login('libreria', 'libreria123');
    assert.equal((await api.raw('GET', '/backup', { token: vendedor2 })).status, 403);
  });
});

// Importa la configuración en un proceso aparte con las variables dadas.
const startWith = (platformEnv) => (env) =>
  spawnSync(process.execPath, ['-e', "await import('./src/config.js')", '--input-type=module'], {
    cwd: new URL('..', import.meta.url),
    env: { PATH: process.env.PATH, ...platformEnv, ...env },
    encoding: 'utf8',
  });

describe('arranque en Railway', () => {
  const start = startWith({ RAILWAY_PROJECT_ID: 'x' });
  const prod = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) };

  test('no arranca sin NODE_ENV=production', () => {
    const r = start({ RAILWAY_VOLUME_MOUNT_PATH: '/data' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /NODE_ENV=production/);
  });

  test('no arranca sin volumen', () => {
    const r = start(prod);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /volumen/);
  });

  test('no arranca con la base fuera del volumen', () => {
    const r = start({ ...prod, RAILWAY_VOLUME_MOUNT_PATH: '/data', DB_PATH: '/app/app.db' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /dentro del volumen/);
  });

  test('arranca con NODE_ENV y volumen', () => {
    const r = start({ ...prod, RAILWAY_VOLUME_MOUNT_PATH: '/data' });
    assert.equal(r.status, 0, r.stderr);
  });
});

describe('arranque en Render', () => {
  const start = startWith({ RENDER: 'true' });
  const prod = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) };
  const disk = os.tmpdir();

  test('no arranca sin NODE_ENV=production', () => {
    const r = start({ VOLUME_PATH: disk });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /NODE_ENV=production/);
  });

  test('no arranca sin VOLUME_PATH', () => {
    const r = start(prod);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /volumen/);
  });

  test('no arranca si el disco no está montado', () => {
    const r = start({ ...prod, VOLUME_PATH: path.join(disk, 'no-existe-' + process.pid) });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no está montado/);
  });

  test('arranca con NODE_ENV y disco', () => {
    const r = start({ ...prod, VOLUME_PATH: disk });
    assert.equal(r.status, 0, r.stderr);
  });
});
