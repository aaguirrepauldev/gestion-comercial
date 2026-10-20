'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MODULES, PAYMENT_METHODS, RECEIPT } from '@/lib/constants';
import { dateTime, money, qty } from '@/lib/format';

// Comprobante de la venta para impresora térmica. Se monta fuera de la app y solo se ve al imprimir;
// abre el diálogo de impresión apenas se muestra y llama a onDone cuando termina.
export default function Receipt({ module, sale, onDone }) {
  useEffect(() => {
    window.addEventListener('afterprint', onDone);
    // Espera a que el comprobante esté pintado antes de imprimir.
    const id = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('afterprint', onDone);
    };
  }, [sale, onDone]);

  const header = RECEIPT[module] ?? { name: MODULES[module].name, lines: [] };

  return createPortal(
    <div className="receipt" style={{ '--receipt-width': `${RECEIPT.widthMm}mm` }}>
      <div className="receipt-center">
        <strong className="receipt-title">{header.name}</strong>
        {header.lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <hr />
      <div className="receipt-row">
        <span>Venta #{sale.id}</span>
        <span>{dateTime(sale.created_at)}</span>
      </div>
      <div>Atendió: {sale.user_name}</div>
      <hr />
      {sale.items.map((i) => (
        <div key={i.id} className="receipt-item">
          <div>{i.product_name}</div>
          <div className="receipt-row">
            <span>
              {qty(i.qty, i.unit)} x {money(i.unit_price)}
              {i.unit === 'kg' ? '/kg' : ''}
            </span>
            <span>{money(i.subtotal)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div className="receipt-row receipt-total">
        <span>TOTAL</span>
        <span>{money(sale.total)}</span>
      </div>
      <div className="receipt-row">
        <span>Pago</span>
        <span>{PAYMENT_METHODS[sale.payment_method]}</span>
      </div>
      {sale.status === 'anulada' && <div className="receipt-center receipt-total">*** VENTA ANULADA ***</div>}
      <hr />
      <div className="receipt-center">
        <div>Comprobante no válido como factura</div>
        <div>¡Gracias por su compra!</div>
      </div>
    </div>,
    document.body
  );
}
