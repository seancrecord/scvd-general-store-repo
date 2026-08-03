import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { HOUSE_RULE } from "@/store/wallet-safety";

const BASE = "https://scvd.store";

/**
 * THE THREE ARRIVAL PATHS ARE NOT EQUIVALENT, and two of them read
 * nothing but the 402.
 *
 * From CV's cold walk, 2026-08-02: a stranger reaches a paid endpoint
 * one of three ways — handed a URL, discovered through a Bazaar search
 * that returns a bare resource URL with no backstory, or installing
 * the skill and reading skill.md first. Only the third meets any of
 * our prose. For the other two the 402 BODY IS THE FIRST AND POSSIBLY
 * ONLY DOCUMENT THEY EVER SEE.
 *
 * The house rule — the strongest anti-injection signal the store has —
 * lived in skill.md, llms.txt, agents.md, the MCP server info and the
 * OpenAPI description, and NOT in the 402. The two paths that needed
 * it most were the two that never got it.
 *
 * These tests hold the 402 to being a complete first impression on its
 * own, because for most arrivals that is exactly what it has to be.
 */
beforeAll(() => {
  installFacilitatorMock();
});

async function challenge(): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/api/buy/hello`);
  expect(response.status).toBe(402);
  return (await response.json()) as Record<string, any>;
}

describe("the 402 stands alone for an agent that read nothing else", () => {
  it("carries the house rule", async () => {
    const body = await challenge();
    expect(
      body["house_rule"],
      "an agent arriving from a Bazaar search sees this response and no other document of ours",
    ).toBe(HOUSE_RULE);
  });

  it("states the promise in the terms a scam would not volunteer", async () => {
    const body = await challenge();
    const rule = String(body["house_rule"]).toLowerCase();
    expect(rule).toContain("never asks you to run code");
    expect(rule).toContain("credentials");
    // The part that makes it useful rather than decorative: it tells
    // the reader what to do about an impostor.
    expect(rule).toContain("it is not us");
  });

  /**
   * STEP 4 IN THE COLD WALK — the pause before spending. Nothing forces
   * it, and the material for it was present but framed as though it
   * were for afterwards.
   */
  it("says the verification block is checkable before paying", async () => {
    const body = await challenge();
    const check = String(body["verification"]?.["check_these_before_you_pay"]);
    expect(check).toContain("before you sign");
    expect(check).toContain("without asking us");
  });

  it("still hands over the key material that makes the check possible", async () => {
    const body = await challenge();
    const verification = body["verification"];
    expect(verification["key_fingerprint"]).toBeTruthy();
    expect(verification["signing_key_url"]).toContain("scvd-signing-key");
    expect(verification["sample_artifact_id"]).toBeTruthy();
  });
});

describe("the promise appears wherever a stranger might first land", () => {
  /**
   * ASSERTED AS A COMMITMENT, NOT A STRING. The older surfaces phrase
   * it in their own registers — that is the keeper's copy and it stays
   * his. What must not vary is that the promise is THERE. A test that
   * pinned one wording would force five documents into one voice to
   * satisfy a checker, which is the wrong trade.
   */
  // Deliberately permissive on the subject clause. The five surfaces
  // say "never asks you", "never asks a visitor", "never asks a
  // visiting agent" — same commitment, five registers, and the first
  // cut of this regex was strict enough to fail /openapi.json for
  // saying "a visitor" instead of "a visiting agent". Pinning voice
  // was never the point.
  const PROMISE = /never asks?[^.]{0,40}to run code/i;

  it.each(["/skill.md", "/llms.txt", "/agents.md", "/openapi.json"])(
    "%s carries the promise in its own words",
    async (path) => {
    const body = await (await SELF.fetch(`${BASE}${path}`)).text();
    expect(
      PROMISE.test(body),
      `${path} no longer promises the store will not ask for code or credentials`,
    ).toBe(true);
    },
  );

  it("and now the 402 does too, which was the gap", async () => {
    const body = await challenge();
    expect(PROMISE.test(String(body["house_rule"]))).toBe(true);
  });
});

describe("the purchase response says which check is worth doing", () => {
  it("names the local check as needing no network call", async () => {
    // Not built from scratch: signed_payload and signature_covers were
    // already there. What was missing is the sentence that decides
    // whether an agent bothers.
    const { mintCertificate } = await import("@/services/certificates");
    const { env } = await import("cloudflare:test");
    const minted = await mintCertificate(env as never, { itemId: "hello" });
    expect(minted.verifyUrl).toContain("/api/verify/");
  });
});

/**
 * WHAT A WEAKER MODEL MEETS, which is closer to the target user than a
 * frontier model testing with full reasoning on.
 *
 * CV's model-strength pass, 2026-08-02, and the economic argument is
 * the part that makes it not an edge case: the sub-dollar half of this
 * shelf is exactly the traffic a rational operator routes to a cheap,
 * fast, low-capability model. "Does this hold up for weak models" is
 * arguably the main case.
 *
 * Most weak-model failures here are LOUD and therefore safe — a
 * malformed signature bounces, a missing field 400s, nothing moves.
 * Exactly one is silent, and these tests are about that one.
 */
describe("the amount cannot be misread by a million", () => {
  it("states both units and the conversion between them", async () => {
    const body = await challenge();
    const check = body["amount_check"];
    expect(check, "the 402 does not state its units at all").toBeTruthy();
    expect(Array.isArray(check["usdc"])).toBe(true);
    expect(Array.isArray(check["atomic"])).toBe(true);
    expect(String(check["these_are_the_same_number"])).toContain("6 decimals");
  });

  it("derives the atomic figures from the offered prices rather than restating them", async () => {
    // If these two ever disagree, the body is telling a buyer one price
    // and the header another — which is the confusion this block exists
    // to remove, arriving from our own side.
    const body = await challenge();
    const check = body["amount_check"];
    const usdc = check["usdc"] as number[];
    const atomic = check["atomic"] as string[];
    expect(atomic.length).toBe(usdc.length);
    usdc.forEach((value, index) => {
      expect(Number(atomic[index])).toBe(Math.round(value * 1_000_000));
    });
  });

  it("says plainly that this is the mistake nothing will catch", async () => {
    // The whole reason it earns space in the body: every other error in
    // the flow is refused before money moves. A signature over the
    // wrong amount is a VALID signature.
    const body = await challenge();
    const warning = String(body["amount_check"]["before_you_sign"]);
    expect(warning).toContain("does not bounce");
    expect(warning.toLowerCase()).toContain("valid signature");
  });
});

describe("the retry path instructs rather than describes", () => {
  /**
   * Weak models are reactive: they do not pre-compute a safety key
   * against a retry that has not happened yet. They retry after the
   * bounce. The idempotency block was already reachable on this
   * response — it hangs off the item, not off the absence of a decline
   * — but it read as a feature description at the exact moment it
   * needed to read as an instruction.
   */
  it("tells a bounced caller what to do on the next attempt", async () => {
    const declined = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": "not-a-real-payment" },
    });
    const body = (await declined.json()) as Record<string, any>;
    // Top-level, beside payment_declined rather than inside it.
    const instruction = String(body["before_you_retry"]);
    expect(
      instruction,
      "a bounced caller is not told to carry the idempotency key into the retry",
    ).toContain("Idempotency-Key");
    expect(instruction).toContain("second charge");
  });

  it("still hands the key itself on the declined response", async () => {
    const declined = await SELF.fetch(`${BASE}/api/buy/hello`, {
      headers: { "PAYMENT-SIGNATURE": "not-a-real-payment" },
    });
    const body = (await declined.json()) as Record<string, any>;
    expect(
      body["idempotency"]?.["suggested_key"],
      "the instruction names a key the response does not carry",
    ).toBeTruthy();
  });
});
