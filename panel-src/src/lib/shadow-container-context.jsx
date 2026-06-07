import { createContext, useContext } from "react";

/**
 * Conteneur (div) posé dans le Shadow DOM du panel, à utiliser comme `container`
 * pour les Portals Radix UI (Dialog, DropdownMenu, Tooltip...) afin qu'ils
 * héritent du CSS du panel au lieu de se monter dans `document.body` (hors
 * Shadow DOM, donc sans styles).
 */
const ShadowContainerContext = createContext(null);

export const ShadowContainerProvider = ShadowContainerContext.Provider;

export function useShadowContainer() {
  return useContext(ShadowContainerContext);
}
