'use client';

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

  return (
    <aside className="sidebar">
      <div className="brand">Gestión Comercial</div>

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

      <nav>
        {NAV.map((item) => {
          const href = `/${current}${item.path}`;
          return (
            <Link key={item.path} href={href} className={pathname === href ? 'active' : ''}>
              <span>{item.icon}</span> {item.label}
            </Link>
          );
        })}
        {user.role === 'admin' && (
          <Link href="/usuarios" className={pathname === '/usuarios' ? 'active' : ''}>
            <span>👥</span> Usuarios
          </Link>
        )}
      </nav>

      <div className="sidebar-footer">
        <div>
          <strong>{user.name}</strong>
          <div className="muted small">{user.role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
        </div>
        <button className="btn ghost small" onClick={logout}>
          Salir
        </button>
      </div>
    </aside>
  );
}
