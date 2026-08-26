import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { performLaunchCheck } from "@/services/launch-check";
import { WATCH_EVIDENCE_BODY_LIMIT_BYTES } from "@/services/watch-evidence";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const TARGET = "https://shop.example/api/buy/thing";

/**
 * ROADMAP 1.2, THE LAUNCH-CHECK HALF — ledger I5: "raw evidence
 * discarded."
 *
 * The walk is the artifact class where a dispute is likeliest,
 * because money moves on the strength of what the challenge said —
 * and the challenge's raw bytes were read at the door and thrown
 * away, leaving the signed record narrating a response nobody could
 * re-examine. Same build as the census (#258) and the standing watch
 * (#246), same shared capture, so three producers cannot disagree
 * about what a digest means.
 *
 * The DELIVERY response is deliberately absent here: its body feeds
 * fulfillment on the money path, and that refactor gets its own
 * change with its own care.
 */

function challenge(): string {
  return btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          payTo: "0x2222222222222222222222222222222222222222",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          amount: "5000",
          maxTimeoutSeconds: 300,
        },
      ],
    }),
  );
}

/** A one-knock seller: answers the unpaid GET and nothing else. */
function door(body: string | null, headers: Record<string, string>): typeof fetch {
  return (async () =>
    new Response(body, { status: 402, headers })) as unknown as typeof fetch;
}

describe("the walk keeps the challenge it acted on", () => {
  it("carries the verbatim challenge bytes inside the signed record", async () => {
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: door("terms prose", {
        "PAYMENT-REQUIRED": challenge(),
        "Content-Type": "application/json",
      }),
    });
    /*
     * No signer configured, so the walk stops at unpaid_by_rule or
     * similar — the point is the CHALLENGE evidence, which exists the
     * moment the door answered, whatever happened after.
     */
    expect(typeof check.challenge_evidence).toBe("object");
    expect(check.challenge_evidence!.challenge_bytes).toBe(challenge());
    expect(check.challenge_evidence!.headers["content-type"]).toBe(
      "application/json",
    );
    expect(check.challenge_evidence!.body_sha256).toMatch(/^[0-9a-f]{64}$/);
    /*
     * Inside the signed bytes, not beside them. signature_covers is
     * prose — "the canonical JSON of every field above signature" —
     * so the check is positional: the evidence field must sit above
     * the signature in serialization order, where the recipe reaches.
     */
    const keys = Object.keys(check);
    expect(keys.indexOf("challenge_evidence")).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf("challenge_evidence")).toBeLessThan(
      keys.indexOf("signature"),
    );
  });

  it("still reads a body-carried challenge after the capture consumed the stream", async () => {
    /*
     * THE REGRESSION THIS GUARDS: the capture reads the body once,
     * and the walk's JSON-challenge fallback used to read it again
     * from the response. If the fallback ever reaches for the stream
     * instead of the captured text, a body-carried challenge becomes
     * unreadable and every such door books as malformed_challenge.
     */
    const bodyChallenge = JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          payTo: "0x2222222222222222222222222222222222222222",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          amount: "5000",
          maxTimeoutSeconds: 300,
        },
      ],
    });
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: door(bodyChallenge, { "Content-Type": "application/json" }),
    });
    expect(check.verdict).not.toBe("malformed_challenge");
    expect(check.challenge_evidence!.challenge_bytes).toBeNull();
    expect(check.challenge_evidence!.body_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to hash a body it did not finish, and the walk survives it", async () => {
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: door("x".repeat(WATCH_EVIDENCE_BODY_LIMIT_BYTES + 1), {
        "PAYMENT-REQUIRED": challenge(),
      }),
    });
    expect(check.challenge_evidence!.body_truncated).toBe(true);
    expect(check.challenge_evidence!.body_sha256).toBeNull();
    // The header carried the challenge, so the oversized body must
    // not have cost the walk its terms.
    expect(check.challenge_evidence!.challenge_bytes).toBe(challenge());
  });

  it("records no evidence for a door that never answered", async () => {
    const check = await performLaunchCheck(testEnv, TARGET, {
      fetch: (async () => {
        throw new Error("connect timeout");
      }) as unknown as typeof fetch,
    });
    expect(check.verdict).toBe("unreachable");
    expect(check.challenge_evidence).toBeUndefined();
  });
});
