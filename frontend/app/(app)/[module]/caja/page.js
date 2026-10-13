'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { moduleApi } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/constants';
import { dateTime, money } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import Modal from '@/components/Modal';
import SalesTable from '@/components/SalesTable';

export default function CajaPage() {
  const { module } = useParams();
  const current = useLoad(() => moduleApi(module, '/cash/current'), [module]);
  const history = useLoad(() => moduleApi(module, '/cash/history'), [module]);
  const [detail, setDetail] = useState(null);

  const refresh = () => {
    current.reload();
    history.reload();
  };

  if (current.loading && !current.data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <header className="page-header">
        <h1>Caja</h1>
      </header>

      {current.error && <div className="alert error">{current.error.message}</div>}
      {current.data ? (
        <OpenSession module={module} session={current.data} onChange={refresh} />
      ) : (
        <OpenForm module={module} onOpened={refresh} />
      )}

      <section className="card">
        <h2>Cierres anteriores</h2>
        {history.data?.length === 0 ? (
          <p className="muted">Todavía no hay cajas cerradas.</p>
        ) : (
          <table className="hover">
            <thead>
              <tr>
                <th>#</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Cerró</th>
                <th className="num">Ventas</th>
                <th className="num">Esperado</th>
                <th className="num">Contado</th>
                <th className="num">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {(history.data ?? []).map((s) => (
                <tr key={s.id} onClick={async () => setDetail(await moduleApi(module, `/cash/${s.id}`))}>
                  <td>{s.id}</td>
                  <td>{dateTime(s.opened_at)}</td>
                  <td>{dateTime(s.closed_at)}</td>
                  <td>{s.closed_by_name}</td>
                  <td className="num">{money(s.sales_total)}</td>
                  <td className="num">{money(s.expected_cash)}</td>
                  <td className="num">{money(s.counted_cash)}</td>
                  <td className={`num ${diffClass(s.difference)}`}>{money(s.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detail && <SessionDetail module={module} session={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

const diffClass = (d) => (d === 0 ? 'ok' : d < 0 ? 'danger' : 'warn');

function OpenForm({ module, onOpened }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await moduleApi(module, '/cash/open', { method: 'POST', body: { opening_amount: amount || 0 } });
      onOpened();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card narrow">
      <h2>La caja está cerrada</h2>
      <p className="muted">Ingresá el efectivo con el que se inicia el turno (cambio).</p>
      <form className="inline-form" onSubmit={submit}>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Monto inicial"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <button className="btn primary">Abrir caja</button>
      </form>
      {error && <div className="alert error">{error}</div>}
    </section>
  );
}

function Summary({ session }) {
  return (
    <div className="summary">
      <div className="summary-row">
        <span>Monto inicial</span>
        <span>{money(session.opening_amount)}</span>
      </div>
      <div className="summary-row">
        <span>+ Ventas en efectivo</span>
        <span>{money(session.cash_sales)}</span>
      </div>
      <div className="summary-row">
        <span>+ Ingresos manuales</span>
        <span>{money(session.ingresos)}</span>
      </div>
      <div className="summary-row">
        <span>− Egresos / retiros</span>
        <span>{money(session.egresos)}</span>
      </div>
      <div className="summary-row total">
        <span>Efectivo esperado</span>
        <span>{money(session.expected_cash)}</span>
      </div>

      <h3>Ventas por medio de pago</h3>
      {session.sales_by_method.length === 0 && <p className="muted small">Sin ventas.</p>}
      {session.sales_by_method.map((m) => (
        <div className="summary-row" key={m.payment_method}>
          <span>
            {PAYMENT_METHODS[m.payment_method]} <span className="muted small">({m.count})</span>
          </span>
          <span>{money(m.total)}</span>
        </div>
      ))}
      <div className="summary-row total">
        <span>Total vendido ({session.sales_count} ventas)</span>
        <span>{money(session.sales_total)}</span>
      </div>
      {session.cancelled_count > 0 && <p className="small muted">{session.cancelled_count} venta(s) anulada(s)</p>}
    </div>
  );
}

function MovementsTable({ movements }) {
  if (movements.length === 0) return <p className="muted small">Sin movimientos manuales.</p>;
  return (
    <table>
      <tbody>
        {movements.map((m) => (
          <tr key={m.id}>
            <td>{dateTime(m.created_at)}</td>
            <td>{m.description}</td>
            <td className="muted">{m.user_name}</td>
            <td className={`num ${m.type === 'egreso' ? 'danger' : 'ok'}`}>
              {m.type === 'egreso' ? '−' : '+'}
              {money(m.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OpenSession({ module, session, onChange }) {
  const [mov, setMov] = useState({ type: 'egreso', amount: '', description: '' });
  const [close, setClose] = useState({ counted_cash: '', notes: '' });
  const [error, setError] = useState('');
  const counted = Number(close.counted_cash);
  const diff = close.counted_cash === '' ? null : counted - session.expected_cash;

  async function run(fn) {
    setError('');
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  const addMovement = (e) => {
    e.preventDefault();
    run(async () => {
      await moduleApi(module, '/cash/movements', { method: 'POST', body: mov });
      setMov({ type: 'egreso', amount: '', description: '' });
    });
  };

  const closeSession = (e) => {
    e.preventDefault();
    if (!confirm(`¿Cerrar la caja con ${money(counted)} contados? Diferencia: ${money(diff)}`)) return;
    run(() => moduleApi(module, '/cash/close', { method: 'POST', body: close }));
  };

  return (
    <section className="grid-2">
      <div className="card">
        <h2>
          Caja #{session.id} <span className="badge ok">abierta</span>
        </h2>
        <p className="muted small">
          Abierta por {session.opened_by_name} el {dateTime(session.opened_at)}
        </p>
        <Summary session={session} />
      </div>

      <div>
        <div className="card">
          <h2>Ingreso / retiro de efectivo</h2>
          <form className="form-grid" onSubmit={addMovement}>
            <label>
              Tipo
              <select value={mov.type} onChange={(e) => setMov({ ...mov, type: e.target.value })}>
                <option value="egreso">Egreso (pago, retiro)</option>
                <option value="ingreso">Ingreso (aporte de cambio)</option>
              </select>
            </label>
            <label>
              Monto
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={mov.amount}
                onChange={(e) => setMov({ ...mov, amount: e.target.value })}
                required
              />
            </label>
            <label className="span-2">
              Descripción
              <input
                value={mov.description}
                onChange={(e) => setMov({ ...mov, description: e.target.value })}
                placeholder="Ej: pago a proveedor"
                required
              />
            </label>
            <div className="span-2 form-actions">
              <button className="btn outline">Registrar</button>
            </div>
          </form>
          <MovementsTable movements={session.movements} />
        </div>

        <div className="card">
          <h2>Cerrar caja</h2>
          <form className="form-grid" onSubmit={closeSession}>
            <label>
              Efectivo contado
              <input
                type="number"
                step="0.01"
                min="0"
                value={close.counted_cash}
                onChange={(e) => setClose({ ...close, counted_cash: e.target.value })}
                required
              />
            </label>
            <div className="diff-box">
              <span className="muted small">Diferencia</span>
              <strong className={diff === null ? 'muted' : diffClass(Math.round(diff * 100) / 100)}>
                {diff === null ? '—' : money(diff)}
              </strong>
            </div>
            <label className="span-2">
              Observaciones
              <input value={close.notes} onChange={(e) => setClose({ ...close, notes: e.target.value })} />
            </label>
            <div className="span-2 form-actions">
              <button className="btn danger">Cerrar caja</button>
            </div>
          </form>
        </div>
        {error && <div className="alert error">{error}</div>}
      </div>
    </section>
  );
}

function SessionDetail({ module, session, onClose }) {
  const sales = useLoad(() => moduleApi(module, `/sales?session_id=${session.id}`), [module, session.id]);
  return (
    <Modal title={`Caja #${session.id}`} onClose={onClose} wide>
      <p className="muted small">
        Abierta por {session.opened_by_name} ({dateTime(session.opened_at)}) · Cerrada por {session.closed_by_name} (
        {dateTime(session.closed_at)})
      </p>
      <div className="grid-2">
        <div>
          <Summary session={session} />
          <div className="summary-row">
            <span>Efectivo contado</span>
            <span>{money(session.counted_cash)}</span>
          </div>
          <div className={`summary-row total ${diffClass(session.difference)}`}>
            <span>Diferencia</span>
            <span>{money(session.difference)}</span>
          </div>
          {session.notes && <p className="small">Obs.: {session.notes}</p>}
        </div>
        <div>
          <h3>Movimientos de efectivo</h3>
          <MovementsTable movements={session.movements} />
          <h3>Ventas</h3>
          <SalesTable sales={sales.data ?? []} onSelect={() => {}} />
        </div>
      </div>
    </Modal>
  );
}
