'use client';

import { useMemo, useState } from 'react';
import { api, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ESTADOS_NEGOCIO, MODULES, TRIAL_MAX_MODULES } from '@/lib/constants';
import { ago, dateTime, day, money } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import Modal from '@/components/Modal';
import { negocioLink } from '@/lib/negocio';
import { useDialog } from '@/components/ConfirmDialog';
import PasswordInput from '@/components/PasswordInput';

// Pruebas gratis a las que les quedan pocos días: es el momento de llamar para ofrecer el plan pago.
const PRUEBA_POR_TERMINAR_DIAS = 3;
const pruebaPorTerminar = (n) => n.estado === 'prueba' && n.dias_restantes !== null && n.dias_restantes <= PRUEBA_POR_TERMINAR_DIAS;

const FILTERS = {
  todos: { label: 'Todos', test: () => true },
  prueba: { label: 'En prueba', test: (n) => n.estado === 'prueba' },
  prueba_por_terminar: { label: `Prueba termina en ${PRUEBA_POR_TERMINAR_DIAS} días`, test: pruebaPorTerminar },
  activo: { label: 'Activos', test: (n) => n.estado === 'activo' },
  por_vencer: {
    label: 'Vencen en 7 días',
    test: (n) => ['prueba', 'activo'].includes(n.estado) && n.dias_restantes !== null && n.dias_restantes <= 7,
  },
  vencidos: { label: 'Vencidos', test: (n) => ['gracia', 'vencido'].includes(n.estado) },
  suspendido: { label: 'Suspendidos', test: (n) => n.estado === 'suspendido' },
};

// En prueba, elegir un rubro reemplaza al anterior (se permite uno solo); si no, se suman o se quitan.
function toggleRubro(modules, m, enPrueba) {
  if (modules.includes(m)) return modules.filter((x) => x !== m);
  return enPrueba ? [...modules, m].slice(-TRIAL_MAX_MODULES) : [...modules, m];
}

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
          <span className={`small ${count('prueba_por_terminar') > 0 ? 'warn' : 'muted'}`}>
            {count('prueba_por_terminar')} {count('prueba_por_terminar') === 1 ? 'termina' : 'terminan'} en {PRUEBA_POR_TERMINAR_DIAS} días
          </span>
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
                <th>Último ingreso</th>
                <th>Ventas 7 días</th>
                <th className="num">Prod. / usuarios</th>
              </tr>
            </thead>
            <tbody>
              {list.map((n) => (
                <tr key={n.id} onClick={() => setSelected(n.id)} className={pruebaPorTerminar(n) ? 'highlight' : undefined}>
                  <td>
                    <strong>{n.nombre}</strong>{' '}
                    <span className="muted">{n.modules.map((m) => MODULES[m]?.icon).join(' ')}</span>
                    <div className="small muted">/{n.slug}</div>
                  </td>
                  <td>{n.admin_username ?? '—'}</td>
                  <td>{n.contacto ?? '—'}</td>
                  <td>
                    <EstadoBadge estado={n.estado} />
                    {pruebaPorTerminar(n) && <div className="small warn">Termina la prueba</div>}
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
                  <td title={n.ultimo_ingreso ? dateTime(n.ultimo_ingreso) : 'Nadie entró todavía'}>
                    <span className={inactivo(n.ultimo_ingreso) ? 'warn' : undefined}>{ago(n.ultimo_ingreso)}</span>
                  </td>
                  <td>
                    {n.ventas_7d > 0 ? (
                      <>
                        {n.ventas_7d} · {money(n.total_7d)}
                      </>
                    ) : (
                      <span className="muted">Sin ventas</span>
                    )}
                    {n.ventas_7d === 0 && n.ultima_venta && <div className="small muted">Última: {day(n.ultima_venta)}</div>}
                  </td>
                  <td className="num">
                    {n.productos} / {n.usuarios}
                  </td>
                </tr>
              ))}
              {list.length === 0 && !negocios.loading && (
                <tr>
                  <td colSpan={9} className="muted">
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

// Nadie del negocio entró en la última semana (o nunca).
function inactivo(ultimoIngreso) {
  if (!ultimoIngreso) return true;
  return Date.now() - new Date(ultimoIngreso.replace(' ', 'T')).getTime() > 7 * 86400000;
}

function EstadoBadge({ estado }) {
  const e = ESTADOS_NEGOCIO[estado] ?? { label: estado, badge: '' };
  return <span className={`badge ${e.badge}`}>{e.label}</span>;
}

function NegocioDetail({ id, onClose, onChanged }) {
  const detail = useLoad(() => api(`/plataforma/negocios/${id}`), [id]);
  const [tab, setTab] = useState('pago');
  const [suspendError, setSuspendError] = useState('');
  const dialog = useDialog();
  const n = detail.data;

  const changed = () => {
    detail.reload();
    onChanged();
  };

  // Suspender: nadie del negocio puede entrar (los datos quedan). Reactivar lo vuelve a activo,
  // o a prueba si todavía no pagó nunca.
  async function toggleSuspend() {
    const suspended = n.estado === 'suspendido';
    if (
      !suspended &&
      !(await dialog.confirm({
        title: `¿Suspender "${n.nombre}"?`,
        message: 'Nadie del negocio va a poder entrar hasta que lo reactives. Los datos se conservan.',
        confirmLabel: 'Suspender',
        danger: true,
      }))
    )
      return;
    setSuspendError('');
    try {
      const estado = suspended ? (n.pagos.length > 0 ? 'activo' : 'prueba') : 'suspendido';
      await api(`/plataforma/negocios/${n.id}`, { method: 'PUT', body: { estado } });
      changed();
    } catch (err) {
      setSuspendError(err.message);
    }
  }

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

          <div className="alert-row mt">
            <span className="small muted">
              {n.estado === 'suspendido'
                ? 'Cuenta suspendida: nadie del negocio puede entrar.'
                : 'Suspender corta el acceso a todo el negocio sin borrar sus datos.'}
            </span>
            <button
              className={`btn small ${n.estado === 'suspendido' ? 'primary' : 'danger'}`}
              onClick={toggleSuspend}
            >
              {n.estado === 'suspendido' ? 'Reactivar cuenta' : 'Suspender cuenta'}
            </button>
          </div>
          {suspendError && <div className="alert error">{suspendError}</div>}

          <div className="filters mt">
            {[
              ['pago', 'Registrar pago'],
              ['editar', 'Editar'],
              ['usuarios', 'Usuarios'],
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
          {tab === 'usuarios' && <UsuariosNegocio negocio={n} />}
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
    slug: negocio.slug,
    estado: negocio.estado_guardado,
    vence_el: negocio.vence_el ?? '',
    modules: negocio.modules,
    contacto: negocio.contacto ?? '',
    notas: negocio.notas ?? '',
  });
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const enPrueba = form.estado === 'prueba';
  const toggleModule = (m) => setForm((f) => ({ ...f, modules: toggleRubro(f.modules, m, f.estado === 'prueba') }));

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
      <label className="span-2">
        Código (dirección para entrar)
        <input
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
          required
          autoCapitalize="none"
        />
        <span className="small muted">
          {form.slug === negocio.slug
            ? `Entran desde ${negocioLink(negocio.slug)}`
            : `Al guardar, el link pasa a ser ${negocioLink(form.slug)} y el anterior deja de funcionar: avisale al negocio.`}
        </span>
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
      <fieldset className="span-2 rubros">
        <legend>Rubros</legend>
        {Object.values(MODULES).map((m) => (
          <label key={m.id} className="check">
            <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} /> {m.icon}{' '}
            {m.name}
          </label>
        ))}
        {enPrueba && (
          <p className="small muted span-all">En prueba se permite un solo rubro. Pasalo a Activo para habilitar varios.</p>
        )}
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

// Usuarios del negocio y blanqueo de contraseña para quien se la olvidó.
function UsuariosNegocio({ negocio }) {
  const usuarios = useLoad(() => api(`/plataforma/negocios/${negocio.id}/usuarios`), [negocio.id]);
  const [temporal, setTemporal] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const dialog = useDialog();

  async function blanquear(u) {
    const ok = await dialog.confirm({
      title: `¿Blanquear la contraseña de "${u.username}"?`,
      message: 'Se genera una contraseña temporal y se cierran sus sesiones abiertas. Al entrar va a tener que elegir una nueva.',
      confirmLabel: 'Blanquear clave',
      danger: true,
    });
    if (!ok) return;
    setError('');
    setCopied(false);
    try {
      setTemporal(await api(`/plataforma/negocios/${negocio.id}/usuarios/${u.id}/blanquear`, { method: 'POST' }));
      usuarios.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporal.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt">
      {temporal && (
        <div className="alert ok">
          Contraseña temporal de <strong>{temporal.username}</strong>: <code style={{ fontSize: 16 }}>{temporal.password}</code>{' '}
          <button className="btn small outline" onClick={copy}>
            {copied ? 'Copiada' : 'Copiar'}
          </button>
          <div className="small">
            Pasásela al usuario: es la única vez que se muestra. Al entrar con ella va a tener que elegir una nueva.
          </div>
        </div>
      )}
      {(error || usuarios.error) && <div className="alert error">{error || usuarios.error.message}</div>}
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Alta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(usuarios.data ?? []).map((u) => (
            <tr key={u.id}>
              <td>
                <code>{u.username}</code>
              </td>
              <td>{u.name}</td>
              <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
              <td>
                <span className={`badge ${u.active ? 'ok' : 'danger'}`}>{u.active ? 'Activo' : 'Desactivado'}</span>{' '}
                {u.debe_cambiar_clave && <span className="badge warn">Clave temporal</span>}
              </td>
              <td>{day(u.created_at)}</td>
              <td className="num">
                <button className="btn small outline" onClick={() => blanquear(u)}>
                  Blanquear clave
                </button>
              </td>
            </tr>
          ))}
          {usuarios.data?.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Este negocio no tiene usuarios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NuevoNegocio({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_NEGOCIO);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setAdmin = (key) => (e) => setForm({ ...form, admin: { ...form.admin, [key]: e.target.value } });
  const toggleModule = (m) => setForm((f) => ({ ...f, modules: toggleRubro(f.modules, m, true) }));

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
        <fieldset className="span-2 rubros">
          <legend>Rubros</legend>
          {Object.values(MODULES).map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} /> {m.icon}{' '}
              {m.name}
            </label>
          ))}
          <p className="small muted span-all">Arranca en prueba con un solo rubro. Al pasarlo a Activo se pueden sumar más.</p>
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
          <PasswordInput value={form.admin.password} onChange={setAdmin('password')} required minLength={8} />
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

// Cambia la contraseña del superadmin en la base (no toca SUPERADMIN_PASSWORD, que solo se usa la primera vez).
// Cierra las otras sesiones abiertas; esta sigue con un token nuevo.
function CambiarPassword({ onClose }) {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.nueva !== form.repetir) return setError('Las contraseñas nuevas no coinciden');
    setBusy(true);
    try {
      await changePassword(form.actual, form.nueva);
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <Modal title="Cambiar mi contraseña" onClose={onClose}>
        <div className="alert ok">
          Listo, tu contraseña nueva quedó guardada. La próxima vez entrá con ella. Las sesiones abiertas en otros
          dispositivos se cerraron.
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Contraseña actual
          <PasswordInput value={form.actual} onChange={set('actual')} required autoFocus autoComplete="current-password" />
        </label>
        <label className="span-2">
          Nueva contraseña
          <PasswordInput value={form.nueva} onChange={set('nueva')} required minLength={8} autoComplete="new-password" />
        </label>
        <label className="span-2">
          Repetir la nueva
          <PasswordInput value={form.repetir} onChange={set('repetir')} required minLength={8} autoComplete="new-password" />
        </label>
        {error && <div className="alert error span-2">{error}</div>}
        <div className="span-2 form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
