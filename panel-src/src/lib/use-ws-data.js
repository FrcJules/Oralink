import { useCallback, useEffect, useState } from "react";
import { useWsCommand } from "./hass-context.jsx";

/**
 * Charge le résultat d'une commande WebSocket `livebox/*` (cf. panel.py) et
 * expose { data, loading, error, refresh }. Le refresh est manuel : les tabs
 * appellent `livebox/refresh` côté coordinator avant de recharger si besoin.
 */
export function useWsData(type, params = {}) {
  const callWs = useWsCommand();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    callWs({ type, ...params })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
  }, [callWs, type, JSON.stringify(params)]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refresh: load };
}
