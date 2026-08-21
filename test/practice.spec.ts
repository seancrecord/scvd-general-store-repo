import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE OBSTACLE COURSE's laws: every scenario is deterministic and
 * self-explaining, the broken doors are broken in exactly the named
 * way, and the one well-formed door warns three ways before anyone
 * pays dust to the dead address.
 */
describe("the obstacle course", () => {
  it("indexes every scenario with what it teaches, and points the paper trail at service_audit", async () => {
    const index = (await (
      await SELF.fetch(`${BASE}/api/practice`)
    ).json()) as { scenarios: { id: string; url: string }[]; when_it_is_your_door: string };
    expect(index.scenarios.map((s) => s.id)).toEqual([
      "malformed-header",
      "empty-accepts",
      "testnet-network",
      "name-payto",
      "wrong-rail-payto",
      "dust-correct",
    ]);
    expect(index.when_it_is_your_door).toContain("service_audit");
  });

  it("serves each named defect exactly as described, at 402", async () => {
    const malformed = await SELF.fetch(`${BASE}/api/practice/malformed-header`);
    expect(malformed.status).toBe(402);
    expect(() =>
      JSON.parse(atob(malformed.headers.get("PAYMENT-REQUIRED")!)),
    ).toThrow();

    const testnet = await SELF.fetch(`${BASE}/api/practice/testnet-network`);
    const challenge = JSON.parse(
      atob(testnet.headers.get("PAYMENT-REQUIRED")!),
    ) as { accepts: { network: string }[] };
    expect(challenge.accepts[0]!.network).toBe("eip155:84532");

    const named = await SELF.fetch(`${BASE}/api/practice/name-payto`);
    const namedChallenge = JSON.parse(
      atob(named.headers.get("PAYMENT-REQUIRED")!),
    ) as { accepts: { payTo: string }[] };
    expect(namedChallenge.accepts[0]!.payTo).toMatch(/\.eth$/);
  });

  it("every body teaches: defect, right behavior, and the preflight check that catches it", async () => {
    for (const id of ["empty-accepts", "wrong-rail-payto", "dust-correct"]) {
      const body = (await (
        await SELF.fetch(`${BASE}/api/practice/${id}`)
      ).json()) as Record<string, string | boolean>;
      expect(body["practice"]).toBe(true);
      expect(String(body["what_is_wrong"]).length).toBeGreaterThan(20);
      expect(String(body["what_a_good_client_does"]).length).toBeGreaterThan(20);
      expect(String(body["preflight_names_this"]).length).toBeGreaterThan(3);
    }
  });

  it("the well-formed door parses clean, pays only the dead address, and shouts not to", async () => {
    const response = await SELF.fetch(`${BASE}/api/practice/dust-correct`);
    const challenge = JSON.parse(
      atob(response.headers.get("PAYMENT-REQUIRED")!),
    ) as { accepts: { payTo: string; amount: string }[] };
    expect(challenge.accepts[0]!.payTo.toLowerCase()).toContain("dead");
    expect(challenge.accepts[0]!.amount).toBe("1");
    const body = (await response.json()) as { what_is_wrong: string };
    expect(body.what_is_wrong).toContain("DO NOT PAY");
  });

  it("an unknown scenario 404s with the roster", async () => {
    const response = await SELF.fetch(`${BASE}/api/practice/nope`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { scenarios: string[] };
    expect(body.scenarios).toContain("testnet-network");
  });
});
