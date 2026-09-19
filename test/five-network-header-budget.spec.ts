import { installBuyerHarness, baseline, items, testEnv as quoteEnv } from "./helpers/buyer-harness";
import { env } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { app } from "@/index";
import { MENU_ITEMS } from "@/store/menu";
import { acceptedNetworks } from "@/lib/payment-networks";
import { priceTiersUsdc } from "@/lib/payments";
import { verifyOwnJws } from "@/lib/offer-receipt";
import { KV_KEYS } from "@/lib/kv-keys";
import { markKeeperSeen } from "@/services/shutter";
import type { Env } from "@/types";
import { decodePaymentRequired } from "./helpers/payment";

installBuyerHarness();
const base = "https://scvd.store";
const receiver = "0x3333333333333333333333333333333333333333";
/**
 * AS PRODUCTION SERVES IT (2026-09-19): five rails AND the native lane.
 * Until this day the bindings enabled the rails alone, and the widest
 * door measured 11,494 bytes here while the live one read 14,017: the
 * three Payment challenges a pay-what-it-deserves door has carried in
 * WWW-Authenticate since the native tips release (2,128 bytes) were
 * bytes this guard never built, on a line held 1,343 bytes under the
 * live number. The lane rides the bindings now, so the widest quote
 * this file measures is the widest quote a stock Node client gets.
 */
const bindings = { ...env, FIELD_WALLET_KEY: quoteEnv.FIELD_WALLET_KEY, POLYGON_PAY_TO: receiver, ARBITRUM_PAY_TO: receiver, WORLD_PAY_TO: receiver, SOLANA_PAY_TO: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE" , MPP_CHECKOUT_ENABLED: "true", MPP_CHALLENGE_KEY: "fixture-native-checkout-hmac-key"} as unknown as Env;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  await markKeeperSeen(bindings);

  const original = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/x402/supported")) return response;
    const body = await response.json() as { kinds: unknown[] };
    body.kinds.push(...["eip155:137", "eip155:42161", "eip155:480"].map(network => ({ x402Version: 2, scheme: "exact", network })));
    return Response.json(body);
  });

});
beforeEach(async () => {
  await bindings.ORDERS.put(KV_KEYS.gazetteIssue(901), JSON.stringify({ issue_number: 901, title: "Fixture", date: "2026-09-01", markdown: "A test page", contributors: [], tip_ids: [] }));
});
afterAll(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
/**
 * WHAT THE EDGE ADDS THAT NO LOCAL BUILD CAN (2026-09-19). Cloudflare
 * puts nine lines on every live answer that workerd never writes:
 * report-to (240), nel (69), date (37), cf-ray (30), alt-svc (30),
 * transfer-encoding (28), x-robots-tag (23), server (20) and
 * connection (19), measured on the widest door that day: 14,017 bytes
 * live against 13,574 built here, the same offers and challenges. A
 * stock Node client counts them against its 16,384, so this guard
 * counts them too. Measured, not derived; re-measure before moving.
 */
const EDGE_HEADER_BYTES = 450;

const get = (path: string) => app.request(base + path, { headers: { Accept: "application/json" } }, bindings);
type Offers = { "offer-receipt": { info: { offers: { signature: string; acceptIndex: number }[] } } };

it("fits every five-network menu and publication quote within stock Node response headers", async () => {
  const paths = MENU_ITEMS.map(item => `/api/buy/${item.id}?${new URLSearchParams(Object.entries(baseline(items.find(row => row.id === item.id)!)).map(([key, value]) => [key, String(value)]))}`);
  for (const [path, field] of [["/almanac", "entries"], ["/gazette", "issues"], ["/zodiac/archive", "pages"]]) {
    const index = await (await get(`${path}?view=compact`)).json() as Record<string, { buy_url: string }[]>;
    expect(index[field!]!.length).toBeGreaterThan(0);
    paths.push(new URL(index[field!]![0]!.buy_url).pathname);
  }
  const oversized: string[] = [];
  let widest = { path: "", bytes: 0 };
  for (const path of paths) {
    const response = await get(path);
    expect(response.status, path).toBe(402);
    const quote = decodePaymentRequired(response);
    expect([...new Set(quote.accepts.map(a => a.network))], path).toEqual(acceptedNetworks(bindings));
    const body = await response.json() as { extensions: Offers };
    expect(body.extensions["offer-receipt"].info.offers.length, path).toBe(quote.accepts.length);
    // The lane is on: one Payment challenge per tier, so the guard is measuring the header the lane makes.
    const item = MENU_ITEMS.find(row => path.startsWith(`/api/buy/${row.id}?`));
    const tiers = item ? priceTiersUsdc(item).length : quote.accepts.length / acceptedNetworks(bindings).length;
    expect(((response.headers.get("WWW-Authenticate") ?? "").match(/Payment /g) ?? []).length, `${path} challenges`).toBe(tiers);
    let bytes = 32 + EDGE_HEADER_BYTES;
    response.headers.forEach((value, name) => { bytes += new TextEncoder().encode(`${name}: ${value}\r\n`).length; });
    if (bytes > widest.bytes) widest = { path, bytes };
    if (bytes >= 15_360) oversized.push(`${path}: ${bytes}`);
  }
  expect(oversized, `widest door ${widest.path} at ${widest.bytes} bytes with the edge's lines counted; the line is 15,360 and Node's cliff 16,384`).toEqual([]);
});

it("keeps every wide-quote signature verifiable in the body when its header mirror would overflow", async () => {
  const response = await get("/api/buy/graffiti_on_a_train?tag=fixture");
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
