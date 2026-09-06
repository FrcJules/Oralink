/**
 * Card — conteneur de base pour toutes les sections du panel.
 *
 * Prop `fill` : la carte occupe tout l'espace vertical disponible de son
 * conteneur (utile pour les onglets à tableau unique comme Appareils ou
 * Événements). Le body devient flex-col avec overflow-hidden, et les enfants
 * peuvent utiliser `flex-1 overflow-y-auto` pour scroller à l'intérieur.
 */
export function Card({ title, actions, children, id, fill }) {
  return (
    <div
      id={id}
      className={`lb-card ${fill ? "flex flex-col h-full" : ""}`}
    >
      <div className="lb-card-header flex-shrink-0">
        <span className="lb-card-title">{title}</span>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <div className={`lb-card-body ${fill ? "flex flex-col flex-1 overflow-hidden" : ""}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Ligne label/valeur générique (fiches "Box", "WAN", détails d'un appareil…).
 *
 * min-w-0 + break-words sur la valeur : un flex item a par défaut
 * `min-width: auto`, c'est-à-dire qu'il refuse de rétrécir sous la largeur de
 * son contenu — une longue valeur sans espaces (numéro de série, adresse MAC,
 * version de firmware…) poussait donc la ligne, puis toute la carte, hors de
 * l'écran sur mobile au lieu de passer à la ligne, forçant un défilement
 * horizontal. `flex-shrink-0` sur le label évite le même souci dans l'autre
 * sens (un long libellé ne doit jamais être celui qui rétrécit).
 */
export function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b lb-border py-1 text-sm last:border-0">
      <span className="lb-text-muted flex-shrink-0">{label}</span>
      <span className="min-w-0 break-words text-right font-medium lb-text">{value ?? "—"}</span>
    </div>
  );
}

/** Affiche un message de chargement / erreur, ou rien si tout va bien. */
export function StateBox({ loading, error }) {
  if (loading) return <p className="lb-text-muted text-sm">Chargement…</p>;
  if (error) return <p className="lb-text-error text-sm">Erreur : {String(error.message ?? error)}</p>;
  return null;
}
