import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';
import { migrations } from '../src/migrations.js';

let api, adminA, adminB, superadmin;

before(async () => {
  api = await startServer();
  adminA = await api.login('admin', 'admin123', 'demo');
  superadmin = await api.login('superadmin', 'superadmin123');
  const res = await api.request('POST', '/auth/registro', {
    body: { negocio: 'Kiosco Juan', slug: 'kiosco-juan', modules: ['kiosco'], name: 'Juan', username: 'juan', password: 'clave-juan-1' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.negocio.slug, 'kiosco-juan');
  adminB = res.body.token;
});
after(() => api.close());

const crear = (token, body) =>
  api.request('POST', '/users', { token, body: { name: 'Venta', role: 'vendedor', password: 'clave-venta-1', ...body } });

describe('usuarios únicos por negocio', () => {
  test('dos negocios pueden tener el mismo usuario', async () => {
    assert.equal((await crear(adminA, { username: 'venta', modules: ['libreria'], password: 'clave-venta-A' })).status, 201);
    assert.equal((await crear(adminB, { username: 'venta', modules: ['kiosco'], password: 'clave-venta-B' })).status, 201);
    // Hasta el nombre del admin de otro negocio.
    assert.equal((await crear(adminB, { username: 'admin', modules: ['kiosco'] })).status, 201);
  });

  test('dentro del mismo negocio no se repite', async () => {
    const res = await crear(adminA, { username: 'venta', modules: ['libreria'] });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /este negocio/);
  });

  test('cada uno entra a su negocio con el código', async () => {
    const a = await api.request('POST', '/auth/login', { body: { negocio: 'demo', username: 'venta', password: 'clave-venta-A' } });
    assert.equal(a.status, 200);
    assert.equal(a.body.user.negocio.slug, 'demo');
    const b = await api.request('POST', '/auth/login', { body: { negocio: 'Kiosco-Juan ', username: 'venta', password: 'clave-venta-B' } });
    assert.equal(b.status, 200);
    assert.equal(b.body.user.negocio.slug, 'kiosco-juan');
    // La clave de un negocio no sirve en el otro.
    const cruzada = await api.request('POST', '/auth/login', { body: { negocio: 'demo', username: 'venta', password: 'clave-venta-B' } });
    assert.equal(cruzada.status, 401);
  });

  test('sin código pide el negocio si el usuario existe en más de uno', async () => {
    const res = await api.request('POST', '/auth/login', { body: { username: 'venta', password: 'clave-venta-A' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /código de tu negocio/);
    // Si existe en uno solo, entra y la respuesta trae el código para recordarlo.
    const juan = await api.request('POST', '/auth/login', { body: { username: 'juan', password: 'clave-juan-1' } });
    assert.equal(juan.status, 200);
    assert.equal(juan.body.user.negocio.slug, 'kiosco-juan');
  });

  test('un código inexistente da un error claro', async () => {
    const res = await api.request('POST', '/auth/login', { body: { negocio: 'no-existe', username: 'venta', password: 'x' } });
    assert.equal(res.status, 404);
    assert.equal((await api.request('GET', '/auth/negocio/no-existe')).status, 404);
  });

  test('el superadmin entra sin código aunque un negocio tenga su mismo usuario de tienda', async () => {
    assert.equal((await api.request('GET', '/plataforma/negocios', { token: superadmin })).status, 200);
  });
});

describe('dirección del negocio en el registro', () => {
  test('propone una a partir del nombre y una variante si está tomada', async () => {
    const libre = await api.request('GET', `/auth/registro/direccion?nombre=${encodeURIComponent('Librería Centro')}`);
    assert.deepEqual(libre.body, { slug: 'libreria-centro', disponible: true });
    const tomada = await api.request('GET', `/auth/registro/direccion?nombre=${encodeURIComponent('Kiosco Juan')}`);
    assert.equal(tomada.body.slug, 'kiosco-juan-2');
    const elegida = await api.request('GET', '/auth/registro/direccion?slug=kiosco-juan');
    assert.equal(elegida.body.disponible, false);
    assert.equal(elegida.body.sugerencia, 'kiosco-juan-2');
  });
});

describe('el superadmin cambia el código desde Plataforma', () => {
  test('valida y el link viejo deja de andar', async () => {
    const { body: lista } = await api.request('GET', '/plataforma/negocios', { token: superadmin });
    const juan = lista.find((n) => n.slug === 'kiosco-juan');
    const put = (slug) => api.request('PUT', `/plataforma/negocios/${juan.id}`, { token: superadmin, body: { slug } });
    assert.equal((await put('demo')).status, 409);
    assert.equal((await put('plataforma')).status, 400);
    const ok = await put('kiosco-don-juan');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.slug, 'kiosco-don-juan');
    assert.equal((await api.request('GET', '/auth/negocio/kiosco-juan')).status, 404);
    assert.equal((await api.login('venta', 'clave-venta-B', 'kiosco-don-juan')).length > 0, true);
  });
});

describe('migración de una base con negocios', () => {
  test('les da un código a cada negocio y conserva usuarios, columnas e índices', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestion-mig-slug-'));
    const file = path.join(dir, 'app.db');
    const version = migrations.findIndex((m) => m.name === 'usuarios únicos por negocio y código de negocio');
    const old = new DatabaseSync(file);
    old.function('now_local', () => '2026-01-01 10:00:00');
    migrations.slice(0, version).forEach((m) => m.up(old));
    old.exec(`
      PRAGMA user_version = ${version};
      INSERT INTO negocios (id, nombre, created_at) VALUES (1, 'Librería Centro', 'x'), (2, 'Librería  centro', 'x'), (3, 'Ñandú & Cía.', 'x'), (4, 'Login', 'x');
      -- Una columna agregada por otra migración también tiene que sobrevivir la reconstrucción.
      ALTER TABLE users ADD COLUMN email TEXT;
      INSERT INTO users (negocio_id, username, password_hash, name, role, modules, email, created_at)
        VALUES (1, 'admin', 'h1', 'Admin 1', 'admin', 'libreria', 'a@x.com', 'x'), (2, 'admin2', 'h2', 'Admin 2', 'admin', 'libreria', NULL, 'x');
      INSERT INTO users (negocio_id, superadmin, username, password_hash, name, role, created_at) VALUES (NULL, 1, 'superadmin', 'h', 'S', 'admin', 'x');
      INSERT INTO cash_sessions (negocio_id, module, opened_by, opened_at, numero) VALUES (1, 'libreria', 1, 'x', 1);
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
      const slugs = db.prepare('SELECT slug FROM negocios ORDER BY id').all().map((n) => n.slug);
      assert.deepEqual(slugs, ['libreria-centro', 'libreria-centro-2', 'nandu-cia', 'login-2']);
      assert.equal(db.prepare("SELECT email FROM users WHERE username = 'admin'").get().email, 'a@x.com');
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      db.exec('PRAGMA foreign_keys = ON');
      // El mismo usuario en otro negocio ahora se puede; en el mismo, no.
      db.exec("INSERT INTO users (negocio_id, username, password_hash, name, role, created_at) VALUES (2, 'admin', 'h', 'A', 'admin', 'x')");
      assert.throws(() => db.exec("INSERT INTO users (negocio_id, username, password_hash, name, role, created_at) VALUES (1, 'admin', 'h', 'A', 'admin', 'x')"));
      assert.throws(() => db.exec("INSERT INTO users (negocio_id, superadmin, username, password_hash, name, role, created_at) VALUES (NULL, 1, 'superadmin', 'h', 'S', 'admin', 'x')"));
      // Siguen el trigger del negocio obligatorio, el índice por negocio y la caja apuntando a su usuario.
      assert.throws(() => db.exec("INSERT INTO users (username, password_hash, name, role, created_at) VALUES ('x', 'x', 'x', 'admin', 'x')"), /obligatorio/);
      assert.throws(() => db.exec("INSERT INTO negocios (nombre, created_at) VALUES ('Sin código', 'x')"), /slug/);
      const indices = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").all().map((i) => i.name);
      assert.ok(indices.includes('ix_users_negocio'));
      assert.equal(db.prepare('SELECT u.name FROM cash_sessions c JOIN users u ON u.id = c.opened_by').get().name, 'Admin 1');
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
