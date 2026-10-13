'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MODULES } from '@/lib/constants';
import { useLoad } from '@/lib/useLoad';
import Modal from '@/components/Modal';

const EMPTY_USER = { username: '', name: '', password: '', role: 'vendedor', modules: [], active: true };

export default function UsuariosPage() {
  const { user } = useAuth();
  const users = useLoad(() => api('/users'), []);
  const [editing, setEditing] = useState(null);

  if (user.role !== 'admin') return <div className="alert error">Requiere rol administrador.</div>;

  return (
    <>
      <header className="page-header">
        <h1>Usuarios</h1>
        <button className="btn primary" onClick={() => setEditing(EMPTY_USER)}>
          + Nuevo usuario
        </button>
      </header>

      <section className="card">
        {users.error && <div className="alert error">{users.error.message}</div>}
        <table className="hover">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Módulos</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id} onClick={() => setEditing(u)}>
                <td>{u.username}</td>
                <td>{u.name}</td>
                <td>{u.role === 'admin' ? 'Administrador' : 'Vendedor'}</td>
                <td>{u.modules.map((m) => `${MODULES[m].icon} ${MODULES[m].name}`).join(' · ')}</td>
                <td>
                  <span className={`badge ${u.active ? 'ok' : 'danger'}`}>{u.active ? 'activo' : 'inactivo'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <UserForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            users.reload();
          }}
        />
      )}
    </>
  );
}

function UserForm({ initial, onClose, onSaved }) {
  const isNew = !initial.id;
  const [form, setForm] = useState({ ...initial, password: '' });
  const [error, setError] = useState('');

  const toggleModule = (m) =>
    setForm((f) => ({ ...f, modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m] }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (!isNew && !body.password) delete body.password;
      await api(isNew ? '/users' : `/users/${initial.id}`, { method: isNew ? 'POST' : 'PUT', body });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={isNew ? 'Nuevo usuario' : `Editar: ${initial.username}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Usuario
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            disabled={!isNew}
            required
            autoFocus={isNew}
          />
        </label>
        <label>
          Nombre
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          {isNew ? 'Contraseña' : 'Nueva contraseña (opcional)'}
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={isNew}
            minLength={6}
          />
        </label>
        <label>
          Rol
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="vendedor">Vendedor</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <fieldset className="span-2">
          <legend>Módulos habilitados</legend>
          {form.role === 'admin' ? (
            <p className="muted small">Los administradores acceden a todos los módulos.</p>
          ) : (
            Object.values(MODULES).map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} />{' '}
                {m.icon} {m.name}
              </label>
            ))
          )}
        </fieldset>
        {!isNew && (
          <label className="check span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{' '}
            Usuario activo
          </label>
        )}
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
