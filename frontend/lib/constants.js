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

// Encabezado del comprobante impreso (no válido como factura). Editá nombre y líneas de cada negocio
// (dirección, teléfono, CUIT…). widthMm es el ancho imprimible: ~72 para papel de 80 mm, ~48 para 58 mm.
export const RECEIPT = {
  widthMm: 72,
  libreria: { name: 'Librería', lines: [] },
  avicola: { name: 'Avícola', lines: [] },
};
