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
      // Les commandes de modification exigent un compte administrateur HA
      // (`@websocket_api.require_admin` côté panel.py).
      const text = err?.code === "unauthorized"
        ? "Action réservée aux administrateurs Home Assistant."
        : (errorMessage ?? `Erreur : ${String(err?.message ?? err)}`);
      toast?.error(text);
      throw err;
    }
  }, [callWs, toast]);
}
