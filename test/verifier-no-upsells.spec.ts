import { SELF } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";

const base = "https://scvd.store";
afterEach(() => vi.unstubAllGlobals());

async function call(path: string, name: string) {
  const response = await SELF.fetch(base + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name, arguments: { url: "https://qualification.example/door" } } }),
  });
  return await response.json() as { result: { structuredContent: Record<string, unknown>; content: { text: string }[] } };
}

it.each(["not_ready", "unreachable"])("keeps %s evidence and its limits without offering purchases on the verifier door", async (verdict) => {
  vi.stubGlobal("fetch", async () => {
    if (verdict === "unreachable") throw new TypeError("connection refused");
    return new Response("Not a payment endpoint", { status: 200 });
  });
  const general = await call("/mcp", "preflight_endpoint");
  const verifier = await call("/mcp/verifier", "preflight_x402_endpoint");
  const original = general.result.structuredContent;
  const reading = verifier.result.structuredContent;
  expect(original["verdict"]).toBe(verdict);
  expect(JSON.stringify(original)).toContain("buy_observation");
  expect(JSON.stringify(verifier)).not.toMatch(/buy_observation|\/api\/buy\/|price_usdc|signed_copy_of_this_reading/);
  for (const field of ["verdict", "reached_level", "reached_level_meaning", "checks", "checks_vector", "advisories", "what_this_cannot_tell_you", "our_conflict_of_interest", "single_probe_note", "rate_limit"]) {
    expect(reading[field], field).toEqual(original[field]);
  }
  const ladder = reading["the_rest_of_the_ladder"] as { unclimbed: { rung: string; what_it_is: string }[]; already_free: string };
  expect(ladder.unclimbed.map(row => row.rung)).toEqual(["L3c", "L3d", "L4-L6"]);
  expect(ladder.unclimbed.every(row => row.what_it_is.length > 0)).toBe(true);
  expect(ladder.already_free).toContain("/api/conformance/v1");
  expect(reading["store_identity"]).toMatchObject({ homepage: base + "/mcp/verifier" });
  expect(verifier.result.content.map(part => part.text)).toContain(JSON.stringify(reading));
});
