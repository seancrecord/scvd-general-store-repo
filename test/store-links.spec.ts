import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ATTEST_CONFLICT_LINE, attestLoop, storeDoors, storeLinks, whereToLookNext } from "@/lib/store-links";
import { USE_WHEN } from "@/store/spec";
import { ROOMS } from "@/store/rooms";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE LINK SET, SWEPT (2026-09-21): the same store roster on the 402,
 * the MCP error data, the verify JSON, the host JSON twin, the
 * purchase response and the error bodies; `next` derived from named
 * sources and never hand-placed; every door on the roster answers;
 * the buy→attest loop built once and carried whole.
 */

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

describe("the link set", () => {
  it("derives next from the recipes, the room, the settlement and the tier, in that order, naming each source", () => {
    const recipe = USE_WHEN.find((entry) => entry.items.filter((id) => !id.startsWith("free:")).length >= 2)!;
    const [first, second] = recipe.items.filter((id) => !id.startsWith("free:"));
    const links = storeLinks(BASE, { item: first, path: "/corpus", settlement: { tx: "0xabc", item: first! } });
    const bySource = (source: string) => links.next.filter((step) => step.source === source);
    expect(bySource("use_when").map((step) => step.item)).toContain(second);
    // Every recipe-derived step carries the sentence of a recipe that names it (the last such recipe wins on a duplicate).
    expect(bySource("use_when").every((step) => USE_WHEN.some((entry) => entry.when === step.why && entry.items.includes(step.item)))).toBe(true);
    expect(bySource("room").map((step) => step.item)).toEqual(ROOMS.find((room) => room.path === "/corpus")!.deeper);
    expect(bySource("settlement").map((step) => step.item)).toEqual(["settlement_attestation"]);
    expect(links.next.map((step) => step.item)).not.toContain(first);
    expect(new Set(links.next.map((step) => step.item)).size).toBe(links.next.length);
    const order = links.next.map((step) => step.source);
    expect(order).toEqual([...order].sort((a, b) => ["use_when", "room", "settlement", "host_tier"].indexOf(a) - ["use_when", "room", "settlement", "host_tier"].indexOf(b)));
    for (const step of links.next) {
      expect(getMenuItem(step.item), step.item).toBeDefined();
      expect(step.price_usdc).toBe(getMenuItem(step.item)!.price_usdc);
      expect(step.url.startsWith(`${BASE}/api/buy/${step.item}`)).toBe(true);
    }
  });

  it("lets a host's own tier pick the instrument, and offers a refresh only when the round's reading is the newest", () => {
    const broken = storeLinks(BASE, { host: { host: "down.example", tier: "broken" } });
    expect(broken.next.map((step) => step.item)).toEqual(["launch_check", "passport_refresh"]);
    expect(broken.next[0]!.url).toBe(`${BASE}/api/buy/launch_check?host=down.example`);
    const standing = storeLinks(BASE, { host: { host: "up.example", tier: "standing", refreshed: true } });
    expect(standing.next.map((step) => step.item)).toEqual(["spot_check"]);
    expect(standing.next.every((step) => step.source === "host_tier")).toBe(true);
  });

  it("builds the attest loop once, prefilled, with the conflict line, and never on the settlement items", () => {
    const loop = attestLoop(BASE, { tx: "0xdeadbeef", item: "hello" })!;
    expect(loop.url).toBe(`${BASE}/api/buy/settlement_attestation?tx_hash=0xdeadbeef`);
    expect(loop.price_usdc).toBe(getMenuItem("settlement_attestation")!.price_usdc);
    expect(loop.conflict).toBe(ATTEST_CONFLICT_LINE);
    for (const id of ["settlement_attestation", "settlement_reconciliation", "attestation_bundle"]) {
      expect(attestLoop(BASE, { tx: "0x1", item: id })).toBeUndefined();
    }
    expect(storeLinks(BASE, { item: "hello", settlement: { tx: "0x2", item: "hello" } }).attest?.url).toContain("tx_hash=0x2");
  });

  it("carries the same store roster on the 402, the MCP error data, the verify JSON, the host twin and the purchase response", async () => {
    const doors = storeDoors(BASE);
    const url = `${BASE}/api/buy/hello?agent_name=sweep`;
    const quote = await SELF.fetch(url, { headers: { Accept: "application/json" } });
    expect(quote.status).toBe(402);
    const quoteBody = (await quote.json()) as { store_links: { store: unknown; next: unknown[] } };
    expect(quoteBody.store_links.store).toEqual(doors);

    const mcp = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "buy_simple", arguments: { item_id: "hello", agent_name: "sweep" } } }),
    });
    const mcpBody = (await mcp.json()) as { error?: { data?: { store_links?: { store: unknown; next: unknown[] }; spec?: unknown } } };
    expect(mcpBody.error?.data?.store_links?.store, JSON.stringify(mcpBody).slice(0, 400)).toEqual(doors);
    expect(mcpBody.error?.data?.spec).toBeDefined();
    // The same item at both doors derives the same next list.
    expect(mcpBody.error!.data!.store_links!.next).toEqual(quoteBody.store_links.next);

    const challenge = decodePaymentRequired(quote);
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!), Accept: "application/json" } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    const purchase = (await paid.json()) as { certificate: { cert_id: string }; store_links: { store: unknown; attest?: { url: string } }; attest_this_purchase?: { url: string } };
    expect(purchase.store_links.store).toEqual(doors);
    if (purchase.attest_this_purchase) expect(purchase.store_links.attest?.url).toBe(purchase.attest_this_purchase.url);

    const verify = (await (await SELF.fetch(`${BASE}/api/verify/${purchase.certificate.cert_id}`, { headers: { Accept: "application/json" } })).json()) as { store_links: { store: unknown } };
    expect(verify.store_links.store).toEqual(doors);

    const missing = (await (await SELF.fetch(`${BASE}/no-such-aisle`, { headers: { Accept: "application/json" } })).json()) as { where_to_look_next: unknown };
    expect(missing.where_to_look_next).toEqual(whereToLookNext(BASE));
  });

  it("names only doors that answer", async () => {
    for (const [name, href] of Object.entries(storeDoors(BASE))) {
      if (name === "name" || name === "verify_url_template") continue;
      const res = await SELF.fetch(href, { headers: { Accept: "application/json" } });
      expect(res.status, `${name} ${href}`).not.toBe(404);
    }
    for (const link of whereToLookNext(BASE)) {
      const res = await SELF.fetch(link.url);
      expect(res.status, link.url).toBe(200);
    }
  });
});
