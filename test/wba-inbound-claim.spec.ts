import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recordPorchVisit, type MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE INBOUND HALF OF WEB BOT AUTH, claim-only (2026-08-11): a
 * visitor presenting a Signature-Agent header gets it recorded on the
 * porch event VERBATIM AND AS A CLAIM — the store fetches no
 * directory and verifies no signature, and the field name says so.
 * The census question this answers is "are signers showing up at this
 * door at all," which is the number that decides whether verifying
 * machinery ever gets built.
 */

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

describe("the Signature-Agent claim on porch events", () => {
  it("records the header verbatim, under a name that says claim", async () => {
    const host = `claim-check-${Date.now()}.example`;
    const claim = `"https://${host}"`;
    await recordPorchVisit(testEnv, "storefront", {
      userAgent: "wba-claim-check/1.0",
      signatureAgent: claim,
    });
    const events = await eventsWithClaim(host);
    expect(events.length).toBe(1);
    // Verbatim, quotes and all: what was claimed IS the datum.
    expect(events[0]?.signature_agent_claim).toBe(claim);
  });

  it("writes nothing when no header was sent", async () => {
    await recordPorchVisit(testEnv, "storefront", {
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

  it("is wired at the door: a real request's header reaches the event row", async () => {
    const host = `door-check-${Date.now()}.example`;
    const claim = `"https://${host}"`;
    const response = await SELF.fetch("https://scvd.store/llms.txt", {
      headers: { "Signature-Agent": claim },
    });
    expect(response.status).toBe(200);
    /*
     * The middleware hands the write to waitUntil, so the row can
     * land after the response resolves (venue-register.spec.ts wrote
     * the race down). Polled rather than raced.
     */
    let events: MetricEvent[] = [];
    for (let attempt = 0; attempt < 20 && events.length === 0; attempt += 1) {
      events = await eventsWithClaim(host);
      if (events.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    expect(events.length).toBe(1);
    expect(events[0]?.signature_agent_claim).toBe(claim);
  });
});
