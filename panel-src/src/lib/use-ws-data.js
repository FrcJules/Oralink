import { useCallback, useEffect, useRef, useState } from "react";
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
  // Numéro de la dernière requête lancée : une réponse plus ancienne (params
  // changés entre-temps, ou auto-refresh qui double une requête lente) est
  // ignorée au lieu d'écraser des données plus récentes.
  const requestSeq = useRef(0);
  const paramsKey = JSON.stringify(params);

  const load = useCallback(() => {
    const seq = ++requestSeq.current;
    // Pas de setState synchrone ici (appelé depuis un effet) : l'état initial
    // est déjà « loading », et lors d'un rafraîchissement les données
    // précédentes restent affichées (pas de clignotement) jusqu'à la réponse.
    callWs({ type, ...JSON.parse(paramsKey) })
      .then((data) => {
        if (seq === requestSeq.current) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (seq === requestSeq.current) setState((s) => ({ ...s, loading: false, error }));
      });
  }, [callWs, type, paramsKey]);

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
