import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

// Productos de los datos de ejemplo
const POLLO = 11; // avícola, kg, $3600/kg, stock 85.5
const PECHUGA = 12; // avícola, kg, $7200/kg
const HUEVOS = 17; // avícola, unidad, $6000, stock 40
const CUADERNO = 1; // librería, unidad

let api, admin, vendedor;
const avicola = (path) => `/modules/avicola${path}`;
const getProduct = async (id) =>
  (await api.request('GET', avicola('/products?all=1'), { token: admin })).body.find((p) => p.id === id);

before(async () => {
  api = await startServer();
  admin = await api.login('admin', 'admin123');
  vendedor = await api.login('avicola', 'avicola123');
});
after(() => api.close());

describe('login y permisos', () => {
  test('rechaza una contraseña incorrecta', async () => {
    const res = await api.request('POST', '/auth/login', { body: { username: 'admin', password: 'mala' } });
    assert.equal(res.status, 401);
  });

  test('un vendedor no entra a un módulo que no tiene asignado', async () => {
    const res = await api.request('GET', '/modules/libreria/products', { token: vendedor });
    assert.equal(res.status, 403);
  });

  test('sin token no hay acceso', async () => {
    const res = await api.request('GET', avicola('/products'));
    assert.equal(res.status, 401);
  });
});

describe('flujo de caja y ventas', () => {
  let saleId;

  test('no se puede vender con la caja cerrada', async () => {
    const res = await api.request('POST', avicola('/sales'), {
      token: vendedor,
      body: { payment_method: 'efectivo', items: [{ product_id: HUEVOS, qty: 1 }] },
    });
    assert.equal(res.status, 409);
  });

  test('abre la caja con monto inicial', async () => {
    const res = await api.request('POST', avicola('/cash/open'), { token: vendedor, body: { opening_amount: 1000 } });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'abierta');
    assert.equal(res.body.expected_cash, 1000);

    const again = await api.request('POST', avicola('/cash/open'), { token: vendedor, body: { opening_amount: 0 } });
    assert.equal(again.status, 409, 'solo una caja abierta por módulo');
  });

  test('vende por kg y por unidad, calcula el total y descuenta stock', async () => {
    const res = await api.request('POST', avicola('/sales'), {
      token: vendedor,
      body: {
        payment_method: 'efectivo',
        items: [
          { product_id: POLLO, qty: 1.255 },
          { product_id: HUEVOS, qty: 2 },
        ],
      },
    });
    assert.equal(res.status, 201);
    saleId = res.body.id;
    // 1,255 kg × $3600 = $4518 + 2 × $6000 = $12000
    assert.equal(res.body.total, 16518);
    assert.equal(res.body.items.length, 2);

    assert.equal((await getProduct(POLLO)).stock, 84.245);
    assert.equal((await getProduct(HUEVOS)).stock, 38);
  });

  test('registra la venta en el historial de stock', async () => {
    const res = await api.request('GET', avicola(`/products/movements?product_id=${POLLO}`), { token: admin });
    const venta = res.body.find((m) => m.sale_id === saleId);
    assert.equal(venta.type, 'venta');
    assert.equal(venta.qty, -1.255);
    assert.equal(venta.stock_after, 84.245);
  });

  test('agrupa líneas repetidas del mismo producto', async () => {
    const res = await api.request('POST', avicola('/sales'), {
      token: vendedor,
      body: {
        payment_method: 'debito',
        items: [
          { product_id: PECHUGA, qty: 0.5 },
          { product_id: PECHUGA, qty: 0.25 },
        ],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].qty, 0.75);
    assert.equal(res.body.total, 5400);
  });

  test('rechaza cantidades inválidas y stock insuficiente', async () => {
    const sell = (items) =>
      api.request('POST', avicola('/sales'), { token: vendedor, body: { payment_method: 'efectivo', items } });

    assert.equal((await sell([{ product_id: HUEVOS, qty: 1.5 }])).status, 400, 'unidad con decimales');
    assert.equal((await sell([{ product_id: POLLO, qty: 0 }])).status, 400, 'cantidad cero');
    assert.equal((await sell([{ product_id: HUEVOS, qty: 1000 }])).status, 409, 'más que el stock');
    assert.equal((await sell([{ product_id: CUADERNO, qty: 1 }])).status, 404, 'producto de otro módulo');
    assert.equal((await getProduct(HUEVOS)).stock, 38, 'una venta rechazada no toca el stock');
  });

  test('solo un admin puede anular, y la anulación repone el stock', async () => {
    const denied = await api.request('POST', avicola(`/sales/${saleId}/cancel`), { token: vendedor });
    assert.equal(denied.status, 403);

    const res = await api.request('POST', avicola(`/sales/${saleId}/cancel`), { token: admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'anulada');
    assert.equal((await getProduct(POLLO)).stock, 85.5);
    assert.equal((await getProduct(HUEVOS)).stock, 40);

    const again = await api.request('POST', avicola(`/sales/${saleId}/cancel`), { token: admin });
    assert.equal(again.status, 409, 'no se anula dos veces');
  });

  test('ingresos y retiros de efectivo', async () => {
    const ingreso = await api.request('POST', avicola('/cash/movements'), {
      token: vendedor,
      body: { type: 'ingreso', amount: 500, description: 'cambio' },
    });
    assert.equal(ingreso.status, 201);

    const excesivo = await api.request('POST', avicola('/cash/movements'), {
      token: vendedor,
      body: { type: 'egreso', amount: 100000, description: 'retiro' },
    });
    assert.equal(excesivo.status, 400, 'no se retira más efectivo del que hay');

    const egreso = await api.request('POST', avicola('/cash/movements'), {
      token: vendedor,
      body: { type: 'egreso', amount: 200, description: 'pago a proveedor' },
    });
    assert.equal(egreso.status, 201);
  });

  test('una venta en efectivo suma al efectivo esperado; las otras no', async () => {
    const res = await api.request('POST', avicola('/sales'), {
      token: vendedor,
      body: { payment_method: 'efectivo', items: [{ product_id: HUEVOS, qty: 1 }] },
    });
    assert.equal(res.status, 201);

    const { body: caja } = await api.request('GET', avicola('/cash/current'), { token: vendedor });
    // 1000 inicial + 6000 en efectivo + 500 ingreso − 200 egreso (la venta anulada y la de débito no cuentan)
    assert.equal(caja.expected_cash, 7300);
    assert.equal(caja.sales_count, 2);
    assert.equal(caja.sales_total, 11400);
    assert.equal(caja.cancelled_count, 1);
  });

  test('cierra la caja y calcula la diferencia', async () => {
    const res = await api.request('POST', avicola('/cash/close'), {
      token: vendedor,
      body: { counted_cash: 7250, notes: 'faltante' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'cerrada');
    assert.equal(res.body.expected_cash, 7300);
    assert.equal(res.body.difference, -50);

    const { body: history } = await api.request('GET', avicola('/cash/history'), { token: vendedor });
    assert.equal(history[0].id, res.body.id);
  });

  test('con la caja cerrada no se vende ni se anula', async () => {
    const venta = await api.request('POST', avicola('/sales'), {
      token: vendedor,
      body: { payment_method: 'efectivo', items: [{ product_id: HUEVOS, qty: 1 }] },
    });
    assert.equal(venta.status, 409);

    const { body: ventas } = await api.request('GET', avicola('/sales'), { token: admin });
    const completada = ventas.find((s) => s.status === 'completada');
    const anular = await api.request('POST', avicola(`/sales/${completada.id}/cancel`), { token: admin });
    assert.equal(anular.status, 409);
  });
});

describe('movimientos de stock', () => {
  test('ingreso suma, egreso no puede dejar stock negativo y pide motivo', async () => {
    const move = (body, token = vendedor) =>
      api.request('POST', avicola(`/products/${PECHUGA}/stock`), { token, body });
    const inicial = (await getProduct(PECHUGA)).stock;

    assert.equal((await move({ type: 'ingreso', qty: 10 })).body.stock, inicial + 10);
    assert.equal((await move({ type: 'egreso', qty: 1000, note: 'merma' })).status, 400);
    assert.equal((await move({ type: 'egreso', qty: 1 })).status, 400, 'sin motivo');
    assert.equal((await move({ type: 'egreso', qty: 1, note: 'merma' })).body.stock, inicial + 9);
  });

  test('solo un admin puede ajustar el stock por recuento', async () => {
    const body = { type: 'ajuste', qty: 20, note: 'recuento' };
    const denied = await api.request('POST', avicola(`/products/${PECHUGA}/stock`), { token: vendedor, body });
    assert.equal(denied.status, 403);

    const res = await api.request('POST', avicola(`/products/${PECHUGA}/stock`), { token: admin, body });
    assert.equal(res.status, 200);
    assert.equal(res.body.stock, 20);
  });
});
