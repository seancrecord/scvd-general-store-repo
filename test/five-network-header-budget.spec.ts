import { env } from "cloudflare:test";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { app } from "@/index";
import { MENU_ITEMS } from "@/store/menu";
import { acceptedNetworks } from "@/lib/payment-networks";
import { verifyOwnJws } from "@/lib/offer-receipt";
import { KV_KEYS } from "@/lib/kv-keys";
import { markKeeperSeen } from "@/services/shutter";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { decodePaymentRequired } from "./helpers/payment";

const base = "https://scvd.store";
const receiver = "0x3333333333333333333333333333333333333333";
const bindings = { ...env, POLYGON_PAY_TO: receiver, ARBITRUM_PAY_TO: receiver, WORLD_PAY_TO: receiver, SOLANA_PAY_TO: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE" } as unknown as Env;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  await markKeeperSeen(bindings);
  installFacilitatorMock();
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/x402/supported")) return response;
    const body = await response.json() as { kinds: unknown[] };
    body.kinds.push(...["eip155:137", "eip155:42161", "eip155:480"].map(network => ({ x402Version: 2, scheme: "exact", network })));
    return Response.json(body);
  });
  await bindings.ORDERS.put(KV_KEYS.gazetteIssue(901), JSON.stringify({ issue_number: 901, title: "Fixture", date: "2026-09-01", markdown: "A test page", contributors: [], tip_ids: [] }));
});
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const get = (path: string) => app.request(base + path, { headers: { Accept: "application/json" } }, bindings);
type Offers = { "offer-receipt": { info: { offers: { signature: string; acceptIndex: number }[] } } };

it("fits every five-network menu and publication quote within stock Node response headers", async () => {
  const paths = MENU_ITEMS.map(item => `/api/buy/${item.id}`);
  for (const [path, field] of [["/almanac", "entries"], ["/gazette", "issues"], ["/zodiac/archive", "pages"]]) {
    const index = await (await get(`${path}?view=compact`)).json() as Record<string, { buy_url: string }[]>;
    expect(index[field!]!.length).toBeGreaterThan(0);
    paths.push(new URL(index[field!]![0]!.buy_url).pathname);
  }
  const oversized: string[] = [];
  for (const path of paths) {
    const response = await get(path);
    expect(response.status, path).toBe(402);
    const quote = decodePaymentRequired(response);
    expect([...new Set(quote.accepts.map(a => a.network))], path).toEqual(acceptedNetworks(bindings));
    const body = await response.json() as { extensions: Offers };
    expect(body.extensions["offer-receipt"].info.offers.length, path).toBe(quote.accepts.length);
    let bytes = 32;
    response.headers.forEach((value, name) => { bytes += new TextEncoder().encode(`${name}: ${value}\r\n`).length; });
    if (bytes >= 15_360) oversized.push(`${path}: ${bytes}`);
  }
  expect(oversized).toEqual([]);
});

it("keeps every wide-quote signature verifiable in the body when its header mirror would overflow", async () => {
  const response = await get("/api/buy/graffiti_on_a_train");
  const quote = decodePaymentRequired(response);
  expect(quote.extensions?.["offer-receipt"]).toBeUndefined();
  expect(quote.extensions?.bazaar).toBeDefined();
  const body = await response.json() as { extensions: Offers };
  const offers = body.extensions["offer-receipt"].info.offers;
  expect(offers.length).toBe(quote.accepts.length);
  for (const offer of offers) {
    const verified = await verifyOwnJws(bindings, offer.signature);
    expect(verified.valid).toBe(true);
    const { scheme, network, asset, payTo, amount } = quote.accepts[offer.acceptIndex]!;
    expect(verified.payload).toMatchObject({ scheme, network, asset, payTo, amount });
  }
});

it("retains the signed-offer header mirror for quotes that fit", async () => {
  const response = await get("/api/buy/hello");
  const quote = decodePaymentRequired(response);
  const body = await response.json() as { extensions: Offers };
  expect(quote.extensions?.["offer-receipt"]).toEqual(body.extensions["offer-receipt"]);
});
