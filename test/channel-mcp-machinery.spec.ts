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

/**
 * A HEADER WITH TWO READERS AND NO WRITER (2026-09-21).
 *
 * `gateSignals` and the verify route both trusted an inbound
 * `X-SCVD-Channel: mcp` and set `viaMcp` from it. The comment beside
 * one of them said the header was "set only by our own MCP handler on
 * internal dispatch" and "stripped from anything a visitor could
 * spoof" — and a grep across src/, test/ and the doors Worker finds
 * NOBODY setting it and NOTHING stripping it. The internal dispatch it
 * described is gone; mcpSignals() sets `viaMcp` directly now.
 *
 * So what was left was a request header any caller could send to be
 * counted as an MCP client at the paid door and at the receipt reader.
 * The same shape as the `?source=` seam at the buyer-signals desk, in
 * the second place it could live.
 *
 * The door is ours to say. A caller's header does not get to say it.
 */
describe("the caller does not get to declare its own door", () => {
  it("does not read a channel out of the request at all", () => {
    const sources = import.meta.glob("../src/**/*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const touches: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      // Quoted, so this file's own prose about the removal does not
      // count as the header coming back.
      // Anchored and repeated: a bare replace("../", "") takes only the
      // FIRST occurrence, which CodeQL calls incomplete escaping and is
      // right to — a deeper glob prefix would have left "../" in the
      // middle of the name this failure prints.
      if (/["'`]X-SCVD-Channel["'`]/i.test(String(source))) touches.push(path.replace(/^(?:\.\.\/)+/, ""));
    }
    // Both directions, deliberately: a reader with no writer IS the
    // defect, and a writer reintroduced later would bring the reader
    // back with it. The door is set in code by the route that answered
    // — routes/mcp.ts mcpSignals — not carried on the wire.
    expect(
      touches,
      `X-SCVD-Channel is back in: ${touches.join(", ")}`,
    ).toEqual([]);
  });

  it("leaves the route-set flag as the only way to claim a door", () => {
    // inferChannel is the whole judgement; viaMcp comes from the route
    // that answered, never from bytes the caller chose.
    expect(inferChannel({ userAgent: "curl/8.4.0" })).toBe("direct");
    expect(inferChannel({ viaMcp: true, userAgent: "curl/8.4.0" })).toBe("mcp");
  });
});
