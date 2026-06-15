import { useState, useRef } from "react";
import {
  LayoutDashboard, Monitor, Network, GitFork,
  Wifi, Radio, BarChart2, Phone, Tv,
  Settings, Activity, Menu, X, ChevronRight,
} from "lucide-react";
import { useHass } from "./lib/hass-context.jsx";
import { OverviewTab }      from "./tabs/overview-tab.jsx";
import { DevicesTab }       from "./tabs/devices-tab.jsx";
import { ReseauTab }        from "./tabs/reseau-tab.jsx";
import { WifiTab }          from "./tabs/wifi-tab.jsx";
import { GraphsTab }        from "./tabs/graphs-tab.jsx";
import { AdministrationTab } from "./tabs/administration-tab.jsx";
import { TopologyTab }      from "./tabs/topology-tab.jsx";
import { PhoneTab }         from "./tabs/phone-tab.jsx";
import { EventsTab }        from "./tabs/events-tab.jsx";
import { TvDecoderTab }     from "./tabs/tv-decoder-tab.jsx";
import { RepeatersTab }     from "./tabs/repeaters-tab.jsx";

const NAV_GROUPS = [
  {
    items: [
      { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
    ],
  },
  {
    label: "Réseau",
    items: [
      { id: "devices",  label: "Appareils",  icon: Monitor  },
      { id: "reseau",   label: "DHCP & NAT", icon: Network  },
      { id: "topology", label: "Topologie",  icon: GitFork  },
    ],
  },
  {
    label: "Wifi",
    items: [
      { id: "wifi",      label: "Wifi",        icon: Wifi     },
      { id: "repeaters", label: "Répéteurs",   icon: Radio    },
      { id: "graphs",    label: "Graphiques",  icon: BarChart2 },
    ],
  },
  {
    label: "Services",
    items: [
      { id: "phone", label: "Téléphone",    icon: Phone },
      { id: "tv",    label: "Décodeurs TV", icon: Tv    },
    ],
  },
  {
    label: "Système",
    items: [
      { id: "administration", label: "Administration", icon: Settings  },
      { id: "events",         label: "Événements",     icon: Activity  },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const TAB_RENDER = {
  overview:       () => <OverviewTab />,
  devices:        () => <DevicesTab />,
  reseau:         () => <ReseauTab />,
  wifi:           () => <WifiTab />,
  graphs:         () => <GraphsTab />,
  administration: () => <AdministrationTab />,
  topology:       () => <TopologyTab />,
  repeaters:      () => <RepeatersTab />,
  phone:          () => <PhoneTab />,
  events:         () => <EventsTab />,
  tv:             () => <TvDecoderTab />,
};

function Sidebar({ active, onSelect, onClose, showCloseBtn }) {
  return (
    <aside className="flex h-full w-56 flex-col overflow-y-auto border-r lb-border bg-[var(--card-background-color,#fff)]">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 border-b lb-border px-4 py-3.5 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold"
            style={{ background: "var(--lb-brand)", color: "var(--lb-brand-contrast)" }}
          >O</span>
          <div className="min-w-0">
            <p className="text-sm font-bold lb-text leading-tight">Oralink</p>
            <p className="text-xs lb-text-muted leading-tight">Livebox</p>
          </div>
        </div>
        {showCloseBtn && (
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1 hover:bg-[var(--secondary-background-color)]"
          >
            <X className="size-4 lb-text-muted" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="mb-1 px-4 text-xs font-semibold uppercase tracking-wide lb-text-muted">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                      isActive
                        ? "lb-sidebar-active"
                        : "lb-text-muted hover:bg-[var(--secondary-background-color)] hover:lb-text"
                    }`}
                  >
                    <Icon className="size-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {isActive && <ChevronRight className="ml-auto size-3.5 flex-shrink-0 opacity-60" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export default function App() {
  const hass = useHass();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hassMenuRef = useRef(null);

  if (!hass) {
    return <p className="p-6 text-sm lb-text-muted">En attente de la connexion à Home Assistant…</p>;
  }

  const handleSelect = (id) => {
    setActiveTab(id);
    setSidebarOpen(false);
  };

  const activeLabel = ALL_ITEMS.find((i) => i.id === activeTab)?.label ?? "Oralink";

  return (
    <div className="flex lb-app-height">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, static on desktop */}
      <div className={`
        fixed inset-y-0 left-0 z-40 md:static md:z-auto md:flex md:flex-shrink-0
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <Sidebar
          active={activeTab}
          onSelect={handleSelect}
          onClose={() => setSidebarOpen(false)}
          showCloseBtn={sidebarOpen}
        />
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b lb-border px-4 py-3 md:hidden flex-shrink-0">
          {/* HA sidebar toggle (bubbles through Shadow DOM) */}
          <button
            ref={hassMenuRef}
            onClick={() =>
              hassMenuRef.current?.dispatchEvent(
                new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true })
              )
            }
            className="rounded-md p-1.5 lb-text-muted hover:bg-[var(--secondary-background-color)]"
            aria-label="Menu Home Assistant"
          >
            <Menu className="size-5" />
          </button>
          {/* Panel nav toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 lb-text-muted hover:bg-[var(--secondary-background-color)]"
            aria-label="Navigation panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <span className="text-base font-semibold lb-text truncate">{activeLabel}</span>
        </header>

        {/* Tab content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {TAB_RENDER[activeTab]?.()}
        </main>
      </div>
    </div>
  );
}
