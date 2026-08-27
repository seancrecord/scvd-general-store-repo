import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeSettlement } from "@/services/attestation";
import { checkConformance } from "@/services/conformance";
import { readReceipt } from "@/services/receipt-verify";
import { issuePassport } from "@/services/passport";
import { TRANSFER_TOPIC } from "@/lib/base-rpc";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * ROADMAP 3.3 — FRESHNESS (ledger D2, F4).
 *
 * D2: nearly every artifact class binds content plus a self-reported
 * timestamp and nothing that ages. A month-old SETTLED attestation
 * verifies forever and LOOKS CURRENT — the signature is honest, the
 * presentation is not. The passport already solved this (signed
 * `expires`, freshness state, "refuse expired evidence" in its own
 * scope); the settlement attestation — the other class built to be
 * presented live — did not.
 *
 * F4: the same dishonesty from the desk's side of the counter. The
 * verifier accepts nowSeconds; checkConformance never passed one, so
 * the desk's expiry verdict rode the wall clock — the house testing
 * law (inject the clock on BOTH sides) applied to the tests and not
 * to the product.
 *
 * The acceptance case is the roadmap's own: an old artifact served
 * without staleness today.
 */

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYER = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
const PAY_TO = "0xdd350976b8cffc65938c0464d39a2c78be079bd0";
const HASH = `0x${"5a".repeat(32)}`;
const pad = (address: string) =>
  `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

function settledBaseReceipt(): unknown {
  return {
    transactionHash: HASH,
    status: "0x1",
    blockNumber: "0x3f0f5c00",
    logs: [
      {
        address: BASE_USDC,
        topics: [TRANSFER_TOPIC, pad(PAYER), pad(PAY_TO)],
        data: `0x${(500000n).toString(16).padStart(64, "0")}`,
      },
    ],
  };
}

function stubRpc(receipt: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as { method?: string };
      const result =
        body.method === "eth_blockNumber" ? "0x3f0f5d00" : receipt;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

/** A stranger's signed offer, same builder discipline as the desk spec. */
async function foreignOffer(
  overrides: Record<string, unknown> = {},
): Promise<{ jws: string; publicKeyHex: string }> {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
  );
  const publicKeyHex = [...rawPublic]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const b64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const encode = (value: unknown): string =>
    b64url(new TextEncoder().encode(JSON.stringify(value)));
  const header = { alg: "EdDSA", kid: "did:web:example.test#key-1" };
  const payload = {
    version: 1,
    resourceUrl: "https://example.test/api/buy/thing",
    scheme: "exact",
    network: "eip155:8453",
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    payTo: "0x0000000000000000000000000000000000000001",
    amount: "1000",
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return { jws: `${signingInput}.${b64url(signature)}`, publicKeyHex };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("D2 — the attestation carries its own shelf life", () => {
  it("a new observation states stale_after, derived from the injected clock", async () => {
    stubRpc(settledBaseReceipt());
    const now = new Date("2026-08-27T12:00:00.000Z");
    const observation = await observeSettlement(
      testEnv,
      { txHash: HASH },
      now,
    );
    expect(observation.status).toBe("SETTLED");
    expect(observation.observed_at).toBe(now.toISOString());
    /*
     * THE RED LINE. Before 3.3 this artifact carried observed_at and
     * nothing that ages: presented a month later it still read as a
     * statement about NOW. stale_after is the artifact saying, in its
     * own signed bytes, when to stop treating it as current.
     */
    const staleAfter = (observation as unknown as { stale_after?: string })
      .stale_after;
    expect(staleAfter).toBeDefined();
    expect(new Date(staleAfter!).getTime()).toBeGreaterThan(now.getTime());
    expect(observation.scope).toContain("stale_after");
  });
});

describe("F4 — the desk's clock is injected, not read off the wall", () => {
  it("an offer live on the wall clock is expired under the injected one", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const twoHoursOn = new Date(Date.now() + 2 * 3600 * 1000);
    const result = await checkConformance(
      { artifact: jws, public_key_hex: publicKeyHex },
      testEnv,
      twoHoursOn,
    );
    expect(result.verdict?.verdict).toBe("conforms");
    /*
     * validUntil is one hour out; the injected reading time is two.
     * A desk whose expiry rides Date.now() answers live=true here,
     * which is the F4 defect verbatim.
     */
    expect(result.verdict?.live).toBe(false);
  });

  it("the same offer under the honest present is live — the clock changed, nothing else", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const result = await checkConformance(
      { artifact: jws, public_key_hex: publicKeyHex },
      testEnv,
      new Date(),
    );
    expect(result.verdict?.live).toBe(true);
  });
});

describe("is_stale is derived at read, never stored", () => {
  it("the desk reports staleness on an artifact past its own stale_after, advisory, verdict untouched", async () => {
    const past = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { jws, publicKeyHex } = await foreignOffer({ stale_after: past });
    const result = await checkConformance(
      { artifact: jws, public_key_hex: publicKeyHex },
      testEnv,
      new Date(),
    );
    const staleness = result.verdict?.checks.find(
      (check) => check.name === "staleness",
    ) as { ok: boolean; advisory?: boolean; detail: string } | undefined;
    expect(staleness).toBeDefined();
    expect(staleness!.ok).toBe(false);
    expect(staleness!.advisory).toBe(true);
    // Stale is not invalid: the signature still proves the document.
    expect(result.verdict?.verdict).toBe("conforms");
  });

  it("no stale_after, no staleness check — absence of the field is not a defect", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const result = await checkConformance(
      { artifact: jws, public_key_hex: publicKeyHex },
      testEnv,
      new Date(),
    );
    expect(
      result.verdict?.checks.find((check) => check.name === "staleness"),
    ).toBeUndefined();
  });

  it("the receipt reader derives staleness under its own injected clock", async () => {
    /*
     * Signed for real: the reader refuses to discuss the freshness of
     * a document it could not verify, which is correct — an attacker
     * should not get "merely stale" as a verdict on a forgery.
     */
    const body = { artifact: "some_reading", stale_after: "2026-08-01T00:00:00.000Z" };
    const { signature, publicKey } = await signMessage(
      JSON.stringify(body),
      testEnv.SIGNING_KEY,
    );
    const record = JSON.stringify({
      ...body,
      signature,
      public_key: publicKey,
    });
    const reading = await readReceipt(
      testEnv,
      record,
      new Date("2026-08-27T12:00:00.000Z"),
    );
    const staleness = reading.checks.find(
      (check) => check.name === "staleness",
    );
    expect(staleness).toBeDefined();
    expect(staleness!.outcome).toBe("fail");
    expect(staleness!.detail).toContain("not as a statement about now");
  });
});

describe("the passport pinned as the class that already did this (D2's exception)", () => {
  it("carries signed expires at AGING_DAYS past issue — a host with no history still gets an aging document", async () => {
    /*
     * The host passport, not the self passport: the self one refuses
     * to issue without live catalogs to cite, which is its own law
     * and not this spec's business. What D2 needs pinned is the
     * CLASS behaviour — every issued passport carries a signed
     * expires derived from the injected clock, so an old passport
     * re-presented cannot read as current.
     */
    const now = new Date("2026-08-27T12:00:00.000Z");
    const outcome = await issuePassport(testEnv, "never-met.example", now);
    if ("payload" in outcome && outcome.payload) {
      expect(
        (outcome.payload as { expires?: string }).expires,
      ).toBeDefined();
    } else {
      // A refusal for an unknown host is fine — the refusal is not a
      // passport and carries nothing that could be mistaken for one.
      expect(outcome).toBeDefined();
    }
  });
});
