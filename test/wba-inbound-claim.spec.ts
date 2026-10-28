import worker from "@/index";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recordChallengeIssued, type MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/** Signature claims remain representable on retained quote evidence. Free-visit
 * claim collection retired with the optional raw visit history on 2026-10-23. */

/**
 * Rows are matched on the bare hostname, not the full claim: the
 * claim carries sf-string quotes that JSON-escape inside the stored
 * row, so a raw includes() on the quoted form silently finds nothing
 * — which is exactly how this spec's first cut passed 0 for 1.
 */
async function eventsWithClaim(bareHost: string): Promise<MetricEvent[]> {
  const listed = await testEnv.COUNTERS.list({ prefix: "evt:" });
  const events: MetricEvent[] = [];
  for (const key of listed.keys) {
    const raw = await testEnv.COUNTERS.get(key.name);
    if (raw?.includes(bareHost)) {
      events.push(JSON.parse(raw) as MetricEvent);
    }
  }
  return events;
}

describe("Signature-Agent claims after the free-visit cost cut", () => {
  it("records the header verbatim, under a name that says claim", async () => {
    const host = `claim-check-${Date.now()}.example`;
    const claim = `"https://${host}"`;
    await recordChallengeIssued(testEnv, "/api/buy/hello", {
      userAgent: "wba-claim-check/1.0",
      signatureAgent: claim,
    });
    const events = await eventsWithClaim(host);
    expect(events.length).toBe(1);
    // Verbatim, quotes and all: what was claimed IS the datum.
    expect(events[0]?.signature_agent_claim).toBe(claim);
  });

  it("writes nothing when no header was sent", async () => {
    await recordChallengeIssued(testEnv, "/api/buy/hello", {
      userAgent: "wba-claim-check/2.0",
    });
    const listed = await testEnv.COUNTERS.list({ prefix: "evt:" });
    for (const key of listed.keys) {
      const raw = (await testEnv.COUNTERS.get(key.name)) ?? "";
      if (raw.includes("wba-claim-check/2.0")) {
        expect(raw).not.toContain("signature_agent_claim");
      }
    }
  });

  it("does not retain signature claims from a free page request", async () => {
    const host = "free-claim-check.example";
    const ctx = createExecutionContext();
    const response = await worker.fetch!(new Request("https://scvd.store/llms.txt", {
      headers: { "Signature-Agent": `"https://${host}"` },
    }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(await eventsWithClaim(host)).toEqual([]);
  });
});
