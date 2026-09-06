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
    <aside className="flex h-full min-h-0 w-56 flex-col overflow-y-auto border-r lb-border bg-[var(--card-background-color,#fff)]">
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
      <nav className="flex-1 min-h-0 overflow-y-auto py-3 space-y-4">
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
    <div className="flex min-h-0 flex-1 overflow-hidden">
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar — `fixed` (not just a high z-index in normal flow):
            it must be completely immune to whatever the page around it is
            doing, since it's the only way to close the drawer or reach HA's
            own menu. A normal-flow header can still end up not receiving
            taps — pushed out of view by a page-level scroll some tall tab
            triggers elsewhere, or just fragile nested-flex sizing — even
            when it visually outranks the drawer (z-40) and backdrop (z-30)
            on z-index alone. Fixed positioning sidesteps all of that: it's
            always painted at the same spot relative to the viewport,
            independent of scroll or layout state. Content below gets
            matching top padding (h-14) so it doesn't start underneath it. */}
        <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b lb-border bg-[var(--card-background-color,#fff)] px-4 md:hidden">
          {/* HA sidebar toggle (bubbles through Shadow DOM) */}
          <button
            ref={hassMenuRef}
            onClick={() => {
              setSidebarOpen(false);
              hassMenuRef.current?.dispatchEvent(
                new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true })
              );
            }}
            className="rounded-md p-1.5 lb-text-muted hover:bg-[var(--secondary-background-color)]"
            aria-label="Menu Home Assistant"
          >
            <Menu className="size-5" />
          </button>
          {/* Panel nav toggle — a real open/close toggle, not open-only: the
              drawer's own close button sits at its own top, which this header
              (z-50, on top of the drawer at z-40) visually covers whenever the
              drawer is open. Without this being a toggle, there was no way
              left to close the drawer once opened, other than tapping the
              dimmed backdrop below the header strip. */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded-md p-1.5 lb-text-muted hover:bg-[var(--secondary-background-color)]"
            aria-label={sidebarOpen ? "Fermer la navigation" : "Ouvrir la navigation"}
          >
            {sidebarOpen ? (
              <X className="size-5" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
              </svg>
            )}
          </button>
          <span className="text-base font-semibold lb-text truncate">{activeLabel}</span>
        </header>

        {/* Tab content — overflow-hidden so tabs control their own scroll.
            min-h-0 on every flex link in this chain is required: a flex
            item's default min-height is "auto" (its content's natural size),
            not 0 — without overriding that, a tall tab (e.g. Répéteurs with
            many devices) refuses to shrink to the space actually allotted to
            it and grows the whole page instead of scrolling internally here,
            which pushes the mobile header (a normal, non-fixed element) out
            of view on scroll while the fixed nav drawer stays pinned to the
            viewport — looking like the drawer took over the screen. */}
        {/* pt-[4.5rem] clears the fixed mobile header (h-14 = 3.5rem) on top of
            the usual p-4 spacing; md:pt-6 resets it back to plain md:p-6 on
            desktop, where that header doesn't exist. */}
        <main className="flex-1 min-h-0 overflow-hidden p-4 pt-[4.5rem] md:p-6 md:pt-6 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto lb-scroll">
            {TAB_RENDER[activeTab]?.()}
          </div>
        </main>
      </div>
    </div>
  );
}
