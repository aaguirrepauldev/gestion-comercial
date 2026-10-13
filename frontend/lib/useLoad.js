'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Carga datos asíncronos y expone reload() para refrescar tras una acción.
// Si hay varias cargas en curso (p. ej. al escribir en un buscador), solo se usa la última.
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const lastRequest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const request = ++lastRequest.current;
    try {
      const data = await load();
      if (request === lastRequest.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (request === lastRequest.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [load]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
  }, [reload]);

  return { ...state, reload };
}
