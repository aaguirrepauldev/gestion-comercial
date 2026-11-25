'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import SubscriptionBanner from '@/components/SubscriptionBanner';

export default function AppLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // El superadmin no tiene negocio propio: solo usa el panel de plataforma.
  const wrongPlace = user?.superadmin && !pathname.startsWith('/plataforma');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    else if (wrongPlace) router.replace('/plataforma');
  }, [user, loading, wrongPlace, router]);

  if (!user || wrongPlace) return <div className="center-screen muted">Cargando…</div>;

  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <SubscriptionBanner />
        {children}
      </main>
    </div>
  );
}
