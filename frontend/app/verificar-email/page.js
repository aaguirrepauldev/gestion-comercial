'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { homePath, useAuth } from '@/lib/auth';

// Dos usos: con ?token=… (el link del email) activa la cuenta y entra; sin token muestra
// "revisá tu correo" y deja pedir el link de nuevo.
export default function VerificarEmailPage() {
  const { verifyEmail } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const started = useRef(false);

  // Se lee de la URL en el navegador porque la web se exporta como sitio estático.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
    setEmail(params.get('email') ?? '');
    setSentTo(params.get('email') ?? '');
  }, []);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token)
      .then((user) => router.replace(homePath(user)))
      .catch((err) => setError(err.message));
  }, [token, verifyEmail, router]);

  async function resend(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/reenviar-verificacion', { method: 'POST', body: { email } });
      setSentTo(email);
      setResent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (token === null || (token && !error)) return <div className="center-screen muted">Confirmando tu email…</div>;

  return (
    <div className="center-screen">
      <form className="card login-card" onSubmit={resend}>
        <h1>Confirmá tu email</h1>
        {sentTo && !error && (
          <div className="alert">
            {resent ? 'Te mandamos un link nuevo' : 'Te mandamos un link'} a <b>{sentTo}</b>. Abrilo para activar tu cuenta
            (revisá también la carpeta de spam).
          </div>
        )}
        {error && <div className="alert error">{error}</div>}
        <p className="muted small">¿No te llegó o venció el link? Pedí uno nuevo:</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoCapitalize="none" />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Enviando…' : 'Reenviar link'}
        </button>
        <p className="center small">
          <Link href="/login">Volver a ingresar</Link>
        </p>
      </form>
    </div>
  );
}
