import { Router } from 'express';
import { db } from '../db.js';
import { MONTHLY_PRICE, TRANSFER_INFO } from '../config.js';

// Lo que ve el negocio de su propia suscripción: estado, vencimiento, cómo pagar y pagos registrados.
const router = Router();

router.get('/', (req, res) => {
  const pagos =
    req.user.role === 'admin'
      ? db
          .prepare('SELECT id, monto, metodo, referencia, fecha, desde, hasta FROM pagos WHERE negocio_id = ? ORDER BY id DESC LIMIT 24')
          .all(req.negocioId)
      : [];
  res.json({
    ...req.user.negocio,
    precio_mensual: MONTHLY_PRICE || null,
    datos_transferencia: TRANSFER_INFO || null,
    pagos,
  });
});

export default router;
