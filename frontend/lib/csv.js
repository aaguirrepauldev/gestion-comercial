// Lectura y armado de CSV para la importación del catálogo, sin dependencias.

// Columnas del catálogo y los nombres de encabezado que aceptamos para cada una.
export const CATALOG_COLUMNS = [
  { key: 'code', header: 'codigo', aliases: ['codigo', 'cod', 'code', 'sku', 'codigo de barras', 'ean'] },
  { key: 'name', header: 'nombre', aliases: ['nombre', 'producto', 'descripcion', 'articulo', 'detalle', 'name'], required: true },
  { key: 'category', header: 'categoria', aliases: ['categoria', 'rubro', 'familia', 'category'] },
  { key: 'unit', header: 'unidad', aliases: ['unidad', 'unidad de venta', 'medida', 'unit'] },
  { key: 'cost', header: 'costo', aliases: ['costo', 'precio de costo', 'precio costo', 'cost'] },
  { key: 'price', header: 'precio', aliases: ['precio', 'precio de venta', 'precio venta', 'pvp', 'price'], required: true },
  { key: 'stock', header: 'stock', aliases: ['stock', 'stock inicial', 'cantidad', 'existencia'] },
  { key: 'min_stock', header: 'stock_minimo', aliases: ['stock minimo', 'minimo', 'stock min', 'min stock'] },
];

const normalize = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Excel en español guarda con ";" y a veces en Windows-1252: probamos UTF-8 y si falla, latin1.
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

// Parser RFC 4180: comillas, comillas escapadas ("") y saltos de línea dentro de un campo.
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Convierte el CSV en filas { line, code, name, ... } según los encabezados.
export function parseCatalog(text) {
  const [header, ...data] = parseCsv(text);
  if (!header) throw new Error('El archivo está vacío');
  const index = {};
  header.forEach((h, i) => {
    const col = CATALOG_COLUMNS.find((c) => c.aliases.includes(normalize(h)));
    if (col && index[col.key] === undefined) index[col.key] = i;
  });
  const missing = CATALOG_COLUMNS.filter((c) => c.required && index[c.key] === undefined).map((c) => c.header);
  if (missing.length) {
    throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}. Descargá la plantilla para ver el formato.`);
  }
  const rows = [];
  data.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === '')) return; // filas vacías al final del archivo
    const row = { line: i + 2 };
    for (const [key, col] of Object.entries(index)) row[key] = (cells[col] ?? '').trim();
    rows.push(row);
  });
  if (rows.length === 0) throw new Error('El archivo no tiene productos debajo de los encabezados');
  return { rows, columns: Object.keys(index) };
}

const csvField = (v) => (/[";\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// Descarga un CSV que Excel abre bien en español (";" y BOM para los acentos).
export function downloadCsv(filename, rows) {
  const text = '﻿' + rows.map((r) => r.map(csvField).join(';')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCatalogTemplate(module) {
  const examples =
    module === 'avicola'
      ? [
          ['AVI-101', 'Pollo entero', 'Pollo fresco', 'kg', '2300', '3600', '50,5', '10'],
          ['AVI-102', 'Huevos blancos maple x30', 'Huevos', 'unidad', '4200', '6000', '20', '5'],
        ]
      : [
          ['LIB-101', 'Cuaderno espiralado A4', 'Cuadernos', 'unidad', '2500', '4200', '30', '5'],
          ['LIB-102', 'Papel madera', 'Papelería', 'kg', '1800', '3000', '12,5', '2'],
        ];
  downloadCsv(`plantilla-productos-${module}.csv`, [CATALOG_COLUMNS.map((c) => c.header), ...examples]);
}
