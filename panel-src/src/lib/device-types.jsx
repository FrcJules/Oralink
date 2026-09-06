import {
  CircleHelp, Monitor, Laptop, Smartphone, Tablet, Tv, HardDrive, Printer,
  Gamepad2, Wifi, Network, Router, Radio, Plug, Camera, Server, House, Globe,
  Box as BoxIcon,
} from "lucide-react";

// ── Icônes + libellés d'appareil — partagés entre la topologie, l'onglet
// Appareils et le tableau des appareils connectés d'un répéteur, pour que
// les mêmes catégories et icônes s'affichent partout. Une clé de cette map
// est aussi la valeur stockée pour un type forcé manuellement (cf.
// livebox/topology/type/set) — cf. deviceTypeLabel/deviceIconKey ci-dessous.
export const DEVICE_ICON_OPTIONS_MAP = {
  generic: { key: "generic", label: "Générique", Icon: CircleHelp },
  monitor: { key: "monitor", label: "Ordinateur", Icon: Monitor },
  laptop: { key: "laptop", label: "Portable", Icon: Laptop },
  smartphone: { key: "smartphone", label: "Téléphone", Icon: Smartphone },
  tablet: { key: "tablet", label: "Tablette", Icon: Tablet },
  tv: { key: "tv", label: "TV / Décodeur", Icon: Tv },
  storage: { key: "storage", label: "Stockage / NAS", Icon: HardDrive },
  printer: { key: "printer", label: "Imprimante", Icon: Printer },
  gamepad: { key: "gamepad", label: "Console", Icon: Gamepad2 },
  accessPoint: { key: "accessPoint", label: "Borne WiFi", Icon: Wifi },
  switch: { key: "switch", label: "Switch réseau", Icon: Network },
  router: { key: "router", label: "Routeur", Icon: Router },
  repeater: { key: "repeater", label: "Répéteur", Icon: Radio },
  plug: { key: "plug", label: "Prise / CPL", Icon: Plug },
  camera: { key: "camera", label: "Caméra", Icon: Camera },
  server: { key: "server", label: "Serveur", Icon: Server },
  home: { key: "home", label: "Maison / Smart", Icon: House },
  globe: { key: "globe", label: "Internet", Icon: Globe },
  box: { key: "box", label: "Box / Décodeur", Icon: BoxIcon },
};

export const DEVICE_ICON_OPTIONS = Object.values(DEVICE_ICON_OPTIONS_MAP);

const DEVICE_TYPE_TO_ICON_KEY = {
  Computer: "monitor",
  "Desktop iOS": "monitor",
  "Desktop Windows": "monitor",
  "Desktop Linux": "monitor",
  Laptop: "laptop",
  "Laptop iOS": "laptop",
  "Laptop Windows": "laptop",
  "Laptop Linux": "laptop",
  "Mobile iOS": "smartphone",
  Mobile: "smartphone",
  "Mobile Android": "smartphone",
  "Tablet iOS": "tablet",
  Tablet: "tablet",
  "Tablet Android": "tablet",
  "Tablet Windows": "tablet",
  TV: "tv",
  TVKey: "tv",
  "Apple TV": "tv",
  NAS: "storage",
  Nas: "storage",
  Printer: "printer",
  "Game Console": "gamepad",
  Switch: "switch",
  Switch4: "switch",
  Switch8: "switch",
  "Access Point": "accessPoint",
  HomePlug: "plug",
  "Set-top Box TV UHD": "tv",
  "Set-top Box": "box",
  Server: "server",
  Router: "router",
  Repeater: "repeater",
};

export function isSwitchDevice(type) {
  return !!type && /^Switch(\d+)?$/i.test(type);
}

/** Résout le type d'un appareil (brut Livebox, ou clé d'icône si forcé) vers une clé d'icône. */
export function deviceIconKey(type) {
  if (!type) return "generic";
  if (Object.hasOwn(DEVICE_ICON_OPTIONS_MAP, type)) return type;
  return DEVICE_TYPE_TO_ICON_KEY[type] ?? "generic";
}

export function renderDeviceIcon(source, className = "h-4 w-4") {
  const { Icon } = DEVICE_ICON_OPTIONS_MAP[deviceIconKey(source)];
  return <Icon className={className} />;
}

/** Libellé lisible d'un type d'appareil — traduit les clés d'icône forcées en français,
 * laisse passer tel quel un DeviceType brut Livebox non reconnu. */
export function deviceTypeLabel(type) {
  if (!type) return null;
  if (Object.hasOwn(DEVICE_ICON_OPTIONS_MAP, type)) return DEVICE_ICON_OPTIONS_MAP[type].label;
  return type;
}
