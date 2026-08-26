import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE MANIFEST BECOMES ROUTABLE (2026-08-26, after a verified outside
 * diagnosis).
 *
 * /.well-known/x402 served `resources` as bare URL strings while the
 * catalog beside it served structured objects — same 31 tools, two
 * incompatible shapes. Crawlers parse the well-known path first, find
 * nothing structured, and index the store as a "known origin" that
 * never resolves as routable tools. Meanwhile neither surface carried
 * `accepts`, so even the structured entries were unpriced — and a
 * router needs scheme/network/amount/payTo to treat a tool as a
 * routable paid call. That is the live-vs-claimed gap we hunt others
 * for, on our own front door.
 *
 * The law this spec pins: ONE builder, BOTH surfaces, accepts DERIVED
 * from the same railAccepts the till actually charges with — never
 * hand-written, so the manifest cannot drift from the money path.
 */

const BASE = "https://scvd.store";

async function json(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

type Entry = {
  resourceUrl: string;
  method: string;
  x402Version: number;
  description: string;
  accepts: {
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    extra?: { name: string; version: string };
  }[];
};

describe("the routable manifest", () => {
  beforeAll(installFacilitatorMock);

  it("serves structured objects, not bare strings, at the path crawlers read first", async () => {
    const manifest = await json("/.well-known/x402");
    const resources = manifest["resources"] as unknown[];
    expect(resources.length).toBeGreaterThan(0);
    for (const entry of resources) {
      expect(typeof entry).toBe("object");
      const record = entry as Entry & {
        resource: string;
        type: string;
        lastUpdated: string;
      };
      expect(typeof record.resourceUrl).toBe("string");
      // The standard discovered-resource spelling rides beside ours.
      expect(record.resource).toBe(record.resourceUrl);
      expect(record.type).toBe("http");
      expect(record.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(record.method).toBe("GET");
      expect(Array.isArray(record.accepts)).toBe(true);
    }
  });

  it("the two surfaces serve identical resources — one builder, no divergence", async () => {
    const thin = await json("/.well-known/x402");
    const catalog = await json("/.well-known/x402.json");
    expect(thin["resources"]).toEqual(catalog["resources"]);
  });

  it("every entry's accepts carries the routable minimum on every open rail", async () => {
    const manifest = await json("/.well-known/x402");
    const resources = manifest["resources"] as Entry[];
    for (const entry of resources) {
      expect(entry.accepts.length).toBeGreaterThan(0);
      for (const accept of entry.accepts) {
        expect(accept.scheme).toBe("exact");
        expect(accept.network).toMatch(/^(eip155:\d+|solana:)/);
        // Atomic USDC, never a dollar string, never a decimal.
        expect(accept.amount).toMatch(/^\d+$/);
        expect(accept.asset.length).toBeGreaterThan(0);
        expect(accept.payTo.length).toBeGreaterThan(0);
        if (accept.network.startsWith("eip155:")) {
          // The EIP-712 domain params, present on every EVM entry —
          // the exact conformance line a directory checks us on.
          expect(accept.extra).toEqual({ name: "USD Coin", version: "2" });
        }
      }
    }
  });

  it("advertised accepts match the challenge the till actually serves", async () => {
    /*
     * T5 as construction, not patrol: the manifest derives from
     * railAccepts, and this test proves the derivation against a real
     * 402 from a real door. If the middleware and the manifest ever
     * disagree on amount, payTo, or rails, this is where it shows.
     */
    const manifest = await json("/.well-known/x402");
    const resources = manifest["resources"] as Entry[];
    const spot = resources.find((r) => r.resourceUrl.endsWith("/api/buy/spot_check"));
    expect(spot).toBeDefined();
    const live = await SELF.fetch(`${BASE}/api/buy/spot_check`);
    expect(live.status).toBe(402);
    const header = live.headers.get("PAYMENT-REQUIRED");
    const challenge = JSON.parse(atob(header ?? "")) as {
      accepts: { network: string; amount: string; payTo: string; asset: string }[];
    };
    const advertisedRails = spot!.accepts.map((a) => a.network).sort();
    const servedRails = challenge.accepts.map((a) => a.network).sort();
    expect(advertisedRails).toEqual(servedRails);
    for (const served of challenge.accepts) {
      const advertised = spot!.accepts.find((a) => a.network === served.network);
      expect(advertised, `no advertised accept for ${served.network}`).toBeDefined();
      expect(advertised!.amount).toBe(served.amount);
      expect(advertised!.payTo.toLowerCase()).toBe(served.payTo.toLowerCase());
      expect(advertised!.asset.toLowerCase()).toBe(served.asset.toLowerCase());
    }
  });

  it("the almanac and gazette doors ride the manifest with accepts too", async () => {
    const manifest = await json("/.well-known/x402");
    const resources = manifest["resources"] as Entry[];
    const buyDoors = resources.filter((r) => r.resourceUrl.includes("/api/buy/"));
    // Menu doors present; any non-menu door (almanac/gazette pages,
    // when published) must carry the same structured shape — the
    // filter above just proves the split is visible to this test.
    expect(buyDoors.length).toBeGreaterThanOrEqual(20);
    for (const entry of resources) {
      expect(Array.isArray((entry as Entry).accepts)).toBe(true);
    }
  });
});
