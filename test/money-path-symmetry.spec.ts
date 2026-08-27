import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  fieldSignerFromKey,
  performLaunchCheck,
} from "@/services/launch-check";
import type { TransferClaimRead } from "@/services/attestation";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const TARGET = "https://shop.example/api/buy/thing";
const TEST_FIELD_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SELLER_PAY_TO = "0x1111111111111111111111111111111111111111";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** A perfectly well-formed hash naming a transaction that does not exist. */
const FABRICATED_TX = "0x" + "de".repeat(32);

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * MONEY-PATH SYMMETRY (roadmap 3.2, ledger C2/I4).
 *
 * The walk verifies everything the seller SAYS — schema, signature,
 * replay — and then takes the one thing the seller says about MONEY
 * on faith: the PAYMENT-RESPONSE transaction hash rode into the
 * signed observation as `tx_hash`, no qualifier, as if this store had
 * seen it on chain. It had not. A door could hand back any 64 hex
 * characters and this store would sign them into a Bitcoin-anchored
 * corpus as the settlement record.
 *
 * Meanwhile our OWN settlements get the attestation desk: receipt
 * read, transfer matched, finality counted. The asymmetry is the
 * defect: strict about our money, credulous about theirs.
 */

function sellerReturning(txValue: string | null): typeof fetch {
  const spent = new Set<string>();
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const payment = headers.get("PAYMENT-SIGNATURE");
    if (!payment) {
      return new Response("{}", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": btoa(
            JSON.stringify({
              x402Version: 2,
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "5000",
                  asset: USDC_BASE,
                  payTo: SELLER_PAY_TO,
                  maxTimeoutSeconds: 300,
                  extra: { name: "USD Coin", version: "2" },
                },
              ],
            }),
          ),
        },
      });
    }
    if (spent.has(payment)) {
      return new Response(JSON.stringify({ error: "already settled" }), {
        status: 402,
      });
    }
    spent.add(payment);
    return new Response(JSON.stringify({ goods: "the thing" }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...(txValue !== null
          ? { "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: txValue })) }
          : {}),
      },
    });
  }) as typeof fetch;
}

const clearScreen = async () => ({ listed: false as const, source: "test screen" });

async function walkWithSigner(
  txValue: string | null,
  readClaim?: (
    txHash: string,
    query: { payer: string; recipient: string },
    network: string,
  ) => Promise<TransferClaimRead>,
) {
  const signer = await fieldSignerFromKey(TEST_FIELD_KEY);
  return performLaunchCheck(testEnv, TARGET, {
    fetch: sellerReturning(txValue),
    signer,
    screen: clearScreen,
    ...(readClaim ? { readClaim } : {}),
  } as never);
}

const read = (result: Partial<TransferClaimRead>) =>
  async (): Promise<TransferClaimRead> =>
    ({
      status: "SETTLED",
      recipient: SELLER_PAY_TO,
      payer: null,
      amountUsdc: 0.005,
      blockHeight: 34_000_000,
      confirmations: 40,
      ...result,
    }) as TransferClaimRead;

describe("the claim is labelled a claim, never signed as fact", () => {
  it("a fabricated PAYMENT-RESPONSE hash with no reader at the seam is CLAIMED, not fact", async () => {
    const check = await walkWithSigner(FABRICATED_TX);
    expect(check.verdict).toBe("settled");
    expect(check.tx_hash).toBe(FABRICATED_TX);
    /*
     * THE RED LINE. Before 3.2 the observation carried tx_hash bare —
     * sixty-four seller-chosen hex characters signed into the corpus
     * with nothing saying "we did not look." Every row must now say
     * what the hash IS: a claim, until a chain read says otherwise.
     */
    expect(check.tx_hash_status).toBe("claimed");
    expect(check.tx_verification?.read).toBe("not_attempted");
  });

  it("a reader that finds the transfer to the seller's own payTo upgrades the claim to CONFIRMED", async () => {
    const check = await walkWithSigner(FABRICATED_TX, read({ status: "SETTLED" }));
    expect(check.tx_hash_status).toBe("confirmed_on_chain");
    expect(check.tx_verification?.read).toBe("receipt");
    expect(check.tx_verification?.chain_status).toBe("SETTLED");
    expect(check.tx_verification?.observed_recipient).toBe(SELLER_PAY_TO);
  });

  it("PENDING_FINALITY counts as confirmed — the transfer is real, the depth is young", async () => {
    const check = await walkWithSigner(
      FABRICATED_TX,
      read({ status: "PENDING_FINALITY", confirmations: 2 }),
    );
    expect(check.tx_hash_status).toBe("confirmed_on_chain");
  });

  it("NOT_FOUND stays CLAIMED — rule 52 both directions, a receipt not yet visible is not a lie", async () => {
    const check = await walkWithSigner(FABRICATED_TX, read({ status: "NOT_FOUND" }));
    expect(check.tx_hash_status).toBe("claimed");
    expect(check.tx_verification?.chain_status).toBe("NOT_FOUND");
  });

  it("a mined receipt with no transfer from our wallet to their payTo is CONTRADICTED", async () => {
    const check = await walkWithSigner(
      FABRICATED_TX,
      read({ status: "INSUFFICIENT_MATCH", recipient: "0x2222222222222222222222222222222222222222" }),
    );
    expect(check.tx_hash_status).toBe("contradicted");
  });

  it("a REVERTED receipt is CONTRADICTED — the seller cited a transaction where no value moved", async () => {
    const check = await walkWithSigner(FABRICATED_TX, read({ status: "REVERTED" }));
    expect(check.tx_hash_status).toBe("contradicted");
  });

  it("a reader that throws leaves the claim CLAIMED — an unreachable RPC is our gap, not their defect", async () => {
    const check = await walkWithSigner(FABRICATED_TX, async () => {
      throw new Error("RPC unreachable");
    });
    expect(check.tx_hash_status).toBe("claimed");
    expect(check.tx_verification?.read).toBe("failed");
  });

  it("an identifier that cannot name an EVM transaction on the rail we paid is UNVERIFIABLE, and the reader is never called", async () => {
    let called = 0;
    const check = await walkWithSigner("not-a-transaction-hash", async () => {
      called += 1;
      throw new Error("must not be called");
    });
    expect(check.tx_hash_status).toBe("unverifiable_shape");
    expect(called).toBe(0);
  });

  it("no PAYMENT-RESPONSE at all: no hash, no status, nothing to verify", async () => {
    const check = await walkWithSigner(null);
    expect(check.tx_hash).toBeNull();
    expect(check.tx_hash_status).toBeNull();
    expect(check.tx_verification).toBeUndefined();
  });

  it("the verification stage is on the walk's own record, and the label rides the signed bytes", async () => {
    const check = await walkWithSigner(FABRICATED_TX, read({ status: "REVERTED" }));
    const stage = check.stages.find((s) => s.stage === "tx-verify");
    expect(stage).toBeDefined();
    expect(stage!.ok).toBe(false);
    /*
     * Signed-as-fact is over only if the label is INSIDE the signature.
     * evidence_hash covers the core; the core must carry the status.
     */
    expect(check.signature_covers).toContain("signature");
    expect(check.tx_hash_status).toBe("contradicted");
  });
});
