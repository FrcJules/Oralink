import { haConnect } from "./ha.mjs";
import { writeFileSync } from "node:fs";
const reads = process.argv[2].split(",");
const { call, close } = await haConnect();
const out = {};
for (const t of reads) {
  const r = await call({ type: t });
  out[t] = r.success ? r.result : { __error: r.error };
  console.log(t.padEnd(30), r.success ? `ok (${JSON.stringify(r.result).length} o)` : `ERREUR ${r.error?.code}: ${r.error?.message}`);
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
await close();
