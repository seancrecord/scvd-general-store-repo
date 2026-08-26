import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { MENU_ITEMS } from "@/store";
import { validSpotCheckHost } from "@/services/spot-check";
import type { Env } from "@/types";

/**
 * THE SPOT CHECK (roadmap 0.17; the keeper named it, priced it, and
 * signed the copy on 2026-08-26).
 *
 * The cheapest thing on the shelf, and priced there on purpose: the
 * routine pre-transaction question — what does the observatory know
 * about this host — answered from KV alone, signed with the same
 * discipline five dollars buys. The derived price floor advertises
 * this number on every surface, so the price test here is also the
 * store's public "from $0.001" claim being pinned.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

async function buySpotCheck(query: string): Promise<Response> {
  const url = `${BASE}/api/buy/spot_check${query}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  const accepted = required.accepts[0];
  if (!accepted) throw new Error("No payment tier offered");
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
}

describe("the spot check reads the books at the counter", () => {
  it("is the cheapest item on the menu, at the keeper's number", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "spot_check");
    expect(item).toBeDefined();
    expect(item!.price_usdc).toBe(0.001);
    const floor = Math.min(...MENU_ITEMS.map((entry) => entry.price_usdc));
    // The advertised floor IS this item. If something undercuts it,
    // this test asks whether that was meant.
    expect(floor).toBe(0.001);
  });

  it("refuses the sale without a host: no host, no charge", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/spot_check`);
    // The probe rule: unsigned asks the price and gets a 402 that
    // names the required parameter.
    expect(challenge.status).toBe(402);
    const body = (await challenge.json()) as Record<string, unknown>;
    expect(body["required_params"]).toEqual(["host"]);

    const required = decodePaymentRequired(challenge);
    const accepted = required.accepts[0]!;
    const paid = await SELF.fetch(`${BASE}/api/buy/spot_check`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(paid.status).toBe(400);
    const refusal = (await paid.json()) as Record<string, unknown>;
    expect(String(refusal["error"])).toContain("no charge");
  });

  it("refuses a URL where it asked for a hostname", async () => {
    const paid = await buySpotCheck("?host=https://example.com/api");
    expect(paid.status).toBe(400);
  });

  it("sells a signed not_observed for a host the books have never met", async () => {
    const response = await buySpotCheck("?host=never-met.example.com");
    expect(response.status).toBe(200);
    // Extras spread flat into the purchase response, beside the
    // certificate — the same shape every instant item serves.
    const extras = (await response.json()) as {
      spot_check: {
        host: string;
        not_observed: boolean;
        history: { rounds_probed: number };
      };
      signed_payload: string;
      signature: string;
      public_key: string;
      evidence_hash: string;
      certificate: { attests?: string };
    };
    const body = extras;
    /*
     * NOT_OBSERVED IS THE PRODUCT for this host: Rule 52 says the
     * lookup's blindness must never read as a verdict, and Rule 43
     * says nothing here is a score. The buyer paid for the books'
     * honest emptiness, signed.
     */
    expect(extras.spot_check.not_observed).toBe(true);
    expect(extras.spot_check.history.rounds_probed).toBe(0);
    // Signed like everything else: payload, signature, key, and the
    // evidence hash bound into the certificate the verify door serves.
    expect(extras.signature).toMatch(/^[0-9a-f]+$/i);
    expect(extras.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.certificate.attests).toBe(extras.evidence_hash);
    // The record never contains a score under any name.
    const flat = extras.signed_payload.toLowerCase();
    expect(flat).not.toContain('"score"');
    expect(flat).not.toContain('"rating"');
  });

  it("points at the free twin, because the same facts serve free", async () => {
    const response = await buySpotCheck("?host=never-met.example.com");
    const body = (await response.json()) as {
      spot_check: { free_twin_url: string };
    };
    expect(body.spot_check.free_twin_url).toBe(
      `${BASE}/corpus/host/never-met.example.com.json`,
    );
  });

  it("validates hostnames strictly enough to keep junk out of signed records", () => {
    expect(validSpotCheckHost("example.com")).toBe("example.com");
    expect(validSpotCheckHost("  ShOp.Example.COM ")).toBe("shop.example.com");
    expect(validSpotCheckHost("https://example.com")).toBeNull();
    expect(validSpotCheckHost("no-dots")).toBeNull();
    expect(validSpotCheckHost("")).toBeNull();
    expect(validSpotCheckHost("a".repeat(260) + ".com")).toBeNull();
  });
});
