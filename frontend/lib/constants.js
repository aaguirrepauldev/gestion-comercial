export const MODULES = {
  libreria: { id: 'libreria', name: 'Librería', icon: '📚', accent: '#2563eb' },
  avicola: { id: 'avicola', name: 'Avícola', icon: '🐔', accent: '#d97706' },
};

export const PAYMENT_METHODS = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
};

export const STOCK_MOVEMENT_TYPES = {
  inicial: 'Stock inicial',
  ingreso: 'Ingreso',
  egreso: 'Egreso / merma',
  ajuste: 'Ajuste',
  venta: 'Venta',
  anulacion: 'Anulación',
};

// Comprobante impreso (no válido como factura). El título es el nombre del negocio; `lines` agrega renglones
// fijos por rubro. widthMm es el ancho imprimible: ~72 para papel de 80 mm, ~48 para 58 mm.
export const RECEIPT = {
  widthMm: 72,
  libreria: { lines: [] },
  avicola: { lines: [] },
};

export const ESTADOS_NEGOCIO = {
  prueba: { label: 'Prueba', badge: '' },
  activo: { label: 'Activo', badge: 'ok' },
  gracia: { label: 'Vencido (en gracia)', badge: 'warn' },
  vencido: { label: 'Vencido', badge: 'danger' },
  suspendido: { label: 'Suspendido', badge: 'danger' },
};
