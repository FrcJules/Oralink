import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.jsx";
import { useHass } from "./lib/hass-context.jsx";
import { DevicesTab } from "./tabs/devices-tab.jsx";
import { NetworkTab } from "./tabs/network-tab.jsx";
import { DhcpTab } from "./tabs/dhcp-tab.jsx";
import { NatTab } from "./tabs/nat-tab.jsx";
import { TopologyTab } from "./tabs/topology-tab.jsx";
import { AdvancedTab } from "./tabs/advanced-tab.jsx";
import { RepeatersTab } from "./tabs/repeaters-tab.jsx";
import { SystemTab } from "./tabs/system-tab.jsx";
import { PhoneTab } from "./tabs/phone-tab.jsx";
import { GraphsTab } from "./tabs/graphs-tab.jsx";
import { EventsTab } from "./tabs/events-tab.jsx";
import { ComingSoonTab } from "./tabs/coming-soon-tab.jsx";

const TABS = [
  { id: "devices", label: "Appareils", render: () => <DevicesTab /> },
  { id: "network", label: "Réseau", render: () => <NetworkTab /> },
  { id: "dhcp", label: "DHCP", render: () => <DhcpTab /> },
  { id: "nat", label: "NAT", render: () => <NatTab /> },
  { id: "topology", label: "Topologie", render: () => <TopologyTab /> },
  { id: "repeaters", label: "Répéteurs", render: () => <RepeatersTab /> },
  { id: "events", label: "Événements", render: () => <EventsTab /> },
  { id: "graphs", label: "Graphiques", render: () => <GraphsTab /> },
  { id: "phone", label: "Téléphone", render: () => <PhoneTab /> },
  { id: "system", label: "Système", render: () => <SystemTab /> },
  { id: "advanced", label: "Avancé", render: () => <AdvancedTab /> },
  {
    id: "tv",
    label: "Décodeurs TV",
    render: () => <ComingSoonTab title="Décodeurs TV Orange" description="Chaînes, télécommande virtuelle, infos décodeur" />,
  },
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
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
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
