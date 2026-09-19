import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "@/index";
import { itemKeyFromPath } from "@/lib/metrics";
import { nativeCheckoutItem } from "@/lib/mpp-checkout-capability";
import { markKeeperSeen } from "@/services/shutter";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * ONE DOOR, TWO SPELLINGS (2026-09-19; ROADMAP D1's open question).
 *
 * routes/buy.ts says `/api/buy/hello` and `/api/buy/hello/` are one
 * door, and the shelf checks agree — but the payment gate's own lookups
 * read lib/metrics.ts itemKeyFromPath, which kept the slash, so "hello/"
 * was no item: the slashed knock answered a 402 with no buyer guidance,
 * no sample, no idempotency block, no native Payment challenge, and its
 * counters landed under a phantom item. The doors parity test saw it on
 * its first run (2026-09-05) and, by its own law, could only hold the
 * doors to the store's thinner answer.
 *
 * This holds the two spellings to one answer under one clock. The only
 * bytes allowed to differ are the ones that spell the request's own
 * path back to the buyer (the x402 resource URL and the native
 * challenge's scope), which a retry at the same URL must carry as sent.
 */
const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const FROZEN = new Date("2026-09-19T02:00:00.000Z");
const KEY = "trailing-slash-challenge-key-0123456789";
const bindings: Env = { ...testEnv, MPP_CHECKOUT_ENABLED: "true", MPP_CHALLENGE_KEY: KEY };

beforeAll(async () => {
  installFacilitatorMock();
  await markKeeperSeen(testEnv);
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => vi.useRealTimers());

async function knock(path: string) {
  vi.setSystemTime(FROZEN);
  const response = await app.request(`${BASE}${path}`, { headers: { Accept: "application/json" } }, bindings);
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

/** The slashed spelling, with its own path spelled the plain way, so the rest can be compared byte for byte. */
function unslash(text: string, id: string): string {
  return text.replaceAll(`/api/buy/${id}/`, `/api/buy/${id}`);
}

/**
 * A signed offer is a JWS over terms that name the resource URL, so its
 * bytes differ by the slash inside the signed payload. Replace each one
 * with its decoded payload, spelled plain, and the offers compare on
 * what they say rather than on the signature over the spelling.
 */
function readable(value: unknown, id: string): unknown {
  if (typeof value === "string") {
    const jws = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(value);
    if (!jws) return value;
    const payload = atob(jws[2]!.replace(/-/g, "+").replace(/_/g, "/"));
    return `jws:${unslash(payload, id)}`;
  }
  if (Array.isArray(value)) return value.map(entry => readable(entry, id));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, readable(entry, id)]));
  }
  return value;
}

describe("a trailing slash is the same door", () => {
  it("the item key and the native door read the two spellings as one item", () => {
    const [first] = MENU_ITEMS;
    expect(first).toBeDefined();
    expect(itemKeyFromPath(`/api/buy/${first!.id}/`)).toBe(first!.id);
    expect(itemKeyFromPath(`/api/buy/${first!.id}`)).toBe(first!.id);
    expect(nativeCheckoutItem(`/api/buy/${first!.id}/`, "GET")?.id).toBe(first!.id);
    // Two slashes are still not a door name; the shelf check answers that knock.
    expect(itemKeyFromPath(`/api/buy/${first!.id}//`)).toBe(first!.id);
    expect(nativeCheckoutItem(`/api/buy/${first!.id}//`, "GET")).toBeUndefined();
    expect(itemKeyFromPath("/")).toBe("");
  });

  it("answers the slashed knock with the same 402 body, terms and native challenge as the plain one", async () => {
    // Every door on the shelf, since the gate's lookups run for all of them.
    for (const item of MENU_ITEMS) {
      const plain = await knock(`/api/buy/${item.id}`);
      const slashed = await knock(`/api/buy/${item.id}/`);
      expect(slashed.status, item.id).toBe(plain.status);
      if (plain.status !== 402) continue;
      // The body: every key the plain answer carries, with the same values.
      const plainBody = JSON.parse(plain.text) as Record<string, unknown>;
      const slashedBody = JSON.parse(unslash(slashed.text, item.id)) as Record<string, unknown>;
      expect(Object.keys(slashedBody).sort(), `${item.id}: body keys`).toEqual(Object.keys(plainBody).sort());
      expect(readable(slashedBody, item.id), `${item.id}: body`).toEqual(readable(plainBody, item.id));
      // The x402 terms: the same offers, the resource spelled as knocked.
      const terms = (header: Headers) => JSON.parse(atob(header.get("PAYMENT-REQUIRED") ?? "")) as Record<string, unknown>;
      expect(readable(JSON.parse(unslash(JSON.stringify(terms(slashed.headers)), item.id)), item.id), `${item.id}: terms`)
        .toEqual(readable(terms(plain.headers), item.id));
      // The native lane: a Payment challenge on both, not the X402 hint on one.
      expect(plain.headers.get("WWW-Authenticate"), `${item.id}: plain challenge`).toMatch(/^Payment /);
      expect(slashed.headers.get("WWW-Authenticate"), `${item.id}: slashed challenge`).toMatch(/^Payment /);
    }
  });
});
