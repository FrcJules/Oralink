import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.jsx";
import { useHass } from "./lib/hass-context.jsx";
import { DevicesTab } from "./tabs/devices-tab.jsx";
import { NetworkTab } from "./tabs/network-tab.jsx";
import { DhcpTab } from "./tabs/dhcp-tab.jsx";
import { NatTab } from "./tabs/nat-tab.jsx";
import { TopologyTab } from "./tabs/topology-tab.jsx";
import { AdvancedTab } from "./tabs/advanced-tab.jsx";
import { RepeatersTab } from "./tabs/repeaters-tab.jsx";
import { ComingSoonTab } from "./tabs/coming-soon-tab.jsx";

const TABS = [
  { id: "devices", label: "Appareils", render: () => <DevicesTab /> },
  { id: "network", label: "Réseau", render: () => <NetworkTab /> },
  { id: "dhcp", label: "DHCP", render: () => <DhcpTab /> },
  { id: "nat", label: "NAT", render: () => <NatTab /> },
  { id: "topology", label: "Topologie", render: () => <TopologyTab /> },
  { id: "repeaters", label: "Répéteurs", render: () => <RepeatersTab /> },
  { id: "advanced", label: "Avancé", render: () => <AdvancedTab /> },
  {
    id: "events",
    label: "Événements",
    render: () => <ComingSoonTab title="Journal d'événements" description="Connexions/déconnexions, alertes, notifications email" />,
  },
  {
    id: "graphs",
    label: "Graphiques",
    render: () => <ComingSoonTab title="Graphiques de trafic" description="Historique de bande passante par appareil et par interface" />,
  },
];

export default function App() {
  const hass = useHass();

  if (!hass) {
    return <p className="p-6 text-sm text-slate-500">En attente de la connexion à Home Assistant…</p>;
  }

  return (
    <main className="space-y-4">
      <header className="flex items-center gap-2 py-2">
        <span className="text-lg font-semibold text-slate-900">📡 Oralink — Livebox</span>
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
