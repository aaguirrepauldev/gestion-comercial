'use client';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ESTADOS_NEGOCIO } from '@/lib/constants';
import { day, money } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';

// Estado de la suscripción del negocio y cómo pagarla (por ahora, transferencia).
export default function SuscripcionPage() {
  const { user } = useAuth();
  const { data, error } = useLoad(() => api('/suscripcion'), []);

  if (user.role !== 'admin') return <div className="alert error">Requiere rol administrador.</div>;
  if (error) return <div className="alert error">{error.message}</div>;
  if (!data) return <p className="muted">Cargando…</p>;

  const estado = ESTADOS_NEGOCIO[data.estado] ?? { label: data.estado, badge: '' };

  return (
    <>
      <header className="page-header">
        <h1>Mi suscripción</h1>
      </header>

      <div className="grid-2">
        <section className="card">
          <h2>{data.nombre}</h2>
          <div className="summary-row">
            <span>Estado</span>
            <span className={`badge ${estado.badge}`}>{estado.label}</span>
          </div>
          <div className="summary-row">
            <span>{data.estado === 'prueba' ? 'La prueba termina el' : 'Pagado hasta el'}</span>
            <strong>{data.vence_el ? day(data.vence_el) : 'Sin vencimiento'}</strong>
          </div>
          {data.dias_restantes !== null && data.dias_restantes >= 0 && (
            <div className="summary-row">
              <span>Días restantes</span>
              <span>{data.dias_restantes}</span>
            </div>
          )}
          {data.precio_mensual && (
            <div className="summary-row">
              <span>Precio mensual</span>
              <span>{money(data.precio_mensual)}</span>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Cómo pagar</h2>
          {data.datos_transferencia ? (
            <>
              <p className="muted">Transferí a esta cuenta y mandanos el comprobante. Lo acreditamos en el día.</p>
              <pre className="transfer">{data.datos_transferencia}</pre>
            </>
          ) : (
            <p className="muted">Escribinos y te pasamos los datos para transferir.</p>
          )}
          <p className="small muted">
            Al acreditar el pago se extiende el vencimiento. Si se vence, tus datos no se borran: el sistema queda en
            modo consulta hasta que se renueva.
          </p>
        </section>
      </div>

      <section className="card">
        <h2>Pagos registrados</h2>
        {data.pagos.length === 0 ? (
          <p className="muted">Todavía no hay pagos.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Medio</th>
                <th>Referencia</th>
                <th>Cubre hasta</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {data.pagos.map((p) => (
                <tr key={p.id}>
                  <td>{day(p.fecha)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.metodo}</td>
                  <td>{p.referencia ?? '—'}</td>
                  <td>{day(p.hasta)}</td>
                  <td className="num">{money(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
