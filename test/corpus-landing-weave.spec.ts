import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * A BROWSER'S TWO HEADERS. The corpus index serves JSON to anything
 * that is not a browser, so a probe without a user agent reads the
 * JSON and never sees the woven sentence at all — the same trap the
 * paywall work fell into on 2026-08-28.
 */
const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

const PAY_TO = "0x00000000000000000000000000000000000000aa";

/**
 * Two doors advertising the SAME receiving address, so the derived
 * reading has a cluster to find. A fixture where every door has its
 * own address would make the woven sentence render zeros and prove
 * nothing about whether the numbers are real.
 */
function round(week: string): WardRound {
  return {
    week,
    at: new Date().toISOString(),
    listed_resources: 2,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: [
      {
        host: "one.example",
        resources: 1,
        verdict: "ready",
        failed: [],
        advisories: [],
        offer: { pay_to: [PAY_TO] },
      },
      {
        host: "two.example",
        resources: 1,
        verdict: "ready",
        failed: [],
        advisories: [],
        offer: { pay_to: [PAY_TO] },
      },
    ] as unknown as WardRound["hosts"],
  };
}

async function sweep(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
}

beforeEach(sweep);

async function landingHtml(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/corpus`, { headers: BROWSER });
  expect(response.status).toBe(200);
  return response.text();
}

/**
 * THE WALLET-FACTS FINDING, WOVEN (keeper, 2026-08-29: "Yes or weave
 * it into an existing place").
 *
 * It was drafted as a Gazette line and struck, because the Gazette
 * had retired three weeks before the draft was written. What survived
 * is the finding, and the keeper's instruction was to fold it into
 * somewhere that already exists rather than bolt on a new sentence.
 *
 * THE ONE THING THAT MUST BE TRUE OF IT is that the numbers are read,
 * not typed. The original draft said so in its own margin: the figure
 * moves every Sunday, so a paragraph carrying 544 and 78 and 60 as
 * constants starts rotting immediately and would eventually have this
 * store publishing, in prose, a number its own JSON contradicts. That
 * is the exact defect the corrections desk exists for, and we would
 * have shipped it into the page a stranger reads first.
 */
describe("the wallet-facts finding, woven into the corpus index", () => {
  it("says what it can, and invents nothing, when the chain is empty", async () => {
    const html = await landingHtml();
    expect(html).toContain("Wallet facts, counted and never judged");
    expect(html).toContain("The chain holds no signed week yet");
    // The empty case must not render a figure of any kind.
    expect(html).not.toMatch(/This week: \d+ distinct receiving addresses/);
  });

  it("reads the live numbers off the latest signed week once one exists", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round("2026-W35")),
    );
    const pass = await takeCorpusSnapshot(testEnv, {
      calendars: ["https://calendar.test"],
      fetch: (async () =>
        new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
    });
    expect(pass.taken).toBe(true);

    const html = await landingHtml();
    expect(html).not.toContain("The chain holds no signed week yet");
    expect(html).toContain("This week:");

    /*
     * THE ASSERTION THAT MATTERS: the page and the JSON must quote the
     * same figures, because they run the same derivation. A page that
     * merely renders SOME number would pass a laxer test and still let
     * the two surfaces drift — which is the whole failure this weave
     * was written to avoid.
     */
    const facts = (await (
      await SELF.fetch(`${BASE}/corpus/wallet-facts.json`)
    ).json()) as Record<string, number>;
    expect(html).toContain(
      `${facts["distinct_addresses"]} distinct receiving addresses`,
    );
    expect(html).toContain(
      `${facts["addresses_at_multiple_doors"]} of them receiving at more than one door`,
    );
    expect(html).toContain(
      `largest single cluster fronting ${facts["largest_cluster_doors"]}`,
    );

    // The fixture put both doors behind one address, so the finding
    // has something to report — a test that passed on all zeros would
    // not have shown the derivation working.
    expect(facts["addresses_at_multiple_doors"]).toBeGreaterThan(0);

    // And the caveat travels with the number, never behind a link.
    expect(html).toContain("move every Sunday");
    expect(html).toContain("Custodial and platform wallets");
  });
});
