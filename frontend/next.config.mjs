/** @type {import('next').NextConfig} */
const nextConfig = {
  // El monorepo tiene su propio package-lock en la raíz; el frontend es su propio proyecto.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
