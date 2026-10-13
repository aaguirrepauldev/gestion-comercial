'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? `/${user.modules[0]}` : '/login');
  }, [user, loading, router]);

  return <div className="center-screen muted">Cargando…</div>;
}
