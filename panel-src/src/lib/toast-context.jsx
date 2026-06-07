import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShadowContainer } from "./shadow-container-context.jsx";

const ToastContext = createContext(null);

let nextToastId = 0;

/**
 * Petites notifications transitoires (succès/erreur) affichées en bas à droite
 * du panel — confirmation visuelle qu'une action (sauvegarde, redémarrage,
 * ajout d'une règle...) a bien été prise en compte par la Livebox.
 * Rendues via un portail dans le conteneur du Shadow DOM pour hériter du CSS.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const container = useShadowContainer();
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((message, variant) => {
    const id = ++nextToastId;
    setToasts((list) => [...list, { id, message, variant }]);
    timers.current.set(id, setTimeout(() => dismiss(id), 5000));
  }, [dismiss]);

  const api = useRef({
    success: (message) => push(message, "success"),
    error: (message) => push(message, "error"),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {container && createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              onClick={() => dismiss(t.id)}
              className={`lb-card pointer-events-auto cursor-pointer px-4 py-2.5 text-sm shadow-lg ${
                t.variant === "error" ? "lb-text-error" : "lb-text"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>,
        container,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
