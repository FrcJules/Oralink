import { useWsData } from "../lib/use-ws-data.js";
import { Card, StateBox } from "../components/card.jsx";
import { DeviceTable } from "../components/device-table.jsx";

export function DevicesTab() {
  const { data, loading, error } = useWsData("livebox/devices", {}, 3_000);

  return (
    <div className="h-full flex flex-col">
      <Card title={`Appareils${data ? ` (${data.length})` : ""}`} fill>
        <StateBox loading={loading} error={error} />
        {data && <DeviceTable devices={data} />}
      </Card>
    </div>
  );
}
