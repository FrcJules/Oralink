import { Card } from "../components/card.jsx";

/**
 * Emplacement réservé pour les fonctionnalités identifiées dans le plan
 * (cf. CLAUDE.md → "Feuille de route") qui n'existent pas encore côté panel :
 * Événements, Graphiques de trafic, Téléphone, Décodeurs TV, Répéteurs détaillés...
 * Chacune deviendra un onglet à part entière avec ses propres commandes
 * WebSocket dans panel.py, suivant le pattern des onglets existants.
 */
export function ComingSoonTab({ title, description }) {
  return (
    <Card title={title}>
      <p className="text-sm text-slate-500">{description} — à venir (voir CLAUDE.md, section feuille de route).</p>
    </Card>
  );
}
