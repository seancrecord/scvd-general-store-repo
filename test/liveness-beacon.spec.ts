import * as ed25519 from "@noble/ed25519";
import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PRESENT_WINDOW_HOURS } from "@/services/shutter";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

const bytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));

async function fetchBeacon(): Promise<Record<string, unknown>> {
  const res = await SELF.fetch(`${BASE}/.well-known/liveness.json`);
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * THE LIVENESS BEACON, verified the way a stranger has to.
 *
 * The beacon's whole value is that an outside verifier can check it
 * without trusting the store's own answer, so the tests here do what
 * that verifier would do: real ed25519 over the served signed_payload,
 * and field-by-field agreement between the payload that was signed and
 * the fields served beside it. A beacon whose signature covers
 * something other than what it displays is a canary that lies.
 */
describe("the liveness beacon", () => {
  it("serves the two separate facts, signed, with the window derived not typed", async () => {
    const body = await fetchBeacon();
    expect(typeof body["statement"]).toBe("string");
    expect(typeof body["issued_at"]).toBe("string");
    // The window constant comes from the shutter, the same discipline
    // the store already acts on — never a second hand-typed copy.
    expect(body["presence_window_hours"]).toBe(PRESENT_WINDOW_HOURS);
    expect(body["algorithm"]).toBe("ed25519");
    expect(typeof body["how_to_fail_closed"]).toBe("string");
    expect(typeof body["what_this_does_not_prove"]).toBe("string");
  });

  it("verifies with real ed25519 against the served payload and key", async () => {
    const body = await fetchBeacon();
    const ok = await ed25519.verifyAsync(
      bytes(String(body["signature"])),
      new TextEncoder().encode(String(body["signed_payload"])),
      bytes(String(body["public_key"])),
    );
    expect(ok).toBe(true);
    // And the signed payload IS the displayed fields, not a cousin.
    const signed = JSON.parse(String(body["signed_payload"])) as Record<
      string,
      unknown
    >;
    expect(signed["issued_at"]).toBe(body["issued_at"]);
    expect(signed["keeper_last_seen"]).toBe(body["keeper_last_seen"]);
    expect(signed["keeper_within_presence_window"]).toBe(
      body["keeper_within_presence_window"],
    );
    expect(signed["presence_window_hours"]).toBe(
      body["presence_window_hours"],
    );
  });

  it("reports the keeper inside the window when he was provably just here", async () => {
    await testEnv.COUNTERS.put("keeper_last_seen", new Date().toISOString());
    const body = await fetchBeacon();
    expect(body["keeper_within_presence_window"]).toBe(true);
    expect(body["keeper_last_seen"]).not.toBeNull();
  });

  it("reports the keeper outside the window when the last visit is stale", async () => {
    const stale = new Date(
      Date.now() - (PRESENT_WINDOW_HOURS + 24) * 3600 * 1000,
    ).toISOString();
    await testEnv.COUNTERS.put("keeper_last_seen", stale);
    const body = await fetchBeacon();
    expect(body["keeper_within_presence_window"]).toBe(false);
    // The stale date itself is still served: the fact, not a verdict.
    expect(body["keeper_last_seen"]).toBe(stale);
  });

  it("never claims the morbid thing", async () => {
    const body = await fetchBeacon();
    const disclaimer = String(body["what_this_does_not_prove"]).toLowerCase();
    expect(disclaimer).toContain("alive");
    expect(disclaimer).toContain("cannot know");
  });

  it("is pointed to from the machine trust surfaces", async () => {
    const trust = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as Record<string, unknown>;
    const x402 = (await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json()) as Record<string, unknown>;
    expect(JSON.stringify(trust)).toContain("/.well-known/liveness.json");
    expect(JSON.stringify(x402)).toContain("/.well-known/liveness.json");
  });
});
