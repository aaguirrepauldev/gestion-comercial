'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { MODULES } from '@/lib/constants';

const NAV = [
  { path: '', label: 'Inicio', icon: '🏠' },
  { path: '/ventas', label: 'Ventas', icon: '🛒' },
  { path: '/stock', label: 'Stock', icon: '📦' },
  { path: '/caja', label: 'Caja', icon: '💵' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const current = params.module ?? user.modules[0];
  const section = params.module ? pathname.slice(`/${current}`.length) : '';
  const link = (href, icon, label) => (
    <Link href={href} className={pathname === href || pathname === `${href}/` ? 'active' : ''}>
      <span>{icon}</span> {label}
    </Link>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        Gestión Comercial
        <span className="negocio">{user.superadmin ? 'Plataforma' : user.negocio?.nombre}</span>
      </div>

      {user.superadmin ? (
        <nav>{link('/plataforma', '🏢', 'Negocios')}</nav>
      ) : (
        <>
          {user.modules.length > 1 && (
            <div className="module-switch">
              {user.modules.map((m) => (
                <Link
                  key={m}
                  href={`/${m}${section}`}
                  className={m === params.module ? 'active' : ''}
                  style={{ '--accent': MODULES[m].accent }}
                >
                  {MODULES[m].icon} {MODULES[m].name}
                </Link>
              ))}
            </div>
          )}

          <nav>
            {NAV.map((item) => (
              <Fragment key={item.path}>{link(`/${current}${item.path}`, item.icon, item.label)}</Fragment>
            ))}
            {user.role === 'admin' && link('/usuarios', '👥', 'Usuarios')}
            {user.role === 'admin' && link('/suscripcion', '💳', 'Mi suscripción')}
          </nav>
        </>
      )}

      <div className="sidebar-footer">
        <div>
          <strong>{user.name}</strong>
          <div className="muted small">
            {user.superadmin ? 'Superadmin' : user.role === 'admin' ? 'Administrador' : 'Vendedor'}
          </div>
        </div>
        <button className="btn ghost small" onClick={logout}>
          Salir
        </button>
      </div>
    </aside>
  );
}
