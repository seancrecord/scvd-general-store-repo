import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store/menu";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";

const BASE = "https://scvd.store";

describe("/ucp/v1 catalog", () => {
  it("returns products for a query and caps the page size", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/v1/catalog/search?q=x402&limit=500`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.length).toBeLessThanOrEqual(50);
    expect(body["store.scvd"].availability_is_not_a_commitment).toContain("402");
  });

  it("lists the shelf when no query is given", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/ucp/v1/catalog/search`)
    ).json()) as Record<string, any>;
    expect(body.products.length).toBe(20);
    expect(body["store.scvd"].total_in_catalog).toBe(coreCommerceItems().length);
  });

  it("looks up an item and hands back a variant id a checkout could use", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/ucp/v1/catalog/lookup?id=service_audit`)
    ).json()) as Record<string, any>;
    expect(body.product.id).toBe("gid://scvd.store/Product/service_audit");
    expect(body.product.variants[0].id).toBe(
      "gid://scvd.store/Variant/service_audit",
    );
    expect(body.product.variants[0].sku).toBe("SCVD-SERVICE-AUDIT");
    expect(body.product.variants[0].price).toEqual({ amount: 500, currency: "USD" });
  });

  it("asks for an identifier rather than guessing when none is given", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/v1/catalog/lookup`);
    expect(res.status).toBe(400);
  });

  /**
   * The sub-cent shelf is the case where a bare 404 would be a lie: the
   * item exists, it is for sale, and it is absent from this catalog for
   * a reason a reader can act on.
   */
  it("distinguishes 'not in this catalog' from 'no such item'", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/v1/catalog/lookup?id=spot_check`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.error).toBe("not_in_ucp_catalog");
    expect(body.still_for_sale).toBe(true);
    expect(body.price_usdc).toBe(0.001);
    expect(body.buy_url).toBe(`${BASE}/api/buy/spot_check`);

    const missing = await SELF.fetch(`${BASE}/ucp/v1/catalog/lookup?id=no_such_item`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as Record<string, any>).error).toBe("not_found");
  });
});

describe("/ucp schemas and specs", () => {
  it("serves the payment handler schema from the namespace that owns it", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/schemas/payment/usdc-x402.json`);
    expect(res.status).toBe(200);
    const schema = (await res.json()) as Record<string, any>;
    expect(schema.$id).toBe(`${BASE}/ucp/schemas/payment/usdc-x402.json`);
    expect(schema.properties.decimals.const).toBe(6);
    expect(schema.properties.scheme.const).toBe("exact");
  });

  it("serves a per-item input schema generated from the door's own validation", async () => {
    for (const id of ["the_statement", "graffiti_on_a_train", "attestation_bundle"]) {
      const res = await SELF.fetch(`${BASE}/ucp/schemas/items/${id}.input.json`);
      expect(res.status, id).toBe(200);
      const schema = (await res.json()) as Record<string, any>;
      const expected = buyInputSchema(getMenuItem(id)!);
      expect(schema.required ?? []).toEqual(expected.required ?? []);
      expect(Object.keys(schema.properties)).toEqual(
        Object.keys(expected.properties ?? {}),
      );
    }
  });

  it("serves an input schema for the sub-cent shelf too, which has no catalog row", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/schemas/items/spot_check.input.json`);
    expect(res.status).toBe(200);
  });

  it("404s an item schema nobody sells", async () => {
    const res = await SELF.fetch(`${BASE}/ucp/schemas/items/nothing.input.json`);
    expect(res.status).toBe(404);
  });

  it("says plainly, at every door, that UCP cannot be paid here yet", async () => {
    const landing = (await (await SELF.fetch(`${BASE}/ucp`)).json()) as Record<
      string,
      any
    >;
    expect(landing.what_does_not).toContain("Checkout");
    expect(landing.what_does_not).toContain("/api/buy/");
    const spec = (await (
      await SELF.fetch(`${BASE}/ucp/specs/payment/usdc-x402`)
    ).json()) as Record<string, any>;
    expect(spec.not_yet_negotiable).toContain("no UCP checkout");
  });

  it("every schema and spec the profile points at answers 200", async () => {
    const profile = (await (
      await SELF.fetch(`${BASE}/.well-known/ucp`)
    ).json()) as Record<string, any>;
    const urls = new Set<string>();
    const walk = (value: unknown): void => {
      if (typeof value === "string" && value.startsWith(`${BASE}/ucp/`)) {
        if (!value.includes("{")) urls.add(value);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(profile);
    expect(urls.size).toBeGreaterThan(3);
    for (const url of urls) {
      const res = await SELF.fetch(url);
      expect(res.status, url).toBe(200);
    }
  });
});

/**
 * DISCOVERY DRIFT IS THE FAILURE THIS STORE HAS ALREADY HAD TWICE: a
 * placeholder ingested as a real SKU, and one wallet in two spellings
 * read as a rotation. A new machine-readable surface is a new chance
 * at both, so it is checked against the ones already published rather
 * than only against itself.
 */
describe("UCP agrees with the surfaces already published", () => {
  it("quotes the same price as /menu.json for every item it lists", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as Record<
      string,
      any
    >;
    const rows: any[] = menu.items ?? menu.menu ?? menu.catalog ?? [];
    expect(rows.length).toBeGreaterThan(0);
    const priced = new Map<string, number>(
      rows
        .filter((row) => typeof row?.id === "string")
        .map((row) => [row.id as string, Number(row.price_usdc)]),
    );
    for (const item of coreCommerceItems()) {
      const listed = priced.get(item.id);
      if (listed === undefined) continue;
      const body = (await (
        await SELF.fetch(`${BASE}/ucp/v1/catalog/lookup?id=${item.id}`)
      ).json()) as Record<string, any>;
      const settlement = body.product.variants[0].metadata["store.scvd"].settlement;
      expect(Number(settlement.amount_usdc), item.id).toBe(listed);
      // The minimum tier is the price the menu quotes; the catalog
      // price is that same money in cents.
      expect(body.product.variants[0].price.amount, item.id).toBe(
        Math.round(listed * 100),
      );
    }
  });

  it("is findable from the surfaces a machine already reads", async () => {
    // A door nobody can find is not a door. The API catalog is the
    // fixed path a scanner is allowed to know; llms.txt is what an
    // agent reads first.
    const catalog = (await (
      await SELF.fetch(`${BASE}/.well-known/api-catalog`)
    ).json()) as Record<string, any>;
    const anchors = (catalog.linkset as any[]).map((row) => row.anchor);
    expect(anchors).toContain(`${BASE}/.well-known/ucp`);

    // /llms.txt is an index of areas; the catalog surfaces are listed
    // in the menu area and in the full guide.
    for (const path of ["/llms-full.txt", "/menu/llms.txt"]) {
      const llms = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(llms, path).toContain(`${BASE}/.well-known/ucp`);
      // And it says what is missing there, not only what is present.
      expect(llms, path).toContain("no UCP checkout");
    }
  });

  it("uses the item ids and listing URLs the rest of the store uses", async () => {
    for (const item of coreCommerceItems().slice(0, 6)) {
      const body = (await (
        await SELF.fetch(`${BASE}/ucp/v1/catalog/lookup?id=${item.id}`)
      ).json()) as Record<string, any>;
      expect(body.product.metadata["store.scvd"].item_id).toBe(item.id);
      expect(body.product.metadata["store.scvd"].sku).toBe(requireCommerce(item).sku);
      expect(body.product.url).toBe(`${BASE}/menu/${item.id}`);
      const listing = await SELF.fetch(body.product.url, {
        headers: { Accept: "application/json" },
      });
      expect(listing.status, item.id).toBe(200);
    }
  });
});
