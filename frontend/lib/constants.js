// Rubros (tipos de negocio). Los ids tienen que coincidir con MODULES de backend/src/config.js.
export const MODULES = {
  libreria: { id: 'libreria', name: 'Librería', icon: '📚', accent: '#2563eb' },
  avicola: { id: 'avicola', name: 'Avícola', icon: '🐔', accent: '#d97706' },
  almacen: { id: 'almacen', name: 'Almacén', icon: '🛒', accent: '#0f766e' },
  kiosco: { id: 'kiosco', name: 'Kiosco', icon: '🍬', accent: '#db2777' },
  verduleria: { id: 'verduleria', name: 'Verdulería', icon: '🥕', accent: '#16a34a' },
  carniceria: { id: 'carniceria', name: 'Carnicería', icon: '🥩', accent: '#b91c1c' },
  panaderia: { id: 'panaderia', name: 'Panadería', icon: '🥖', accent: '#a16207' },
  ferreteria: { id: 'ferreteria', name: 'Ferretería', icon: '🔧', accent: '#475569' },
  dietetica: { id: 'dietetica', name: 'Dietética', icon: '🌾', accent: '#65a30d' },
  petshop: { id: 'petshop', name: 'Pet shop / Forrajería', icon: '🐾', accent: '#7c3aed' },
  indumentaria: { id: 'indumentaria', name: 'Indumentaria', icon: '👕', accent: '#0891b2' },
  bazar: { id: 'bazar', name: 'Bazar / Regalería', icon: '🎁', accent: '#c2410c' },
};

// Rubros que se pueden elegir en la prueba gratis (el backend lo valida igual: TRIAL_MAX_MODULES).
export const TRIAL_MAX_MODULES = 1;

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
  // Ej.: libreria: { lines: ['Av. Siempreviva 742', 'Tel. 555-1234'] }
};

export const ESTADOS_NEGOCIO = {
  prueba: { label: 'Prueba', badge: '' },
  activo: { label: 'Activo', badge: 'ok' },
  gracia: { label: 'Vencido (en gracia)', badge: 'warn' },
  vencido: { label: 'Vencido', badge: 'danger' },
  suspendido: { label: 'Suspendido', badge: 'danger' },
};
