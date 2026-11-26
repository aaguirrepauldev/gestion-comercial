'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { day } from '@/lib/format';

// Aviso arriba de todas las pantallas cuando la prueba o la suscripción están por vencer o vencidas.
export default function SubscriptionBanner() {
  const { user } = useAuth();
  const n = user.negocio;
  if (!n || n.dias_restantes === null) return null;

  const link = user.role === 'admin' && <Link href="/suscripcion">Ver cómo pagar</Link>;
  const contactAdmin = user.role !== 'admin' && <span className="small">Avisale al administrador del negocio.</span>;

  if (n.estado === 'vencido') {
    return (
      <div className="alert error banner">
        <span>
          La suscripción venció el {day(n.vence_el)}. Podés consultar tus datos, pero no cargar ventas ni cambios hasta
          renovarla.
        </span>
        {link || contactAdmin}
      </div>
    );
  }
  if (n.estado === 'gracia') {
    return (
      <div className="alert warn banner">
        <span>
          La suscripción venció el {day(n.vence_el)}. Después del {day(n.limite_gracia)} el sistema queda en solo lectura.
        </span>
        {link || contactAdmin}
      </div>
    );
  }
  if (n.estado === 'prueba' || n.dias_restantes <= 7) {
    const dias = n.dias_restantes === 0 ? 'hoy' : n.dias_restantes === 1 ? 'mañana' : `en ${n.dias_restantes} días`;
    const que = n.estado === 'prueba' ? 'La prueba gratis' : 'La suscripción';
    // Durante la prueba solo se lo mostramos al admin, para no molestar a los vendedores.
    if (n.estado === 'prueba' && user.role !== 'admin' && n.dias_restantes > 3) return null;
    return (
      <div className="alert banner banner-yellow">
        <span>
          <strong>{que} vence {dias}</strong> ({day(n.vence_el)}).
        </span>
        {link}
      </div>
    );
  }
  return null;
}
