import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.jsx";
import { useHass } from "./lib/hass-context.jsx";
import { OverviewTab } from "./tabs/overview-tab.jsx";
import { DevicesTab } from "./tabs/devices-tab.jsx";
import { ReseauTab } from "./tabs/reseau-tab.jsx";
import { WifiTab } from "./tabs/wifi-tab.jsx";
import { GraphsTab } from "./tabs/graphs-tab.jsx";
import { AdministrationTab } from "./tabs/administration-tab.jsx";
import { TopologyTab } from "./tabs/topology-tab.jsx";
import { PhoneTab } from "./tabs/phone-tab.jsx";
import { EventsTab } from "./tabs/events-tab.jsx";
import { TvDecoderTab } from "./tabs/tv-decoder-tab.jsx";

const TABS = [
  { id: "overview",        label: "Vue d'ensemble", render: () => <OverviewTab /> },
  { id: "devices",         label: "Appareils",       render: () => <DevicesTab /> },
  { id: "reseau",          label: "Réseau",           render: () => <ReseauTab /> },
  { id: "wifi",            label: "Wifi",             render: () => <WifiTab /> },
  { id: "graphs",          label: "Graphiques",       render: () => <GraphsTab /> },
  { id: "administration",  label: "Administration",   render: () => <AdministrationTab /> },
  { id: "topology",        label: "Topologie",        render: () => <TopologyTab /> },
  { id: "phone",           label: "Téléphone",        render: () => <PhoneTab /> },
  { id: "events",          label: "Événements",       render: () => <EventsTab /> },
  { id: "tv",              label: "Décodeurs TV",     render: () => <TvDecoderTab /> },
];

export default function App() {
  const hass = useHass();

  if (!hass) {
    return <p className="p-6 text-sm lb-text-muted">En attente de la connexion à Home Assistant…</p>;
  }

  return (
    <main className="space-y-4">
      <header className="flex items-center gap-2.5 py-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold"
          style={{ background: "var(--lb-brand)", color: "var(--lb-brand-contrast)" }}
        >
          O
        </span>
        <span className="text-lg font-semibold">
          <span className="lb-text">Oralink </span>
          <span style={{ color: "var(--lb-brand)" }}>Livebox</span>
        </span>
      </header>

      <Tabs defaultValue={TABS[0].id}>
        {/* Tab bar: scrollable on mobile, wrapped flex on larger screens */}
        <TabsList className="w-full overflow-x-auto flex-nowrap md:flex-wrap h-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="whitespace-nowrap text-xs md:text-sm flex-shrink-0">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            {tab.render()}
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
