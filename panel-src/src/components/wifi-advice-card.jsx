/** Conseils Wi-Fi (livebox/wifi/advice) : signal faible, connexions instables. */
import { Lightbulb } from "lucide-react";
import { useWsData } from "../lib/use-ws-data.js";
import { Card } from "./card.jsx";
import { Pill } from "./status.jsx";

export function WifiAdviceCard() {
  const { data } = useWsData("livebox/wifi/advice", {}, 60_000);
  if (!data) return null;
  return (
    <Card title={<span className="flex items-center gap-2"><Lightbulb className="size-4" /> Conseils Wi-Fi</span>}>
      {data.length === 0 ? (
        <p className="text-sm lb-text-muted">
          Rien à signaler : aucun appareil avec un signal faible ni de connexion instable sur les dernières 24 h.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.map((a) => (
            <li key={`${a.mac}-${a.kind}`} className="flex items-start gap-2 border-b lb-border pb-2 last:border-0">
              <Pill level={a.level}>{a.kind === "weak_signal" ? "Signal" : "Instable"}</Pill>
              <span>
                <span className="font-medium lb-text">{a.name}</span>
                {a.band && <span className="ml-1 text-xs lb-text-muted">({a.band})</span>}
                <span className="block lb-text-muted">{a.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
