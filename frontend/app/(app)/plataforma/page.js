'use client';

import { useMemo, useState } from 'react';
import { api, download, setToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ESTADOS_NEGOCIO, MODULES } from '@/lib/constants';
import { dateTime, day, money } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import Modal from '@/components/Modal';

const FILTERS = {
  todos: { label: 'Todos', test: () => true },
  prueba: { label: 'En prueba', test: (n) => n.estado === 'prueba' },
  activo: { label: 'Activos', test: (n) => n.estado === 'activo' },
  por_vencer: {
    label: 'Vencen en 7 días',
    test: (n) => ['prueba', 'activo'].includes(n.estado) && n.dias_restantes !== null && n.dias_restantes <= 7,
  },
  vencidos: { label: 'Vencidos', test: (n) => ['gracia', 'vencido'].includes(n.estado) },
  suspendido: { label: 'Suspendidos', test: (n) => n.estado === 'suspendido' },
};

const EMPTY_NEGOCIO = { nombre: '', modules: [], contacto: '', admin: { name: '', username: '', password: '' } };

// Panel del dueño de la plataforma: todos los negocios, su suscripción y los pagos por transferencia.
export default function PlataformaPage() {
  const { user } = useAuth();
  const negocios = useLoad(() => api('/plataforma/negocios'), []);
  const [filter, setFilter] = useState('todos');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [backup, setBackup] = useState({ busy: false, error: '' });

  const list = useMemo(() => (negocios.data ?? []).filter(FILTERS[filter].test), [negocios.data, filter]);
  const count = (key) => (negocios.data ?? []).filter(FILTERS[key].test).length;

  async function downloadBackup() {
    setBackup({ busy: true, error: '' });
    try {
      await download('/backup');
      setBackup({ busy: false, error: '' });
    } catch (err) {
      setBackup({ busy: false, error: err.message });
    }
  }

  if (!user.superadmin) return <div className="alert error">Solo para el administrador de la plataforma.</div>;

  return (
    <>
      <header className="page-header">
        <h1>Negocios</h1>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => setChangingPassword(true)}>
            Cambiar mi contraseña
          </button>
          <button className="btn outline" onClick={downloadBackup} disabled={backup.busy}>
            {backup.busy ? 'Preparando copia…' : 'Descargar copia de la base'}
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + Nuevo negocio
          </button>
        </div>
      </header>
      {backup.error && <div className="alert error">{backup.error}</div>}

      <section className="stats">
        <div className="card stat">
          <span className="muted">Negocios</span>
          <strong>{negocios.data?.length ?? '—'}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Activos (pagos)</span>
          <strong className="ok">{count('activo')}</strong>
        </div>
        <div className="card stat">
          <span className="muted">En prueba</span>
          <strong>{count('prueba')}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Vencidos</span>
          <strong className="danger">{count('vencidos')}</strong>
          <span className="small muted">{count('por_vencer')} vencen en 7 días</span>
        </div>
      </section>

      <section className="card">
        <div className="toolbar filters">
          {Object.entries(FILTERS).map(([key, f]) => (
            <button
              key={key}
              className={`btn small ${filter === key ? 'primary' : 'outline'}`}
              onClick={() => setFilter(key)}
            >
              {f.label} ({count(key)})
            </button>
          ))}
        </div>
        {negocios.error && <div className="alert error">{negocios.error.message}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="hover">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Admin</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th>Vence</th>
                <th>Último pago</th>
                <th>Última venta</th>
              </tr>
            </thead>
            <tbody>
              {list.map((n) => (
                <tr key={n.id} onClick={() => setSelected(n.id)}>
                  <td>
                    <strong>{n.nombre}</strong>{' '}
                    <span className="muted">{n.modules.map((m) => MODULES[m]?.icon).join(' ')}</span>
                  </td>
                  <td>{n.admin_username ?? '—'}</td>
                  <td>{n.contacto ?? '—'}</td>
                  <td>
                    <EstadoBadge estado={n.estado} />
                  </td>
                  <td>
                    {n.vence_el ? day(n.vence_el) : 'Sin vencimiento'}
                    {n.dias_restantes !== null && (
                      <div className={`small ${n.dias_restantes < 0 ? 'danger' : n.dias_restantes <= 7 ? 'warn' : 'muted'}`}>
                        {n.dias_restantes < 0 ? `hace ${-n.dias_restantes} días` : `en ${n.dias_restantes} días`}
                      </div>
                    )}
                  </td>
                  <td>{n.ultimo_pago ? `${day(n.ultimo_pago.fecha)} · ${money(n.ultimo_pago.monto)}` : '—'}</td>
                  <td>{n.ultima_venta ? dateTime(n.ultima_venta) : '—'}</td>
                </tr>
              ))}
              {list.length === 0 && !negocios.loading && (
                <tr>
                  <td colSpan={7} className="muted">
                    No hay negocios en este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <NegocioDetail
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={() => negocios.reload()}
        />
      )}
      {creating && (
        <NuevoNegocio
          onClose={() => setCreating(false)}
          onSaved={(n) => {
            setCreating(false);
            negocios.reload();
            setSelected(n.id);
          }}
        />
      )}
      {changingPassword && <CambiarPassword onClose={() => setChangingPassword(false)} />}
    </>
  );
}

function EstadoBadge({ estado }) {
  const e = ESTADOS_NEGOCIO[estado] ?? { label: estado, badge: '' };
  return <span className={`badge ${e.badge}`}>{e.label}</span>;
}

function NegocioDetail({ id, onClose, onChanged }) {
  const detail = useLoad(() => api(`/plataforma/negocios/${id}`), [id]);
  const [tab, setTab] = useState('pago');
  const n = detail.data;

  const changed = () => {
    detail.reload();
    onChanged();
  };

  return (
    <Modal title={n ? n.nombre : 'Negocio'} onClose={onClose} wide>
      {detail.error && <div className="alert error">{detail.error.message}</div>}
      {!n ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <span className="muted small">Estado</span>
              <EstadoBadge estado={n.estado} />
            </div>
            <div className="stat">
              <span className="muted small">Vence</span>
              <strong style={{ fontSize: 16 }}>{n.vence_el ? day(n.vence_el) : 'Sin vencimiento'}</strong>
            </div>
            <div className="stat">
              <span className="muted small">Usuarios / productos</span>
              <strong style={{ fontSize: 16 }}>
                {n.usuarios} / {n.productos}
              </strong>
            </div>
            <div className="stat">
              <span className="muted small">Alta</span>
              <strong style={{ fontSize: 16 }}>{day(n.created_at)}</strong>
            </div>
          </div>

          <div className="filters mt">
            {[
              ['pago', 'Registrar pago'],
              ['editar', 'Editar'],
              ['pagos', `Pagos (${n.pagos.length})`],
            ].map(([key, label]) => (
              <button key={key} className={`btn small ${tab === key ? 'primary' : 'outline'}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'pago' && <RegistrarPago negocio={n} onSaved={changed} />}
          {tab === 'editar' && <EditarNegocio negocio={n} onSaved={changed} />}
          {tab === 'pagos' && <PagosTable pagos={n.pagos} />}
        </>
      )}
    </Modal>
  );
}

function RegistrarPago({ negocio, onSaved }) {
  const [form, setForm] = useState({ monto: '', meses: '1', hasta: '', fecha: '', referencia: '' });
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ error: '', ok: '' });
    try {
      const body = { monto: form.monto, referencia: form.referencia };
      if (form.hasta) body.hasta = form.hasta;
      else body.meses = Number(form.meses);
      if (form.fecha) body.fecha = form.fecha;
      const saved = await api(`/plataforma/negocios/${negocio.id}/pagos`, { method: 'POST', body });
      setForm({ monto: '', meses: '1', hasta: '', fecha: '', referencia: '' });
      setMsg({ error: '', ok: `Pago registrado. Ahora vence el ${day(saved.vence_el)}.` });
      onSaved();
    } catch (err) {
      setMsg({ error: err.message, ok: '' });
    }
    setBusy(false);
  }

  return (
    <form className="form-grid mt" onSubmit={submit}>
      <label>
        Monto recibido
        <input type="number" min="0" step="0.01" value={form.monto} onChange={set('monto')} required autoFocus />
      </label>
      <label>
        Fecha del pago
        <input type="date" value={form.fecha} onChange={set('fecha')} />
        <span className="small muted">Vacío = hoy</span>
      </label>
      <label>
        Extender
        <select value={form.meses} onChange={set('meses')} disabled={Boolean(form.hasta)}>
          {[1, 2, 3, 6, 12].map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? 'mes' : 'meses'}
            </option>
          ))}
        </select>
        <span className="small muted">
          Desde el {negocio.vence_el && negocio.dias_restantes >= 0 ? day(negocio.vence_el) : 'día de hoy'}
        </span>
      </label>
      <label>
        …o hasta una fecha exacta
        <input type="date" value={form.hasta} onChange={set('hasta')} />
      </label>
      <label className="span-2">
        Referencia
        <input value={form.referencia} onChange={set('referencia')} placeholder="Banco, n° de operación, quién transfirió…" />
      </label>
      {msg.error && <div className="alert error span-2">{msg.error}</div>}
      {msg.ok && <div className="alert ok span-2">{msg.ok}</div>}
      <div className="span-2 form-actions">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Registrar pago'}
        </button>
      </div>
    </form>
  );
}

function EditarNegocio({ negocio, onSaved }) {
  const [form, setForm] = useState({
    nombre: negocio.nombre,
    estado: negocio.estado_guardado,
    vence_el: negocio.vence_el ?? '',
    modules: negocio.modules,
    contacto: negocio.contacto ?? '',
    notas: negocio.notas ?? '',
  });
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleModule = (m) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m] }));

  async function submit(e) {
    e.preventDefault();
    setMsg({ error: '', ok: '' });
    try {
      await api(`/plataforma/negocios/${negocio.id}`, { method: 'PUT', body: { ...form, vence_el: form.vence_el || null } });
      setMsg({ error: '', ok: 'Cambios guardados.' });
      onSaved();
    } catch (err) {
      setMsg({ error: err.message, ok: '' });
    }
  }

  return (
    <form className="form-grid mt" onSubmit={submit}>
      <label>
        Nombre
        <input value={form.nombre} onChange={set('nombre')} required />
      </label>
      <label>
        Contacto
        <input value={form.contacto} onChange={set('contacto')} />
      </label>
      <label>
        Estado
        <select value={form.estado} onChange={set('estado')}>
          <option value="prueba">Prueba</option>
          <option value="activo">Activo</option>
          <option value="suspendido">Suspendido (no puede entrar)</option>
        </select>
      </label>
      <label>
        Vence el
        <input type="date" value={form.vence_el} onChange={set('vence_el')} />
        <span className="small muted">Vacío = sin vencimiento</span>
      </label>
      <fieldset className="span-2">
        <legend>Rubros</legend>
        {Object.values(MODULES).map((m) => (
          <label key={m.id} className="check">
            <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} /> {m.icon}{' '}
            {m.name}
          </label>
        ))}
      </fieldset>
      <label className="span-2">
        Notas internas
        <textarea rows={3} value={form.notas} onChange={set('notas')} />
      </label>
      {msg.error && <div className="alert error span-2">{msg.error}</div>}
      {msg.ok && <div className="alert ok span-2">{msg.ok}</div>}
      <div className="span-2 form-actions">
        <button className="btn primary">Guardar</button>
      </div>
    </form>
  );
}

function PagosTable({ pagos }) {
  if (pagos.length === 0) return <p className="muted mt">Todavía no hay pagos registrados.</p>;
  return (
    <table className="mt">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Medio</th>
          <th>Referencia</th>
          <th>Período</th>
          <th>Registró</th>
          <th className="num">Monto</th>
        </tr>
      </thead>
      <tbody>
        {pagos.map((p) => (
          <tr key={p.id}>
            <td>{day(p.fecha)}</td>
            <td style={{ textTransform: 'capitalize' }}>{p.metodo}</td>
            <td>{p.referencia ?? '—'}</td>
            <td>
              {p.desde ? day(p.desde) : '—'} → {day(p.hasta)}
            </td>
            <td>{p.registrado_por_name ?? '—'}</td>
            <td className="num">{money(p.monto)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NuevoNegocio({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_NEGOCIO);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setAdmin = (key) => (e) => setForm({ ...form, admin: { ...form.admin, [key]: e.target.value } });
  const toggleModule = (m) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m] }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      onSaved(await api('/plataforma/negocios', { method: 'POST', body: form }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Nuevo negocio" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nombre del negocio
          <input value={form.nombre} onChange={set('nombre')} required autoFocus />
        </label>
        <fieldset className="span-2">
          <legend>Rubros</legend>
          {Object.values(MODULES).map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} /> {m.icon}{' '}
              {m.name}
            </label>
          ))}
        </fieldset>
        <label className="span-2">
          Contacto
          <input value={form.contacto} onChange={set('contacto')} placeholder="Teléfono o email" />
        </label>
        <label>
          Nombre del administrador
          <input value={form.admin.name} onChange={setAdmin('name')} required />
        </label>
        <label>
          Usuario
          <input value={form.admin.username} onChange={setAdmin('username')} required />
        </label>
        <label className="span-2">
          Contraseña inicial
          <input type="password" value={form.admin.password} onChange={setAdmin('password')} required minLength={8} />
        </label>
        <p className="span-2 small muted">Arranca en prueba gratis. Después registrás el pago desde el detalle.</p>
        {error && <div className="alert error span-2">{error}</div>}
        <div className="span-2 form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary">Crear</button>
        </div>
      </form>
    </Modal>
  );
}

function CambiarPassword({ onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const { token } = await api('/plataforma/password', { method: 'PUT', body: { password } });
      setToken(token);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nueva contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus />
        </label>
        {error && <div className="alert error span-2">{error}</div>}
        <div className="span-2 form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
