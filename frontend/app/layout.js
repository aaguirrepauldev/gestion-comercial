import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { DialogProvider } from '@/components/ConfirmDialog';

export const metadata = {
  title: 'Gestión Comercial',
  description: 'Control de stock, ventas y caja — Librería y Avícola',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <DialogProvider>{children}</DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
