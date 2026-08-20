import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

// Without the mock the SDK validates our offered networks against a
// facilitator that is not there, and route construction fails before
// any challenge exists to inspect.
beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE BUYER WE HAD NOT MODELLED, 2026-08-20.
 *
 * Our help for hand-rollers assumed a reader: prose at /try, a URL on
 * the challenge, the whole teaching block on declines. The buyer that
 * turned up writes a SCRIPT — an agent that reaches for a general
 * web3 library, runs headless, renders no HTML, follows no link. One
 * of ours did exactly that against our own door: five attempts, forty
 * seconds, four envelope errors, twice the same missing `accepted`,
 * with the full teaching sitting unread in responses it already held.
 *
 * These tests hold the answer to that buyer — a payload with our half
 * already filled in — and, more importantly, they hold it against the
 * FIVE ACTUAL FAILURES, so the fix cannot rot into decoration.
 */

interface Challenge {
  accepts: { network: string; asset: string; payTo: string; amount: string }[];
}

async function challengeAndBody(): Promise<{
  challenge: Challenge;
  body: Record<string, unknown>;
}> {
  const response = await SELF.fetch(`${BASE}/api/buy/small_blessing`);
  expect(response.status).toBe(402);
  const header = response.headers.get("PAYMENT-REQUIRED");
  expect(header, "no challenge header at all").toBeTruthy();
  return {
    challenge: JSON.parse(atob(header as string)) as Challenge,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("the first 402 hands a script a payload, not a lecture", () => {
  it("fills every field that is ours and leaves exactly three blanks", async () => {
    const { challenge, body } = await challengeAndBody();
    const template = body["payload_template"] as Record<string, unknown>;
    expect(template, "no template on the first 402").toBeTruthy();

    const evm = challenge.accepts.find((entry) =>
      entry.network.startsWith("eip155:"),
    )!;
    // Read from the offer, never recomputed: the template's accepted
    // block is the very object we advertised.
    expect(template["accepted"]).toEqual(evm);
    expect(template["x402Version"]).toBe(2);

    const payload = template["payload"] as Record<string, unknown>;
    const auth = payload["authorization"] as Record<string, string>;
    expect(auth["to"]).toBe(evm.payTo);
    expect(auth["value"]).toBe(evm.amount);

    // Exactly three blanks, and they are the three only a buyer can
    // fill. Anything else left as a placeholder would be us asking the
    // client to guess.
    const blanks = [
      payload["signature"],
      auth["from"],
      auth["nonce"],
    ].filter((value) => typeof value === "string" && value.startsWith("<"));
    expect(blanks).toHaveLength(3);
    expect(auth["validAfter"]).toBe("0");
    expect(auth["validBefore"]).not.toContain("<");
  });

  it("makes all four of the field run's envelope errors unreachable", async () => {
    const { body } = await challengeAndBody();
    const template = body["payload_template"] as Record<string, unknown>;
    const payload = template["payload"] as Record<string, unknown>;
    const auth = payload["authorization"] as Record<string, unknown>;

    // local:payload_not_an_object — it is an object.
    expect(typeof template).toBe("object");
    // local:payload_missing_accepted (twice) — present, pre-filled.
    expect(template["accepted"]).toBeTruthy();
    // local:preflight:payload.authorization.validAfter — legal value.
    expect(auth["validAfter"]).toBe("0");
    // local:requirement_mismatch:asset — the asset rides inside the
    // copied `accepted`, so it cannot disagree unless rebuilt.
    expect(
      (template["accepted"] as Record<string, unknown>)["asset"],
    ).toBeTruthy();
  });

  it("says the things a script gets wrong next, in the same breath", async () => {
    const { body } = await challengeAndBody();
    const note = String(body["payload_template_note"]);
    // Decimal strings, the trap CV hit twice in July.
    expect(note).toContain("STRINGS");
    // The silent one waiting after the envelope.
    expect(note).toContain("EIP-712 domain");
    expect(note).toContain("verifyingContract");
    // And the rail this template is NOT for.
    expect(note).toContain("solana");
    // How to actually send it.
    expect(note).toContain("PAYMENT-SIGNATURE");
  });

  it("keeps the human's pointer too — the page still exists", async () => {
    const { body } = await challengeAndBody();
    expect(String(body["hand_rolling_url"])).toContain("/try#hand-rolling");
  });
});
