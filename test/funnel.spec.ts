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
