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
