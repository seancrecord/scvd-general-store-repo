import { describe, expect, it } from "vitest";
import { inferChannel, isInfrastructureUserAgent } from "@/lib/channel";

/**
 * THE DOOR IS NOT THE INTENT.
 *
 * inferChannel returned "mcp" before it ever read the user-agent, so
 * every self-identifying crawler that came in through /mcp was filed
 * as a customer and could never be filed as machinery — while
 * services/reclassify.ts, which re-derives the channel from the
 * user-agent alone, would have called the same row infrastructure.
 * Two instruments, two answers, one row.
 */
describe("machinery over the MCP door", () => {
  it("names an MCP-borne prober as machinery, not as an MCP client", () => {
    expect(
      inferChannel({
        viaMcp: true,
        userAgent: "x402-conformance-monitor/0.1 (read-only; no-wallet; no-payment)",
      }),
    ).toBe("infrastructure");
    expect(
      inferChannel({
        viaMcp: true,
        userAgent: "vet402-observatory-l1/1.0 (+https://vet402.com/observatory/methodology)",
      }),
    ).toBe("infrastructure");
  });

  it("leaves a real buyer's SDK over MCP exactly where it was", () => {
    // The generic strings are deliberately NOT on the table: this is
    // what a customer's client looks like, and promoting it would be
    // permanent.
    expect(inferChannel({ viaMcp: true, userAgent: "node" })).toBe("mcp");
    expect(inferChannel({ viaMcp: true, userAgent: "axios/1.7.2" })).toBe("mcp");
    expect(inferChannel({ viaMcp: true })).toBe("mcp");
  });

  it("still classifies the HTTP door exactly as before", () => {
    expect(inferChannel({ userAgent: "uptimerobot/2.0" })).toBe("infrastructure");
    expect(inferChannel({ userAgent: "curl/8.4.0" })).toBe("direct");
    expect(inferChannel({ declaredSource: "webmcp", userAgent: "chrome" })).toBe("webmcp");
  });

  it("agrees with what the reclassifier computes from the user-agent alone", () => {
    const ua = "vet402-observatory-l1/1.0 (+https://vet402.com/observatory/methodology)";
    // The reclassifier passes no viaMcp. The live path must not reach a
    // different verdict about the same client.
    expect(inferChannel({ userAgent: ua })).toBe("infrastructure");
    expect(inferChannel({ viaMcp: true, userAgent: ua })).toBe("infrastructure");
    expect(isInfrastructureUserAgent(ua)).toBe(true);
  });

  it("says nothing about a client that gave no name", () => {
    expect(isInfrastructureUserAgent(undefined)).toBe(false);
    expect(isInfrastructureUserAgent("")).toBe(false);
  });
});
