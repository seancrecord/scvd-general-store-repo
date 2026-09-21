import { describe, expect, it } from "vitest";
import { isInfrastructureUserAgent, inferChannel } from "@/lib/channel";
import { readReason } from "@/lib/declines";

/**
 * SIXTEEN OF THE LOST SALES SAID "NO PAYMENT ATTACHED" (2026-09-21).
 *
 * StillOS-payability-census/1.0 supplied 16 of the 25 declines the desk
 * was calling money the store turned away, while declaring in its own
 * user-agent that it attaches no payment. The table matched only
 * `census-probe`, never the bare word, and had no hint for the English
 * form of `no-pay`.
 */
const STILLOS =
  "StillOS-payability-census/1.0 (+https://stillosdigitalholdings.com/settlement; measurement, no payment attached; contact stillmarcus24@gmail.com)";

describe("a census that says it will not pay", () => {
  it("reads as machinery, on its name and on its declaration alike", () => {
    expect(isInfrastructureUserAgent(STILLOS)).toBe(true);
    // Either half alone is enough; neither is carrying the other.
    expect(isInfrastructureUserAgent("acme-payability-census/2.0")).toBe(true);
    expect(isInfrastructureUserAgent("some-walker/1.0 (no payment attached)")).toBe(true);
  });

  it("leaves the demand columns whichever door it knocks on", () => {
    expect(inferChannel({ userAgent: STILLOS })).toBe("infrastructure");
    // The door is not the intent: machinery over MCP is still machinery.
    expect(inferChannel({ userAgent: STILLOS, viaMcp: true })).toBe("infrastructure");
  });

  /**
   * The standing rule of this table, restated once more: a generic
   * string promoted here is misclassified forever. The widening of
   * `census-probe` to `census` must not reach a buyer's SDK.
   */
  it("still does not catch a real buyer's SDK", () => {
    for (const ua of [
      "node",
      "python-httpx/0.28.1",
      "curl/8.5.0",
      "axios/1.7.2",
      "Deno/1.44",
      "undici",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
    ]) {
      expect(isInfrastructureUserAgent(ua), ua).toBe(false);
    }
  });

  /** The older, narrower entry is subsumed, not dropped. */
  it("keeps catching what census-probe caught", () => {
    expect(isInfrastructureUserAgent("census-probe/1.0")).toBe(true);
  });
});

/**
 * THE PRESCRIPTION THAT SHIPPED SIX DAYS EARLIER. The reading told the
 * keeper the requirement was not in the challenge and that putting it
 * there was the fix. It went into the challenge on 2026-09-15.
 */
describe("the missing-input reading, after the challenge was fixed", () => {
  const reading = readReason("local:input_missing:tx_hash").reading;

  it("no longer asks for a fix that shipped", () => {
    expect(reading).not.toContain("is not discoverable from the header alone");
    expect(reading).not.toContain("that would be ours to fix in the challenge");
  });

  it("says where the requirement actually rides now", () => {
    expect(reading).toContain("?tx_hash=");
    expect(reading).toContain("required-inputs");
    expect(reading).toContain("retry_url_template");
  });

  it("names what is left unfixed: the door's shape, not the publishing", () => {
    expect(reading).toContain("retries THE SAME URL");
    expect(reading).toContain("no money moved");
    // Still the desk's own vocabulary, so the escalation rule above it
    // keeps reading as the condition it is.
    expect(reading).toContain("DIFFERENT clients");
  });
});
