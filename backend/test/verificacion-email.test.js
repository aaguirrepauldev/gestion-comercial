import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { startServer } from './helpers.js';
import { outbox } from '../src/email.js';
import { db } from '../src/db.js';

let api;
let n = 0;
const registrar = (body) => {
  n += 1;
  return api.request('POST', '/auth/registro', {
    body: { negocio: `Negocio ${n}`, modules: ['libreria'], name: 'Dueño', username: `dueno${n}`, password: 'clave-segura-1', email: `dueno${n}@example.com`, ...body },
  });
};
const linkToken = (email) => /token=([\w-]+)/.exec(outbox.findLast((m) => m.to === email).text)[1];

before(async () => {
  api = await startServer();
});
after(() => api.close());

describe('verificación de email al registrarse', () => {
  test('el email es obligatorio y tiene que ser válido', async () => {
    assert.equal((await registrar({ email: '' })).status, 400);
    assert.equal((await registrar({ email: 'sin-arroba' })).status, 400);
    assert.equal((await registrar({ email: 'a@b' })).status, 400);
  });

  test('la cuenta no puede entrar hasta confirmar el email', async () => {
    const alta = await registrar({ username: 'pepe', email: 'Pepe@Example.com' });
    assert.equal(alta.status, 201);
    assert.equal(alta.body.token, undefined);
    assert.equal(alta.body.email, 'pepe@example.com');

    const login = await api.request('POST', '/auth/login', { body: { username: 'pepe', password: 'clave-segura-1' } });
    assert.equal(login.status, 403);
    assert.match(login.body.error, /confirmar tu email/);

    // Guarda el contacto con el email si no cargó otro.
    assert.equal(db.prepare("SELECT n.contacto FROM negocios n JOIN users u ON u.negocio_id = n.id WHERE u.username = 'pepe'").get().contacto, 'pepe@example.com');
  });

  test('no se puede registrar dos veces el mismo email', async () => {
    const res = await registrar({ email: 'pepe@example.com' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /esperando confirmación/);
  });

  test('reenviar manda un link nuevo y el anterior deja de valer', async () => {
    const viejo = linkToken('pepe@example.com');
    const res = await api.request('POST', '/auth/reenviar-verificacion', { body: { email: 'pepe@example.com' } });
    assert.equal(res.status, 200);
    const nuevo = linkToken('pepe@example.com');
    assert.notEqual(viejo, nuevo);
    assert.equal((await api.request('POST', '/auth/verificar-email', { body: { token: viejo } })).status, 400);

    // Para un email que no existe responde igual, sin mandar nada.
    const antes = outbox.length;
    assert.equal((await api.request('POST', '/auth/reenviar-verificacion', { body: { email: 'nadie@example.com' } })).status, 200);
    assert.equal(outbox.length, antes);
  });

  test('el link activa la cuenta, inicia la sesión y no se puede volver a usar', async () => {
    const token = linkToken('pepe@example.com');
    const res = await api.request('POST', '/auth/verificar-email', { body: { token } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'pepe');
    assert.equal((await api.request('GET', '/auth/me', { token: res.body.token })).status, 200);
    assert.equal((await api.request('POST', '/auth/verificar-email', { body: { token } })).status, 400);
    assert.equal((await api.request('POST', '/auth/login', { body: { username: 'pepe', password: 'clave-segura-1' } })).status, 200);
  });

  test('un token inventado no sirve', async () => {
    assert.equal((await api.request('POST', '/auth/verificar-email', { body: { token: 'cualquiera' } })).status, 400);
    assert.equal((await api.request('POST', '/auth/verificar-email', { body: {} })).status, 400);
  });

  test('las cuentas sin confirmar con el link vencido se borran y liberan el usuario y el email', async () => {
    const alta = await registrar({ username: 'olvidadizo', email: 'olvido@example.com' });
    assert.equal(alta.status, 201);
    db.prepare(
      "UPDATE email_verificaciones SET expira = 0 WHERE user_id = (SELECT id FROM users WHERE username = 'olvidadizo')"
    ).run();
    const negocios = db.prepare('SELECT COUNT(*) AS n FROM negocios').get().n;
    // El nuevo registro (desde la misma IP) llega al límite de 3 por hora: es el último que entra.
    const otra = await registrar({ username: 'olvidadizo', email: 'olvido@example.com' });
    assert.equal(otra.status, 201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM negocios').get().n, negocios);
  });
});

describe('límite de registros por IP', () => {
  test('después de 3 registros en una hora rechaza los siguientes', async () => {
    const res = await registrar();
    assert.equal(res.status, 429);
    assert.match(res.body.error, /Demasiados registros/);
  });
});

describe('configuración en producción', () => {
  const signupEnabled = (env) =>
    spawnSync(
      process.execPath,
      ['--input-type=module', '-e', "const c = await import('./src/config.js'); console.log(c.SIGNUP_ENABLED)"],
      { cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), ...env }, encoding: 'utf8' }
    );

  test('sin RESEND_API_KEY el registro público queda cerrado', () => {
    const r = signupEnabled({});
    assert.equal(r.stdout.trim(), 'false');
    assert.match(r.stderr, /RESEND_API_KEY/);
  });

  test('con RESEND_API_KEY queda abierto', () => {
    assert.equal(signupEnabled({ RESEND_API_KEY: 're_test' }).stdout.trim(), 'true');
  });
});
