'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(`/${user.modules[0]}`);
  }, [user, router]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <h1>Gestión Comercial</h1>
        <p className="muted">📚 Librería · 🐔 Avícola</p>
        <label>
          Usuario
          <input
            autoFocus
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        {process.env.NODE_ENV !== 'production' && (
          <p className="hint">
            Demo: <code>admin / admin123</code> · <code>libreria / libreria123</code> · <code>avicola / avicola123</code>
          </p>
        )}
      </form>
    </div>
  );
}
