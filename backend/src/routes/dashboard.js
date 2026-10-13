import { Router } from 'express';
import { db } from '../db.js';
import { getOpenSession, sessionSummary } from './cash.js';

const router = Router({ mergeParams: true });

function localDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

router.get('/', (req, res) => {
  const { module } = req.params;

  const today = db
    .prepare(
      `SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(total), 0), 2) AS total FROM sales
       WHERE module = ? AND status = 'completada' AND date(created_at) = date('now','localtime')`
    )
    .get(module);

  const byDay = new Map(
    db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS count, ROUND(SUM(total), 2) AS total FROM sales
         WHERE module = ? AND status = 'completada' AND date(created_at) >= date('now','localtime','-6 days')
         GROUP BY day`
      )
      .all(module)
      .map((r) => [r.day, r])
  );
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = localDate(d);
    return byDay.get(day) ?? { day, count: 0, total: 0 };
  });

  const topProducts = db
    .prepare(
      `SELECT i.product_name AS name, i.unit, ROUND(SUM(i.qty), 3) AS qty, ROUND(SUM(i.subtotal), 2) AS total
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.module = ? AND s.status = 'completada' AND date(s.created_at) = date('now','localtime')
       GROUP BY i.product_id ORDER BY total DESC LIMIT 5`
    )
    .all(module);

  const lowStock = db
    .prepare(
      `SELECT id, name, unit, stock, min_stock FROM products
       WHERE module = ? AND active = 1 AND stock <= min_stock ORDER BY stock / NULLIF(min_stock, 0)`
    )
    .all(module);

  const inventory = db
    .prepare(
      `SELECT COUNT(*) AS products, ROUND(COALESCE(SUM(stock * cost), 0), 2) AS cost_value,
         ROUND(COALESCE(SUM(stock * price), 0), 2) AS retail_value
       FROM products WHERE module = ? AND active = 1`
    )
    .get(module);

  const open = getOpenSession(module);
  res.json({
    today,
    last7Days,
    topProducts,
    lowStock,
    inventory,
    cash: open ? sessionSummary(open.id) : null,
  });
});

export default router;
