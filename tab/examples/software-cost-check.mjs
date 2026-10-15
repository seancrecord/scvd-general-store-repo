import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {logToolEvent, burnRollup, checkBeforeSignup, trialsConverting, whatsDue} from "../tools.mjs";

// Every call uses this fresh synthetic ledger, never the user's default path.
export function softwareCostExample() {
  const ledger = join(mkdtempSync(join(tmpdir(), "scvd-tab-example-")), "tab.jsonl");
  const trialEnds = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const price = (amount, period) => ({amount, currency: "USD", period});
  for (const event of [
    {tool_name: "synthetic-analytics", event: "paid_started", category: "analytics", problem_solved: "Fixture reports", price: price(20, "month")},
    {tool_name: "synthetic-hosting", event: "paid_started", category: "hosting", problem_solved: "Fixture website", price: price(120, "year")},
    {tool_name: "synthetic-trial", event: "trial_started", category: "analytics", problem_solved: "Fixture alternative reports", price: price(15, "month"), trial_ends: trialEnds},
  ]) {
    const result = logToolEvent(event, ledger);
    if (!result.logged) throw new Error(`Synthetic event refused: ${JSON.stringify(result.problems)}`);
  }
  return {
    scope: "Synthetic local records only; no reminder delivered or acknowledged.",
    ledger_path: ledger,
    burn: burnRollup({}, ledger),
    existing_signup: checkBeforeSignup({tool_name: "synthetic-analytics", category: "analytics"}, ledger),
    possible_overlap: checkBeforeSignup({tool_name: "synthetic-new-analytics", category: "analytics"}, ledger),
    trials: trialsConverting({days: 7}, ledger),
    reminders: whatsDue({limit: 10, days: 7}, ledger),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(softwareCostExample(), null, 2));
}
