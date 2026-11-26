import { MODULES } from './config.js';

// Código del negocio para su link de entrada (tuapp.com/<slug>): el nombre sin tildes, espacios ni mayúsculas.
// Es único en toda la plataforma; los usuarios, en cambio, son únicos solo dentro de cada negocio.
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;

// Rutas de la web y de la API que no pueden usarse como código de un negocio.
export const RESERVED_SLUGS = new Set([
  ...MODULES,
  'api', 'login', 'logout', 'registro', 'usuarios', 'plataforma', 'suscripcion', 'verificar-email',
  'admin', 'superadmin', 'ayuda', 'soporte', 'precios', 'contacto', 'index', 'static', 'assets', 'public',
  'www', 'app', 'web', 'negocio', 'negocios', '404', '500',
]);

export function slugify(text) {
  const slug = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : '';
}

export const isValidSlug = (slug) => SLUG_RE.test(slug) && !slug.includes('--') && !RESERVED_SLUGS.has(slug);

// Primera variante libre: libreria-centro, libreria-centro-2, libreria-centro-3…
export function freeSlug(base, isTaken) {
  const root = slugify(base) || 'negocio';
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = root.slice(0, 40 - suffix.length).replace(/-+$/, '') + suffix;
    if (isValidSlug(candidate) && !isTaken(candidate)) return candidate;
  }
}
