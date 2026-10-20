/** @type {import('next').NextConfig} */
const nextConfig = {
  // Se compila como sitio estático (frontend/out) que sirve la propia API: un solo servicio en producción.
  output: 'export',
  // Cada pantalla queda como carpeta/index.html, que es lo que espera express.static.
  trailingSlash: true,
  // El monorepo tiene su propio package-lock en la raíz; el frontend es su propio proyecto.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
