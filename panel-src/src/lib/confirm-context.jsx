import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShadowContainer } from "./shadow-container-context.jsx";

const ConfirmContext = createContext(null);

/**
 * Confirmation modale intégrée au panel (jamais de window.confirm — ces
 * popups natives du navigateur ne sont pas souhaitées ici). Rendue via un
 * portail dans le conteneur du Shadow DOM pour hériter du CSS, sur le même
 * modèle que ToastProvider.
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const container = useShadowContainer();
  const resolver = useRef(null);

  const confirm = useCallback(({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false }) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({ title, message, confirmLabel, cancelLabel, danger });
    });
  }, []);

  const settle = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {container && request && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => settle(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="lb-card w-full max-w-sm p-5 shadow-xl"
          >
            {request.title && <p className="mb-2 font-semibold lb-text">{request.title}</p>}
            <p className="whitespace-pre-line text-sm lb-text-muted">{request.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => settle(false)} className="lb-btn-outline">
                {request.cancelLabel}
              </button>
              <button
                onClick={() => settle(true)}
                className={request.danger ? "rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700" : "lb-btn-primary"}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
        container,
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
