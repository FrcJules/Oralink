import { createContext, useContext } from "react";

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
  return (message) => {
    if (!hass) return Promise.reject(new Error("hass not ready"));
    return hass.callWS(message);
  };
}
