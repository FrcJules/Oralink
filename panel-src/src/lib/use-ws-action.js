import { useCallback } from "react";
import { useWsCommand } from "./hass-context.jsx";
import { useToast } from "./toast-context.jsx";

/**
 * Encapsule un appel WebSocket de mutation (`livebox/...`) avec un retour
 * visuel systématique (toast succès/erreur) — confirmation que l'action a
 * bien été prise en compte par la Livebox, ou explication de l'échec.
 */
export function useWsAction() {
  const callWs = useWsCommand();
  const toast = useToast();

  return useCallback(async (message, { success, error: errorMessage } = {}) => {
    try {
      const result = await callWs(message);
      if (success) toast?.success(success);
      return result;
    } catch (err) {
      toast?.error(errorMessage ?? `Erreur : ${String(err.message ?? err)}`);
      throw err;
    }
  }, [callWs, toast]);
}
