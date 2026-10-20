import ModuleGate from '@/components/ModuleGate';
import { MODULES } from '@/lib/constants';

// La web se exporta como sitio estático: se genera una copia de cada pantalla por módulo.
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(MODULES).map((module) => ({ module }));

export default function ModuleLayout({ children }) {
  return <ModuleGate>{children}</ModuleGate>;
}
