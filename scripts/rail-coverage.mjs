#!/usr/bin/env node
/**
 * npm run rail-coverage -- --out <dir>
 *
 * For every service a public directory lists: which rails does the door
 * ADVERTISE, and which of those does the directory MEASURE? The gap is
 * where a settlement count can be a true zero and a misleading one at
 * the same time.
 *
 * NOT OUR FINDING. StillOS Notary ran this first, on issue #622,
 * 2026-09-16, after we read his five doors and returned UNKNOWN on
 * daxpt — a door whose Base rail is provably empty and whose XRPL rail
 * is not. He generalised the shape across the whole directory. This is
 * the second operator reproducing it independently, which is the only
 * thing a second operator is for.
 *
 * THE CAIP-2 TRAP IS THE WHOLE INSTRUMENT. Comparing chain ids as
 * strings returns hundreds of gaps that are not gaps: one producer
 * truncates a Solana chain reference and another does not. His first
 * pass found 266 and 248 of them were exactly that. Normalising before
 * comparing is the difference between a finding and a scare, and it is
 * why the naive count is reported here too rather than quietly dropped.
 *
 * Read-only. Signs nothing, spends nothing, needs no key. Never a
 * ranking (rule 43); rows are in the order the directory served them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sameChain } from "./lib/evm-chains.mjs";
import { useEnvProxy } from "./lib/proxy-fetch.mjs";

// Node's fetch ignores HTTPS_PROXY; in a proxied sandbox that reads as
// "host unreachable" when the host is merely unrouted. See the module.
await useEnvProxy();

const SOURCE = "https://x402-list.com/api/v1/services";
const UA = "scvd-rail-coverage/1.0 (+https://scvd.store/what) read-only";
const ATTRIBUTION = "Data: x402-list.com (CC BY 4.0)";

/**
 * Testnet chain ids. A door advertising a testnet rail that nobody
 * measures is a different fact from a mainnet one — no real money was
 * ever going to move there — so the two are counted apart rather than
 * summed into a scarier single number.
 */
const TESTNETS = new Set([
  "eip155:84532",    // Base Sepolia
  "eip155:80002",    // Polygon Amoy
  "eip155:11155111", // Ethereum Sepolia
  "eip155:421614",   // Arbitrum Sepolia
]);

const flags = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) flags[a.slice(2)] = process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i];
}
const fail = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

const getJson = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

/** Every page. A denominator that is a page is the failure this whole line of work began with. */
async function allServices() {
  const first = await getJson(`${SOURCE}?page=1&per_page=25`);
  const pages = first.meta?.total_pages ?? 1;
  const rows = [...first.data];
  for (let p = 2; p <= pages; p += 1) rows.push(...(await getJson(`${SOURCE}?page=${p}&per_page=25`)).data);
  const distinct = new Set(rows.map((r) => r.slug));
  if (rows.length !== first.meta?.total || distinct.size !== rows.length) {
    fail(`walked ${rows.length} rows (${distinct.size} distinct) against meta.total ${first.meta?.total}: the population moved under the walk`);
  }
  return { rows, pages, total: first.meta.total };
}

const outDir = flags.out ?? `research/rail-coverage-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(outDir, { recursive: true });

const { rows, pages, total } = await allServices();
console.log(`walked ${rows.length} services across ${pages} pages (meta.total ${total})\n`);

let naiveGapDoors = 0;
const gaps = [];
for (const row of rows) {
  const advertised = row.networks_caip2 ?? [];
  const measured = row.assessment?.traction?.measured_networks ?? [];
  if (advertised.some((a) => !measured.includes(a))) naiveGapDoors += 1;
  const unmeasured = advertised.filter((a) => !measured.some((m) => sameChain(a, m)));
  if (unmeasured.length === 0) continue;
  const traction = row.assessment?.traction ?? null;
  gaps.push({
    slug: row.slug, base_url: row.base_url ?? null,
    advertised, measured, unmeasured,
    unmeasured_mainnet: unmeasured.filter((r) => !TESTNETS.has(r)),
    tx_count_all_time: traction?.tx_count_all_time ?? null,
    traction_status: traction?.status ?? null,
  });
}

const byRail = {};
for (const g of gaps) for (const r of g.unmeasured) byRail[r] = (byRail[r] ?? 0) + 1;
const quiet = gaps.filter((g) => g.tx_count_all_time === 0 || g.tx_count_all_time === null);
const quietMainnet = quiet.filter((g) => g.unmeasured_mainnet.length > 0);

console.log(`doors with a gap, naive string compare:   ${naiveGapDoors}`);
console.log(`doors with a gap, CAIP-2 normalised:      ${gaps.length}`);
console.log(`  of those, zero or null all-time:        ${quiet.length}`);
console.log(`  of those, on a MAINNET rail:            ${quietMainnet.length}`);
console.log("\nunmeasured rails, by how many doors advertise them:");
for (const [rail, n] of Object.entries(byRail).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rail.padEnd(46)} ${String(n).padStart(3)}${TESTNETS.has(rail) ? "  (testnet)" : ""}`);
}
console.log("\nquiet on a mainnet rail nobody measures:");
for (const g of quietMainnet) console.log(`  ${g.slug}`);

const report = {
  what_this_is: "For every service in a public x402 directory: the rails the door advertises, set against the rails that directory says it measured. Never a ranking; rows are in the order the directory served them.",
  what_this_is_not: "Not a finding that any door is unpaid, and not an error in the directory. A traction row that names its measured_networks is telling the truth about what it counted. This measures the DISTANCE between what a door offers and what one observer watched, which is a fact about coverage and belongs to everybody.",
  first_run_by: "StillOS Notary (stillosdigitalholdings.com), issue #622, 2026-09-16. This is an independent reproduction by a second operator using its own code; the shape of the question is theirs.",
  read_at: new Date().toISOString(),
  source: { url: SOURCE, attribution: ATTRIBUTION, license: "CC-BY-4.0", pages_walked: pages, services_seen: rows.length, meta_total: total },
  the_caip2_trap: `Comparing chain ids as strings gives ${naiveGapDoors} doors with a gap. Normalising first gives ${gaps.length}. The difference is one producer truncating a chain reference and another not, and reporting the first number would have been a scare rather than a finding. Both are printed here so the correction is visible rather than assumed.`,
  counts: {
    services_seen: rows.length,
    gap_doors_naive: naiveGapDoors,
    gap_doors_normalised: gaps.length,
    gap_doors_quiet: quiet.length,
    gap_doors_quiet_mainnet: quietMainnet.length,
    by_rail: byRail,
    denominator_note: "Every figure is out of services_seen, the whole population at the named moment, not a page of it.",
  },
  quiet_on_an_unmeasured_mainnet_rail: quietMainnet.map((g) => g.slug),
  doors: gaps,
};
writeFileSync(join(outDir, "reading.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n→ ${join(outDir, "reading.json")}`);
