'use client';

import { useEffect, useState } from 'react';

// Devuelve `value` recién cuando deja de cambiar durante `delay` ms (p. ej. mientras se escribe).
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
