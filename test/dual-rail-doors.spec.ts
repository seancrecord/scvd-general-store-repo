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


/** Top-level twin of the claims describe's wallet factory, for the
 * journey tests below that need one outside that scope. */
async function solanaWalletFor(): Promise<{
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

describe("the reset journey ends at the goods, not at a mailbox", () => {
  /**
   * The journey sweep's find (2026-08-20): most of the shelf is
   * INSTANT — no order opens, the certificate rides the purchase
   * response, and an agent that resets before reading it held
   * nothing. The claims door existed for exactly that reset and
   * returned orders only; its own note told the most common buyer to
   * email the keeper. Same key proof, both kinds of record.
   */
  it("returns the certificates the wallet paid for, newest first", async () => {
    const wallet = await solanaWalletFor();
    const put = (id: string, date: string) =>
      testEnv.PATRONS.put(
        `cert:${id}`,
        JSON.stringify({
          certificate: {
            cert_id: id,
            item: "hello",
            patron_number: 990010,
            date,
            paid_usdc: 0.5,
            payer: wallet.address,
            settlement_tx: "0x" + "ab".repeat(32),
          },
          signature: "00".repeat(64),
          public_key: "11".repeat(32),
        }),
      );
    await put("cert_resetold", "2026-08-01T00:00:00.000Z");
    await put("cert_resetnew", "2026-08-20T00:00:00.000Z");

    const challenge = await (
      await SELF.fetch(`${BASE}/api/claims/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet.address }),
      })
    ).json() as Record<string, unknown>;
    const signature = await wallet.sign(String(challenge["challenge"]));
    const res = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: wallet.address, signature }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      certificates: { cert_id: string; verify_url: string }[];
    };
    expect(body.certificates.map((c) => c.cert_id)).toEqual([
      "cert_resetnew",
      "cert_resetold",
    ]);
    expect(body.certificates[0]!.verify_url).toContain(
      "/api/verify/cert_resetnew",
    );
  });

  it("returns nobody ELSE's certificates with the claim", async () => {
    const owner = await solanaWalletFor();
    const stranger = await solanaWalletFor();
    await testEnv.PATRONS.put(
      "cert_notyours1",
      JSON.stringify({
        certificate: {
          cert_id: "cert_notyours1",
          item: "hello",
          patron_number: 990011,
          date: "2026-08-19T00:00:00.000Z",
          payer: stranger.address,
        },
        signature: "00".repeat(64),
        public_key: "11".repeat(32),
      }),
    );
    const challenge = await (
      await SELF.fetch(`${BASE}/api/claims/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: owner.address }),
      })
    ).json() as Record<string, unknown>;
    const signature = await owner.sign(String(challenge["challenge"]));
    const body = (await (
      await SELF.fetch(`${BASE}/api/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: owner.address, signature }),
      })
    ).json()) as { certificates: { cert_id: string }[] };
    expect(
      body.certificates.find((c) => c.cert_id === "cert_notyours1"),
    ).toBeUndefined();
  });
});

describe("the completion webhook's outcome goes in the book", () => {
  /**
   * Journey 3 of the sweep: the buyer asked to be told when their
   * human-labor order finished, their endpoint was down for the one
   * attempt, and before 2026-08-20 nothing anywhere recorded that the
   * owed notice was never delivered — fetch does not throw on a 500.
   */
  it("records a delivered webhook as delivered", async () => {
    const { installFacilitatorMock, TEST_WEBHOOK_URL } = await import(
      "./helpers/facilitator-mock"
    );
    installFacilitatorMock();
    const { createOrder, completeOrder } = await import("@/services/orders");
    const { getMenuItem } = await import("@/store");
    const order = await createOrder(testEnv, {
      item: getMenuItem("the_collab")!,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990020,
      certId: "cert_hooktest1",
      callbackUrl: TEST_WEBHOOK_URL,
    });
    const done = await completeOrder(testEnv, order.order_id, "the goods");
    expect(done!.webhook).toContain("delivered");
  });

  it("records an unreachable webhook as attempted and not retried", async () => {
    const { installFacilitatorMock } = await import("./helpers/facilitator-mock");
    installFacilitatorMock();
    const { createOrder, completeOrder } = await import("@/services/orders");
    const { getMenuItem } = await import("@/store");
    const order = await createOrder(testEnv, {
      item: getMenuItem("the_collab")!,
      paidUsdc: 5,
      tipUsdc: 0,
      patronNumber: 990021,
      certId: "cert_hooktest2",
      // The mock throws on URLs it does not know — a dead endpoint.
      callbackUrl: "https://gone.example/hook",
    });
    const done = await completeOrder(testEnv, order.order_id, "the goods");
    expect(done!.webhook).toContain("unreachable");
    expect(done!.webhook).toContain("not retried");
    // And the deliverable is still there for the poller.
    expect(done!.deliverable).toBe("the goods");
  });
});
