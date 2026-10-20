// En producción la web la sirve la misma API, así que alcanza con una ruta relativa.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
const TOKEN_KEY = 'gc_token';

export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY));
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }
  if (!res.ok) await fail(path, res);
  return res;
}

async function fail(path, res) {
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/auth/login') {
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
  }
  const err = new Error(data?.error ?? `Error ${res.status}`);
  err.status = res.status;
  throw err;
}

export async function api(path, options) {
  const res = await request(path, options);
  return res.json().catch(() => null);
}

// Descarga un archivo de la API (con la sesión) usando el nombre que manda el servidor.
export async function download(path) {
  const res = await request(path);
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'descarga';
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export const moduleApi = (module, path, options) => api(`/modules/${module}${path}`, options);
