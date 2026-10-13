import { Router } from 'express';
import { db, recordStockMovement, tx } from '../db.js';
import { requireAdmin } from '../auth.js';
import { PAYMENT_METHODS } from '../config.js';
import { HttpError, normalizeQty, round2, round3 } from '../util.js';
import { getOpenSession } from './cash.js';

const router = Router({ mergeParams: true });

function getSale(module, id) {
  const sale = db
    .prepare(
      `SELECT s.*, u.name AS user_name, uc.name AS cancelled_by_name
       FROM sales s JOIN users u ON u.id = s.user_id
       LEFT JOIN users uc ON uc.id = s.cancelled_by
       WHERE s.id = ? AND s.module = ?`
    )
    .get(Number(id), module);
  if (!sale) throw new HttpError(404, 'Venta no encontrada');
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(sale.id);
  return sale;
}

// Lista de ventas por caja (?session_id=) o por día (?date=YYYY-MM-DD, por defecto hoy).
router.get('/', (req, res) => {
  const args = [req.params.module];
  let filter;
  if (req.query.session_id) {
    filter = 's.session_id = ?';
    args.push(Number(req.query.session_id));
  } else if (req.query.date) {
    filter = 'date(s.created_at) = ?';
    args.push(String(req.query.date));
  } else {
    filter = "date(s.created_at) = date('now','localtime')";
  }
  res.json(
    db
      .prepare(
        `SELECT s.*, u.name AS user_name,
           (SELECT COUNT(*) FROM sale_items i WHERE i.sale_id = s.id) AS items_count
         FROM sales s JOIN users u ON u.id = s.user_id
         WHERE s.module = ? AND ${filter}
         ORDER BY s.id DESC`
      )
      .all(...args)
  );
});

router.get('/:id', (req, res) => res.json(getSale(req.params.module, req.params.id)));

router.post('/', (req, res) => {
  const { module } = req.params;
  const { items, payment_method } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'La venta no tiene productos');
  if (!PAYMENT_METHODS.includes(payment_method)) throw new HttpError(400, 'Medio de pago inválido');
  const session = getOpenSession(module);
  if (!session) throw new HttpError(409, 'La caja está cerrada. Abrí la caja antes de vender.');

  const saleId = tx(() => {
    // Agrupa líneas repetidas del mismo producto
    const requested = new Map();
    for (const item of items) {
      const pid = Number(item.product_id);
      requested.set(pid, [...(requested.get(pid) ?? []), item.qty]);
    }

    const lines = [];
    for (const [pid, qtys] of requested) {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND module = ? AND active = 1').get(pid, module);
      if (!product) throw new HttpError(404, `Producto ${pid} no encontrado`);
      const qty = round3(qtys.reduce((acc, q) => acc + normalizeQty(product.unit, q), 0));
      if (qty > product.stock + 1e-9) {
        throw new HttpError(409, `Stock insuficiente para "${product.name}" (disponible: ${product.stock})`);
      }
      lines.push({ product, qty, subtotal: round2(qty * product.price) });
    }
    const total = round2(lines.reduce((acc, l) => acc + l.subtotal, 0));

    const id = Number(
      db
        .prepare('INSERT INTO sales (module, session_id, user_id, total, payment_method) VALUES (?, ?, ?, ?, ?)')
        .run(module, session.id, req.user.id, total, payment_method).lastInsertRowid
    );
    const insertItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name, unit, qty, unit_price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const { product, qty, subtotal } of lines) {
      insertItem.run(id, product.id, product.name, product.unit, qty, product.price, subtotal);
      const stockAfter = round3(product.stock - qty);
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stockAfter, product.id);
      recordStockMovement({ productId: product.id, type: 'venta', qty: -qty, stockAfter, saleId: id, userId: req.user.id });
    }
    return id;
  });
  res.status(201).json(getSale(module, saleId));
});

router.post('/:id/cancel', requireAdmin, (req, res) => {
  const { module, id } = req.params;
  const sale = getSale(module, id);
  if (sale.status === 'anulada') throw new HttpError(409, 'La venta ya está anulada');
  const session = db.prepare('SELECT status FROM cash_sessions WHERE id = ?').get(sale.session_id);
  if (session.status !== 'abierta') throw new HttpError(409, 'No se puede anular una venta de una caja ya cerrada');

  tx(() => {
    for (const item of sale.items) {
      const { stock } = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
      const stockAfter = round3(stock + item.qty);
      db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stockAfter, item.product_id);
      recordStockMovement({
        productId: item.product_id, type: 'anulacion', qty: item.qty, stockAfter,
        saleId: sale.id, note: `Anulación venta #${sale.id}`, userId: req.user.id,
      });
    }
    db.prepare(
      "UPDATE sales SET status = 'anulada', cancelled_by = ?, cancelled_at = datetime('now','localtime') WHERE id = ?"
    ).run(req.user.id, sale.id);
  });
  res.json(getSale(module, id));
});

export default router;
