import { useMemo } from "react";
import { useWsData } from "./use-ws-data.js";

/**
 * Résout une adresse MAC en nom d'appareil connu de la Livebox — utile pour
 * les tableaux qui ne reçoivent qu'une MAC brute (stations Wifi, stations
 * répéteur) et n'ont pas déjà un nom résolu côté backend.
 */
export function useDeviceNames() {
  const { data } = useWsData("livebox/devices", {}, 30_000);

  const byMac = useMemo(() => {
    const map = new Map();
    for (const d of data ?? []) {
      if (d.mac) map.set(d.mac.toUpperCase(), d.name);
    }
    return map;
  }, [data]);

  return (mac, fallback = mac) => {
    if (!mac) return fallback;
    const name = byMac.get(mac.toUpperCase());
    return name && name !== mac ? name : fallback;
  };
}
