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

export const todayLocal = (date = new Date()) => nowLocal(date).slice(0, 10);

// Suma (o resta) días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria del servidor.
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
