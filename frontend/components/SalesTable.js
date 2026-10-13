'use client';

import { PAYMENT_METHODS } from '@/lib/constants';
import { money, time } from '@/lib/format';

export default function SalesTable({ sales, onSelect }) {
  if (sales.length === 0) return <p className="muted">No hay ventas.</p>;
  return (
    <table className="hover">
      <thead>
        <tr>
          <th>#</th>
          <th>Hora</th>
          <th>Vendedor</th>
          <th>Medio de pago</th>
          <th className="num">Ítems</th>
          <th className="num">Total</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {sales.map((s) => (
          <tr key={s.id} onClick={() => onSelect(s)} className={s.status === 'anulada' ? 'struck' : ''}>
            <td>{s.id}</td>
            <td>{time(s.created_at)}</td>
            <td>{s.user_name}</td>
            <td>{PAYMENT_METHODS[s.payment_method]}</td>
            <td className="num">{s.items_count}</td>
            <td className="num">{money(s.total)}</td>
            <td>
              <span className={`badge ${s.status === 'anulada' ? 'danger' : 'ok'}`}>{s.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
