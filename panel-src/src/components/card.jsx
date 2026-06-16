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

/** Affiche un message de chargement / erreur, ou rien si tout va bien. */
export function StateBox({ loading, error }) {
  if (loading) return <p className="lb-text-muted text-sm">Chargement…</p>;
  if (error) return <p className="lb-text-error text-sm">Erreur : {String(error.message ?? error)}</p>;
  return null;
}
