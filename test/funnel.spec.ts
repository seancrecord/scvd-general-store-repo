import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { recordChallengeIssued, recordPaymentDecline, recordSettlement } from "@/lib/metrics";
import { auditFunnel, VERIFICATION_TIER } from "@/services/funnel";
import { readDeclines } from "@/lib/declines";
import { renderFunnelPage } from "@/pages/admin/funnel-page";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/** Retained events are evidence of requests, not a joined buyer journey. */

/** Both homes of an event row: a decline is also written under declevt:. */
async function clearEvents(): Promise<void> {
  for (const prefix of ["evt:", "declevt:"]) {
    let cursor: string | undefined;
    for (;;) {
      const listed = await testEnv.COUNTERS.list({
        prefix,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      if (listed.list_complete) break;
      cursor = listed.cursor;
    }
  }
}

beforeEach(clearEvents);

/*
 * Channel and house are DERIVED from signals, never passed: an
 * ordinary user-agent with no house header reads as organic direct
 * traffic, exactly like a real buyer's client would.
 */
const organic = { userAgent: "buyer-client/1.0" };

describe("readings bounded by retained evidence", () => {
  it("reports asks without recorded outcomes without inferring abandonment", async () => {
    for (let i = 0; i < 12; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", organic);
    }
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "settlement_attestation")!;
    expect(row.asks_organic).toBe(12);
    expect(row.wallets_opened).toBe(0);
    expect(row.verdict).toContain("PRICE-ASKS ONLY");
    expect(row.verdict).not.toContain("nobody tried");
    // The honest caveat rides the verdict itself: an ask is a 402
    // issued, not a human with intent.
    expect(row.verdict.toLowerCase()).toContain("crawlers");
  });

  it("reports refusal events and their reasons", async () => {
    for (let i = 0; i < 8; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/standing_watch", organic);
    }
    for (let i = 0; i < 3; i += 1) {
      await recordPaymentDecline(
        testEnv,
        "/api/buy/standing_watch",
        "settle:insufficient_funds",
        organic,
      );
    }
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "standing_watch")!;
    expect(row.wallets_opened).toBe(3);
    expect(row.verdict).toContain("REFUSALS RECORDED");
    expect(row.verdict).toContain("insufficient_funds");
    // The desk's reading rides along so the fix is legible in place.
    expect(row.verdict).toContain("fault:");
  });

  it("reports concentrated reasons without claiming one cause or fix", async () => {
    for (let i = 0; i < 20; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/small_blessing", organic);
    }
    for (let i = 0; i < 7; i += 1) {
      await recordPaymentDecline(
        testEnv,
        "/api/buy/small_blessing",
        "local:payload_not_an_object",
        organic,
      );
    }
    await recordPaymentDecline(
      testEnv,
      "/api/buy/small_blessing",
      "verify_error",
      organic,
    );
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "small_blessing")!;
    expect(row.declines_organic).toBe(8);
    expect(row.verdict).toContain("CONCENTRATED REASONS");
    expect(row.verdict).toContain("do not establish a single cause");
    expect(row.verdict).not.toContain("MIXED REASONS");
  });

  it("refuses to call a scatter a wall, and lists every reason it found", async () => {
    for (let i = 0; i < 20; i += 1) {
      await recordChallengeIssued(
        testEnv,
        "/api/buy/settlement_attestation",
        organic,
      );
    }
    const reasons = [
      "verify_error",
      "verify_error",
      "local:preflight:payload.authorization.nonce",
      "local:preflight:payload.signature",
      "local:payload_missing_accepted",
    ];
    for (const reason of reasons) {
      await recordPaymentDecline(
        testEnv,
        "/api/buy/settlement_attestation",
        reason,
        organic,
      );
    }
    const report = await auditFunnel(testEnv);
    const row = report.items.find(
      (r) => r.item === "settlement_attestation",
    )!;
    expect(row.declines_organic).toBe(5);
    expect(row.verdict).toContain("MIXED REASONS");
    // The claim that one fix clears it is exactly what must not appear.
    expect(row.verdict).not.toContain("one fix clears most of it");
    // Every reason, not just the top one — the three that used to vanish.
    for (const reason of new Set(reasons)) {
      expect(row.verdict, reason).toContain(reason);
    }
  });

  it("does not subtract unjoined event counts to invent abandoned buyers", async () => {
    for (let i = 0; i < 20; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/standing_watch", organic);
    }
    await recordPaymentDecline(
      testEnv,
      "/api/buy/standing_watch",
      "settle:insufficient_funds",
      organic,
    );
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "standing_watch")!;
    expect(row.asks_organic).toBe(20);
    expect(row.declines_organic).toBe(1);
    expect(row.verdict).not.toContain("19 of 20");
    expect(row.verdict).not.toContain("never presented a signature");
    expect(row.verdict).toContain("not joined buyer journeys");
  });

  it("states whose problem ALL of them were, not only the top row's", async () => {
    for (let i = 0; i < 10; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/launch_check", organic);
    }
    for (const reason of [
      "verify_error",
      "local:preflight:payload.authorization.nonce",
      "local:preflight:payload.signature",
    ]) {
      await recordPaymentDecline(
        testEnv,
        "/api/buy/launch_check",
        reason,
        organic,
      );
    }
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "launch_check")!;
    // Two preflight refusals are the buyer's; the verify_error is not
    // classifiable from here. Both counts ride the verdict.
    expect(row.verdict).toContain("Fault mix:");
    expect(row.verdict).toContain("2 buyer");
    expect(row.verdict).toContain("1 unknown");
  });

  it("separates missing input evidence from unannotated requests", async () => {
    for (let i = 0; i < 6; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", {
        ...organic,
        missingRequired: ["tx_hash"],
      });
    }
    await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", organic);
    const row = (await auditFunnel(testEnv)).items.find((r) => r.item === "settlement_attestation")!;
    expect(row.asks_organic).toBe(7);
    expect(row.asks_locked).toBe(6);
    expect(row.locked_inputs).toEqual({ tx_hash: 6 });
    expect(row.verdict).toContain("LOCKED DOOR: 6 of the 7 asks");
    expect(row.asks_inputs_unknown).toBe(1);
    expect(row.verdict).toContain("1 unknown");
    expect(row.verdict).not.toContain("could have");
  });

  it("says nothing about locks on a row with none", async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/small_blessing", organic);
    }
    const row = (await auditFunnel(testEnv)).items.find((r) => r.item === "small_blessing")!;
    expect(row.asks_locked).toBe(0);
    expect(row.verdict).not.toContain("LOCKED DOOR");
  });

  it("carries the missing input evidence on a refusal row too", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", {
      ...organic,
      missingRequired: ["tx_hash"],
    });
    await recordPaymentDecline(testEnv, "/api/buy/settlement_attestation", "verify_error:timeout", organic);
    const row = (await auditFunnel(testEnv)).items.find((r) => r.item === "settlement_attestation")!;
    expect(row.verdict).toContain("REFUSALS RECORDED");
    expect(row.verdict).toContain("LOCKED DOOR");
  });

  /**
   * THE WALKERS (2026-09-04). A client touching four doors inside a
   * minute is indexing the shelf. Its asks were the bulk of every
   * denominator; they are counted apart now and left out.
   */
  it("leaves a catalog walker's asks out of the organic count, and says so", async () => {
    const doors = ["settlement_attestation", "small_blessing", "hello", "luckies", "daily_fortune"];
    for (const door of doors) {
      await recordChallengeIssued(testEnv, `/api/buy/${door}`, { userAgent: "node" });
    }
    await recordChallengeIssued(testEnv, "/api/buy/small_blessing", organic);
    const report = await auditFunnel(testEnv);
    const blessing = report.items.find((r) => r.item === "small_blessing")!;
    expect(blessing.asks_walked).toBe(1);
    expect(blessing.asks_organic).toBe(1);
    expect(blessing.verdict).toContain("WALKED: 1 more ask");
    const hello = report.items.find((r) => r.item === "hello")!;
    expect(hello.asks_organic).toBe(0);
    expect(hello.asks_walked).toBe(1);
    expect(hello.verdict).toContain("WALKED ONLY");
    expect(hello.verdict).toContain("Purchase intent is unknown");
    expect(report.walk_rule.min_items).toBe(4);
  });

  it("still counts a walker's payment as a wallet, because a crawler that pays is a customer", async () => {
    const doors = ["settlement_attestation", "small_blessing", "hello", "luckies"];
    for (const door of doors) {
      await recordChallengeIssued(testEnv, `/api/buy/${door}`, { userAgent: "node" });
    }
    await recordPaymentDecline(testEnv, "/api/buy/hello", "settle:insufficient_funds", { userAgent: "node" });
    const row = (await auditFunnel(testEnv)).items.find((r) => r.item === "hello")!;
    expect(row.asks_walked).toBe(1);
    expect(row.wallets_opened).toBe(1);
    expect(row.declines_organic).toBe(1);
  });

  it("reports settlements with no refusals in the retained records", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/small_blessing", organic);
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      ...organic,
      paidUsdc: 0.005,
      minimumUsdc: 0.005,
    });
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "small_blessing")!;
    expect(row.settles_organic).toBe(1);
    expect(row.verdict).toContain("SETTLEMENTS RECORDED");
  });
});

describe("what must never inflate the funnel", () => {
  it("ignores house traffic and known infrastructure alike", async () => {
    // The keeper testing his own store is not a lost sale, and the
    // crawler floor is not demand. Either one in the organic column
    // would manufacture a funnel problem out of noise.
    await recordChallengeIssued(testEnv, "/api/buy/service_audit", {
      userAgent: "keeper-test/1.0",
      houseHeader: "test-house-secret",
    });
    await recordChallengeIssued(testEnv, "/api/buy/service_audit", {
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)",
    });
    const report = await auditFunnel(testEnv);
    expect(report.items.find((r) => r.item === "service_audit")).toBeUndefined();
  });
});

describe("the page and its ordering", () => {
  it("puts the verification tier first, because that shelf is the question", async () => {
    // A novelty door with far MORE traffic must still sort below the
    // strategic shelf — the page exists for the tier, not the volume.
    for (let i = 0; i < 20; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/daily_fortune", organic);
    }
    await recordChallengeIssued(testEnv, "/api/buy/settlement_reconciliation", organic);
    const report = await auditFunnel(testEnv);
    expect(report.items[0]!.item).toBe("settlement_reconciliation");
    expect(report.items[0]!.verification_tier).toBe(true);
    expect(VERIFICATION_TIER).toContain("settlement_reconciliation");
  });

  it("serves the reading at /admin/funnel, JSON for scripts and HTML for eyes", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", organic);
    const auth = {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    };
    const json = await SELF.fetch(`${BASE}/admin/funnel`, {
      headers: { ...auth, Accept: "application/json" },
    });
    expect(json.status).toBe(200);
    const body = (await json.json()) as { items: { item: string }[] };
    expect(body.items.some((r) => r.item === "settlement_attestation")).toBe(true);

    const html = await SELF.fetch(`${BASE}/admin/funnel`, {
      headers: { ...auth, Accept: "text/html" },
    });
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("The funnel");
  });

  it("stays behind the keeper's door", async () => {
    expect((await SELF.fetch(`${BASE}/admin/funnel`)).status).toBe(401);
  });
});

describe("the window note tells the truth at the exact cap boundary", () => {
  it("says CAPPED when the cap lands on a page edge with rows left", async () => {
    /*
     * Caught by the keeper's first real load: exactly 4,000 rows
     * scanned, oldest from yesterday — and the page said "Every event
     * row on record." The cap had landed precisely on a page edge, so
     * the loop exited without ever refusing a row, and `capped`
     * stayed false. A coverage claim decided by which branch exits a
     * loop is decided by luck; completeness is only claimable when
     * the scan SAW the end of the listing.
     */
    for (let i = 0; i < 12; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/hello", organic);
    }
    const report = await auditFunnel(testEnv, { scanCap: 8, pageSize: 4 });
    expect(report.rows_scanned).toBe(8);
    expect(report.capped).toBe(true);
    expect(report.window_note).toContain("Newest 8 event rows only");
    expect(report.window_note).not.toContain("Every event row");
  });

  it("still claims completeness when the listing genuinely ended", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/hello", organic);
    const report = await auditFunnel(testEnv, { scanCap: 100, pageSize: 4 });
    expect(report.capped).toBe(false);
    expect(report.window_note).toContain("Every retained event row read");
  });
});

describe("the next move — the funnel's pitch fix on the purchase response", () => {
  /*
   * The funnel's diagnosis: the tier's wall is upstream, and the
   * specific brick is that a browsing agent holds no tx hash, so the
   * required input reads as work. The one moment a buyer provably
   * holds the input AND a willingness to pay is right after a settle
   * — so the purchase response offers the attestation with the hash
   * already in the URL.
   */
  it("hands every ordinary purchase the attestation URL with its OWN tx filled in", async () => {
    const { installFacilitatorMock } = await import("./helpers/facilitator-mock");
    const { buildPaymentSignature, decodePaymentRequired } = await import(
      "./helpers/payment"
    );
    installFacilitatorMock();
    const { SELF: self } = await import("cloudflare:test");
    const challenge = await self.fetch(`${BASE}/api/buy/hello`);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const paid = await self.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    const block = body["patron"] ?? body;
    const offer = block.attest_this_purchase ?? body.attest_this_purchase;
    expect(offer, "no attest_this_purchase on the purchase response").toBeTruthy();
    expect(offer.url).toContain("/api/buy/settlement_attestation?tx_hash=");
    // The buyer's own settlement, not a sample: the hash in the URL is
    // the one on the certificate.
    expect(offer.url).toContain(block.certificate.settlement_tx);
  });
});


describe("recorded evidence, without invented buyer journeys", () => {
  it("keeps checked-present inputs separate from unknown historical annotations", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", organic);
    await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", { ...organic, missingRequired: [] });
    await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", { ...organic, missingRequired: ["tx_hash"] });
    const row = (await auditFunnel(testEnv)).items[0]!;
    expect(row.asks_organic).toBe(3);
    expect(row.asks_inputs_present).toBe(1);
    expect(row.asks_inputs_unknown).toBe(1);
    expect(row.asks_locked).toBe(1);
    expect(row.verdict).toContain("1 unknown");
    expect(row.verdict).not.toContain("could have bought");
  });

  it("separates input, payment, and settlement refusal events without claiming signatures or intent", async () => {
    for (const reason of ["local:input_invalid:hours", "local:payload_not_an_object", "settle:insufficient_funds"]) {
      await recordPaymentDecline(testEnv, "/api/buy/the_statement", reason, organic);
    }
    const report = await auditFunnel(testEnv);
    const row = report.items[0]!;
    expect(row.input_refusals_organic).toBe(1);
    expect(row.payment_declines_organic).toBe(1);
    expect(row.settlement_declines_organic).toBe(1);
    const { declines } = await readDeclines(testEnv);
    expect(declines.find(r => r.reason === "local:input_invalid:hours")?.stage).toBe("input");
    expect(row.verdict).not.toMatch(/signed payments|REAL INTENT|one fix|never presented a signature/);
    const html = renderFunnelPage(report);
    expect(html).toContain("input refusals");
    expect(html).not.toMatch(/nobody tried|somebody tried|wallets opened/);
  });

  it("publishes observed timestamps without claiming a complete capture window", async () => {
    for (const [suffix, at] of [["a", "2026-09-01T00:00:00.000Z"], ["b", "2026-09-02T00:00:00.000Z"]]) {
      await testEnv.COUNTERS.put(`evt:test-${suffix}`, JSON.stringify({ kind: "challenge", item: "hello", at, channel: "direct", house: false }));
    }
    const report = await auditFunnel(testEnv);
    expect(report.observed_from).toBe("2026-09-01T00:00:00.000Z");
    expect(report.observed_through).toBe("2026-09-02T00:00:00.000Z");
    expect(report.what_this_cannot_see.join(" ")).toContain("not joined");
    expect(report.what_this_cannot_see.join(" ")).not.toContain("proves nobody");
    expect(report.window_note).toContain("retained");
  });
});
