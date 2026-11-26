'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { homePath, useAuth } from '@/lib/auth';
import { MODULES } from '@/lib/constants';
import { negocioLink, slugify } from '@/lib/negocio';
import { useDebounced } from '@/lib/useDebounced';
import PasswordInput from '@/components/PasswordInput';

// Alta de un negocio nuevo con prueba gratis. Crea el negocio y su usuario administrador.
export default function RegistroPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ negocio: '', slug: '', modules: [], contacto: '', name: '', username: '', password: '' });
  // Mientras no la toque, la dirección sigue al nombre del negocio.
  const [slugTouched, setSlugTouched] = useState(false);
  const [direccion, setDireccion] = useState(null);
  const slug = useDebounced(form.slug, 400);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(homePath(user));
  }, [user, router]);

  useEffect(() => {
    api('/auth/registro').then(setInfo).catch(() => setInfo({ habilitado: false }));
  }, []);

  // Avisa si la dirección elegida ya la usa otro negocio y propone una variante (libreria-centro-2).
  useEffect(() => {
    if (!slug) return setDireccion(null);
    let cancel = false;
    api(`/auth/registro/direccion?slug=${encodeURIComponent(slug)}`)
      .then((r) => !cancel && setDireccion(r))
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [slug]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setNombre = (e) =>
    setForm({ ...form, negocio: e.target.value, ...(!slugTouched && { slug: slugify(e.target.value) }) });
  const setSlug = (value) => {
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug: value }));
  };
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
      if (err.sugerencia) setDireccion({ slug: form.slug, disponible: false, error: err.message, sugerencia: err.sugerencia });
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
              <input autoFocus value={form.negocio} onChange={setNombre} required maxLength={80} />
            </label>
            <label>
              Dirección para entrar
              <input
                value={form.slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                required
                minLength={2}
                maxLength={40}
                autoCapitalize="none"
                autoCorrect="off"
              />
              {form.slug && direccion?.slug === form.slug && !direccion.disponible ? (
                <span className="small" style={{ color: 'var(--danger)' }}>
                  {direccion.error}{' '}
                  {direccion.sugerencia && (
                    <button type="button" className="link" onClick={() => setSlug(direccion.sugerencia)}>
                      Usar {direccion.sugerencia}
                    </button>
                  )}
                </span>
              ) : (
                <span className="small muted">
                  Vos y tus empleados entran desde <strong>{negocioLink(form.slug || 'tu-negocio')}</strong>
                </span>
              )}
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
              <PasswordInput value={form.password} onChange={set('password')} required minLength={8} />
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
