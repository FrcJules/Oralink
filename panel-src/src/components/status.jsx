import { useState } from "react";
import { ChevronRight } from "lucide-react";

/** Pastille d'état : level = ok | warn | bad | neutral. */
export function Pill({ level = "neutral", children, title }) {
  return <span className={`lb-pill lb-pill-${level}`} title={title}>{children}</span>;
}

/** Point de couleur d'état (début de ligne d'alerte, appareil en ligne…). */
export function Dot({ level = "neutral", className = "" }) {
  return <span aria-hidden="true" className={`lb-dot lb-dot-${level} ${className}`} />;
}

/**
 * Section repliable, fermée par défaut. Le contenu n'est monté qu'à
 * l'ouverture : les cartes qui font leurs propres requêtes WS (IPTV,
 * connexion…) ne coûtent rien tant qu'on ne les regarde pas.
 */
export function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="lb-card lb-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <ChevronRight className="lb-chevron size-4 lb-text-muted transition-transform" />
        {title}
      </summary>
      {open && <div className="lb-card-body">{children}</div>}
    </details>
  );
}

/**
 * Mini-courbe SVG (sans recharts, pour rester dans le chunk principal).
 * `series` : [{ values: number[], color, area?, dashed? }], même échelle.
 */
export function Sparkline({ series, height = 44, label }) {
  const width = 200;
  const all = series.flatMap((s) => s.values);
  const n = Math.max(...series.map((s) => s.values.length), 0);
  if (n < 2) return <div style={{ height }} />;
  const max = Math.max(...all, 0.001);
  const x = (i) => (i / (n - 1)) * width;
  const y = (v) => height - 2 - (Math.max(0, v) / max) * (height - 6);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full"
      style={{ height }} role="img" aria-label={label}>
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        const line = `M${pts.join(" L")}`;
        return (
          <g key={si}>
            {s.area && (
              <path d={`${line} L${width},${height} L0,${height} Z`} fill={s.color} fillOpacity="0.15" />
            )}
            <path d={line} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.4 : 2}
              strokeDasharray={s.dashed ? "4 3" : undefined} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}
