export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function toNumber(value, label) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n)) {
    throw new HttpError(400, `${label}: valor inválido`);
  }
  return n;
}

// Productos por unidad solo admiten cantidades enteras; los de kg hasta 3 decimales.
export function normalizeQty(unit, value, { allowZero = false } = {}) {
  const qty = unit === 'kg' ? round3(toNumber(value, 'Cantidad')) : toNumber(value, 'Cantidad');
  if (allowZero ? qty < 0 : qty <= 0) throw new HttpError(400, 'La cantidad debe ser mayor a cero');
  if (unit === 'unidad' && !Number.isInteger(qty)) {
    throw new HttpError(400, 'Los productos por unidad requieren cantidades enteras');
  }
  return qty;
}

// Números como vienen de una planilla argentina: "$ 1.234,50", "1234,5", "1234.50" o "1.500" (mil quinientos).
export function parseDecimal(value, label) {
  if (typeof value === 'number') return toNumber(value, label);
  let s = String(value ?? '').replace(/[$\s]/g, '');
  if (s === '') return toNumber(s, label);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // El separador que aparece último es el decimal; el otro es de miles.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    s = /^-?\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  return toNumber(s, label);
}
