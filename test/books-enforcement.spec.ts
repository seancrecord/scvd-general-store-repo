import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { recordSettlement } from "@/lib/metrics";
import { BASE_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { mintCertificate } from "@/services/certificates";
import { backfillPayerSettlesFromCertificates } from "@/services/payer-repair";
import { sweepBooksInvariants } from "@/services/books-invariants";
import { computeNetStatement } from "@/services/net-statement";
import { RAILS_ENTERED_BY_HAND } from "@/services/stats";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE ENFORCEMENT ROUND (keeper-approved 2026-08-07): the identities
 * the store publishes, checked by machinery instead of by the keeper
 * reading his own pages. These tests hold the enforcers themselves —
 * an invariant sweep that cannot detect a planted breach is a smoke
 * detector that never met smoke.
 */

async function sweepCounters(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
  await testEnv.COUNTERS.delete(KV_KEYS.railMeterStart);
  await testEnv.COUNTERS.delete(KV_KEYS.railSplit);
  await testEnv.COUNTERS.delete(KV_KEYS.inflowMeterStart("base"));
  await testEnv.COUNTERS.delete(KV_KEYS.inflowMeterStart("solana"));
  // The sweep alerts dedupe for six hours; clear markers so each test
  // observes its own alert rather than a predecessor's suppression.
  const alerts = await testEnv.COUNTERS.list({ prefix: "alert_sent:books_invariant" });
  await Promise.all(alerts.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
}

beforeEach(sweepCounters);

describe("hand-entered rails are hashes or nothing", () => {
  it("derives the count from the evidence, so a bare number cannot exist", () => {
    // The shape IS the enforcement: adding a hand-placed sale without
    // its transaction hash is unrepresentable. These patterns hold
    // whatever is added later; today both lists are honestly empty.
    for (const hash of RAILS_ENTERED_BY_HAND.base) {
      expect(hash, `base entry "${hash}" is not an EVM tx hash`).toMatch(
        /^0x[0-9a-fA-F]{64}$/,
      );
    }
    for (const signature of RAILS_ENTERED_BY_HAND.solana) {
      expect(
        signature,
        `solana entry "${signature}" is not a base58 transaction signature`,
      ).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    }
  });
});

describe("the net-by-chain statement", () => {
  it("shows booked-by-rail money beside observed inflow, per chain and month", async () => {
    const month = new Date().toISOString().slice(0, 7);
    // The till books two sales on two rails…
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      network: BASE_NETWORK,
    });
    await recordSettlement(testEnv, "/api/buy/hello", {
      paidUsdc: 2,
      minimumUsdc: 2,
      network: SOLANA_NETWORK,
      houseHeader: testEnv.HOUSE_SECRET,
    });
    // …and the walk banked what the chain showed for the same month.
    await testEnv.COUNTERS.put(
      KV_KEYS.metric(month, "inflow", "base"),
      String(500_000),
    );
    await testEnv.COUNTERS.put(KV_KEYS.inflowMeterStart("base"), "2026-08-01T00:00:00.000Z");

    const statement = await computeNetStatement(testEnv);
    const base = statement.base.months.find((row) => row.month === month);
    expect(base?.observed_inflow_usdc).toBe(0.5);
    expect(base?.booked_organic_usdc).toBe(0.5);
    expect(base?.difference_usdc).toBe(0);
    // House money is IN the booked side: the chain cannot tell family
    // money from a stranger's, so the side facing it must not either.
    const solana = statement.solana.months.find((row) => row.month === month);
    expect(solana?.booked_house_usdc).toBe(2);
    expect(solana?.booked_organic_usdc).toBe(0);
    // Method and named difference-contents ride the statement itself.
    expect(statement.method.length).toBeGreaterThan(0);
    expect(statement.difference_may_contain.length).toBeGreaterThan(0);
  });

  it("publishes no row for a month neither meter saw", async () => {
    const statement = await computeNetStatement(testEnv);
    expect(statement.base.months).toEqual([]);
    expect(statement.solana.months).toEqual([]);
    // And says WHY there is nothing: the meters have no start date yet.
    expect(statement.base.observed_since).toBeNull();
  });
});

describe("the books invariant sweep", () => {
  it("reports clean books as clean", async () => {
    const sweep = await sweepBooksInvariants(testEnv);
    expect(sweep.breaches).toEqual([]);
    expect(sweep.checked).toBeGreaterThanOrEqual(4);
  });

  it("catches the rail records claiming more sales than the counters know", async () => {
    const month = new Date().toISOString().slice(0, 7);
    await testEnv.COUNTERS.put(`metric:${month}:paid:hello`, "1");
    // A snapshot that claims nine certificate-backed sales against one
    // counted settle: the exact shape of the 88−85 family of defects,
    // planted. The storefront drops the split (honest) — and before
    // this sweep, that drop was the defect's ONLY witness.
    await testEnv.COUNTERS.put(
      KV_KEYS.railSplit,
      JSON.stringify({
        base: 9,
        solana: 0,
        unknown: 0,
        placed_before_second_rail: 0,
        truncated: false,
        computed_at: new Date().toISOString(),
      }),
    );
    const sweep = await sweepBooksInvariants(testEnv);
    expect(
      sweep.breaches.some((breach) => breach.startsWith("rail-overshoot")),
      `planted overshoot went undetected: ${JSON.stringify(sweep.breaches)}`,
    ).toBe(true);
    // And it paged rather than only returning: the alert log has it.
    const { listAlerts } = await import("@/lib/alerts");
    const alerts = await listAlerts(testEnv, 10);
    expect(
      alerts.some((alert) => alert.condition === "books_invariant"),
      "the breach was found but nobody was paged",
    ).toBe(true);
  });

  it("catches a completed month that booked more on a chain than the chain shows", async () => {
    // Both meters live since July…
    await testEnv.COUNTERS.put(KV_KEYS.railMeterStart, "2026-06-15T00:00:00.000Z");
    await testEnv.COUNTERS.put(
      KV_KEYS.inflowMeterStart("base"),
      "2026-06-15T00:00:00.000Z",
    );
    // …and July booked $5 on Base while the walk saw only $1 arrive.
    await testEnv.COUNTERS.put(
      KV_KEYS.metric("2026-07", "revrail", "base"),
      String(5_000_000),
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.metric("2026-07", "inflow", "base"),
      String(1_000_000),
    );
    const sweep = await sweepBooksInvariants(testEnv);
    expect(
      sweep.breaches.some((breach) => breach.startsWith("booked-exceeds-chain")),
      `booked-but-never-arrived went undetected: ${JSON.stringify(sweep.breaches)}`,
    ).toBe(true);
  });

  /**
   * THE ALARM MOVED (2026-09-05). The counters-vs-rows compare paged
   * twice in a week, both times on a lost read-modify-write, which the
   * keeper ruled is not a books defect. What a certificate can PROVE
   * is a settle: payer and transaction on the artifact, and the books'
   * per-settle record under the same wallet and transaction. A
   * certificate with no record is a sale the till never booked — the
   * two Solana penny settles of 2026-08-05 — and that is what pages.
   */
  it("pages on a certificate whose settle the books never recorded, and stops once it is booked", async () => {
    const wallet = "F1xtureSo1anaWa11etNotAnyBuyer11111111111111";
    // Money moved and a certificate minted; recordSettlement never ran.
    const minted = await mintCertificate(testEnv, {
      itemId: "hello",
      paidUsdc: 0.01,
      network: SOLANA_NETWORK,
      payer: wallet,
      settlementTx: "5neverBooked000000000000000000000000000000000000000000000000000001",
    });
    const sweep = await sweepBooksInvariants(testEnv);
    const breach = sweep.breaches.find((line) => line.startsWith("certificate-without-settle"));
    expect(breach, `an unbooked settle went undetected: ${JSON.stringify(sweep.breaches)}`).toBeDefined();
    expect(breach).toContain(minted.certificate.cert_id);
    expect(breach).toContain(wallet);
    expect(breach).toContain("/admin/repair/payer-settles");
    // The repair the breach names books it, and the breach closes.
    await backfillPayerSettlesFromCertificates(testEnv);
    const after = await sweepBooksInvariants(testEnv);
    expect(after.breaches.filter((line) => line.startsWith("certificate-without-settle"))).toEqual([]);
  });

  it("no longer pages when a counter and a row differ by a lost increment", async () => {
    const month = new Date().toISOString().slice(0, 7);
    // A settle on the counters with no payer row behind it: the shape
    // that paged as settle-reconciliation until 2026-09-05.
    await testEnv.COUNTERS.put(`metric:${month}:paid:hello`, "2");
    const sweep = await sweepBooksInvariants(testEnv);
    expect(sweep.breaches.filter((line) => line.startsWith("settle-reconciliation"))).toEqual([]);
  });

  it("does not judge the current month, which the walk still trails", async () => {
    const month = new Date().toISOString().slice(0, 7);
    await testEnv.COUNTERS.put(KV_KEYS.railMeterStart, "2026-06-15T00:00:00.000Z");
    await testEnv.COUNTERS.put(
      KV_KEYS.inflowMeterStart("base"),
      "2026-06-15T00:00:00.000Z",
    );
    // Booked now, not yet walked: normal for up to an hour, and for
    // however long the month has left. Not a breach.
    await testEnv.COUNTERS.put(
      KV_KEYS.metric(month, "revrail", "base"),
      String(5_000_000),
    );
    const sweep = await sweepBooksInvariants(testEnv);
    expect(
      sweep.breaches.filter((breach) => breach.startsWith("booked-exceeds-chain")),
    ).toEqual([]);
  });
});
