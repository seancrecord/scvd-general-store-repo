import { Hono } from "hono";
import { recoverMessageAddress } from "viem";
import { isRecord } from "@/types";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  CREDIT_FLOOR_ATOMIC,
  CREDIT_IDLE_EXPIRY_DAYS,
  CREDIT_RATE,
  CreditRefused,
  creditOutstandingAtomic,
  getCredit,
  redeemCredit,
  usd,
} from "@/services/store-credit";
import type { HonoEnv } from "@/types";

/**
 * REGULARS' CREDIT, public face: read any wallet's balance free (the
 * balances derive from purchases whose payers are already on signed
 * public certificates — transparency, not leakage), and cash out with
 * the claims door's exact challenge-and-recover discipline: a
 * single-use nonce, EIP-191 personal_sign, recovery-based, EOA only.
 * The payout can only land at the wallet that earned it, so there is
 * no payout_to to steal.
 */
export const creditRoutes = new Hono<HonoEnv>();

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHALLENGE_TTL_SECONDS = 300;

function challengeText(address: string, nonce: string): string {
  return `scvd.store credit cash-out for ${address.toLowerCase()} — nonce ${nonce}. Signing this authorizes sending the wallet's full credit balance to the wallet itself, nowhere else.`;
}

creditRoutes.get("/api/credit/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  if (!ADDRESS.test(wallet)) {
    return c.json(
      { error: "The wallet must be a 0x Base address — the wallet is the loyalty card, and there is nothing else to look up by." },
      400,
    );
  }
  const record = await getCredit(c.env, wallet);
  const outstanding = await creditOutstandingAtomic(c.env);
  return c.json(
    {
      what_this_is: `Regulars' credit: ${CREDIT_RATE * 100}% of every organic purchase banks to the wallet that paid — no account, no signup, the wallet is the card. A CLOSED-LOOP REBATE, said plainly: the store's IOU, redeemable as USDC back to the earning wallet only, never transferable, never a token. Balances idle ${CREDIT_IDLE_EXPIRY_DAYS} days expire; house wallets never accrue.`,
      wallet: record.wallet,
      balance_usd: usd(BigInt(record.balance_atomic)),
      earned_total_usd: usd(BigInt(record.earned_total_atomic)),
      redeemed_total_usd: usd(BigInt(record.redeemed_total_atomic)),
      expired_total_usd: usd(BigInt(record.expired_total_atomic)),
      cash_out:
        usd(BigInt(record.balance_atomic)) >= usd(CREDIT_FLOOR_ATOMIC)
          ? `Eligible. 1) POST /api/credit/challenge with {"address":"${record.wallet}"} — you get a challenge string. 2) EIP-191 personal_sign it with the wallet's own key. 3) POST /api/credit/redeem with {"address","signature"} — the full balance comes back as a signed EIP-3009 authorization payable only to this wallet.`
          : `Below the $${usd(CREDIT_FLOOR_ATOMIC)} floor — it keeps accruing at ${CREDIT_RATE * 100}% of every purchase.`,
      /**
       * The store's whole liability, published beside any one wallet's
       * slice — a loyalty program off the books is how real stores
       * rot, and this store does its bookkeeping in public.
       */
      outstanding_all_wallets_usd: usd(outstanding),
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

creditRoutes.post("/api/credit/challenge", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  if (!ADDRESS.test(address)) {
    return c.json(
      { error: 'Send JSON with {"address":"0x…"} — the wallet whose credit you hold.' },
      400,
    );
  }
  const nonce = crypto.randomUUID();
  await c.env.COUNTERS.put(
    KV_KEYS.creditChallenge(address.toLowerCase()),
    nonce,
    { expirationTtl: CHALLENGE_TTL_SECONDS },
  );
  return c.json({
    challenge: challengeText(address, nonce),
    expires_in_seconds: CHALLENGE_TTL_SECONDS,
    then:
      "EIP-191 personal_sign over the exact challenge string with the wallet's own key, then POST /api/credit/redeem with { address, signature }. EOA signatures only — same limit as the claims door, stated rather than hidden.",
  });
});

creditRoutes.post("/api/credit/redeem", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  const signature =
    isRecord(body) && typeof body["signature"] === "string"
      ? body["signature"].trim()
      : "";
  if (!ADDRESS.test(address) || !signature.startsWith("0x")) {
    return c.json(
      { error: "Send JSON with address (0x + 40 hex) and signature over the challenge from /api/credit/challenge." },
      400,
    );
  }
  const kvKey = KV_KEYS.creditChallenge(address.toLowerCase());
  const nonce = await c.env.COUNTERS.get(kvKey);
  if (!nonce) {
    return c.json(
      { error: "No live challenge for that address — challenges are single-use and expire in five minutes. Start at POST /api/credit/challenge." },
      400,
    );
  }
  // Single-use before verification, the claims door's law: a failed
  // attempt burns the nonce, so nothing about this door rewards guessing.
  await c.env.COUNTERS.delete(kvKey);
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message: challengeText(address, nonce),
      signature: signature as `0x${string}`,
    });
  } catch {
    return c.json(
      { error: "That signature did not parse. EIP-191 personal_sign over the exact challenge string, hex-encoded." },
      400,
    );
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return c.json(
      { error: "The signature recovers to a different wallet than the one claimed. The challenge must be signed by the wallet that earned the credit." },
      403,
    );
  }
  try {
    const result = await redeemCredit(c.env, address);
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof CreditRefused) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});
