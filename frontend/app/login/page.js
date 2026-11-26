'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { homePath, useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(null);

  useEffect(() => {
    if (user) router.replace(homePath(user));
  }, [user, router]);

  // Muestra "Crear cuenta" solo si el registro público está habilitado en el servidor.
  useEffect(() => {
    api('/auth/registro').then((r) => setSignup(r?.habilitado ? r : null)).catch(() => {});
  }, []);

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
        <p className="muted">Stock, ventas y caja para tu negocio</p>
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
        {signup && (
          <p className="center small">
            ¿Todavía no tenés cuenta? <Link href="/registro">Probalo gratis {signup.dias_prueba} días</Link>
            <br />
            <Link href="/verificar-email">¿No te llegó el email de confirmación?</Link>
          </p>
        )}
        {process.env.NODE_ENV !== 'production' && (
          <p className="hint">
            Demo: <code>admin / admin123</code> · <code>libreria / libreria123</code> · <code>avicola / avicola123</code> ·{' '}
            <code>superadmin / superadmin123</code>
          </p>
        )}
      </form>
    </div>
  );
}
