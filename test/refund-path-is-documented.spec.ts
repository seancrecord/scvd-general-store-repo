import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STORE_METADATA } from "@/store";

const BASE = "https://scvd.store";

/**
 * A REFUND AN AGENT CAN ACT ON (2026-09-21).
 *
 * An agent review: "/try says 'refunds are a mailbox,' but there is no
 * machine-visible way to request one; the money-back promise lives
 * only in /what prose. Add a refund mechanism agents can use — an
 * endpoint, or at minimum a documented process in agents.md /
 * openapi.json — so an agent can act on a missed delivery window
 * without a human in the loop."
 *
 * Every step already existed as a real, free, addressable endpoint.
 * None of them were written down together anywhere a machine reads,
 * so an agent holding a late order had a promise and no procedure.
 * agents.md now carries the procedure, and this holds it there.
 *
 * What is deliberately NOT asserted: an endpoint that creates a
 * refund. There isn't one, on purpose — a person pays these by hand —
 * and a test that expected one would be pressure to ship a door that
 * moves the keeper's money on an unauthenticated caller's say-so.
 */

async function agentsMd(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/agents.md`);
  expect(response.status).toBe(200);
  return response.text();
}

describe("the refund path is documented where an agent reads", () => {
  it("states the commitment in the store's own words, not a paraphrase", async () => {
    /*
     * Derived from STORE_METADATA rather than retyped: the promise has
     * exactly one home, and the one time it was phrased twice the
     * second copy claimed refunds were automatic.
     */
    expect(await agentsMd()).toContain(STORE_METADATA.refund_policy);
  });

  it("names every endpoint the procedure needs", async () => {
    const body = await agentsMd();
    for (const [endpoint, why] of [
      ["/api/letter", "the door an agent asks at"],
      ["/api/refund/{refund_id}", "the handle it polls afterwards"],
      ["/api/verify/{cert_id}", "the free check for whether anything was charged"],
      ["/api/order/{order_id}", "the order's own status"],
      ["/menu.json", "where the promised window is published"],
    ]) {
      expect(body, `the refund path does not name ${endpoint} — ${why}`).toContain(endpoint);
    }
  });

  it("tells an agent how to know the window was missed at all", async () => {
    /*
     * The review's actual scenario is "act on a missed delivery
     * window". A procedure that cannot tell late from delivered is not
     * one an agent can act on.
     */
    const body = await agentsMd();
    expect(body).toContain("sla_hours");
  });

  it("never promises the refund is automatic", async () => {
    /*
     * House rule 10, and the exact line that broke it once: copy never
     * says "automatic" until the code makes it automatic. A person
     * pays these by hand from /admin. This is the assertion that keeps
     * a future rewrite of this section honest.
     */
    const body = await agentsMd();
    const section = body.slice(body.indexOf("Asking for a refund"));
    expect(section.length, "the refund section vanished").toBeGreaterThan(200);
    expect(section.toLowerCase()).not.toMatch(/refunds? (is|are) automatic/);
    expect(section.toLowerCase()).not.toMatch(/automatically refund/);
    expect(section).toContain("Nothing here refunds automatically");
  });

  it("leads with the reason most refunds are not owed at all", async () => {
    /*
     * The store settles at the last moment before signing, so a failed
     * delivery takes no money. An agent that chases a refund for a
     * purchase that never charged has wasted a round trip on both
     * sides; the procedure says so in step one.
     */
    const body = await agentsMd();
    expect(body).toContain("delivers first and settles after");
    expect(body).toContain("nothing was charged and there is nothing to refund");
  });

  it("answers the endpoint it points at in the same envelope as everything else", async () => {
    /*
     * A documented dead end is worse than no documentation. This
     * endpoint used to reply to an unknown refund id with a plain-text
     * sentence — no code, no charged flag, nothing to branch on — on
     * the one URL the procedure above tells an agent to POLL. An agent
     * that mistyped an id, or polled before the keeper opened the
     * refund, got a paragraph where it expected fields.
     */
    const response = await SELF.fetch(`${BASE}/api/refund/refund_nonesuch`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body["code"]).toBe("not_found");
    expect(body["charged"]).toBe(false);
    expect(body["retry_same_request"]).toBe(false);
    expect(typeof body["error"]).toBe("string");
    // And it says where to go instead, rather than ending the trail.
    expect(body["letter_url"]).toContain("/api/letter");
  });
});
