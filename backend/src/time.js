import { TIME_ZONE } from './config.js';

// Las fechas se guardan como 'YYYY-MM-DD HH:MM:SS' en la hora del negocio (TIME_ZONE),
// no en la del servidor: así "hoy" es el mismo día aunque la API corra en la nube en UTC.
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function nowLocal(date = new Date()) {
  const p = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// Fecha y hora apta para nombres de archivo: 2026-10-13_18-05-00
export const fileStamp = (date = new Date()) => nowLocal(date).replace(' ', '_').replaceAll(':', '-');

export const todayLocal = (date = new Date()) => nowLocal(date).slice(0, 10);

// Suma (o resta) días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria del servidor.
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Días entre dos fechas 'YYYY-MM-DD' (b - a).
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// Suma meses a 'YYYY-MM-DD'; si el día no existe en el mes destino queda el último (31/01 + 1 mes = 28/02).
export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
