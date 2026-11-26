// Código del negocio (slug) con el que se entró la última vez, para no pedirlo de nuevo en /login.
const KEY = 'gc_negocio';

export function getSavedNegocio() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNegocio(slug) {
  try {
    if (slug) localStorage.setItem(KEY, slug);
    else localStorage.removeItem(KEY);
  } catch {}
}

// Link de entrada del negocio para compartir con los empleados: tuapp.com/<código>.
export const negocioLink = (slug) => (typeof window === 'undefined' ? `/${slug}` : `${window.location.origin}/${slug}`);

// Misma regla que el backend (slugify en backend/src/slug.js), para proponer la dirección mientras se escribe.
export const slugify = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
