import { Router } from 'express';
import { db } from '../db.js';
import { HttpError, round2, toNumber } from '../util.js';

const router = Router({ mergeParams: true });

export function getOpenSession(module) {
  return db.prepare("SELECT * FROM cash_sessions WHERE module = ? AND status = 'abierta'").get(module);
}

// Resumen de una caja: ventas por medio de pago, movimientos manuales y efectivo esperado.
export function sessionSummary(id) {
  const session = db
    .prepare(
      `SELECT cs.*, uo.name AS opened_by_name, uc.name AS closed_by_name
       FROM cash_sessions cs
       JOIN users uo ON uo.id = cs.opened_by
       LEFT JOIN users uc ON uc.id = cs.closed_by
       WHERE cs.id = ?`
    )
    .get(id);
  if (!session) return null;

  const salesByMethod = db
    .prepare(
      `SELECT payment_method, COUNT(*) AS count, ROUND(SUM(total), 2) AS total
       FROM sales WHERE session_id = ? AND status = 'completada'
       GROUP BY payment_method ORDER BY total DESC`
    )
    .all(id);
  const { cancelled } = db
    .prepare("SELECT COUNT(*) AS cancelled FROM sales WHERE session_id = ? AND status = 'anulada'")
    .get(id);
  const movements = db
    .prepare(
      `SELECT m.*, u.name AS user_name FROM cash_movements m
       JOIN users u ON u.id = m.user_id WHERE m.session_id = ? ORDER BY m.id`
    )
    .all(id);

  const sum = (rows, pick) => round2(rows.reduce((acc, r) => acc + pick(r), 0));
  const cashSales = sum(salesByMethod.filter((s) => s.payment_method === 'efectivo'), (s) => s.total);
  const ingresos = sum(movements.filter((m) => m.type === 'ingreso'), (m) => m.amount);
  const egresos = sum(movements.filter((m) => m.type === 'egreso'), (m) => m.amount);

  return {
    ...session,
    sales_by_method: salesByMethod,
    sales_total: sum(salesByMethod, (s) => s.total),
    sales_count: salesByMethod.reduce((acc, s) => acc + s.count, 0),
    cancelled_count: cancelled,
    cash_sales: cashSales,
    ingresos,
    egresos,
    movements,
    expected_cash:
      session.status === 'cerrada'
        ? session.expected_cash
        : round2(session.opening_amount + cashSales + ingresos - egresos),
  };
}

router.get('/current', (req, res) => {
  const session = getOpenSession(req.params.module);
  res.json(session ? sessionSummary(session.id) : null);
});

router.get('/history', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT cs.*, uo.name AS opened_by_name, uc.name AS closed_by_name,
           (SELECT ROUND(COALESCE(SUM(total), 0), 2) FROM sales s
            WHERE s.session_id = cs.id AND s.status = 'completada') AS sales_total
         FROM cash_sessions cs
         JOIN users uo ON uo.id = cs.opened_by
         LEFT JOIN users uc ON uc.id = cs.closed_by
         WHERE cs.module = ? AND cs.status = 'cerrada'
         ORDER BY cs.id DESC LIMIT 100`
      )
      .all(req.params.module)
  );
});

router.get('/:id', (req, res) => {
  const summary = sessionSummary(Number(req.params.id));
  if (!summary || summary.module !== req.params.module) throw new HttpError(404, 'Caja no encontrada');
  res.json(summary);
});

router.post('/open', (req, res) => {
  const { module } = req.params;
  if (getOpenSession(module)) throw new HttpError(409, 'Ya hay una caja abierta para este módulo');
  const amount = round2(toNumber(req.body?.opening_amount ?? 0, 'Monto inicial'));
  if (amount < 0) throw new HttpError(400, 'El monto inicial no puede ser negativo');

  const { lastInsertRowid } = db
    .prepare('INSERT INTO cash_sessions (module, opened_by, opening_amount, opened_at) VALUES (?, ?, ?, now_local())')
    .run(module, req.user.id, amount);
  res.status(201).json(sessionSummary(Number(lastInsertRowid)));
});

router.post('/movements', (req, res) => {
  const session = getOpenSession(req.params.module);
  if (!session) throw new HttpError(409, 'La caja está cerrada');
  const { type, description } = req.body ?? {};
  if (!['ingreso', 'egreso'].includes(type)) throw new HttpError(400, 'Tipo inválido');
  const amount = round2(toNumber(req.body?.amount, 'Monto'));
  if (amount <= 0) throw new HttpError(400, 'El monto debe ser mayor a cero');
  if (!String(description ?? '').trim()) throw new HttpError(400, 'La descripción es obligatoria');

  if (type === 'egreso') {
    const { expected_cash } = sessionSummary(session.id);
    if (amount > expected_cash) throw new HttpError(400, 'El egreso supera el efectivo disponible en caja');
  }
  db.prepare('INSERT INTO cash_movements (session_id, type, amount, description, user_id, created_at) VALUES (?, ?, ?, ?, ?, now_local())').run(
    session.id, type, amount, String(description).trim(), req.user.id
  );
  res.status(201).json(sessionSummary(session.id));
});

router.post('/close', (req, res) => {
  const session = getOpenSession(req.params.module);
  if (!session) throw new HttpError(409, 'No hay una caja abierta');
  const counted = round2(toNumber(req.body?.counted_cash, 'Efectivo contado'));
  if (counted < 0) throw new HttpError(400, 'El efectivo contado no puede ser negativo');

  const { expected_cash } = sessionSummary(session.id);
  db.prepare(
    `UPDATE cash_sessions
     SET status = 'cerrada', closed_by = ?, closed_at = now_local(),
         expected_cash = ?, counted_cash = ?, difference = ?, notes = ?
     WHERE id = ?`
  ).run(
    req.user.id, expected_cash, counted, round2(counted - expected_cash),
    String(req.body?.notes ?? '').trim() || null, session.id
  );
  res.json(sessionSummary(session.id));
});

export default router;
