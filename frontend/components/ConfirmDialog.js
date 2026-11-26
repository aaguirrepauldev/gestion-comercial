'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Reemplazo de window.confirm / window.alert con el estilo de la app.
// Uso:
//   const { confirm, alert } = useDialog();
//   if (!(await confirm({ title: '¿Anular venta?', message: '…', confirmLabel: 'Anular', danger: true }))) return;
//   await alert({ title: 'No se pudo guardar', message: err.message });

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const open = useCallback(
    (opts, alertOnly) =>
      new Promise((resolve) => {
        setDialog({ ...(typeof opts === 'string' ? { message: opts } : opts), alertOnly, resolve });
      }),
    []
  );

  const value = useRef({
    confirm: (opts) => open(opts, false),
    alert: (opts) => open(opts, true),
  }).current;

  const close = useCallback(
    (result) => {
      dialog?.resolve(result);
      setDialog(null);
    },
    [dialog]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog requiere <DialogProvider>');
  return ctx;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger = false,
  alertOnly = false,
  onClose,
}) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    // En acciones destructivas el foco arranca en "Cancelar", así un Enter apurado no borra nada.
    (danger && !alertOnly ? cancelRef : confirmRef).current?.focus();
    // Escucha en captura y corta la propagación: si el diálogo está encima de otro Modal,
    // Escape cierra solo este y no los dos.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [danger, alertOnly, onClose]);

  const tone = danger ? 'danger' : 'info';

  return (
    <div className="modal-backdrop dialog-backdrop" onMouseDown={() => onClose(false)}>
      <div
        className="dialog card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={`dialog-icon ${tone}`} aria-hidden="true">
          {tone === 'danger' ? '!' : 'i'}
        </div>
        <div className="dialog-body">
          <h2 id="dialog-title">{title || (alertOnly ? 'Aviso' : '¿Confirmar?')}</h2>
          {message && (
            <p id="dialog-message" className="muted">
              {message}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          {!alertOnly && (
            <button ref={cancelRef} className="btn outline" onClick={() => onClose(false)}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            className={`btn ${danger && !alertOnly ? 'danger' : 'primary'}`}
            onClick={() => onClose(true)}
          >
            {confirmLabel || (alertOnly ? 'Entendido' : 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}
