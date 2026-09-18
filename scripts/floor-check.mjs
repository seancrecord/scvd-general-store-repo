#!/usr/bin/env node
/**
 * npm run floor-check -- --at-block <n> --out <dir>
 *
 * Takes every door a public directory reports as NEVER PAID, and reads
 * the chain at each door's own advertised payTo. Read-only: it signs
 * nothing, spends nothing, and needs no key.
 *
 * WHY THE CHEAP PATH. Indexing a transfer window costs ~199 requests
 * per address at the public RPC's 2,000-block ceiling. `balanceOf`
 * plus a nonce costs two, and under the nonce argument those two
 * settle both directions: a balance above zero proves arrival, and a
 * zero balance at nonce zero proves an ALL-TIME zero, because USDC
 * leaves an address only by a transaction from it. So the whole
 * population is readable for the price of a sample. The argument is
 * StillOS Notary's; using it to check somebody else's floor is ours.
 *
 * WHAT IT IS NOT. Not an audit of the directory, not a ranking of
 * anything, and not a claim that a door was paid — see
 * BALANCE_RESIDUAL. Where the directory declares its count a floor,
 * a chain reading past it is that claim working.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { USDC_BASE, readDoorRail } from "./lib/paid-doors.mjs";
import { BALANCE_RESIDUAL, compareToFloor, tally } from "./lib/floor-check.mjs";
import { useEnvProxy } from "./lib/proxy-fetch.mjs";

// Node's fetch ignores HTTPS_PROXY; in a proxied sandbox that reads as
// "host unreachable" when the host is merely unrouted. See the module.
await useEnvProxy();

const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const UA = "scvd-floor-check/1.0 (+https://scvd.store/what) read-only";
const SOURCE = "https://x402-list.com/api/v1/services";
/**
 * The caveat the directory prints beside its own numbers, quoted
 * rather than paraphrased. It is what makes these counts floors, and
 * the whole reading turns on it.
 */
const SOURCE_CAVEAT =
  "Conservative undercount: only USDC settlements via facilitators we measure are counted. A measured floor, not an estimate.";
const SOURCE_ATTRIBUTION = "Data: x402-list.com (CC BY 4.0)";

const flags = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a.startsWith("--")) flags[a.slice(2)] = process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i];
}
const fail = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const hex = (n) => `0x${BigInt(n).toString(16)}`;

/**
 * A 429 IS NOT A FACT ABOUT THE CHAIN. The first version of this file
 * threw on every 4xx without retrying and the caller turned the throw
 * into null, so 107 addresses came back "we could not establish it"
 * when every one of them answers on a second ask. An instrument that
 * cannot tell "this address holds nothing" from "we were rate limited"
 * is the failure StillOS described from his own chain reader: failing
 * closed, and silent. Silence is the part that makes it dangerous.
 *
 * So: 429 and 5xx are the provider pacing or stumbling and are retried
 * with backoff; every other 4xx is the provider's stated refusal and
 * is not. Whatever survives is THROWN, never returned as a value the
 * caller can mistake for a reading.
 */
async function rpc(method, params, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await new Promise((done) => setTimeout(done, Math.min(8000, 400 * 2 ** (i - 1))));
    try {
      const r = await fetch(RPC, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 429 || r.status >= 500) {
        const after = Number(r.headers.get("retry-after"));
        if (Number.isFinite(after) && after > 0) await new Promise((d) => setTimeout(d, Math.min(15_000, after * 1000)));
        last = new Error(`${method}: HTTP ${r.status}`);
        continue;
      }
      if (!r.ok) throw new Error(`${method}: HTTP ${r.status}`);
      const b = await r.json();
      if (b.error) throw new Error(`${method}: ${JSON.stringify(b.error)}`);
      return b.result;
    } catch (error) {
      if (/HTTP 4/.test(error?.message ?? "") && !/HTTP 429/.test(error?.message ?? "")) throw error;
      last = error;
    }
  }
  throw new Error(`${last?.message ?? last} (after ${attempts} attempts)`);
}

const getJson = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

/**
 * EVERY page, never the first. A directory that serves 25 rows with a
 * total of 738 hands a denominator to anyone who stops reading, and
 * that is the exact failure this exercise exists to look for. If the
 * walk cannot complete, the run stops rather than publishing a count
 * over a population it did not see.
 */
async function allServices() {
  const first = await getJson(`${SOURCE}?page=1&per_page=25`);
  const pages = first.meta?.total_pages ?? 1;
  const rows = [...first.data];
  for (let p = 2; p <= pages; p += 1) {
    const page = await getJson(`${SOURCE}?page=${p}&per_page=25`);
    rows.push(...page.data);
  }
  const seen = new Set(rows.map((r) => r.slug));
  if (rows.length !== first.meta?.total || seen.size !== rows.length) {
    fail(`walked ${rows.length} rows (${seen.size} distinct) against meta.total ${first.meta?.total}: the population moved under the walk, and a count over a population we did not see whole is exactly what this instrument is for`);
  }
  return { rows, pages, total: first.meta.total };
}

const atBlock = Number(flags["at-block"] ?? fail("need --at-block <n>: a reading with no named height is not comparable with anyone's"));
const outDir = flags.out ?? `research/floor-check-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(outDir, { recursive: true });

const head = Number(BigInt(await rpc("eth_blockNumber", [])));
if (atBlock > head) fail(`--at-block ${atBlock} is past the chain head ${head}`);

const { rows, pages, total } = await allServices();
console.log(`walked ${rows.length} services across ${pages} pages (meta.total ${total})`);

const claimedZero = rows.filter((r) => {
  const t = r.assessment?.traction;
  return (r.networks_caip2 ?? []).includes("eip155:8453") && t?.status === "measured" && t?.tx_count_all_time === 0;
});
console.log(`${claimedZero.length} of them are on Base with a measured count of zero settlements\n`);

const readings = [];
for (const service of claimedZero) {
  let detail = null;
  try { detail = await getJson(`${SOURCE}/${service.slug}`); } catch { /* named below */ }
  const addresses = new Set();
  for (const e of detail?.data?.endpoints ?? []) {
    for (const p of e.pricing ?? []) {
      if (typeof p.pay_to === "string" && p.pay_to.startsWith("0x")) addresses.add(p.pay_to.toLowerCase());
    }
  }
  if (addresses.size === 0) {
    readings.push({ slug: service.slug, pay_to: null, verdict: "NOT_ESTABLISHED",
      established_by: "no EVM payTo could be resolved for this service from the directory, so nothing was read" });
    console.log(`  ${service.slug.padEnd(44)} NOT_ESTABLISHED (no payTo)`);
    continue;
  }
  for (const payTo of addresses) {
    // Sequential and paced. The public RPC rate limits, and a limit hit
    // is what produced the false reading this file was rewritten for.
    let balance = null; let nonce = null; let readError = null;
    try {
      balance = await rpc("eth_call", [{ to: USDC_BASE, data: `0x70a08231${payTo.slice(2).padStart(64, "0")}` }, hex(atBlock)]);
      nonce = await rpc("eth_getTransactionCount", [payTo, hex(atBlock)]);
    } catch (error) {
      readError = error?.message ?? String(error);
    }
    const reading = readDoorRail({
      rail: "eip155:8453", payTo, atBlock,
      balance: balance === null ? null : BigInt(balance),
      nonce: nonce === null ? null : Number(BigInt(nonce)),
    });
    const row = compareToFloor({ claimZero: true, claimKind: "floor", reading });
    readings.push({
      slug: service.slug, base_url: service.base_url ?? null, pay_to: payTo,
      balance_atomic: balance === null ? null : BigInt(balance).toString(),
      nonce: nonce === null ? null : Number(BigInt(nonce)),
      // A row that rests on a failed read says so IN THE ROW. It is not
      // allowed to look like a reading that simply found nothing.
      ...(readError ? { read_failed: true, read_error: readError } : {}),
      ...row,
    });
    console.log(`  ${service.slug.slice(0, 42).padEnd(44)} ${row.verdict}${readError ? "  ← READ FAILED" : ""}`);
    await new Promise((d) => setTimeout(d, 120));
  }
}

const counts = tally(readings);
/**
 * The number that must never be buried. Every NOT_ESTABLISHED resting
 * on a failed request is a gap in this instrument, not in the door,
 * and a run with many of them is a run to throw away rather than to
 * publish. The first run of this file had 107 and reported a tidy
 * verdict for each; that is the disease being guarded against here.
 */
counts.read_failures = readings.filter((r) => r.read_failed).length;
counts.read_failures_note = "Requests that never answered, after retries. These sit inside not_established and are a gap in this reader, never a finding about the door. A run where this is not near zero should not be published.";
if (counts.read_failures > readings.length / 20) {
  console.error(`\n✗ ${counts.read_failures} of ${readings.length} addresses failed to read. That is a reading about our own request budget, not about these doors — not publishing it.\n`);
  process.exit(1);
}
const report = {
  what_this_is: `Every Base door ${SOURCE} reports as never paid, read against the chain at its own advertised payTo. One dated observation at a named height. Never a ranking (rule 43), and the rows are in the order the directory served them.`,
  what_this_is_not: "Not an audit of the directory and not a finding that it is wrong. Its counts declare themselves floors, and a chain reading past a floor is that claim working as stated. The figure of interest is the DISTANCE between a stated floor and what a second reader can see, which is a fact about facilitator coverage and belongs to both sides.",
  read_at: new Date().toISOString(),
  rail: "eip155:8453", asset: USDC_BASE, at_block: atBlock, chain_head_when_read: head,
  method: "balanceOf plus transaction count at the named height, two requests per address. A balance above zero proves arrival; a zero balance at nonce zero proves an all-time zero, because USDC leaves an address only by a transaction from it, which moves the nonce. That argument is StillOS Notary's.",
  source: {
    url: SOURCE, attribution: SOURCE_ATTRIBUTION, license: "CC-BY-4.0",
    their_caveat: SOURCE_CAVEAT,
    why_the_caveat_decides: "Because it declares the count a floor. Against a floor, our BEYOND_FLOOR rows are consistent with the publisher's claim. Against a count that made no such declaration the identical readings would be disagreements. We score publishers against what they actually claimed.",
    pages_walked: pages, services_seen: rows.length, meta_total: total,
    why_every_page: "This endpoint serves 25 rows at a time. Taking page one and dividing gives a denominator that is a page rather than a population — the failure that started this whole line of work.",
  },
  residual: BALANCE_RESIDUAL,
  counts,
  doors: readings,
};
writeFileSync(join(outDir, "reading.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${JSON.stringify(counts, null, 2)}`);
console.log(`\n→ ${join(outDir, "reading.json")}`);
