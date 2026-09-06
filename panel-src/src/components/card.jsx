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
 * Empilée (libellé au-dessus, valeur en dessous) en dessous de `sm`, côte à
 * côte au-delà. Un libellé qui ne rétrécit jamais (nécessaire pour rester
 * lisible) ne laisse, une fois côte à côte sur un écran de téléphone étroit,
 * qu'une colonne resserrée à la valeur — une longue valeur sans espaces
 * (numéro de série, MAC, version de firmware…) s'y retrouve alors compressée
 * sur plusieurs lignes très étroites même sans déborder à proprement parler.
 * Empiler les deux sur mobile donne à la valeur toute la largeur de la ligne.
 */
export function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 border-b lb-border py-1.5 text-sm last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 sm:py-1">
      <span className="lb-text-muted sm:flex-shrink-0">{label}</span>
      <span className="break-words font-medium lb-text sm:min-w-0 sm:text-right">{value ?? "—"}</span>
    </div>
  );
}

/** Affiche un message de chargement / erreur, ou rien si tout va bien. */
export function StateBox({ loading, error }) {
  if (loading) return <p className="lb-text-muted text-sm">Chargement…</p>;
  if (error) return <p className="lb-text-error text-sm">Erreur : {String(error.message ?? error)}</p>;
  return null;
}
