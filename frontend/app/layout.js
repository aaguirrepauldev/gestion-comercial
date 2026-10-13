import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'Gestión Comercial',
  description: 'Control de stock, ventas y caja — Librería y Avícola',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
