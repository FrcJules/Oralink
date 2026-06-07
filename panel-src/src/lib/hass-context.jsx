import { createContext, useCallback, useContext } from "react";

const HassContext = createContext(null);

export function HassProvider({ hass, children }) {
  return <HassContext.Provider value={hass}>{children}</HassContext.Provider>;
}

/** Objet `hass` fourni par Home Assistant (état, services, callWS...). */
export function useHass() {
  return useContext(HassContext);
}

/** Raccourci pour appeler une commande WebSocket exposée par panel.py (ws_get_*, ws_*_set...). */
export function useWsCommand() {
  const hass = useHass();
  // Identité stable entre les rendus : sans `useCallback`, chaque rendu
  // recréait cette fonction, ce qui invalidait le `useCallback`/`useEffect`
  // de `useWsData` et provoquait une boucle infinie d'appels WS et de
  // re-rendus (jusqu'au crash de l'onglet par épuisement mémoire).
  return useCallback(
    (message) => {
      if (!hass) return Promise.reject(new Error("hass not ready"));
      return hass.callWS(message);
    },
    [hass],
  );
}
