'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { moduleApi } from '@/lib/api';
import { MODULES } from '@/lib/constants';
import { money, qty, shortDay } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';

export default function DashboardPage() {
  const { module } = useParams();
  const { data, error } = useLoad(() => moduleApi(module, '/dashboard'), [module]);

  if (error) return <div className="alert error">{error.message}</div>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <header className="page-header">
        <h1>
          {MODULES[module].icon} {MODULES[module].name}
        </h1>
      </header>

      <section className="stats">
        <div className="card stat">
          <span className="muted">Ventas de hoy</span>
          <strong>{money(data.today.total)}</strong>
          <span className="small muted">{data.today.count} operaciones</span>
        </div>
        <div className="card stat">
          <span className="muted">Caja</span>
          {data.cash ? (
            <>
              <strong className="ok">Abierta</strong>
              <span className="small muted">Efectivo esperado {money(data.cash.expected_cash)}</span>
            </>
          ) : (
            <>
              <strong className="danger">Cerrada</strong>
              <Link className="small" href={`/${module}/caja`}>
                Abrir caja →
              </Link>
            </>
          )}
        </div>
        <div className="card stat">
          <span className="muted">Stock bajo</span>
          <strong className={data.lowStock.length ? 'danger' : 'ok'}>{data.lowStock.length}</strong>
          <span className="small muted">productos bajo el mínimo</span>
        </div>
        <div className="card stat">
          {/* El costo solo llega para los administradores */}
          {data.inventory.cost_value !== undefined ? (
            <>
              <span className="muted">Inventario (a costo)</span>
              <strong>{money(data.inventory.cost_value)}</strong>
              <span className="small muted">
                {data.inventory.products} productos · venta {money(data.inventory.retail_value)}
              </span>
            </>
          ) : (
            <>
              <span className="muted">Inventario (a precio de venta)</span>
              <strong>{money(data.inventory.retail_value)}</strong>
              <span className="small muted">{data.inventory.products} productos</span>
            </>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h2>Últimos 7 días</h2>
          <table>
            <thead>
              <tr>
                <th>Día</th>
                <th className="num">Operaciones</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.last7Days.map((d) => (
                <tr key={d.day}>
                  <td>{shortDay(d.day)}</td>
                  <td className="num">{d.count}</td>
                  <td className="num">{money(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Más vendidos hoy</h2>
          {data.topProducts.length === 0 ? (
            <p className="muted">Todavía no hay ventas hoy.</p>
          ) : (
            <table>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="num">{qty(p.qty, p.unit)}</td>
                    <td className="num">{money(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="mt">Reponer</h2>
          {data.lowStock.length === 0 ? (
            <p className="muted">Todo el stock está por encima del mínimo.</p>
          ) : (
            <table>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num danger">{qty(p.stock, p.unit)}</td>
                    <td className="num muted">mín. {qty(p.min_stock, p.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
