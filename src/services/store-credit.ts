import { BASE_USDC } from "@/lib/base-rpc";
import { canonicalAddress } from "@/lib/addresses";
import { isHouseWallet } from "@/lib/channel";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  oracleScreen,
  fieldSignerFromKey,
  type FieldSigner,
  type SanctionsScreen,
} from "@/services/launch-check";
import type { Env } from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * STORE CREDIT — the regulars' rebate (keeper's "I like it let's do
 * it", 2026-08-19): every organic settle banks a fixed share of the
 * price to the PAYING WALLET, no account, no signup, no cookie —
 * the wallet is the loyalty card, and the store already records it
 * on every certificate. The balance rides every purchase response,
 * which is the whole psychology: a number that grows and only
 * exists here.
 *
 * WHAT THIS IS AND IS NOT, plainly, because the register is the
 * product everywhere in this store: a CLOSED-LOOP REBATE. Credit is
 * the store's IOU, redeemable as USDC back to the wallet that earned
 * it — never transferable, never a token, never tradeable, floats
 * nowhere. It expires idle, it is capped per wallet, and the total
 * outstanding is published and watched by the books invariants,
 * because a loyalty liability off the books is how real stores rot.
 *
 * THE MONEY MATH IS INTEGER ATOMIC UNITS (USDC's six decimals), the
 * same discipline as the till: five percent of a $0.004 attestation
 * is 200 atomic units, and floating a float there would shave
 * someone's dust eventually.
 *
 * HOUSE WALLETS NEVER ACCRUE (isHouseWallet, rule 13's list): the
 * house testing its own shelves is not a regular, and CV's runs
 * banking credit would be the store tipping itself.
 */

/** Share of each organic settle banked as credit. ⚑ keeper dial. */
export const CREDIT_RATE = 0.05;
/** Balance ceiling per wallet, atomic units ($25) — bounds the
 * liability any one wallet can hold. ⚑ keeper dial. */
export const CREDIT_CAP_ATOMIC = 25_000_000n;
/** Cash-out floor, atomic units ($1): below it, keep shopping. */
export const CREDIT_FLOOR_ATOMIC = 1_000_000n;
/** Idle this long, a balance expires back to the store. ⚑ dial. */
export const CREDIT_IDLE_EXPIRY_DAYS = 90;
/** Redemption authorizations expire like the bounty board's. */
export const CREDIT_AUTH_VALID_SECONDS = 7 * 24 * 3600;

export interface CreditRecord {
  wallet: string;
  balance_atomic: string;
  earned_total_atomic: string;
  redeemed_total_atomic: string;
  expired_total_atomic: string;
  updated_at: string;
  /**
   * THE CLAIM MARKER. Written by the redemption that zeroed the
   * balance, so the readback beside it can tell OUR write from a
   * rival's. Absent on records that have never been redeemed.
   */
  claimed_by?: string;
}

/**
 * Run a signing step that has already claimed a balance, and put the
 * balance back if it throws.
 *
 * The claim has to land before the signature (otherwise two requests
 * sign for the same money), which means a signer failure would
 * otherwise zero a buyer's credit and hand them nothing.
 */
async function signWithRollback<T>(
  env: Env,
  creditKey: string,
  claimId: string,
  amount: bigint,
  sign: () => Promise<T>,
): Promise<T> {
  try {
    return await sign();
  } catch (error) {
    /*
     * GIVE BACK THE AMOUNT, DO NOT RESTORE A SNAPSHOT.
     * Corrected 2026-08-25, same day as the block above.
     *
     * The first version wrote back the record as it was read before
     * the claim. Two ways that was wrong:
     *
     *   accrueCredit writes this same key on every settle. A purchase
     *   landing inside the signing window was overwritten by the
     *   snapshot — while bumpOutstanding had already counted it, so
     *   the published liability disagreed with the record it sums.
     *
     *   And it did not check whose record it was overwriting. If a
     *   rival had already won and signed for the balance, restoring
     *   the snapshot RESURRECTED money that was already paid out.
     *
     * So: re-read, refuse to touch anything that is not still our own
     * claim, and add the amount back rather than replacing the whole
     * record — which leaves any accrual that landed meanwhile intact.
     */
    const current = await kvGetJson<CreditRecord>(env.COUNTERS, creditKey, "json");
    if (current && current.claimed_by === claimId) {
      const restored: CreditRecord = {
        ...current,
        balance_atomic: (BigInt(current.balance_atomic) + amount).toString(),
        redeemed_total_atomic: (
          BigInt(current.redeemed_total_atomic) - amount
        ).toString(),
      };
      delete restored.claimed_by;
      await kvPut(env.COUNTERS, creditKey, JSON.stringify(restored));
    }
    throw error;
  }
}

export function usd(atomic: bigint): number {
  return Number(atomic) / 1e6;
}

function empty(wallet: string, now: Date): CreditRecord {
  return {
    wallet,
    balance_atomic: "0",
    earned_total_atomic: "0",
    redeemed_total_atomic: "0",
    expired_total_atomic: "0",
    updated_at: now.toISOString(),
  };
}

async function bumpOutstanding(env: Env, deltaAtomic: bigint): Promise<void> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.creditOutstanding);
  const current = BigInt(raw ?? "0");
  const next = current + deltaAtomic;
  await kvPut(env.COUNTERS, 
    KV_KEYS.creditOutstanding,
    (next < 0n ? 0n : next).toString(),
  );
}

/**
 * Expire an idle balance IN WRITING — the read that notices it writes
 * it down, so the outstanding aggregate never quietly counts money
 * the rules already took back.
 */
async function withExpiry(
  env: Env,
  record: CreditRecord,
  now: Date,
): Promise<CreditRecord> {
  const idleMs = now.getTime() - new Date(record.updated_at).getTime();
  const balance = BigInt(record.balance_atomic);
  if (balance <= 0n || idleMs < CREDIT_IDLE_EXPIRY_DAYS * 24 * 3600 * 1000) {
    return record;
  }
  const expired: CreditRecord = {
    ...record,
    balance_atomic: "0",
    expired_total_atomic: (
      BigInt(record.expired_total_atomic) + balance
    ).toString(),
    updated_at: now.toISOString(),
  };
  await kvPut(env.COUNTERS, 
    KV_KEYS.credit(record.wallet),
    JSON.stringify(expired),
  );
  await bumpOutstanding(env, -balance);
  return expired;
}

export async function getCredit(
  env: Env,
  wallet: string,
  now: Date = new Date(),
): Promise<CreditRecord> {
  const key = canonicalAddress(wallet);
  const record = await kvGetJson<CreditRecord>(env.COUNTERS, 
    KV_KEYS.credit(key),
    "json",
  );
  if (!record) return empty(key, now);
  return withExpiry(env, record, now);
}

export interface AccrualResult {
  earned_usd: number;
  balance_usd: number;
  note: string;
}

/**
 * Bank the settle's share. Returns null when nothing accrues (house
 * wallet, no payer, nothing paid, cap reached) — and the null is
 * silent on the response, because a rebate a buyer cannot have is
 * not a thing to advertise at them.
 */
export async function accrueCredit(
  env: Env,
  payer: string,
  paidUsdc: number,
  now: Date = new Date(),
): Promise<AccrualResult | null> {
  if (!payer || !Number.isFinite(paidUsdc) || paidUsdc <= 0) return null;
  if (isHouseWallet(env, payer)) return null;
  const record = await getCredit(env, payer, now);
  const balance = BigInt(record.balance_atomic);
  if (balance >= CREDIT_CAP_ATOMIC) return null;
  let earned = BigInt(Math.floor(paidUsdc * 1e6 * CREDIT_RATE));
  if (earned <= 0n) return null;
  if (balance + earned > CREDIT_CAP_ATOMIC) {
    earned = CREDIT_CAP_ATOMIC - balance;
  }
  const next: CreditRecord = {
    ...record,
    balance_atomic: (balance + earned).toString(),
    earned_total_atomic: (
      BigInt(record.earned_total_atomic) + earned
    ).toString(),
    updated_at: now.toISOString(),
  };
  // The claim marker is TRANSIENT — it belongs to one redemption in
  // flight. Spreading `...record` forward re-persisted the winning
  // request's id on every later accrual, forever, which is a stale
  // fact sitting in a record that is otherwise all live ones.
  delete next.claimed_by;
  await kvPut(env.COUNTERS, KV_KEYS.credit(record.wallet), JSON.stringify(next));
  await bumpOutstanding(env, earned);
  return {
    earned_usd: usd(earned),
    balance_usd: usd(balance + earned),
    note: `Regulars' credit: ${CREDIT_RATE * 100}% of every purchase banks to the wallet that paid — no account, the wallet is the card. Redeemable as USDC back to your own wallet once it reaches $${usd(CREDIT_FLOOR_ATOMIC)} (GET ${env.STORE_BASE_URL}/api/credit/${record.wallet}); idle ${CREDIT_IDLE_EXPIRY_DAYS} days it expires. A closed-loop rebate — never a token, never transferable.`,
  };
}

export class CreditRefused extends Error {}

export interface RedeemOptions {
  fetch?: typeof fetch;
  signer?: FieldSigner;
  screen?: SanctionsScreen;
  now?: Date;
  randomNonce?: () => string;
}

function defaultNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Cash the balance out — TO THE WALLET THAT EARNED IT, nowhere else,
 * which is why redemption has no payout_to parameter to steal: a
 * leaked challenge signature can only send a regular their own
 * money. Ownership was proven upstream (the routes' challenge-and-
 * recover, the claims door's exact machinery); this trusts its
 * caller for that one fact and nothing else.
 */
export async function redeemCredit(
  env: Env,
  wallet: string,
  options: RedeemOptions = {},
): Promise<{
  redeemed_usd: number;
  payout: {
    method: "eip3009_transfer_with_authorization";
    asset: string;
    chain: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
    how_to_redeem: string;
  };
}> {
  const now = options.now ?? new Date();
  if (!env.FIELD_WALLET_KEY && !options.signer) {
    throw new CreditRefused(
      "cash-out is not enabled on this deployment (the field wallet is not provisioned) — the balance keeps accruing and keeps its expiry clock, and this door opens when the wallet does",
    );
  }
  const record = await getCredit(env, wallet, now);
  const balance = BigInt(record.balance_atomic);
  if (balance < CREDIT_FLOOR_ATOMIC) {
    throw new CreditRefused(
      `the balance ($${usd(balance)}) is under the cash-out floor ($${usd(CREDIT_FLOOR_ATOMIC)}) — it keeps accruing at ${CREDIT_RATE * 100}% of every purchase`,
    );
  }
  const screen =
    options.screen ??
    oracleScreen(
      env.BASE_RPC_URL ?? "https://mainnet.base.org",
      options.fetch ?? fetch,
    );
  const screened = await screen(record.wallet);
  if (screened.listed !== false) {
    throw new CreditRefused(
      screened.listed === true
        ? `the wallet is identified on the sanctions screen (${screened.source}); nothing pays out and the refusal is recorded`
        : `the sanctions screen did not answer (${screened.source}) and the rule fails closed — the balance is untouched; try again when it answers`,
    );
  }
  /*
   * CLAIM THE BALANCE BEFORE SIGNING FOR IT.
   *
   * Until 2026-08-25 this function read the balance, signed an
   * EIP-3009 authorization for it, and only then wrote the record
   * back to zero. Three concurrent redemptions of one $2 balance all
   * read $2 and all got a signed authorization — three DISTINCT
   * nonces, so the USDC contract's own replay protection accepts
   * every one of them. Measured: $6 authorized against a $2 debt.
   *
   * The single-use challenge in front of this route did not help:
   * that is a get-then-delete, and a KV delete is not globally
   * visible for up to a minute. Two edges both see the nonce.
   *
   * So the balance is claimed first: zero it, read it back, and only
   * sign if our own claim id survived. A loser refuses without a
   * signature.
   *
   * WHAT THIS IS AND IS NOT, corrected 2026-08-25 after the first
   * version of this comment called it a mutex. IT IS NOT A MUTEX.
   * Workers KV is a last-write-wins register with edge-cached,
   * eventually-consistent reads and no compare-and-swap. Two requests
   * landing in two colos can each write their own claim and each read
   * back their own claim, and both can proceed. The very property
   * that made the original bug real — a KV write is not immediately
   * visible everywhere — is the property this cannot rely on being
   * false.
   *
   * What it DOES do is close the common case (one colo, back-to-back
   * retries, a client hammering the route) and make the rare case
   * detectable rather than silent. The real fix is a Durable Object
   * per wallet, which is a binding change and a deploy, and is not
   * being done half-awake at 6am. Until then the honest position is
   * this comment plus the books invariant that compares the
   * outstanding aggregate against the sum of the records it claims to
   * total.
   *
   * The sanctions screen stays ABOVE this line: it fails closed and
   * must leave the balance untouched when it cannot answer.
   */
  const claimId = (options.randomNonce ?? defaultNonce)();
  const claimed: CreditRecord = {
    ...record,
    balance_atomic: "0",
    redeemed_total_atomic: (
      BigInt(record.redeemed_total_atomic) + balance
    ).toString(),
    updated_at: now.toISOString(),
    claimed_by: claimId,
  };
  const creditKey = KV_KEYS.credit(record.wallet);
  await kvPut(env.COUNTERS, creditKey, JSON.stringify(claimed));
  const readback = await getCredit(env, wallet, now);
  if (readback.claimed_by !== claimId) {
    /*
     * A MISMATCH HAS TWO CAUSES AND THEY NEED OPPOSITE ANSWERS.
     * Corrected 2026-08-25, hours after the first version of this
     * block shipped treating them as one.
     *
     * (a) SOMEBODY ELSE'S CLAIM IS THERE. A rival won. Refuse, and
     *     leave the record alone: the balance is theirs to spend and
     *     writing anything here would step on it.
     *
     * (b) OUR OWN WRITE IS NOT VISIBLE YET. Workers KV reads are
     *     edge-cached and eventually consistent, and getCredit read
     *     this very key moments ago, priming that cache. A read after
     *     a write CAN return the old value with no rival involved.
     *
     * The first version refused in both cases — after zeroing the
     * record and incrementing redeemed_total, and above the rollback.
     * So a single request with no concurrency at all could burn its
     * challenge, destroy the buyer's balance, book it as redeemed,
     * and sign NOTHING. That is worse than the double-payout it was
     * written to prevent, and it needed no attacker.
     */
    const rivalWon = Boolean(
      readback.claimed_by && readback.claimed_by !== claimId,
    );
    if (!rivalWon) {
      // Case (b): put the balance back before refusing. Nothing was
      // signed, so the buyer must keep their money.
      await kvPut(env.COUNTERS, creditKey, JSON.stringify(record));
      throw new CreditRefused(
        "the claim on this balance could not be confirmed, so nothing was signed and the balance is untouched — ask again in a moment",
      );
    }
    throw new CreditRefused(
      "another redemption claimed this balance first — nothing was signed here, and the balance belongs to whichever request won; read /api/credit/{wallet} for the current state",
    );
  }

  const signer =
    options.signer ??
    (await fieldSignerFromKey(env.FIELD_WALLET_KEY as string));
  const authorization = {
    from: signer.address,
    to: record.wallet,
    value: balance.toString(),
    validAfter: "0",
    validBefore: String(
      Math.floor(now.getTime() / 1000) + CREDIT_AUTH_VALID_SECONDS,
    ),
    nonce: (options.randomNonce ?? defaultNonce)(),
  };
  // If signing throws after the claim, the buyer's balance would be
  // gone with nothing to show for it. Hand it back and re-raise.
  const signature = await signWithRollback(
    env,
    creditKey,
    claimId,
    balance,
    () =>
      signer.signTypedData({
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: 8453,
          verifyingContract: BASE_USDC as `0x${string}`,
        },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: authorization,
      }),
  );
  await bumpOutstanding(env, -balance);
  return {
    redeemed_usd: usd(balance),
    payout: {
      method: "eip3009_transfer_with_authorization",
      asset: BASE_USDC,
      chain: "eip155:8453",
      authorization,
      signature,
      how_to_redeem: `Submit transferWithAuthorization on the USDC contract (${BASE_USDC}) on Base with these fields and this signature — from your own wallet or any relayer; the function is submittable by anyone, and the payout can only land at the wallet that earned it. Valid until unix ${authorization.validBefore}; unredeemed, it expires and nothing is lost — ask again. The signature is the payment.`,
    },
  };
}

/** Outstanding credit across every wallet, for the books' eye. */
export async function creditOutstandingAtomic(env: Env): Promise<bigint> {
  return BigInt((await kvGet(env.COUNTERS, KV_KEYS.creditOutstanding)) ?? "0");
}
