const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export const money = (n) => currency.format(n ?? 0);

export function qty(n, unit) {
  if (unit === 'kg') return `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg`;
  return `${Number(n).toLocaleString('es-AR')} u.`;
}

// SQLite devuelve 'YYYY-MM-DD HH:MM:SS' en hora local
const toDate = (s) => new Date(s.replace(' ', 'T'));
export const dateTime = (s) => (s ? toDate(s).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const time = (s) => (s ? toDate(s).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const shortDay = (day) =>
  toDate(`${day} 00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
