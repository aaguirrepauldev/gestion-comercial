import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let api, superadmin, adminA, negocioB;

before(async () => {
  api = await startServer();
  superadmin = await api.login('superadmin', 'superadmin123');
  adminA = await api.login('admin', 'admin123');
  const res = await api.request('POST', '/auth/registro', {
    body: { negocio: 'Kiosco Norte', modules: ['kiosco'], name: 'Beto', username: 'beto', password: 'clave-beto-1' },
  });
  negocioB = res.body.user.negocio.id;
});
after(() => api.close());

test('el superadmin ve los usuarios de cada negocio, sin datos sensibles', async () => {
  const res = await api.request('GET', `/plataforma/negocios/${negocioB}/usuarios`, { token: superadmin });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].username, 'beto');
  assert.equal(res.body[0].role, 'admin');
  assert.equal(res.body[0].active, true);
  assert.equal(res.body[0].password_hash, undefined);

  const uno = await api.request('GET', '/plataforma/negocios/1/usuarios', { token: superadmin });
  assert.ok(uno.body.some((u) => u.username === 'admin'));
  assert.ok(!uno.body.some((u) => u.username === 'beto'));
});

test('solo el superadmin puede listar y blanquear', async () => {
  assert.equal((await api.request('GET', `/plataforma/negocios/${negocioB}/usuarios`, { token: adminA })).status, 403);
  const list = await api.request('GET', `/plataforma/negocios/${negocioB}/usuarios`, { token: superadmin });
  const url = `/plataforma/negocios/${negocioB}/usuarios/${list.body[0].id}/blanquear`;
  assert.equal((await api.request('POST', url, { token: adminA })).status, 403);
  // El usuario tiene que pertenecer al negocio indicado.
  assert.equal((await api.request('POST', `/plataforma/negocios/1/usuarios/${list.body[0].id}/blanquear`, { token: superadmin })).status, 404);
});

test('blanquear: clave temporal, sesiones cerradas y cambio obligatorio al entrar', async () => {
  const viejo = await api.login('beto', 'clave-beto-1');
  const list = await api.request('GET', `/plataforma/negocios/${negocioB}/usuarios`, { token: superadmin });
  const res = await api.request('POST', `/plataforma/negocios/${negocioB}/usuarios/${list.body[0].id}/blanquear`, {
    token: superadmin,
  });
  assert.equal(res.status, 200);
  const temporal = res.body.password;
  assert.ok(temporal.length >= 8);

  // La sesión vieja y la contraseña vieja dejan de valer.
  assert.equal((await api.request('GET', '/auth/me', { token: viejo })).status, 401);
  assert.equal((await api.request('POST', '/auth/login', { body: { username: 'beto', password: 'clave-beto-1' } })).status, 401);

  const login = await api.request('POST', '/auth/login', { body: { username: 'beto', password: temporal } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.debe_cambiar_clave, true);
  const tmp = login.body.token;
  const lista = await api.request('GET', `/plataforma/negocios/${negocioB}/usuarios`, { token: superadmin });
  assert.equal(lista.body[0].debe_cambiar_clave, true);

  // Con la clave temporal no se puede usar la app, solo cambiarla.
  assert.equal((await api.request('GET', '/modules/kiosco/products', { token: tmp })).status, 403);
  assert.equal((await api.request('GET', '/users', { token: tmp })).status, 403);
  assert.equal((await api.request('GET', '/auth/me', { token: tmp })).status, 200);

  const mal = await api.request('PUT', '/auth/password', { token: tmp, body: { actual: 'otra-cosa', nueva: 'nueva-clave-1' } });
  assert.equal(mal.status, 400);
  const igual = await api.request('PUT', '/auth/password', { token: tmp, body: { actual: temporal, nueva: temporal } });
  assert.equal(igual.status, 400);

  const ok = await api.request('PUT', '/auth/password', { token: tmp, body: { actual: temporal, nueva: 'nueva-clave-1' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.debe_cambiar_clave, false);
  assert.equal((await api.request('GET', '/modules/kiosco/products', { token: ok.body.token })).status, 200);
  assert.equal((await api.request('GET', '/auth/me', { token: tmp })).status, 401);
  await api.login('beto', 'nueva-clave-1');
});
