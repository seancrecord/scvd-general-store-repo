import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store/menu";
import { coreCommerceItems, requireCommerce } from "@/store/commerce";
import { variantGid } from "@/lib/ucp/ids";

const BASE = "https://scvd.store";

const post = (path: string, body: unknown) =>
  SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });


describe("/ucp/v1 catalog", () => {
  it("returns products for a query and caps the page size", async () => {
    const res = await post("/ucp/v1/catalog/search", {
      query: "x402",
      pagination: { limit: 500 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.length).toBeLessThanOrEqual(50);
    expect(body["store.scvd"].availability_is_not_a_commitment).toContain("402");
  });

  it("applies the schema's recommended default page size", async () => {
    const body = (await (
      await post("/ucp/v1/catalog/search", {})
    ).json()) as Record<string, any>;
    // pagination.json RECOMMENDS 10 when a caller names no page size.
    expect(body.products.length).toBe(10);
    expect(body.pagination.has_next_page).toBe(true);
    expect(body.pagination.total_count).toBe(coreCommerceItems().length);
    expect(body["store.scvd"].total_in_catalog).toBe(coreCommerceItems().length);
  });

  it("is a batch operation, and says which identifier resolved to what", async () => {
    const body = (await (
      await post("/ucp/v1/catalog/lookup", {
        ids: ["service_audit", "SCVD-HELLO"],
      })
    ).json()) as Record<string, any>;
    expect(body.products.length).toBe(2);
    const ids = body.products.map(
      (product: any) => product.metadata["store.scvd"].item_id,
    );
    expect(ids.sort()).toEqual(["hello", "service_audit"]);
    for (const product of body.products) {
      for (const variant of product.variants) {
        // Required on a lookup response: which request id resolved here.
        expect(Array.isArray(variant.inputs)).toBe(true);
        expect(variant.inputs.length).toBeGreaterThan(0);
        expect(["exact", "featured", "related"]).toContain(
          variant.inputs[0].match,
        );
      }
    }
  });

  it("refuses a lookup with no ids, the way the schema shapes an error", async () => {
    const res = await post("/ucp/v1/catalog/lookup", {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, any>;
    expect(body.messages[0].type).toBe("error");
    expect(typeof body.messages[0].content).toBe("string");
    expect(body.messages[0].severity).toBe("unrecoverable");
  });

  it("looks up an item and hands back a variant id a checkout could use", async () => {
    const body = (await (
      await post("/ucp/v1/catalog/lookup", { ids: ["service_audit"] })
    ).json()) as Record<string, any>;
    const product = body.products[0];
    expect(product.id).toBe("gid://scvd.store/Product/service_audit");
    expect(product.variants[0].id).toBe("gid://scvd.store/Variant/service_audit");
    expect(product.variants[0].sku).toBe("SCVD-SERVICE-AUDIT");
    expect(product.variants[0].price).toEqual({ amount: 500, currency: "USD" });
    // The store's own shelves, named as the store's own taxonomy.
    expect(product.categories[0].taxonomy).toBe("merchant");
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
    const body = (await (
      await post("/ucp/v1/catalog/lookup", {
        ids: ["spot_check", "no_such_item", "service_audit"],
      })
    ).json()) as Record<string, any>;
    // One resolved; the other two are warnings, not a failed request.
    expect(body.products.length).toBe(1);
    const excluded = body.messages.find(
      (message: any) => message.code === "store.scvd.catalog.excluded",
    );
    expect(excluded.type).toBe("warning");
    expect(excluded["store.scvd"].still_for_sale).toBe(true);
    expect(excluded["store.scvd"].price_usdc).toBe(0.001);
    expect(excluded["store.scvd"].buy_url).toBe(`${BASE}/api/buy/spot_check`);

    const missing = body.messages.find(
      (message: any) => message.code === "not_found",
    );
    expect(missing["store.scvd"].id).toBe("no_such_item");
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

  it("says plainly, at every door, what is open and how Complete is paid", async () => {
    const landing = (await (await SELF.fetch(`${BASE}/ucp`)).json()) as Record<
      string,
      any
    >;
    expect(landing.what_works).toContain("checkout and order");
    expect(landing.what_does_not).toBeUndefined();
    expect(landing.checkout.complete.url).toBe(`${BASE}/ucp/v1/checkout-sessions/{id}/complete`);
    const spec = (await (
      await SELF.fetch(`${BASE}/ucp/specs/payment/usdc-x402`)
    ).json()) as Record<string, any>;
    expect(spec.negotiable).toBe(true);
    expect(spec.not_yet_negotiable).toBeUndefined();
    expect(spec.complete_request.payment.instruments[0].credential.type).toBe("x402");
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
        await post("/ucp/v1/catalog/lookup", { ids: [item.id] })
      ).json()) as Record<string, any>;
      const settlement =
        body.products[0].variants[0].metadata["store.scvd"].settlement;
      expect(Number(settlement.amount_usdc), item.id).toBe(listed);
      // The minimum tier is the price the menu quotes; the catalog
      // price is that same money in cents.
      expect(body.products[0].variants[0].price.amount, item.id).toBe(
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
      // And it says what the profile says: checkout and order are
      // served, and where a platform opens one.
      expect(llms, path).toContain(`${BASE}/ucp/v1/checkout-sessions`);
    }
  });

  it("uses the item ids and listing URLs the rest of the store uses", async () => {
    for (const item of coreCommerceItems().slice(0, 6)) {
      const body = (await (
        await post("/ucp/v1/catalog/lookup", { ids: [item.id] })
      ).json()) as Record<string, any>;
      const product = body.products[0];
      expect(product.metadata["store.scvd"].item_id).toBe(item.id);
      expect(product.metadata["store.scvd"].sku).toBe(requireCommerce(item).sku);
      expect(product.url).toBe(`${BASE}/menu/${item.id}`);
      const listing = await SELF.fetch(product.url, {
        headers: { Accept: "application/json" },
      });
      expect(listing.status, item.id).toBe(200);
    }
  });
});

/**
 * GET PRODUCT, the third operation of the lookup capability and the
 * one this store advertised without serving until 2026-09-19. Lookup
 * answers "which of my identifiers resolved to what"; this answers
 * "tell me everything about this one, and which variant my selections
 * land on".
 */
describe("/ucp/v1/catalog/product", () => {
  const product = (body: unknown) => post("/ucp/v1/catalog/product", body);

  it("answers with one product, singular, in full", async () => {
    const res = await product({ id: "service_audit" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    // `product`, not `products`: a single-resource operation.
    expect(body.products).toBeUndefined();
    expect(body.product.id).toBe("gid://scvd.store/Product/service_audit");
    expect(body.product.variants[0].sku).toBe("SCVD-SERVICE-AUDIT");
    expect(body.product.metadata["store.scvd"].inputs.required).toContain("url");
    // Policies target the singular root; `$.products[0]` would resolve
    // to nothing in a document with no products array.
    expect(body.policies[0].applies_to).toEqual(["$.product"]);
  });

  it("publishes the tier axis with availability signals, and anchors the selection on it", async () => {
    const body = (await (await product({ id: "the_collab" })).json()) as Record<string, any>;
    const axis = body.product.options[0];
    expect(axis.name).toBe("Tier");
    expect(axis.values.length).toBe(body.product.variants.length);
    for (const value of axis.values) {
      expect(typeof value.label).toBe("string");
      expect(value.exists).toBe(true);
      expect(typeof value.available).toBe("boolean");
    }
    // With nothing selected, the featured variant is the first tier.
    expect(body.product.selected[0].name).toBe("Tier");
    expect(body.product.selected[0].id).toBe(body.product.variants[0].id);

    // A selection by label moves it, and says so by id.
    const second = axis.values[1];
    const narrowed = (await (
      await product({ id: "the_collab", selected: [{ name: "Tier", label: second.label }] })
    ).json()) as Record<string, any>;
    expect(narrowed.product.selected[0].label).toBe(second.label);
    expect(narrowed.product.selected[0].id).toBe(second.id);
    // Nothing is hidden: asking about a product answers about the product.
    expect(narrowed.product.variants.length).toBe(body.product.variants.length);
  });

  it("treats a variant id or a tier SKU in the request as the selection it is", async () => {
    const second = variantGid("the_collab", 1);
    const body = (await (await product({ id: second })).json()) as Record<string, any>;
    expect(body.product.selected[0].id).toBe(second);

    // And the tier SKU the catalog hands out resolves the same way.
    const sku = body.product.variants[1].sku;
    const bySku = (await (await product({ id: sku })).json()) as Record<string, any>;
    expect(bySku.product.selected[0].id).toBe(second);
  });

  it("omits the option fields for a product with no option axes, rather than inventing one", async () => {
    const body = (await (await product({ id: "hello" })).json()) as Record<string, any>;
    expect(body.product.variants.length).toBe(1);
    expect(body.product.options).toBeUndefined();
    expect(body.product.selected).toBeUndefined();
  });

  it("warns when a selection matched nothing, and still answers", async () => {
    const body = (await (
      await product({ id: "the_collab", selected: [{ name: "Size", label: "Large" }] })
    ).json()) as Record<string, any>;
    expect(body.messages[0].type).toBe("warning");
    expect(body.messages[0].content).toContain("Tier");
    expect(body.product.selected[0].name).toBe("Tier");
  });

  it("answers an error response for an id with no catalog row, because `product` is required", async () => {
    const res = await product({ id: "no-such-product" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.product).toBeUndefined();
    expect(body.ucp.status).toBe("error");
    expect(body.messages[0].type).toBe("error");
    expect(body.messages[0].severity).toBe("unrecoverable");
  });

  it("keeps the sub-cent items' own explanation rather than calling them missing", async () => {
    const res = await product({ id: "spot_check" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, any>;
    expect(body.messages[0].content).toContain("less than one cent");
    expect(body.messages[0]["store.scvd"].still_for_sale).toBe(true);
    expect(body.messages[0]["store.scvd"].buy_url).toBe(`${BASE}/api/buy/spot_check`);
  });

  it("refuses a request with no id, and names the batch operation for callers who wanted it", async () => {
    const res = await product({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ucp.status).toBe("error");
    expect(body.messages[0].content).toContain("/ucp/v1/catalog/lookup");
  });
});
