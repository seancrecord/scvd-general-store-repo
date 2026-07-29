import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import { STACK_DEPENDENCIES } from "@/store/stack";

/**
 * THE DEPENDENCY DISCLOSURE.
 *
 * The keeper wanted big names as a trust signal. There is an honest
 * version and a dishonest one and they use nearly identical words:
 * "Powered by Coinbase" implies a relationship that does not exist,
 * and an agent doing diligence finds no corroboration on the other end.
 *
 * So this document lists exposure instead of credibility. These tests
 * hold the line that makes it worth publishing: no endorsement, no
 * hedging on the failure modes, and the one dependency with no
 * substitute named as such.
 */
describe("/stack", () => {
  async function fetchStack(): Promise<Record<string, unknown>> {
    const response = await SELF.fetch("https://scvd.store/stack");
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  }

  it("says outright that it is not an endorsement", async () => {
    const body = await fetchStack();
    const stated = String(body.not_an_endorsement);
    expect(stated).toContain("not one of them has heard of this store");
    expect(stated).toContain("exposure rather than as credibility");
  });

  it("never claims a partnership, in any of the usual phrasings", async () => {
    const served = JSON.stringify(await fetchStack()).toLowerCase();
    for (const borrowed of [
      "powered by",
      "in partnership",
      "partnered with",
      "trusted by",
      "backed by",
      "official partner",
    ]) {
      expect(served, `the disclosure reaches for "${borrowed}"`).not.toContain(
        borrowed,
      );
    }
  });

  it("gives every dependency a failure mode and a way to check it", async () => {
    // A disclosure that lists names without consequences is a logo wall
    // with extra steps.
    for (const entry of STACK_DEPENDENCIES) {
      expect(entry.when_it_fails.length, entry.name).toBeGreaterThan(20);
      expect(entry.what_you_lose.length, entry.name).toBeGreaterThan(20);
      expect(entry.how_to_check.length, entry.name).toBeGreaterThan(10);
      expect(["no", "with work", "yes"]).toContain(entry.substitutable);
    }
  });

  it("names the signing key as the one thing with no recovery", async () => {
    const key = STACK_DEPENDENCIES.find((entry) =>
      entry.name.includes("signing key"),
    );
    expect(key, "the signing key is not in its own dependency list").toBeTruthy();
    expect(key?.substitutable).toBe("no");
    expect(key?.what_you_lose).toContain("no substitute and no recovery");
  });

  it("admits the host is the worst failure for a buyer", async () => {
    // Certificates are only as reachable as this host, and "never take a
    // verify URL down" is a rule we hold rather than a property we own.
    const host = STACK_DEPENDENCIES.find((entry) =>
      entry.name.includes("Workers"),
    );
    expect(host?.what_you_lose).toContain("WORST ONE FOR A BUYER");
  });

  it("tells the buyer what survives all of it", async () => {
    const body = await fetchStack();
    // The load-bearing sentence: keep the artifact and its signature
    // checks with the store, its host and its books all gone.
    expect(String(body.what_survives_everything)).toContain(
      "keep the artifact you bought",
    );
  });

  it("states that it is our understanding rather than an audit", async () => {
    const body = await fetchStack();
    expect(String(body.honest_limit)).toContain("not as an audit");
    expect(String(body.honest_limit)).toContain("things we forgot");
  });

  it("is signed, and points at the other half", async () => {
    const body = await fetchStack();
    const { signature, public_key, signature_covers, ...signedBody } = body as {
      signature: string;
      public_key: string;
      signature_covers: string;
    } & Record<string, unknown>;
    await expect(
      verifyMessageSignature(JSON.stringify(signedBody), signature, public_key),
    ).resolves.toBe(true);
    expect(JSON.stringify(body)).toContain("/house-ledger.json");
  });
});
