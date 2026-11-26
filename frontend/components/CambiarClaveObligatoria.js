'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import PasswordInput from '@/components/PasswordInput';

// Pantalla que aparece al entrar con una contraseña blanqueada por el administrador de la plataforma.
export default function CambiarClaveObligatoria() {
  const { user, changePassword, logout } = useAuth();
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (form.nueva !== form.repetir) return setError('Las contraseñas nuevas no coinciden');
    setBusy(true);
    setError('');
    try {
      await changePassword(form.actual, form.nueva);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <h1>Elegí una contraseña nueva</h1>
        <p className="muted">
          Hola {user.name}, entraste con una contraseña temporal. Para seguir, elegí una nueva que solo sepas vos.
        </p>
        <label>
          Contraseña temporal
          <PasswordInput value={form.actual} onChange={set('actual')} required autoFocus />
        </label>
        <label>
          Contraseña nueva
          <PasswordInput value={form.nueva} onChange={set('nueva')} required minLength={8} />
        </label>
        <label>
          Repetir contraseña nueva
          <PasswordInput value={form.repetir} onChange={set('repetir')} required minLength={8} />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
        <button type="button" className="btn ghost block" onClick={logout}>
          Salir
        </button>
      </form>
    </div>
  );
}
