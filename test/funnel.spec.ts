import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { recordChallengeIssued, recordPaymentDecline, recordSettlement } from "@/lib/metrics";
import { auditFunnel, VERIFICATION_TIER } from "@/services/funnel";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE FUNNEL — the instrument for the ledger's sharpest number: 703
 * organic asks on settlement_attestation, one settle, that one
 * refunded. The question it exists to answer is WHICH WALL, and the
 * split it rides on is the decline row: a decline means a wallet was
 * actually opened, so silence divides into "tried and was refused"
 * (fix the flow) and "never tried" (fix the pitch) — opposite
 * diagnoses, opposite fixes, identical ask-counts.
 */

async function clearEvents(): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const listed = await testEnv.COUNTERS.list({
      prefix: "evt:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
}

beforeEach(clearEvents);

/*
 * Channel and house are DERIVED from signals, never passed: an
 * ordinary user-agent with no house header reads as organic direct
 * traffic, exactly like a real buyer's client would.
 */
const organic = { userAgent: "buyer-client/1.0" };

describe("the two opposite silences", () => {
  it("calls a pile of asks with ZERO wallets window-shopping, and points upstream", async () => {
    for (let i = 0; i < 12; i += 1) {
      await recordChallengeIssued(testEnv, "/api/buy/settlement_attestation", organic);
    }
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "settlement_attestation")!;
    expect(row.asks_organic).toBe(12);
    expect(row.wallets_opened).toBe(0);
    expect(row.verdict).toContain("WINDOW-SHOPPING");
    expect(row.verdict).toContain("nobody tried");
    // The honest caveat rides the verdict itself: an ask is a 402
    // issued, not a human with intent.
    expect(row.verdict.toLowerCase()).toContain("crawlers");
  });

  it("calls asks WITH refused wallets blocked intent, and names the brick", async () => {
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
    expect(row.verdict).toContain("REAL INTENT HIT A WALL");
    expect(row.verdict).toContain("insufficient_funds");
    // The desk's reading rides along so the fix is legible in place.
    expect(row.verdict).toContain("fault:");
  });

  /**
   * ONE WALL OR A SCATTER, 2026-09-04. Both live rows below were on
   * the same page and the verdict said the same thing about them:
   * small_blessing, 8 refusals, 7 of them one code — a brick with one
   * fix. settlement_attestation, 5 refusals, 4 distinct codes, the
   * largest ×2 — four problems, and the top row named a transport
   * failure while three buyer-side shape errors went unmentioned.
   */
  it("calls a concentrated pile ONE WALL and stands behind the one fix", async () => {
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
    expect(row.verdict).toContain("ONE WALL");
    expect(row.verdict).toContain("the pitch");
    expect(row.verdict).not.toContain("NO SINGLE WALL");
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
    expect(row.verdict).toContain("NO SINGLE WALL");
    // The claim that one fix clears it is exactly what must not appear.
    expect(row.verdict).not.toContain("one fix clears most of it");
    // Every reason, not just the top one — the three that used to vanish.
    for (const reason of new Set(reasons)) {
      expect(row.verdict, reason).toContain(reason);
    }
  });

  it("names the asks that never presented a signature, not just the refusals", async () => {
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
    // 20 asked, 1 opened a wallet: the refusal is the smaller half.
    expect(row.verdict).toContain("19 of 20");
    expect(row.verdict).toContain("never presented a signature");
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

  it("calls settles-with-no-declines converting, which is the quiet good news", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/small_blessing", organic);
    await recordSettlement(testEnv, "/api/buy/small_blessing", {
      ...organic,
      paidUsdc: 0.005,
      minimumUsdc: 0.005,
    });
    const report = await auditFunnel(testEnv);
    const row = report.items.find((r) => r.item === "small_blessing")!;
    expect(row.settles_organic).toBe(1);
    expect(row.verdict).toContain("Converting");
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
    expect(report.window_note).toContain("Every event row on record");
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
