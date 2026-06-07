import { createContext, useCallback, useContext, useRef } from "react";

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
  // HA pose un nouvel objet `hass` à *chaque* mise à jour d'état dans toute
  // l'installation (potentiellement plusieurs fois par seconde) — bien plus
  // souvent qu'à chaque fois qu'on a réellement besoin de relire les données
  // du panel. Si `callWs` dépendait de `[hass]`, son identité changerait au
  // même rythme, ce qui re-déclencherait en boucle les `useEffect`/
  // `useCallback` de `useWsData` (rechargement -> re-rendu -> nouvelle
  // identité -> rechargement...) — d'où les cartes qui "sautent" sans cesse.
  // On lit donc `hass` via une ref pour garder une identité de fonction
  // stable, tout en appelant toujours la connexion la plus récente.
  const hassRef = useRef(hass);
  hassRef.current = hass;

  return useCallback((message) => {
    const current = hassRef.current;
    if (!current) return Promise.reject(new Error("hass not ready"));
    return current.callWS(message);
  }, []);
}
