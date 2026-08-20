import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";
import { decodeBase58, encodeBase58 } from "@/lib/base58";
import { createOrder } from "@/services/orders";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * THE LAST TWO EVM-ONLY DOORS, OPENED (the dual-currency truth pass's
 * named residues): a Solana payer could buy at every till in the
 * store and then be turned away at /zodiac and /api/claims. These
 * tests hold both doors open on both rails — and hold the base58
 * law: case-sensitive, echoed exactly, never folded.
 */

describe("base58, the little codec under both doors", () => {
  it("round-trips bytes, leading zeros included", () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 0, 1]),
      new Uint8Array([255, 254, 0, 17]),
      crypto.getRandomValues(new Uint8Array(32)),
      crypto.getRandomValues(new Uint8Array(64)),
    ];
    for (const bytes of cases) {
      expect(decodeBase58(encodeBase58(bytes))).toEqual(bytes);
    }
  });

  it("refuses the characters the alphabet excludes", () => {
    expect(decodeBase58("0OIl")).toBeNull();
  });

  it("agrees with a known Solana vector", () => {
    // The USDC mint address decodes to exactly 32 bytes and re-encodes
    // to the same case-sensitive string.
    const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const bytes = decodeBase58(mint)!;
    expect(bytes.length).toBe(32);
    expect(encodeBase58(bytes)).toBe(mint);
  });
});

describe("the zodiac's second rail", () => {
  const solanaAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  it("assigns a base58 wallet a sign for life, echoed exactly as sent", async () => {
    const first = (await (
      await SELF.fetch(`${BASE}/zodiac/${solanaAddress}`)
    ).json()) as Record<string, unknown>;
    const second = (await (
      await SELF.fetch(`${BASE}/zodiac/${solanaAddress}`)
    ).json()) as Record<string, unknown>;
    expect(first["sign"]).toBeTruthy();
    expect(first["sign"]).toBe(second["sign"]);
    // The base58 law: never folded, never lowercased.
    expect(first["address"]).toBe(solanaAddress);
    expect(String(first["page"])).toContain("#");
  });

  it("still turns nicknames away, on either rail's phrasing", async () => {
    const response = await SELF.fetch(`${BASE}/zodiac/not-an-address`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(String(body["error"])).toContain("base58");
  });

  it("leaves the archive room untouched by the base58 pattern", async () => {
    // "archive" is 7 chars of base58 alphabet; the route needs 32+.
    const response = await SELF.fetch(`${BASE}/zodiac/archive`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["archive"]).toBeTruthy();
  });
});

describe("the claims door's second rail", () => {
  async function solanaWallet(): Promise<{
    address: string;
    sign: (message: string) => Promise<string>;
  }> {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const publicKey = await ed25519.getPublicKeyAsync(secret);
    return {
      address: encodeBase58(publicKey),
      sign: async (message: string) =>
        encodeBase58(
          await ed25519.signAsync(new TextEncoder().encode(message), secret),
        ),
    };
  }

  async function challengeFor(address: string): Promise<Record<string, unknown>> {
    const res = await SELF.fetch(`${BASE}/api/claims/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  it("returns a Solana wallet's own orders to the ed25519 key that paid", async () => {
    const wallet = await solanaWallet();
    const item = getMenuItem("the_collab")!;
    const order = await createOrder(testEnv, {
      item,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990003,
      certId: "cert_claimsol1",
      payer: wallet.address,
    });

    const challenge = await challengeFor(wallet.address);
    expect(String(challenge["sign_how"])).toContain("signMessage");
    const signature = await wallet.sign(String(challenge["challenge"]));

    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: wallet.address, signature }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Base58 comes back exactly as it went in.
    expect(body["address"]).toBe(wallet.address);
    const orders = body["orders"] as Array<Record<string, unknown>>;
    expect(orders.find((o) => o["order_id"] === order.order_id)).toBeDefined();
  });

  it("refuses another key's signature and burns the nonce", async () => {
    const owner = await solanaWallet();
    const stranger = await solanaWallet();
    const challenge = await challengeFor(owner.address);
    const wrongSig = await stranger.sign(String(challenge["challenge"]));

    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: owner.address, signature: wrongSig }),
    });
    expect(res.status).toBe(403);

    // Spent is spent, right key or not.
    const rightSig = await owner.sign(String(challenge["challenge"]));
    const retry = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: owner.address, signature: rightSig }),
    });
    expect(retry.status).toBe(400);
  });

  it("accepts the same 64 bytes as hex, since clients disagree on encoding", async () => {
    const wallet = await solanaWallet();
    const challenge = await challengeFor(wallet.address);
    const base58Sig = await wallet.sign(String(challenge["challenge"]));
    const hexSig = [...decodeBase58(base58Sig)!]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: wallet.address, signature: hexSig }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body["orders"])).toBe(true);
  });
});
