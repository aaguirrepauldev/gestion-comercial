import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MINUTES, SIGNUP_MAX_PER_HOUR } from './config.js';
import { HttpError } from './util.js';

// Cuenta intentos por IP en memoria: alcanza para un solo servidor y se reinicia con la API.
function createLimiter({ max, windowMinutes, message }) {
  const windowMs = windowMinutes * 60 * 1000;
  const hits = new Map(); // ip -> { count, resetAt }

  const entryFor = (ip) => {
    const entry = hits.get(ip);
    if (entry && entry.resetAt > Date.now()) return entry;
    hits.delete(ip);
    return null;
  };

  // Limpia las entradas vencidas para que el mapa no crezca indefinidamente.
  setInterval(() => {
    for (const ip of hits.keys()) entryFor(ip);
  }, windowMs).unref();

  return {
    check(ip) {
      const entry = entryFor(ip);
      if (entry && entry.count >= max) {
        const minutes = Math.ceil((entry.resetAt - Date.now()) / 60000);
        throw new HttpError(429, `${message} Probá de nuevo en ${minutes} min.`);
      }
    },
    record(ip) {
      const entry = entryFor(ip) ?? { count: 0, resetAt: Date.now() + windowMs };
      entry.count += 1;
      hits.set(ip, entry);
    },
    clear: (ip) => hits.delete(ip),
  };
}

// Logins fallidos por IP.
const login = createLimiter({
  max: LOGIN_MAX_ATTEMPTS,
  windowMinutes: LOGIN_WINDOW_MINUTES,
  message: 'Demasiados intentos fallidos.',
});
export const checkLoginAllowed = login.check;
export const recordLoginFailure = login.record;
export const clearLoginFailures = login.clear;

// Registros de negocios nuevos por IP (evita que alguien cree cientos de cuentas de prueba).
export const signupLimiter = createLimiter({
  max: SIGNUP_MAX_PER_HOUR,
  windowMinutes: 60,
  message: 'Demasiados registros desde esta conexión.',
});

// Pedidos de reenvío del email de confirmación por IP (para que no se use para llenar de mails a alguien).
export const resendLimiter = createLimiter({
  max: 5,
  windowMinutes: 60,
  message: 'Demasiados pedidos de reenvío desde esta conexión.',
});
