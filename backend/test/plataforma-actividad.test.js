import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let api, superadmin;

before(async () => {
  api = await startServer();
  superadmin = await api.login('superadmin', 'superadmin123');
});
after(() => api.close());

const negocio = async (id) =>
  (await api.request('GET', '/plataforma/negocios', { token: superadmin })).body.find((n) => n.id === id);

test('actividad de cada negocio: último ingreso, ventas de 7 días, productos y usuarios', async () => {
  const reg = await api.request('POST', '/auth/registro', {
    body: { negocio: 'Kiosco Sur', modules: ['kiosco'], name: 'Ana', username: 'ana', password: 'clave-ana-1' },
  });
  const nuevo = await negocio(reg.body.user.negocio.id);
  // Registrarse ya cuenta como ingreso.
  assert.ok(nuevo.ultimo_ingreso);
  assert.equal(nuevo.ventas_7d, 0);
  assert.equal(nuevo.total_7d, 0);
  assert.equal(nuevo.usuarios, 1);
  assert.equal(nuevo.estado, 'prueba');
  assert.ok(nuevo.dias_restantes <= 14);

  const antes = await negocio(1);
  const vendedor = await api.login('avicola', 'avicola123');
  const avicola = (path) => `/modules/avicola${path}`;
  await api.request('POST', avicola('/cash/open'), { token: vendedor, body: { opening_amount: 0 } });
  const venta = await api.request('POST', avicola('/sales'), {
    token: vendedor,
    body: { payment_method: 'efectivo', items: [{ product_id: 17, qty: 1 }] },
  });
  assert.equal(venta.status, 201);

  const despues = await negocio(1);
  assert.ok(despues.ultimo_ingreso);
  assert.equal(despues.ventas_7d, antes.ventas_7d + 1);
  assert.equal(despues.total_7d, antes.total_7d + venta.body.total);
  assert.ok(despues.productos > 0);
});

test('el superadmin cambia su contraseña sabiendo la actual y queda guardada', async () => {
  const mal = await api.request('PUT', '/auth/password', { token: superadmin, body: { actual: 'otra', nueva: 'nueva-clave-sa' } });
  assert.equal(mal.status, 400);
  const ok = await api.request('PUT', '/auth/password', {
    token: superadmin,
    body: { actual: 'superadmin123', nueva: 'nueva-clave-sa' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.superadmin, true);
  assert.equal((await api.request('GET', '/auth/me', { token: superadmin })).status, 401);
  assert.equal((await api.request('POST', '/auth/login', { body: { username: 'superadmin', password: 'superadmin123' } })).status, 401);
  superadmin = await api.login('superadmin', 'nueva-clave-sa');
  // La ruta vieja, que no pedía la contraseña actual, ya no existe.
  assert.equal((await api.request('PUT', '/plataforma/password', { token: superadmin, body: { password: 'x-12345678' } })).status, 404);
});
