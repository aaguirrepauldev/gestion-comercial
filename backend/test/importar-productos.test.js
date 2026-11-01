import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import { parseDecimal } from '../src/util.js';

let api, admin, vendedor;
const libreria = (path) => `/modules/libreria${path}`;
const importar = (rows, dry_run = false, token = admin) =>
  api.request('POST', libreria('/products/import'), { token, body: { rows, dry_run } });
const productos = async () => (await api.request('GET', libreria('/products?all=1'), { token: admin })).body;

before(async () => {
  api = await startServer();
  admin = await api.login('admin', 'admin123');
  vendedor = await api.login('libreria', 'libreria123');
});
after(() => api.close());

describe('números en formato local', () => {
  test('entiende coma decimal, punto de miles y signo $', () => {
    assert.equal(parseDecimal('1.234,50'), 1234.5);
    assert.equal(parseDecimal('$ 3.500'), 3500);
    assert.equal(parseDecimal('1234,5'), 1234.5);
    assert.equal(parseDecimal('1234.50'), 1234.5);
    assert.equal(parseDecimal('1,234.50'), 1234.5);
    assert.equal(parseDecimal('0.250'), 0.25);
    assert.equal(parseDecimal('85.5'), 85.5);
    assert.throws(() => parseDecimal('abc', 'Precio'), /Precio/);
  });
});

describe('importación de catálogo por CSV', () => {
  const rows = [
    { line: 2, code: 'LIB-001', name: 'Cuaderno Rivadavia ABC 50 hojas', category: 'Cuadernos', unit: 'unidad', cost: '2.300', price: '3.900', stock: '99', min_stock: '10' },
    { line: 3, code: 'LIB-100', name: 'Marcador fluo', category: 'Escritura', unit: '', cost: '500', price: '1.200,50', stock: '24', min_stock: '' },
    { line: 4, code: '', name: 'Sobre manila', category: '', unit: 'u', cost: '', price: '300', stock: '', min_stock: '' },
    { line: 5, code: 'LIB-101', name: 'Sin precio', price: '' },
    { line: 6, code: 'LIB-100', name: 'Repetido', price: '10' },
    { line: 7, code: 'LIB-102', name: 'Papel por kilo', unit: 'litros', price: '10' },
  ];

  test('un vendedor no puede importar', async () => {
    const res = await importar(rows, true, vendedor);
    assert.equal(res.status, 403);
  });

  test('la vista previa clasifica las filas sin tocar la base', async () => {
    const before = (await productos()).length;
    const res = await importar(rows, true);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.summary, { create: 2, update: 1, error: 3 });
    const [actualiza, crea, sinCodigo, sinPrecio, repetido, unidad] = res.body.rows;
    assert.equal(actualiza.action, 'update');
    assert.equal(actualiza.stockIgnored, true);
    assert.equal(crea.action, 'create');
    assert.equal(crea.price, 1200.5);
    assert.equal(sinCodigo.action, 'create');
    assert.match(sinPrecio.error, /Precio/);
    assert.match(repetido.error, /repetido/);
    assert.match(unidad.error, /Unidad/);
    assert.equal(unidad.line, 7);
    assert.equal((await productos()).length, before);
  });

  test('importa las filas válidas: crea con stock inicial y actualiza sin tocar el stock', async () => {
    const res = await importar(rows);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.summary, { create: 2, update: 1, error: 3 });

    const all = await productos();
    const cuaderno = all.find((p) => p.code === 'LIB-001');
    assert.equal(cuaderno.price, 3900);
    assert.equal(cuaderno.cost, 2300);
    assert.equal(cuaderno.stock, 40, 'el stock de un producto existente no cambia');
    const marcador = all.find((p) => p.code === 'LIB-100');
    assert.equal(marcador.stock, 24);
    assert.equal(marcador.unit, 'unidad');
    assert.ok(all.find((p) => p.name === 'Sobre manila'));
    assert.ok(!all.find((p) => p.code === 'LIB-101'));

    const movs = (await api.request('GET', libreria(`/products/movements?product_id=${marcador.id}`), { token: admin })).body;
    assert.equal(movs.length, 1);
    assert.equal(movs[0].type, 'inicial');
  });

  test('reimportar el mismo archivo no duplica productos (busca por código o por nombre)', async () => {
    const before = (await productos()).length;
    const res = await importar(rows);
    assert.deepEqual(res.body.summary, { create: 0, update: 3, error: 3 });
    assert.equal((await productos()).length, before);
  });

  test('rechaza un archivo vacío', async () => {
    const res = await importar([]);
    assert.equal(res.status, 400);
  });
});
