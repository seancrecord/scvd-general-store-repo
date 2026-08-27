import { SELF } from "cloudflare:test";
import { expect, it, describe } from "vitest";

/**
 * THE FREE INSTRUMENTS' MCP DOORS (2026-08-27, the keeper's ruling on
 * the tool-surface audit). The preflight and the conformance desk are
 * the store's headline free instruments; until this ruling they were
 * HTTP-only, so the channel agents connect by could not reach them.
 *
 * These tests exercise the actual /mcp route rather than the catalog,
 * because the catalog listing a tool proves nothing about the door
 * answering. The probe paths that need outbound network stop at the
 * services' own validation — which is itself the contract worth
 * pinning: the MCP door and the HTTP door refuse with the same words,
 * because they are the same function.
 */

const BASE = "https://scvd.store";

let rpcId = 0;
async function call(name: string, args: Record<string, unknown>) {
  rpcId += 1;
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return (await response.json()) as Record<string, unknown>;
}

describe("preflight_endpoint answers on the MCP channel", () => {
  it("refuses a missing url with the service's own words, uncharged", async () => {
    const body = await call("preflight_endpoint", {});
    const error = body["error"] as Record<string, unknown>;
    expect(error).toBeTruthy();
    expect(String(error["message"])).toContain('{"url"');
  });

  it("refuses an unparseable url rather than probing garbage", async () => {
    const body = await call("preflight_endpoint", { url: "not a url" });
    const error = body["error"] as Record<string, unknown>;
    expect(String(error["message"])).toContain("not a parseable URL");
  });
});

describe("check_conformance answers on the MCP channel", () => {
  it("refuses an empty artifact with instructions, not a stack trace", async () => {
    const body = await call("check_conformance", {});
    const error = body["error"] as Record<string, unknown>;
    expect(String(error["message"])).toContain("compact JWS");
  });

  it("returns a structured verdict for a well-formed but bogus JWS, offline", async () => {
    /*
     * Three base64url segments, syntactically an artifact, signed by
     * nobody. public_key_hex forces the fully offline path so this
     * test never needs the network — and pins the promise in the tool
     * description that supplying a key makes no request in the
     * caller's name.
     */
    const segment = btoa(JSON.stringify({ alg: "EdDSA" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const artifact = `${segment}.${segment}.${segment}`;
    const body = await call("check_conformance", {
      artifact,
      public_key_hex: "aa".repeat(32),
    });
    const result = body["result"] as Record<string, unknown>;
    expect(result).toBeTruthy();
    const verdict = result["structuredContent"] as Record<string, unknown>;
    expect(["does_not_conform", "could_not_check"]).toContain(
      verdict["verdict"],
    );
    expect(verdict["key_resolution"]).toBe("offline");
  });
});
