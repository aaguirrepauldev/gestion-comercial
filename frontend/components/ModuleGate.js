'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { MODULES } from '@/lib/constants';

export default function ModuleGate({ children }) {
  const { module } = useParams();
  const { user } = useAuth();

  if (!MODULES[module]) return <div className="alert error">Módulo inexistente.</div>;
  if (!user.modules.includes(module)) return <div className="alert error">No tenés acceso a este módulo.</div>;

  // key={module} reinicia el estado de las páginas al cambiar de negocio
  return (
    <div key={module} style={{ '--accent': MODULES[module].accent }}>
      {children}
    </div>
  );
}
