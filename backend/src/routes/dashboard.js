import { Router } from 'express';
import { db } from '../db.js';
import { getOpenSession, sessionSummary } from './cash.js';
import { addDays, todayLocal } from '../time.js';

const router = Router({ mergeParams: true });

router.get('/', (req, res) => {
  const { module } = req.params;

  const today = db
    .prepare(
      `SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(total), 0), 2) AS total FROM sales
       WHERE module = ? AND status = 'completada' AND date(created_at) = today_local()`
    )
    .get(module);

  const byDay = new Map(
    db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS count, ROUND(SUM(total), 2) AS total FROM sales
         WHERE module = ? AND status = 'completada' AND date(created_at) >= date(today_local(), '-6 days')
         GROUP BY day`
      )
      .all(module)
      .map((r) => [r.day, r])
  );
  const todayDay = todayLocal();
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(todayDay, i - 6);
    return byDay.get(day) ?? { day, count: 0, total: 0 };
  });

  const topProducts = db
    .prepare(
      `SELECT i.product_name AS name, i.unit, ROUND(SUM(i.qty), 3) AS qty, ROUND(SUM(i.subtotal), 2) AS total
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.module = ? AND s.status = 'completada' AND date(s.created_at) = today_local()
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

  if (req.user.role !== 'admin') delete inventory.cost_value;

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
