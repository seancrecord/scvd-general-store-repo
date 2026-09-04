// An agent about to pay checks the door first. Run: node example.mjs https://door.example/api/paid
import { exitCodeFor, failedChecks, preflightOne, remediation } from "./x402-preflight.js";

const url = process.argv[2] ?? "https://door.example/api/paid";
const result = await preflightOne(url);
console.log(result.outcome, failedChecks(result.body));
for (const row of remediation(result.body)) console.log(`${row.defect_class}: buyer — ${row.buyer}`);
process.exit(exitCodeFor([result]));
