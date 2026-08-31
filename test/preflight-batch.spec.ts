import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

async function batch(body: unknown) {
  return SELF.fetch(`${BASE}/api/preflight/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * The batch door, and the one thing it must never do: report on a door
 * nobody looked at. Everything else here is shape.
 */
describe("POST /api/preflight/batch", () => {
  it("probes each URL and reports each one's own status", async () => {
    const response = await batch({
      urls: [`${BASE}/api/buy/hello`, "not-a-url"],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      count: number;
      results: { url: string | null; status: number; result: unknown }[];
    };
    expect(body.count).toBe(2);
    expect(body.results).toHaveLength(2);
    // Nothing is flattened: a bad entry keeps its own status beside a
    // good one rather than failing the whole call.
    for (const entry of body.results) {
      expect(typeof entry.status).toBe("number");
      expect(entry.result).toBeTruthy();
    }
  });

  it("refuses an oversized batch whole rather than truncating it", async () => {
    const urls = Array.from({ length: 11 }, (_, i) => `${BASE}/api/buy/hello?i=${i}`);
    const response = await batch({ urls });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { sent: number; max_urls: number };
    expect(body.sent).toBe(11);
    expect(body.max_urls).toBe(10);
  });

  it("says plainly that batching is not a discount", async () => {
    const response = await batch({ urls: [`${BASE}/api/buy/hello`] });
    const body = (await response.json()) as { not_a_discount: string };
    expect(body.not_a_discount).toContain("metered as one");
  });

  it("asks for urls rather than guessing", async () => {
    const response = await batch({});
    expect(response.status).toBe(400);
  });
});
