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

// 'YYYY-MM-DD' → '25/11/2026'
export const day = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');

// 'YYYY-MM-DD HH:MM:SS' → 'hoy', 'ayer', 'hace 5 días'
export function ago(s) {
  if (!s) return 'nunca';
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start(new Date()) - start(toDate(s))) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}
