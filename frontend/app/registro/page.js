'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { homePath, useAuth } from '@/lib/auth';
import { MODULES } from '@/lib/constants';

// Alta de un negocio nuevo con prueba gratis. Crea el negocio y su usuario administrador.
export default function RegistroPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ negocio: '', modules: [], contacto: '', name: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(homePath(user));
  }, [user, router]);

  useEffect(() => {
    api('/auth/registro').then(setInfo).catch(() => setInfo({ habilitado: false }));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  // En la prueba gratis se elige un solo rubro; con el plan pago se pueden sumar más.
  const pickModule = (m) => setForm((f) => ({ ...f, modules: [m] }));

  async function submit(e) {
    e.preventDefault();
    if (form.modules.length === 0) return setError('Elegí el rubro de tu negocio.');
    setBusy(true);
    setError('');
    try {
      await register(form);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!info) return <div className="center-screen muted">Cargando…</div>;

  return (
    <div className="center-screen">
      <form className="card login-card wide" onSubmit={submit}>
        <h1>Creá tu cuenta</h1>
        {info.habilitado ? (
          <>
            <p className="muted">
              {info.dias_prueba} días de prueba gratis, sin tarjeta. Después se abona por transferencia.
            </p>
            <label>
              Nombre del negocio
              <input autoFocus value={form.negocio} onChange={set('negocio')} required maxLength={80} />
            </label>
            <fieldset className="rubros">
              <legend>¿Qué tipo de negocio tenés?</legend>
              {Object.values(MODULES).map((m) => (
                <label key={m.id} className="check">
                  <input
                    type="radio"
                    name="rubro"
                    checked={form.modules.includes(m.id)}
                    onChange={() => pickModule(m.id)}
                  />{' '}
                  {m.icon} {m.name}
                </label>
              ))}
              <p className="small muted span-all">
                En la prueba gratis usás un rubro. Con el plan pago podés sumar más (por ejemplo, librería y kiosco).
              </p>
            </fieldset>
            <label>
              Tu nombre
              <input value={form.name} onChange={set('name')} required />
            </label>
            <label>
              Teléfono o email de contacto
              <input value={form.contacto} onChange={set('contacto')} placeholder="Para avisarte antes del vencimiento" />
            </label>
            <label>
              Usuario para entrar
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                required
                minLength={3}
                autoCapitalize="none"
              />
            </label>
            <label>
              Contraseña
              <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
            </label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary block" disabled={busy}>
              {busy ? 'Creando…' : 'Empezar la prueba gratis'}
            </button>
          </>
        ) : (
          <div className="alert">Por ahora las cuentas nuevas se dan de alta a pedido. Escribinos y te la creamos.</div>
        )}
        <p className="center small">
          ¿Ya tenés cuenta? <Link href="/login">Ingresá</Link>
        </p>
      </form>
    </div>
  );
}
