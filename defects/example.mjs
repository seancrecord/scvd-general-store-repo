// Turn a failed check name into the next step, both sides. Run: node example.mjs accepts
import { defectsBySignal, remediationFor } from "./defects.js";

const signal = process.argv[2] ?? "accepts";
for (const entry of defectsBySignal(signal)) {
  const fix = remediationFor(entry.id);
  console.log(`${entry.id} — ${entry.title}\n  operator: ${fix.operator}\n  buyer:    ${fix.buyer}\n  ${fix.definition_url}`);
}
