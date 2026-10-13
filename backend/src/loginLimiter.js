import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MINUTES } from './config.js';
import { HttpError } from './util.js';

// Cuenta los logins fallidos por IP en memoria: alcanza para un solo servidor y se reinicia con la API.
const windowMs = LOGIN_WINDOW_MINUTES * 60 * 1000;
const failures = new Map(); // ip -> { count, resetAt }

function entryFor(ip) {
  const entry = failures.get(ip);
  if (entry && entry.resetAt > Date.now()) return entry;
  failures.delete(ip);
  return null;
}

export function checkLoginAllowed(ip) {
  const entry = entryFor(ip);
  if (entry && entry.count >= LOGIN_MAX_ATTEMPTS) {
    const minutes = Math.ceil((entry.resetAt - Date.now()) / 60000);
    throw new HttpError(429, `Demasiados intentos fallidos. Probá de nuevo en ${minutes} min.`);
  }
}

export function recordLoginFailure(ip) {
  const entry = entryFor(ip) ?? { count: 0, resetAt: Date.now() + windowMs };
  entry.count += 1;
  failures.set(ip, entry);
}

export const clearLoginFailures = (ip) => failures.delete(ip);

// Limpia las entradas vencidas para que el mapa no crezca indefinidamente.
setInterval(() => {
  for (const ip of failures.keys()) entryFor(ip);
}, windowMs).unref();
