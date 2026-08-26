import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeHost } from "@/services/ward-round";
import { WATCH_EVIDENCE_BODY_LIMIT_BYTES } from "@/services/watch-evidence";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const DOOR = "https://door.example/api/pay";

/**
 * ROADMAP 1.2, THE WARD-ROUND HALF — THE CENSUS SIGNS CONCLUSIONS IT
 * CANNOT REPRODUCE.
 *
 * Ledger B9/G1: a verifier can check "SCVD signed this verdict" and
 * cannot check what SCVD saw, because the probe threw the response
 * away — `response.body?.cancel()` — and kept only the verdict it
 * derived. The weekly snapshot then froze that conclusion, signed it,
 * and anchored it to Bitcoin. Standing-watch rows got their evidence
 * on 2026-08-25 (#246); this is the same build pointed at the census,
 * which is the artifact class where being wrong is anchored forever
 * (the 0.14 lesson).
 *
 * The row's evidence rides VERBATIM into the signed weekly snapshot —
 * registry-pulse freezes rounds as recorded — so nothing here signs
 * anything itself; putting the bytes on the row IS putting them
 * inside the signature.
 */

function challenge(): string {
  return btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          payTo: "0x1111111111111111111111111111111111111111",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          amount: "5000",
        },
      ],
    }),
  );
}

function stubDoor(body: string | null, headers: Record<string, string>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const parsed = new URL(String(url));
      // Hostname equality, not startsWith — the CodeQL lesson from the
      // rail spec, kept on purpose.
      if (parsed.protocol === "https:" && parsed.hostname === "door.example") {
        return new Response(body, { status: 402, headers });
      }
      return new Response("no such upstream in this test", { status: 500 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the census keeps what the knock already fetched", () => {
  it("carries the verbatim challenge and a complete-body digest on the row", async () => {
    stubDoor("terms in the body", {
      "PAYMENT-REQUIRED": challenge(),
      "Content-Type": "application/json",
    });
    const row = await probeHost(testEnv, DOOR);
    expect(row.evidence).toBeDefined();
    // The battery's input, byte for byte — not a paraphrase of it.
    expect(row.evidence!.challenge_bytes).toBe(challenge());
    expect(row.evidence!.headers["content-type"]).toBe("application/json");
    expect(row.evidence!.body_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.evidence!.body_truncated).toBe(false);
  });

  it("refuses to hash a body it did not finish reading", async () => {
    /*
     * A seller-chosen body must never become an unbounded allocation,
     * and a PARTIAL hash must never be published where it could be
     * mistaken for the digest of the whole response — the same two
     * rules the standing watch adopted, because a different rule here
     * would be two instruments disagreeing about what a digest means.
     */
    stubDoor("x".repeat(WATCH_EVIDENCE_BODY_LIMIT_BYTES + 1), {
      "PAYMENT-REQUIRED": challenge(),
    });
    const row = await probeHost(testEnv, DOOR);
    expect(row.evidence!.body_truncated).toBe(true);
    expect(row.evidence!.body_sha256).toBeNull();
  });

  it("records nothing invented for a door that never answered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect timeout");
      }),
    );
    const row = await probeHost(testEnv, DOOR);
    expect(row.verdict).toBe("unreachable");
    // Rule 52's contrapositive: evidence of a response that did not
    // happen would be the worst row in the corpus.
    expect(row.evidence).toBeUndefined();
  });
});
