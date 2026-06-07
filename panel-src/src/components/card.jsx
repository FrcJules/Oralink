export function Card({ title, actions, children }) {
  return (
    <div className="lb-card">
      <div className="lb-card-header">
        <span className="lb-card-title">{title}</span>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <div className="lb-card-body">{children}</div>
    </div>
  );
}

/** Affiche un message de chargement / erreur, ou rien si tout va bien. */
export function StateBox({ loading, error }) {
  if (loading) return <p className="lb-text-muted text-sm">Chargement…</p>;
  if (error) return <p className="lb-text-error text-sm">Erreur : {String(error.message ?? error)}</p>;
  return null;
}
