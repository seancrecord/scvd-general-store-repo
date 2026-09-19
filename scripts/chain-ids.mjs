#!/usr/bin/env node
/**
 * EVERY CHAIN ID IN THE TREE RESOLVES TO A REGISTER — run it, or let CI.
 *
 *   npm run chains:check
 *
 * AT_SCALE rule 1: derive or refuse — never a hand-typed value beside
 * the code it describes. The CAIP-2 ids this store pays on, reads, and
 * warns about are each spelled once, in a file whose job is to own
 * them: the checkout networks (lib/payment-networks.ts), the reader
 * chains (lib/base-rpc.ts, lib/solana-rpc.ts), the subject set the
 * evidence layer admits (evidence/subject.ts) and the testnets the
 * preflight names (lib/value-checks.ts). Everything else in src/ that
 * spells an id — a constant re-declared in a service, a literal in a
 * served string, a default in a route — must spell one of those. A
 * sixth rail, or a corrected id, then has one place to land and this
 * check names every site that did not follow.
 *
 * WHAT IT DOES NOT DO. It does not make the tree derive every literal
 * from the register — that is the slower work, done site by site as
 * files are touched. It refuses an id nobody owns, which is the defect
 * that bites: a mistyped chain id looks exactly like a real one to
 * every reader but the chain.
 *
 * SELF-CHECKED before it reports, the way audit.mjs is: a harvest that
 * comes back empty, a scanner that stops matching, or an unknown id
 * that passes would each read as a clean tree, which is the one
 * failure a guard must not have.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/** The files that OWN chain ids. A literal here is a definition; anywhere else it is a citation. */
const REGISTERS = [
  "src/lib/payment-networks.ts",
  "src/lib/base-rpc.ts",
  "src/lib/solana-rpc.ts",
  "src/evidence/subject.ts",
  "src/lib/value-checks.ts",
];

/**
 * Dated observation records quote what OTHER doors accepted, in their
 * words, and a chain another door names is theirs to register, not
 * ours (rule 51: no instrument has authority over another's register).
 * Each entry says why; a file with no reason is not exempt.
 */
const OBSERVED_RECORDS = {
  "src/store/neighbours.ts": "walk notes quote the chains other doors accepted, verbatim, dated",
};

const CAIP2 = /["'`](eip155:\d+|solana:[1-9A-HJ-NP-Za-km-z]{32,44})["'`]/g;
const CAIP2_LOOSE = /\b(eip155:\d+|solana:[1-9A-HJ-NP-Za-km-z]{32,44})\b/g;

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts") && !entry.endsWith(".d.ts")) found.push(path);
  }
  return found;
}

const register = new Map();
for (const file of REGISTERS) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const match of text.matchAll(CAIP2)) {
    if (!register.has(match[1])) register.set(match[1], file);
  }
}

// THE CANARY. A register that lost its checkout rail, or a scanner that
// stopped matching, would report a clean tree; both die here first.
if (!register.has("eip155:8453") || register.size < 5) {
  console.error(`\nChain-id self-check FAILED: the register harvested ${register.size} ids and lacks Base mainnet. Fix the harvest before trusting any count from this run.`);
  process.exit(1);
}
const sample = [...'const MAINNET = "eip155:8453"; const s = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";'.matchAll(CAIP2)].map((m) => m[1]);
if (sample.length !== 2) {
  console.error("\nChain-id self-check FAILED: the scanner no longer matches a quoted CAIP-2 literal.");
  process.exit(1);
}
if (register.has("eip155:99999999")) {
  console.error("\nChain-id self-check FAILED: an id nobody owns is in the register.");
  process.exit(1);
}

const unknown = [];
let cited = 0;
for (const path of sourceFiles(SRC)) {
  const rel = relative(ROOT, path);
  if (REGISTERS.includes(rel)) continue;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(CAIP2_LOOSE)) {
      cited += 1;
      if (register.has(match[1])) continue;
      if (rel in OBSERVED_RECORDS) continue;
      unknown.push(`${rel}:${index + 1}  ${match[1]}`);
    }
  });
}

// The other half of the canary: the scanner must flag what the register lacks.
const probe = [...'network: "eip155:99999999"'.matchAll(CAIP2_LOOSE)].map((m) => m[1]);
if (probe.length !== 1 || register.has(probe[0])) {
  console.error("\nChain-id self-check FAILED: an unknown id would not be flagged.");
  process.exit(1);
}

console.log(`Chain ids — ${register.size} registered across ${REGISTERS.length} files; ${cited} citations in src/.`);
for (const [id, file] of register) console.log(`  ${id.padEnd(48)} ${file}`);
if (unknown.length) {
  console.error(`\n${unknown.length} chain id${unknown.length === 1 ? "" : "s"} nobody owns:`);
  for (const row of unknown) console.error(`  ${row}`);
  console.error("\nSpell one of the registered ids, add the id to the file that owns its kind, or, for a dated record quoting another door, name the file in OBSERVED_RECORDS with its reason.");
  process.exit(1);
}
console.log("Clean. Every cited chain id resolves to a register.");
