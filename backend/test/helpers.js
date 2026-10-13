import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Cada archivo de test corre en su propio proceso con una base nueva en una carpeta temporal.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestion-test-'));
process.env.DB_PATH = path.join(dir, 'app.db');
process.env.BACKUP_INTERVAL_HOURS = '0';

const { default: app } = await import('../src/app.js');

export async function startServer() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(method, url, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${url}`, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  async function login(username, password) {
    const res = await request('POST', '/auth/login', { body: { username, password } });
    if (res.status !== 200) throw new Error(`Login de ${username} falló: ${res.status}`);
    return res.body.token;
  }

  const close = () => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };

  return { request, login, close };
}
