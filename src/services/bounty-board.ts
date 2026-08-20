import {
  BASE_USDC,
  getBlockNumber,
  getReceipt,
  isSameAddress,
  usdcFromUnits,
  usdcTransfers,
} from "@/lib/base-rpc";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { readPayTo } from "@/lib/pay-to";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newEntryId } from "@/lib/ids";
import {
  LAUNCH_CHECK_UA,
  oracleScreen,
  fieldSignerFromKey,
  type SanctionsScreen,
  type FieldSigner,
} from "@/services/launch-check";
import type { Env } from "@/types";

/**
 * THE BOUNTY BOARD (BOUNTY_BOARD.md) — mystery shoppers for the x402
 * economy: the keeper posts doors, strangers walk them with their own
 * money, the store verifies the settlement ON CHAIN and pays a reward
 * as a signed EIP-3009 authorization the shopper redeems themselves.
 *
 * WHY THE PAYOUT IS AN AUTHORIZATION AND NOT A BROADCAST: the store
 * holds no gas and broadcasts nothing (rule 30's spirit — code moves
 * as little money machinery as possible). USDC's
 * transferWithAuthorization is submittable by ANYONE, so the signed
 * authorization IS the payment: the shopper redeems it on chain, any
 * relayer can carry it, and it expires on its own if never used —
 * unredeemed rewards return to the budget with no cleanup cron.
 *
 * WHAT THE REWARD PAYS FOR, precisely: the chain-verified settlement
 * (real receipt, right payer, right payTo, right amount, postdates
 * the bounty, never claimed before). The shopper's observations are
 * recorded VERBATIM AS A CLAIM — the store never saw their HTTP
 * transcript and never pretends to. Two evidence tiers, both true,
 * never blended.
 */

/** Reward ceiling per bounty (door price + finder's fee). ⚑ keeper dial. */
export const BOUNTY_MAX_REWARD_USD = 0.25;
/** Weekly payout budget, walkabout scale. ⚑ keeper dial. */
export const BOUNTY_WEEKLY_BUDGET_USD = 10;
/** Payout authorizations expire on their own: seven days. */
export const BOUNTY_AUTH_VALID_SECONDS = 7 * 24 * 3600;
/** Verbatim observation cap — a claim, not a filesystem. */
export const BOUNTY_OBSERVATION_CAP = 4000;
/** Bounty listings live this long, then expire unclaimed. */
export const BOUNTY_OPEN_DAYS = 7;

export interface BountyRecord {
  bounty_id: string;
  target_url: string;
  domain: string;
  /** The door's terms, captured BY THE STORE at posting time. */
  pay_to: string;
  amount_atomic: string;
  amount_usd: number;
  reward_usd: number;
  opened_at: string;
  opened_block: number;
  expires_at: string;
  status: "open" | "paid" | "expired";
  claim?: {
    tx_hash: string;
    payer: string;
    payout_to: string;
    claimed_at: string;
    /** The shopper's report, verbatim. UNTRUSTED — labeled so. */
    observation?: string;
    authorization_nonce: string;
    authorization_valid_before: string;
  };
}

interface AcceptEntry {
  scheme?: string;
  network?: string;
  amount?: string;
  maxAmountRequired?: string;
  payTo?: string;
  asset?: string;
}

function decodeBase64Json(value: string): unknown {
  try {
    return JSON.parse(atob(value));
  } catch {
    return null;
  }
}

function amountUsd(entry: AcceptEntry): number {
  const raw = entry.amount ?? entry.maxAmountRequired;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return Number.NaN;
  return Number(raw) / 1e6;
}

export interface BountyBoardOptions {
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

async function listBountyRecords(env: Env): Promise<BountyRecord[]> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.bountyPrefix,
    cap: 200,
  });
  const values = await bulkGetJson<BountyRecord>(env.COUNTERS, listed.names);
  return [...values.values()].filter(
    (record): record is BountyRecord => Boolean(record),
  );
}

async function saveBounty(env: Env, record: BountyRecord): Promise<void> {
  await env.COUNTERS.put(
    KV_KEYS.bounty(record.bounty_id),
    JSON.stringify(record),
  );
}

/** Budget spent this week, in USD. One key per ISO week. */
async function weekSpent(env: Env, weekKey: string): Promise<number> {
  const raw = await env.COUNTERS.get(KV_KEYS.bountyBudget(weekKey));
  const parsed = Number.parseFloat(raw ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export class BountyRefused extends Error {}

/**
 * THE KEEPER'S HAND ONLY (the admin route is the single caller): open
 * a bounty on a door, capturing its terms by reading its 402 ourselves
 * — the claim verifier compares against what WE saw, never against
 * what a shopper tells us the door said.
 */
export async function openBounty(
  env: Env,
  input: { targetUrl: string; rewardUsd: number },
  options: BountyBoardOptions = {},
): Promise<BountyRecord> {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? new Date();
  if (
    !Number.isFinite(input.rewardUsd) ||
    input.rewardUsd <= 0 ||
    input.rewardUsd > BOUNTY_MAX_REWARD_USD
  ) {
    throw new BountyRefused(
      `reward must be between $0 and $${BOUNTY_MAX_REWARD_USD} (BOUNTY_BOARD.md, the dials)`,
    );
  }
  const url = new URL(input.targetUrl);
  const domain = url.hostname.toLowerCase();
  const existing = await listBountyRecords(env);
  const weekKey = currentWeekKey(now);
  if (
    existing.some(
      (record) =>
        record.domain === domain &&
        record.status === "open" &&
        currentWeekKey(new Date(record.opened_at)) === weekKey,
    )
  ) {
    throw new BountyRefused(
      `an open bounty already stands on ${domain} this week — one per domain per week`,
    );
  }

  const response = await fetchImpl(input.targetUrl, {
    headers: { "User-Agent": LAUNCH_CHECK_UA, Accept: "application/json" },
  });
  if (response.status !== 402) {
    throw new BountyRefused(
      `the door answered ${response.status}, not 402 — a bounty needs a payment gate to walk through`,
    );
  }
  const headerRaw = response.headers.get("payment-required");
  const headerChallenge = headerRaw ? decodeBase64Json(headerRaw) : null;
  let bodyChallenge: unknown = null;
  try {
    bodyChallenge = JSON.parse(await response.text());
  } catch {
    bodyChallenge = null;
  }
  const challenge = (headerChallenge ?? bodyChallenge) as {
    accepts?: AcceptEntry[];
  } | null;
  const accepts = Array.isArray(challenge?.accepts) ? challenge.accepts : [];
  const base = accepts
    .filter(
      (entry) =>
        (entry.network === "eip155:8453" || entry.network === "base") &&
        (entry.scheme ?? "exact") === "exact" &&
        Number.isFinite(amountUsd(entry)),
    )
    .sort((a, b) => amountUsd(a) - amountUsd(b));
  const chosen = base[0];
  if (!chosen?.payTo || !isSameAddress(chosen.asset ?? "", BASE_USDC)) {
    throw new BountyRefused(
      "no payable USDC-on-Base rail could be read from the door's 402 — the claim verifier would have nothing to verify against",
    );
  }
  /**
   * THE payTo HAS TO BE AN ADDRESS, and this refusal protects the
   * SHOPPER rather than the store. Found 2026-08-20 sweeping every
   * consumer of a stranger's offer against the payTo taxonomy.
   *
   * A bounty captures the door's payTo at open time, and the claim
   * verifier later checks that the receipt carries a transfer TO that
   * captured value. If the door published a name, three things follow
   * in order: most shoppers cannot pay the door at all; the rare one
   * who resolves the name pays the resolved ADDRESS; and the claim
   * then compares an address against a name and can never match. The
   * shopper does the work, spends their own money, and cannot collect
   * — and from outside it looks exactly like the store welching on a
   * posted reward.
   *
   * Refusing at open is the only honest moment: after that, somebody
   * is already out of pocket.
   */
  const payToRead = readPayTo(chosen.payTo, chosen.network ?? "eip155:8453");
  if (!payToRead.payable) {
    throw new BountyRefused(
      `${payToRead.detail} A bounty captures this value and the claim verifier compares an on-chain transfer against it, so a shopper who managed to pay could never prove it — no bounty is opened, and nothing is held.`,
    );
  }
  const price = amountUsd(chosen);
  if (price >= input.rewardUsd) {
    throw new BountyRefused(
      `the reward ($${input.rewardUsd}) must exceed the door's price ($${price}) or the shopper walks at a loss`,
    );
  }

  const record: BountyRecord = {
    bounty_id: `bty_${newEntryId()}`,
    target_url: input.targetUrl,
    domain,
    pay_to: chosen.payTo,
    amount_atomic: (chosen.amount ?? chosen.maxAmountRequired) as string,
    amount_usd: price,
    reward_usd: input.rewardUsd,
    opened_at: now.toISOString(),
    opened_block: await getBlockNumber(env),
    expires_at: new Date(
      now.getTime() + BOUNTY_OPEN_DAYS * 24 * 3600 * 1000,
    ).toISOString(),
    status: "open",
  };
  await saveBounty(env, record);
  return record;
}

/** The public board: every record, plus the week's remaining budget. */
export async function bountyBoard(env: Env, now: Date = new Date()) {
  const records = await listBountyRecords(env);
  const weekKey = currentWeekKey(now);
  const spent = await weekSpent(env, weekKey);
  return {
    bounties: records.sort((a, b) => b.opened_at.localeCompare(a.opened_at)),
    week: weekKey,
    weekly_budget_usd: BOUNTY_WEEKLY_BUDGET_USD,
    spent_this_week_usd: spent,
    payouts_enabled: Boolean(env.FIELD_WALLET_KEY),
  };
}

export interface ClaimInput {
  bountyId: string;
  txHash: string;
  payer: string;
  payoutTo: string;
  observation?: string;
}

export interface ClaimResult {
  bounty_id: string;
  reward_usd: number;
  what_was_verified: string;
  what_was_not: string;
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
}

/**
 * A claim either pays or refuses with the reason named — never a
 * partial state. Every check below runs BEFORE the budget moves or
 * the authorization signs; the last writes are the record and the
 * budget, in that order, so a crash between them strands at most one
 * bounty in "paid" with the budget uncounted — the cheap direction.
 */
export async function claimBounty(
  env: Env,
  input: ClaimInput,
  options: BountyBoardOptions = {},
): Promise<ClaimResult> {
  const now = options.now ?? new Date();
  if (!env.FIELD_WALLET_KEY && !options.signer) {
    throw new BountyRefused(
      "payouts are not enabled on this deployment (the field wallet is not provisioned); the board is read-only and no claim can pay",
    );
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) {
    throw new BountyRefused("tx_hash must be a 0x 32-byte transaction hash");
  }
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(input.payer) ||
    !/^0x[0-9a-fA-F]{40}$/.test(input.payoutTo)
  ) {
    throw new BountyRefused("payer and payout_to must be 0x Base addresses");
  }
  const bounty = await env.COUNTERS.get<BountyRecord>(
    KV_KEYS.bounty(input.bountyId),
    "json",
  );
  if (!bounty) {
    throw new BountyRefused("no bounty under that id — the board is /api/bounties");
  }
  if (bounty.status !== "open") {
    throw new BountyRefused(`that bounty is ${bounty.status}, not open`);
  }
  if (now.toISOString() > bounty.expires_at) {
    throw new BountyRefused("that bounty expired unclaimed");
  }

  // One payout per transaction, EVER — before any chain read, so a
  // replayed hash costs nothing.
  const txKey = KV_KEYS.bountyTx(input.txHash.toLowerCase());
  if (await env.COUNTERS.get(txKey)) {
    throw new BountyRefused(
      "that transaction has already been claimed — one payout per settlement, ever",
    );
  }

  // THE CHAIN'S PART: the settlement is real, succeeded, runs from
  // the claimed payer to the terms WE captured, and postdates the
  // bounty. This is what the reward pays for.
  const receipt = await getReceipt(env, input.txHash);
  if (!receipt || receipt.status !== "0x1") {
    throw new BountyRefused(
      "the chain shows no successful transaction under that hash — nothing verified, nothing paid",
    );
  }
  const receiptBlock = Number.parseInt(receipt.blockNumber ?? "0x0", 16);
  if (receiptBlock < bounty.opened_block) {
    throw new BountyRefused(
      "that settlement predates the bounty — the board pays for walks it commissioned, not history",
    );
  }
  const transfer = usdcTransfers(receipt).find(
    (candidate) =>
      isSameAddress(candidate.from, input.payer) &&
      isSameAddress(candidate.to, bounty.pay_to) &&
      candidate.amount.toString() === bounty.amount_atomic,
  );
  if (!transfer) {
    throw new BountyRefused(
      `the receipt carries no USDC transfer of ${bounty.amount_atomic} atomic units from ${input.payer} to the door's captured payTo — the settlement the bounty asked for is not in this transaction`,
    );
  }

  // Rule 3, outbound: the address OUR money goes to, screened, fail
  // closed. The oracle needs no key; an unanswered screen pays nobody.
  const screen =
    options.screen ??
    oracleScreen(env.BASE_RPC_URL ?? "https://mainnet.base.org", options.fetch ?? fetch);
  const screened = await screen(input.payoutTo);
  if (screened.listed !== false) {
    throw new BountyRefused(
      screened.listed === true
        ? `the payout address is identified on the sanctions screen (${screened.source}); the claim stands unpaid and the refusal is recorded`
        : `the sanctions screen did not answer (${screened.source}) and the rule fails closed — try again when it does; nothing is lost`,
    );
  }

  // The week's budget, checked last before money.
  const weekKey = currentWeekKey(now);
  const spent = await weekSpent(env, weekKey);
  if (spent + bounty.reward_usd > BOUNTY_WEEKLY_BUDGET_USD) {
    throw new BountyRefused(
      `this week's bounty budget ($${BOUNTY_WEEKLY_BUDGET_USD}) is spent — the board reopens with the ISO week`,
    );
  }

  const signer =
    options.signer ?? (await fieldSignerFromKey(env.FIELD_WALLET_KEY as string));
  const rewardAtomic = String(Math.round(bounty.reward_usd * 1e6));
  const authorization = {
    from: signer.address,
    to: input.payoutTo,
    value: rewardAtomic,
    validAfter: "0",
    validBefore: String(
      Math.floor(now.getTime() / 1000) + BOUNTY_AUTH_VALID_SECONDS,
    ),
    nonce: (options.randomNonce ?? defaultNonce)(),
  };
  const signature = await signer.signTypedData({
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
  });

  const paid: BountyRecord = {
    ...bounty,
    status: "paid",
    claim: {
      tx_hash: input.txHash.toLowerCase(),
      payer: input.payer.toLowerCase(),
      payout_to: input.payoutTo.toLowerCase(),
      claimed_at: now.toISOString(),
      ...(input.observation
        ? { observation: input.observation.slice(0, BOUNTY_OBSERVATION_CAP) }
        : {}),
      authorization_nonce: authorization.nonce,
      authorization_valid_before: authorization.validBefore,
    },
  };
  await env.COUNTERS.put(txKey, input.bountyId);
  await saveBounty(env, paid);
  await env.COUNTERS.put(
    KV_KEYS.bountyBudget(weekKey),
    String(spent + bounty.reward_usd),
  );

  return {
    bounty_id: bounty.bounty_id,
    reward_usd: bounty.reward_usd,
    what_was_verified:
      `The chain's part: transaction ${input.txHash.toLowerCase()} succeeded on Base and carries a USDC transfer of exactly $${usdcFromUnits(BigInt(bounty.amount_atomic))} from your wallet to the door's payTo as this store captured it when the bounty opened, in a block after the bounty existed, never claimed before. That is what the reward pays for.`,
    what_was_not:
      "Your observations, if you sent any, are recorded verbatim as YOUR claim — this store did not see your HTTP transcript and does not pretend to. Crowd-walked rows enter the corpus at their own evidence tier, below house-walked ones, and the tier is always printed.",
    payout: {
      method: "eip3009_transfer_with_authorization",
      asset: BASE_USDC,
      chain: "eip155:8453",
      authorization,
      signature,
      how_to_redeem: `Submit transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature) on the USDC contract (${BASE_USDC}) on Base — from your own wallet or any relayer; the function is submittable by anyone. Valid until unix ${authorization.validBefore}; unredeemed, it expires on its own and the budget takes it back. The signature is the payment — treat it like cash.`,
    },
  };
}
