// What the corpus holds about one host. Run: node example.mjs door.example
import { hostHistory, withDenominator } from "./corpus-client.js";

const host = process.argv[2] ?? "door.example";
const history = await hostHistory(host);
console.log(JSON.stringify(history, null, 2));
if (typeof history.rounds_probed === "number" && typeof history.rounds_since_first_sighting === "number") {
  console.log(withDenominator(history.rounds_probed, history.rounds_since_first_sighting, "rounds since first sighting"));
}
