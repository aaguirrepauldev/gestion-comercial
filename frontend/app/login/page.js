'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { homePath, useAuth } from '@/lib/auth';
import { getSavedNegocio, saveNegocio } from '@/lib/negocio';

// Los usuarios son únicos dentro de cada negocio, así que para entrar hace falta saber de qué negocio.
// Llega por el link del negocio (tuapp.com/libreria-centro → /login/?negocio=libreria-centro), queda
// recordado en el navegador, o se escribe acá. El superadmin de la plataforma entra sin código.
export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ negocio: '', username: '', password: '' });
  // Negocio ya elegido (por el link o recordado): se muestra su nombre en lugar del campo.
  const [negocio, setNegocio] = useState(null);
  const [ready, setReady] = useState(false);
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

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('negocio');
    const slug = (fromLink ?? getSavedNegocio()).trim().toLowerCase();
    if (!slug) return setReady(true);
    api(`/auth/negocio/${encodeURIComponent(slug)}`)
      .then((n) => {
        setNegocio(n);
        setForm((f) => ({ ...f, negocio: n.slug }));
      })
      .catch(() => {
        // El código recordado ya no existe (por ejemplo, lo cambiaron): se pide de nuevo.
        if (fromLink) setError(`No encontramos el negocio "${slug}". Revisá el link o escribí el código.`);
        else saveNegocio('');
      })
      .finally(() => setReady(true));
  }, []);

  function changeNegocio() {
    setNegocio(null);
    setForm((f) => ({ ...f, negocio: '' }));
    saveNegocio('');
    window.history.replaceState(null, '', '/login/');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.negocio.trim().toLowerCase(), form.username, form.password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!ready) return <div className="center-screen muted">Cargando…</div>;

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <h1>{negocio ? negocio.nombre : 'Gestión Comercial'}</h1>
        {negocio ? (
          <p className="muted small">
            Ingresá con tu usuario ·{' '}
            <button type="button" className="link" onClick={changeNegocio}>
              Otro negocio
            </button>
          </p>
        ) : (
          <>
            <p className="muted">Stock, ventas y caja para tu negocio</p>
            <label>
              Código del negocio
              <input
                autoFocus
                value={form.negocio}
                onChange={(e) => setForm({ ...form, negocio: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                placeholder="por ejemplo libreria-centro"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <span className="small muted">Es lo que va después de la barra en el link de tu negocio.</span>
            </label>
          </>
        )}
        <label>
          Usuario
          <input
            autoFocus={Boolean(negocio)}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoCapitalize="none"
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
          </p>
        )}
        {process.env.NODE_ENV !== 'production' && (
          <p className="hint">
            Demo (código <code>demo</code>): <code>admin / admin123</code> · <code>libreria / libreria123</code> ·{' '}
            <code>avicola / avicola123</code> · sin código: <code>superadmin / superadmin123</code>
          </p>
        )}
      </form>
    </div>
  );
}
