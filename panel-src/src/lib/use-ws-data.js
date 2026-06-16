import { useCallback, useEffect, useState } from "react";
import { useWsCommand } from "./hass-context.jsx";

/**
 * Charge le résultat d'une commande WebSocket `livebox/*` (cf. panel.py) et
 * expose { data, loading, error, refresh }.
 *
 * @param {string} type        - type de commande WS (ex: "livebox/devices")
 * @param {object} params      - paramètres supplémentaires (optionnel)
 * @param {number|null} interval - intervalle de rafraîchissement auto en ms (null = désactivé)
 */
export function useWsData(type, params = {}, interval = null) {
  const callWs = useWsCommand();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(() => {
    // On first fetch data=null → show spinner. On auto-refresh we already
    // have data, so keep it visible (no flicker) and just replace silently.
    setState((s) => ({ ...s, loading: s.data === null, error: null }));
    callWs({ type, ...params })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState((s) => ({ ...s, loading: false, error })));
  }, [callWs, type, JSON.stringify(params)]);

  useEffect(() => {
    load();
  }, [load]);

  // Rafraîchissement automatique si interval est fourni
  useEffect(() => {
    if (!interval) return;
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [load, interval]);

  return { ...state, refresh: load };
}
