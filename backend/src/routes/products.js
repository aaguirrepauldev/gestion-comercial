import { Router } from 'express';
import { db, recordStockMovement, tx } from '../db.js';
import { requireAdmin } from '../auth.js';
import { HttpError, normalizeQty, parseDecimal, round2, round3, toNumber } from '../util.js';

const router = Router({ mergeParams: true });

function getProduct(module, id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND module = ?').get(Number(id), module);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  return p;
}

// El costo (y con él el margen) solo lo ven los administradores.
const forRole = (user, product) => {
  if (user.role === 'admin') return product;
  const { cost: _cost, ...rest } = product;
  return rest;
};

function parseProduct(body) {
  const name = String(body.name ?? '').trim();
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  const price = round2(toNumber(body.price, 'Precio'));
  const cost = round2(toNumber(body.cost ?? 0, 'Costo'));
  const minStock = toNumber(body.min_stock ?? 0, 'Stock mínimo');
  if (price < 0 || cost < 0 || minStock < 0) throw new HttpError(400, 'Los valores no pueden ser negativos');
  return {
    code: String(body.code ?? '').trim() || null,
    name,
    category: String(body.category ?? '').trim() || null,
    unit: body.unit === 'kg' ? 'kg' : 'unidad',
    cost,
    price,
    min_stock: minStock,
  };
}

router.get('/', (req, res) => {
  const { q, low, all } = req.query;
  let sql = 'SELECT * FROM products WHERE module = ?';
  const args = [req.params.module];
  if (!all) sql += ' AND active = 1';
  if (q) {
    sql += ' AND (name LIKE ? OR code LIKE ? OR category LIKE ?)';
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (low) sql += ' AND stock <= min_stock';
  res.json(db.prepare(`${sql} ORDER BY name`).all(...args).map((p) => forRole(req.user, p)));
});

router.get('/movements', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const args = [req.params.module];
  let filter = '';
  if (req.query.product_id) {
    filter = ' AND m.product_id = ?';
    args.push(Number(req.query.product_id));
  }
  res.json(
    db
      .prepare(
        `SELECT m.*, p.name AS product_name, p.unit, u.name AS user_name
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         JOIN users u ON u.id = m.user_id
         WHERE p.module = ?${filter}
         ORDER BY m.id DESC LIMIT ${limit}`
      )
      .all(...args)
  );
});

router.post('/', requireAdmin, (req, res) => {
  const { module } = req.params;
  const p = parseProduct(req.body ?? {});
  const initialStock = req.body?.stock ? normalizeQty(p.unit, req.body.stock) : 0;

  const id = tx(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO products (module, code, name, category, unit, cost, price, stock, min_stock, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now_local())`
        )
        .run(module, p.code, p.name, p.category, p.unit, p.cost, p.price, initialStock, p.min_stock).lastInsertRowid
    );
    if (initialStock > 0) {
      recordStockMovement({ productId: id, type: 'inicial', qty: initialStock, stockAfter: initialStock, userId: req.user.id });
    }
    return id;
  });
  res.status(201).json(getProduct(module, id));
});

const MAX_IMPORT_ROWS = 5000;

function parseUnit(value) {
  const u = String(value ?? '').trim().toLowerCase().replace(/^por\s+/, '').replace(/\.$/, '');
  if (['', 'u', 'un', 'uni', 'unid', 'unidad', 'unidades'].includes(u)) return 'unidad';
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u)) return 'kg';
  throw new HttpError(400, `Unidad "${value}" inválida (usá "unidad" o "kg")`);
}

// Una fila del CSV (todo texto) a los campos de un producto, con números en formato local.
function parseImportRow(row) {
  const unit = parseUnit(row.unit);
  const num = (value, label) => (String(value ?? '').trim() === '' ? undefined : parseDecimal(value, label));
  const product = parseProduct({
    code: row.code,
    name: row.name,
    category: row.category,
    unit,
    price: num(row.price, 'Precio') ?? '',
    cost: num(row.cost, 'Costo') ?? 0,
    min_stock: num(row.min_stock, 'Stock mínimo') ?? 0,
  });
  const stock = num(row.stock, 'Stock');
  return { product, stock: stock === undefined || stock === 0 ? 0 : normalizeQty(unit, stock) };
}

// Carga masiva del catálogo desde un CSV ya leído en el navegador.
// Con dry_run solo devuelve qué pasaría con cada fila; sin él aplica las filas válidas en una transacción.
// Los productos se buscan por código (o por nombre si la fila no trae código): si existen se actualizan
// sus datos, pero el stock no se toca (para eso están los movimientos); si no, se crean con su stock inicial.
router.post('/import', requireAdmin, (req, res) => {
  const { module } = req.params;
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'El archivo no tiene filas para importar');
  if (rows.length > MAX_IMPORT_ROWS) throw new HttpError(400, `Máximo ${MAX_IMPORT_ROWS} productos por archivo`);
  const dryRun = Boolean(req.body.dry_run);

  const byCode = new Map();
  const byName = new Map();
  for (const p of db.prepare('SELECT id, code, name, stock FROM products WHERE module = ?').all(module)) {
    if (p.code) byCode.set(p.code.toLowerCase(), p);
    const key = p.name.trim().toLowerCase();
    byName.set(key, byName.has(key) ? null : p); // null = nombre repetido, no se puede usar para identificar
  }

  const seen = new Set();
  const results = rows.map((row, i) => {
    const line = Number(row?.line) || i + 2;
    try {
      const { product, stock } = parseImportRow(row ?? {});
      const key = product.code ? `c:${product.code.toLowerCase()}` : `n:${product.name.toLowerCase()}`;
      if (seen.has(key)) {
        throw new HttpError(400, product.code ? `Código ${product.code} repetido en el archivo` : 'Producto repetido en el archivo');
      }
      seen.add(key);
      const existing = product.code ? byCode.get(product.code.toLowerCase()) : byName.get(product.name.toLowerCase());
      if (!product.code && existing === null) {
        throw new HttpError(400, 'Hay varios productos con ese nombre; agregale el código para identificarlo');
      }
      if (existing && product.unit === 'unidad' && !Number.isInteger(existing.stock)) {
        throw new HttpError(400, 'No se puede pasar a "unidad" un producto con stock fraccionado');
      }
      if (existing && !product.code && existing.code) product.code = existing.code;
      return { line, action: existing ? 'update' : 'create', id: existing?.id, product, stock, stockIgnored: Boolean(existing && stock) };
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      return { line, action: 'error', error: err.message, name: String(row?.name ?? '').trim(), code: String(row?.code ?? '').trim() };
    }
  });

  if (!dryRun) {
    const insert = db.prepare(
      `INSERT INTO products (module, code, name, category, unit, cost, price, stock, min_stock, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now_local())`
    );
    const update = db.prepare(
      'UPDATE products SET code = ?, name = ?, category = ?, unit = ?, cost = ?, price = ?, min_stock = ? WHERE id = ?'
    );
    tx(() => {
      for (const r of results) {
        const p = r.product;
        if (r.action === 'create') {
          r.id = Number(
            insert.run(module, p.code, p.name, p.category, p.unit, p.cost, p.price, r.stock, p.min_stock).lastInsertRowid
          );
          if (r.stock > 0) {
            recordStockMovement({ productId: r.id, type: 'inicial', qty: r.stock, stockAfter: r.stock, note: 'Importación CSV', userId: req.user.id });
          }
        } else if (r.action === 'update') {
          update.run(p.code, p.name, p.category, p.unit, p.cost, p.price, p.min_stock, r.id);
        }
      }
    });
  }

  const count = (action) => results.filter((r) => r.action === action).length;
  res.status(dryRun ? 200 : 201).json({
    dry_run: dryRun,
    summary: { create: count('create'), update: count('update'), error: count('error') },
    rows: results.map(({ product, ...r }) => ({ ...product, ...r })),
  });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { module, id } = req.params;
  const current = getProduct(module, id);
  const p = parseProduct({ ...current, ...req.body });
  if (p.unit !== current.unit && current.unit === 'kg' && !Number.isInteger(current.stock)) {
    throw new HttpError(400, 'No se puede pasar a "unidad" un producto con stock fraccionado');
  }
  const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : current.active;
  db.prepare(
    `UPDATE products SET code = ?, name = ?, category = ?, unit = ?, cost = ?, price = ?, min_stock = ?, active = ?
     WHERE id = ?`
  ).run(p.code, p.name, p.category, p.unit, p.cost, p.price, p.min_stock, active, current.id);
  res.json(getProduct(module, id));
});

// Ingreso de mercadería, egreso (merma/vencimiento) o ajuste por recuento.
router.post('/:id/stock', (req, res) => {
  const { module, id } = req.params;
  const { type, qty, note } = req.body ?? {};
  const product = getProduct(module, id);
  if (!product.active) throw new HttpError(400, 'El producto está desactivado');

  let delta;
  if (type === 'ingreso') {
    delta = normalizeQty(product.unit, qty);
  } else if (type === 'egreso') {
    delta = -normalizeQty(product.unit, qty);
    if (product.stock + delta < 0) throw new HttpError(400, 'El egreso supera el stock disponible');
  } else if (type === 'ajuste') {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Solo un administrador puede ajustar stock');
    delta = normalizeQty(product.unit, qty, { allowZero: true }) - product.stock;
  } else {
    throw new HttpError(400, 'Tipo de movimiento inválido');
  }
  if (type !== 'ingreso' && !String(note ?? '').trim()) {
    throw new HttpError(400, 'Indicá el motivo del movimiento');
  }

  const stockAfter = round3(product.stock + delta);
  tx(() => {
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stockAfter, product.id);
    recordStockMovement({
      productId: product.id,
      type,
      qty: round3(delta),
      stockAfter,
      note: String(note ?? '').trim() || null,
      userId: req.user.id,
    });
  });
  res.json(forRole(req.user, getProduct(module, id)));
});

export default router;
