import {
  BASE_EVM,
  BASE_USDC,
  EVM_CHAINS,
  evmChainOf,
  authorizationUsed,
  getBlockNumber,
  getReceipt,
  isSameAddress,
  rpcEndpoints,
  usdcFromUnits,
  usdcTransfers,
} from "@/lib/base-rpc";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { familyOf, readPayTo, SOLANA_ADDRESS } from "@/lib/pay-to";
import {
  getSlot,
  isSolanaSignature,
  SOLANA_CHAIN,
  SOLANA_USDC_MINT,
  solanaTransactionFacts,
} from "@/lib/solana-rpc";
import { SOLANA_FINALITY_SLOTS } from "@/services/attestation";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newEntryId } from "@/lib/ids";
import {
  LAUNCH_CHECK_UA,
  oracleScreen,
  raiseScreenUnavailable,
  fieldSignerFromKey,
  type SanctionsScreen,
  type FieldSigner,
} from "@/services/launch-check";
import type { Env } from "@/types";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";

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
/**
 * THE RAILS THIS BOARD CAN POST, DERIVED (2026-09-09).
 *
 * BOUNTY_BOARD.md and the board's own rules said "Base, Polygon and
 * Solana" from the day the third rail shipped. The claim verifier had
 * meanwhile grown to read every chain in EVM_CHAINS — seven of them —
 * because evmChainOf resolves the whole list and the claim door reads
 * the bounty's own captured chain. So the room understated the code by
 * four rails, in copy on a page that sells accuracy.
 *
 * Deriving the list from the verifier's own table is the fix that
 * cannot go stale: add a chain to EVM_CHAINS and the board says so the
 * same day, in the rules, in the JSON, and in the posting refusal.
 *
 * WHAT THIS LIST IS NOT is a recommendation. A rail whose gas costs a
 * walker more than the reward pays is a rail where a bounty takes
 * their money — Ethereum mainnet at a $0.25 ceiling is exactly that.
 * The verifier reads it; the keeper should not post it. That judgement
 * lives in BOUNTY_BOARD.md beside the posting press, not in a filter
 * here, because gas is not a fact this store can read at posting time
 * and a rule it cannot check is a rule it should not pretend to.
 */
export function bountyRails(): Array<{ caip2: string; label: string }> {
  return [
    ...EVM_CHAINS.map((chain) => ({ caip2: chain.caip2, label: chain.label })),
    { caip2: SOLANA_CHAIN, label: "Solana" },
  ];
}

/** The rails, named, for copy that must not drift from the verifier. */
export function bountyRailNames(): string {
  const rails = bountyRails().map((rail) => rail.label);
  return `${rails.slice(0, -1).join(", ")} and ${rails[rails.length - 1]}`;
}

/** Bounty listings live this long by default, then expire unclaimed. */
export const BOUNTY_OPEN_DAYS = 7;

/**
 * HOW LONG A LISTING STANDS, TIERED (2026-09-08).
 *
 * Every bounty ran seven days because seven days was the only number
 * in the file. Then ten listings were claimed inside twenty minutes by
 * one automated walker, which said something the fixed number could
 * not: the board's clock and the walkers' clock have nothing to do
 * with each other. A door somebody will walk in a minute does not need
 * a week of shelf life, and a door nobody has walked in a week is not
 * helped by expiring on the eighth day.
 *
 * So the length is a posting decision with three names:
 *
 *   sprint   two days — a door we expect walked immediately; a short
 *            fuse means the board's open list stays a live queue
 *            rather than a backlog of things nobody wants.
 *   standard seven days — the original, and still the default.
 *   long     twenty-one days — a door worth waiting for a DIFFERENT
 *            walker to find, which is the only way the crowd stops
 *            being one wallet.
 *
 * The tier is stored on the record and published, so a walker reading
 * the board knows whether they are looking at a queue or a shelf.
 */
export const BOUNTY_TIERS = {
  sprint: 2,
  standard: BOUNTY_OPEN_DAYS,
  long: 21,
} as const;
export type BountyTier = keyof typeof BOUNTY_TIERS;
/** A listing may not stand longer than this, whatever is asked for. */
export const BOUNTY_MAX_OPEN_DAYS = 30;

/**
 * WHAT WE NEED BACK, PER BOUNTY (2026-09-08, the keeper: "be explicit
 * about what we need back and make sure we do something with the
 * data").
 *
 * Ten walks came in yesterday carrying fifty-one characters each —
 * "HTTP 200; settlement verified for X." — and the store paid $0.25
 * apiece for them. That is not the walker being lazy. Nothing on the
 * board ever said what a useful report contains, so a report that
 * says nothing is a report that met the whole stated standard.
 *
 * A bounty now carries its ASKS: the specific things this store wants
 * observed at that door, published on the listing and repeated at the
 * claim door. They are asks and not conditions — the reward still pays
 * for the chain-verified settlement and nothing else, because a reward
 * withheld over an unverifiable report would be this store grading a
 * stranger's homework with money.
 */
export const BOUNTY_ASK_CAP = 6;
export const BOUNTY_ASK_LENGTH = 160;

/**
 * THE STRUCTURED HALF OF A WALKER'S REPORT.
 *
 * Free text cannot be compared across walkers; these fields can. A
 * body digest from two different wallets at the same door either
 * agrees or does not, and neither walker has to be trusted for that
 * comparison to mean something — which is the first thing on this
 * board that upgrades a claim without the store pretending it
 * verified it.
 *
 * Every field stays THEIR claim, recorded verbatim, tiered below
 * anything the house walked. What changes is that two claims can now
 * be held against each other.
 */
export interface WalkReport {
  /** The paid request's HTTP status, as the walker saw it. */
  status?: number;
  /** Did the paid response carry a PAYMENT-RESPONSE receipt header? */
  payment_response?: boolean;
  /** sha256 of the response body, hex — comparable between walkers. */
  body_sha256?: string;
  /** Response size in bytes, as the walker measured it. */
  bytes?: number;
  /** Round trip of the paid request, milliseconds. */
  latency_ms?: number;
  /** The response's declared content type. */
  content_type?: string;
}

export interface BountyRecord {
  bounty_id: string;
  target_url: string;
  domain: string;
  /** The door's terms, captured BY THE STORE at posting time. */
  pay_to: string;
  /** CAIP-2 of the rail the captured terms quote. Absent means Base —
   * every bounty opened before the third rail's parity build. */
  network?: string;
  /**
   * THE FOURTH RAIL ON THE BOARD (2026-09-05, SOLANA_PARITY.md #2):
   * a bounty on a Solana door keeps two heights, not one. `opened_slot`
   * is the settlement rail's height at posting — the slot a claimed
   * signature must postdate. `opened_block` stays the Base head at the
   * same instant, because the PAYOUT is Base whatever the door's rail,
   * and the redemption reader scans Base from that block. Two chains,
   * two clocks, each named. Absent on every EVM bounty.
   */
  opened_slot?: number;
  amount_atomic: string;
  amount_usd: number;
  reward_usd: number;
  opened_at: string;
  /**
   * The keeper's optional "why this walk" — his own ink, verbatim,
   * shown on the public board so a careful shopper knows what to look
   * at. Optional forever: a bounty is fully self-describing without
   * it (door, captured price, reward, expiry, claim procedure).
   */
  note?: string;
  /**
   * WHAT THIS STORE WANTS OBSERVED HERE, in its own words, published
   * on the listing. Asks, never conditions: the reward pays for the
   * settlement whatever comes back beside it.
   */
  asks?: string[];
  /** The tier the listing was posted under, when it was not standard. */
  tier?: BountyTier;
  /** How many days this listing was posted to stand. */
  open_days?: number;
  /**
   * A SECOND WALK, BY SOMEBODY ELSE (2026-09-08). Set on a bounty
   * posted to re-walk a door this store has already had walked: the
   * claim is refused if it comes from a wallet that already paid a
   * bounty at this domain. The evidence a second walk buys is
   * precisely "a different buyer's money got the same answer", and a
   * repeat by the same wallet buys none of it.
   */
  distinct_payer_required?: boolean;
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
    /**
     * The comparable half of the same report, and the same tier: their
     * claim, kept verbatim, never verified by this store. Its worth is
     * that two walkers' answers at one door can be held against each
     * other without trusting either.
     */
    report?: WalkReport;
    authorization_nonce: string;
    authorization_valid_before: string;
    /**
     * THE CHAIN'S PART, KEPT (2026-09-04): the block the settlement
     * landed in, read off the receipt this store verified. The corpus
     * row cites it. Absent on claims paid before it was written down.
     */
    settled_block?: number;
    /**
     * The slot a Solana settlement landed in, the chain's part on the
     * fourth rail. Present only when the bounty's rail is Solana; the
     * corpus row prints it as `slot`, never as `block`.
     */
    settled_slot?: number;
    /**
     * OUR OWN KNOCK AT THE MOMENT OF THE CLAIM (2026-09-04, the keeper:
     * "what if they type nonsense?"). The walker's observation is a
     * claim and stays one. What this store CAN verify about the door
     * it verifies itself: one unpaid GET at claim time, the same
     * battery the census runs, verdict and named failures kept. So a
     * crowd-walked row carries two facts of ours — the settlement on
     * chain and the door's shape as we saw it — around one claim of
     * theirs. Absent when the knock could not be taken; never a
     * refusal, the claim pays on the chain's part alone.
     */
    house_probe?: {
      verdict: "ready" | "not_ready" | "unreachable";
      failed: string[];
      advisories: string[];
      battery?: string;
      latency_ms?: number;
      at: string;
    };
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
  return [...values.values()].filter((record): record is BountyRecord =>
    Boolean(record),
  );
}

async function saveBounty(env: Env, record: BountyRecord): Promise<void> {
  await kvPut(env.COUNTERS, 
    KV_KEYS.bounty(record.bounty_id),
    JSON.stringify(record),
  );
}

/** Budget spent this week, in USD. One key per ISO week. */
async function weekSpent(env: Env, weekKey: string): Promise<number> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.bountyBudget(weekKey));
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
  input: {
    targetUrl: string;
    rewardUsd: number;
    note?: string;
    /** The tier's length, or a day count of the keeper's own. */
    tier?: BountyTier;
    days?: number;
    /** What this store wants observed at this door. Asks, not conditions. */
    asks?: readonly string[];
    /**
     * CAPTURE THIS RAIL, or refuse (2026-09-09). Without it the picker
     * takes Base whenever a door offers Base, which is every
     * multi-rail door in the census — 136 quote Polygon, 130 Arbitrum,
     * 81 World, and not one of them quotes those EXCLUSIVELY. So the
     * board could read seven chains and was structurally incapable of
     * ever posting on six of them.
     *
     * A CAIP-2 or the plain word ("arbitrum", "eip155:42161",
     * "solana"). Named and not offered is a REFUSAL, never a quiet
     * fallback to Base: a keeper asking for Arbitrum evidence and
     * silently getting another Base row would be buying the wrong
     * thing and told it worked.
     */
    rail?: string;
    /** Refuse a claim from a wallet that already walked this domain. */
    distinctPayer?: boolean;
  },
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
  /**
   * EVM entries first, Base preferred, Polygon accepted (parity ruling
   * 2026-08-21: a Polygon-only door is still a door somebody should
   * be paid to walk). Solana accepted last (2026-09-05, the fourth
   * rail — a Solana-wallet shopper asked, in writing, why a Solana door
   * could not be walked for a reward). The claim verifier reads the
   * bounty's own chain, so whichever rail is captured here is the rail
   * the settlement must land on. The REWARD is Base USDC on every rail:
   * money-out on Solana is SOLANA_PARITY.md #4 and stays shut.
   */
  /*
   * THE RAIL, IF ONE WAS NAMED. Resolved through the same vocabulary
   * the claim door uses, so a rail this store cannot verify can never
   * be captured — and the refusal names what the door DID offer, which
   * is the thing the keeper needs to post it correctly next time.
   */
  let wanted: string | null = null;
  if (input.rail) {
    const asEvm = evmChainOf(input.rail);
    const asked = input.rail.trim().toLowerCase();
    wanted =
      asEvm?.caip2 ??
      (asked === "solana" || asked === SOLANA_CHAIN.toLowerCase()
        ? SOLANA_CHAIN
        : null);
    if (!wanted) {
      throw new BountyRefused(
        `this store cannot verify a settlement on "${input.rail}" — the rails it reads are ${bountyRailNames()}`,
      );
    }
    const offered = [
      ...new Set(
        accepts
          .map((entry) => entry.network)
          .filter((network): network is string => Boolean(network)),
      ),
    ];
    if (!offered.some((network) => network.toLowerCase() === wanted!.toLowerCase())) {
      throw new BountyRefused(
        `this door quotes no ${input.rail} entry — it offers ${offered.join(", ") || "no network at all"}. Nothing is posted: a bounty captured on another rail is not the evidence that was asked for`,
      );
    }
  }
  const railWanted = (entry: AcceptEntry): boolean =>
    wanted === null ||
    (entry.network ?? "").toLowerCase() === wanted.toLowerCase();

  const evmEntries = accepts
    .filter(railWanted)
    .map((entry) => ({
      entry,
      chain: entry.network ? evmChainOf(entry.network) : null,
    }))
    .filter(
      (
        pair,
      ): pair is {
        entry: AcceptEntry;
        chain: NonNullable<ReturnType<typeof evmChainOf>>;
      } =>
        pair.chain !== null &&
        (pair.entry.scheme ?? "exact") === "exact" &&
        Number.isFinite(amountUsd(pair.entry)),
    )
    .sort((a, b) =>
      a.chain.key === b.chain.key
        ? amountUsd(a.entry) - amountUsd(b.entry)
        : a.chain.key === "base"
          ? -1
          : 1,
    );
  const solanaEntries = accepts
    .filter(
      (entry) =>
        railWanted(entry) &&
        entry.network === SOLANA_CHAIN &&
        (entry.scheme ?? "exact") === "exact" &&
        Number.isFinite(amountUsd(entry)),
    )
    .sort((a, b) => amountUsd(a) - amountUsd(b));
  const chosenPair = evmEntries[0];
  const chosenSolana = chosenPair ? undefined : solanaEntries[0];
  /*
   * A named rail that survived the filter above but produced no
   * payable entry — wrong asset, a scheme we do not read, an
   * unparseable amount — refuses here rather than falling through to
   * whatever else the door offers.
   */
  if (wanted && !chosenPair && !chosenSolana) {
    throw new BountyRefused(
      `this door quotes ${input.rail} but no payable USDC entry on it that this store can verify — nothing is posted`,
    );
  }
  const chosen = chosenPair?.entry ?? chosenSolana;
  const bountyChain = chosenPair?.chain;
  const assetMatches = bountyChain
    ? isSameAddress(chosen?.asset ?? "", bountyChain.usdc)
    : chosen?.asset === SOLANA_USDC_MINT;
  const railCaip2 = bountyChain?.caip2 ?? SOLANA_CHAIN;
  if (!chosen?.payTo || !assetMatches) {
    throw new BountyRefused(
      "no payable USDC rail on Base, Polygon or Solana could be read from the door's 402 — the claim verifier would have nothing to verify against",
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
  const payToRead = readPayTo(chosen.payTo, railCaip2);
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

  /*
   * THE LENGTH IS CHOSEN, NOT INHERITED. An explicit day count wins
   * over the tier's; both are bounded, and a length outside the bound
   * is refused rather than clamped — a listing that stands a different
   * time than the keeper asked for is a listing whose expiry nobody
   * can predict from the press that made it.
   */
  const openDays = input.days ?? (input.tier ? BOUNTY_TIERS[input.tier] : BOUNTY_OPEN_DAYS);
  if (!Number.isFinite(openDays) || openDays < 1 || openDays > BOUNTY_MAX_OPEN_DAYS) {
    throw new BountyRefused(
      `a listing stands between 1 and ${BOUNTY_MAX_OPEN_DAYS} days (asked for ${openDays})`,
    );
  }
  const asks = (input.asks ?? [])
    .map((ask) => ask.trim().slice(0, BOUNTY_ASK_LENGTH))
    .filter((ask) => ask.length > 0)
    .slice(0, BOUNTY_ASK_CAP);

  const record: BountyRecord = {
    bounty_id: `bty_${newEntryId()}`,
    target_url: input.targetUrl,
    domain,
    pay_to: chosen.payTo,
    amount_atomic: (chosen.amount ?? chosen.maxAmountRequired) as string,
    amount_usd: price,
    reward_usd: input.rewardUsd,
    opened_at: now.toISOString(),
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 500) } : {}),
    network: railCaip2,
    // The payout rail's height is always kept (the redemption reader
    // scans Base from it); the settlement rail's height is kept beside
    // it when the two differ.
    opened_block: await getBlockNumber(env, bountyChain ?? BASE_EVM),
    ...(bountyChain ? {} : { opened_slot: await getSlot(env) }),
    expires_at: new Date(
      now.getTime() + openDays * 24 * 3600 * 1000,
    ).toISOString(),
    open_days: openDays,
    ...(input.tier ? { tier: input.tier } : {}),
    ...(asks.length > 0 ? { asks } : {}),
    ...(input.distinctPayer ? { distinct_payer_required: true } : {}),
    status: "open",
  };
  await saveBounty(env, record);
  return record;
}

/**
 * A bounty's status AS OF NOW, derived from the record rather than
 * read off it. The stored status is written at two moments only —
 * "open" at posting, "paid" at claim — and nothing ever wrote
 * "expired", so a listing that repeated the stored word kept showing
 * every unclaimed bounty as open forever. The claim door had always
 * checked the clock; the board had not. Between 2026-08-27 and
 * 2026-09-01 the public board offered five doors a shopper could pay
 * and never be paid for. Same lesson as rule 46 and the corrections
 * page: the status a stranger reads must be computed by the same
 * test that would refuse their claim.
 */
export function bountyStatusAt(
  record: Pick<BountyRecord, "status" | "expires_at">,
  now: Date,
): BountyRecord["status"] {
  if (record.status === "open" && now.toISOString() > record.expires_at) {
    return "expired";
  }
  return record.status;
}

/** The public board: every record, plus the week's remaining budget. */
export async function bountyBoard(env: Env, now: Date = new Date()) {
  const records = await listBountyRecords(env);
  const weekKey = currentWeekKey(now);
  const spent = await weekSpent(env, weekKey);
  const bounties = records
    .map((record) => ({ ...record, status: bountyStatusAt(record, now) }))
    .sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  return {
    bounties,
    /** Doors a shopper can still walk and be paid for, as of this read. */
    open_count: bounties.filter((entry) => entry.status === "open").length,
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
  report?: WalkReport;
}

/**
 * THE STRUCTURED REPORT, TAKEN AS DATA AND NEVER AS TRUTH.
 *
 * Every field is a stranger's claim about somebody else's door, so
 * each is bounded to a shape the store can print without thinking
 * about it: a plausible status, a hex digest of the right length, a
 * size and a latency that are numbers rather than essays. A field
 * that does not fit its shape is DROPPED rather than refused — the
 * reward pays for the settlement, and a malformed extra must never
 * cost a walker money they really spent.
 */
export function sanitizeReport(report: WalkReport | undefined): WalkReport | undefined {
  if (!report || typeof report !== "object") return undefined;
  const out: WalkReport = {};
  const { status, payment_response, body_sha256, bytes, latency_ms, content_type } =
    report;
  if (Number.isInteger(status) && (status as number) >= 100 && (status as number) <= 599) {
    out.status = status as number;
  }
  if (typeof payment_response === "boolean") out.payment_response = payment_response;
  if (typeof body_sha256 === "string" && /^(0x)?[0-9a-fA-F]{64}$/.test(body_sha256)) {
    out.body_sha256 = body_sha256.toLowerCase().replace(/^0x/, "");
  }
  if (Number.isFinite(bytes) && (bytes as number) >= 0 && (bytes as number) < 1e9) {
    out.bytes = Math.round(bytes as number);
  }
  if (Number.isFinite(latency_ms) && (latency_ms as number) >= 0 && (latency_ms as number) < 600_000) {
    out.latency_ms = Math.round(latency_ms as number);
  }
  if (typeof content_type === "string" && content_type.length > 0) {
    out.content_type = content_type.slice(0, 120);
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
 * WHY A CLAIM IS REFUSED, IN THE ORDER THE DOOR CHECKS (2026-09-08).
 *
 * The board told a shopper how to walk a door and how to claim, and
 * said nothing at all about the far more expensive question: what
 * happens when a claim is refused AFTER their own money has already
 * left their wallet. Every refusal below was already worded carefully
 * at the moment it fires — and a refusal read for the first time by
 * somebody who is already out of pocket is worded too late. The store
 * that publishes its own defect vocabulary can publish the list of
 * ways it will say no.
 *
 * Two things this list is careful about, because they are the two
 * that cost real money:
 *
 *   WHICH REFUSALS RELEASE. A refusal taken before the settlement is
 *   held costs nothing, and so does every refusal inside the claim
 *   path — the claim is released and the settlement stays claimable.
 *   The one that does not come back is a settlement someone already
 *   claimed. Each row says which it is, in its own words.
 *
 *   WHICH REFUSALS THE WALKER CAN SEE COMING. Price drift, an expired
 *   listing and a spent budget are all readable on the board BEFORE a
 *   wallet opens. Saying so on the same page is the difference between
 *   a rule and a warning.
 *
 * Each row carries the refusal as the door actually words it
 * (`matches`), and test/bounty-board.spec.ts drives every one of them
 * against the real claim door and fails if any row here matches
 * nothing the store says. A refusal that gets reworded and leaves this
 * list behind is a red test, not a quiet lie on the public board.
 */
export interface BountyRefusalNote {
  /** What the door is checking, in the shopper's terms. */
  check: string;
  /** The condition that refuses. */
  refused_when: string;
  /** What it costs the walker, and whether there is a second try. */
  then_what: string;
  /**
   * The door's own wording, for the drift test only — stripped from
   * the published catalogue (BOUNTY_REFUSALS), which is prose.
   */
  matches: RegExp;
}

export const BOUNTY_REFUSAL_CATALOGUE: readonly BountyRefusalNote[] = [
  {
    check: "Payouts are live on this deployment at all",
    refused_when:
      "the field wallet is not provisioned, so there is nothing to sign a reward with",
    then_what:
      "Refused before anything is read, and the board says so on every read: payouts_enabled is false. Nothing is spent — check that field before you walk, not after.",
    matches: /read-only/,
  },
  {
    check: "payout_to is an address this store can pay",
    refused_when:
      "payout_to is not a 0x address — rewards are Base USDC on every rail, Solana doors included",
    then_what:
      "Nothing is looked up, nothing is held, nothing is spent. Fix the address and claim the same settlement again.",
    matches: /payout_to must be a 0x/,
  },
  {
    check: "The bounty exists",
    refused_when: "no record stands under that bounty_id",
    then_what:
      "Ids are bty_… and the board that serves them is /api/bounties. Nothing is held; claim again against a real id.",
    matches: /no bounty under that id/,
  },
  {
    check: "The ids are in the shape of the bounty's own rail",
    refused_when:
      "an EVM bounty is claimed with anything but a 0x hash and a 0x payer, or a Solana bounty with anything but a base58 signature and a base58 payer",
    then_what:
      "Nothing is held. The rail is on the bounty's network field, and it is the rail the settlement has to land on — read it before you pay, not after.",
    matches: /(tx_hash|payer) must be/,
  },
  {
    check: "The bounty is still open",
    refused_when:
      "it was already paid to someone else's settlement, or its status is anything but open",
    then_what:
      "There is no second try on a spent listing, and nothing this store can do after the fact. One bounty pays once: read the board on the same minute you open your wallet.",
    matches: /not open/,
  },
  {
    check: "The bounty has not expired",
    refused_when: "the walk came in after the listing's expires_at",
    then_what:
      `Listings run ${BOUNTY_OPEN_DAYS} days and the clock that refuses your claim is the same one that prints the status you read. An expired listing pays nothing, whatever you spent at the door.`,
    matches: /expired unclaimed/,
  },
  {
    check: "That settlement has never been claimed",
    refused_when: "some claim already paid out against that transaction",
    then_what:
      "One payout per settlement, ever — this is the one refusal that does not come back. A fresh walk needs a fresh payment to the door.",
    matches: /already been claimed/,
  },
  {
    check: "The store's own hold on your settlement reads back",
    refused_when:
      "the store's storage does not yet show its own write — eventually consistent reads, nobody else involved",
    then_what:
      "Nothing was signed and nothing is spent; the settlement stays claimable. Try again in a moment. This is the store's plumbing, not a judgement on your walk.",
    matches: /could not be confirmed/,
  },
  {
    check: "The chain has that settlement, and it succeeded",
    refused_when:
      "the rail shows no transaction under that id, or shows one that failed — a failed transaction moved no USDC",
    then_what:
      "The claim is released. If you paid on a different chain than the bounty captured, that is the whole answer: the settlement has to be on the bounty's own rail.",
    matches: /shows no|that transaction failed/,
  },
  {
    check: "A Solana settlement is past the finality window",
    refused_when:
      "the signature is fewer slots deep than the board pays past — a confirmed transaction the cluster can still drop",
    then_what:
      "Released, not refused for good, and the message says how deep it got. Come back a minute later with the same signature.",
    matches: /slots deep/,
  },
  {
    check: "The settlement postdates the bounty",
    refused_when: "it landed in a block or slot older than the listing",
    then_what:
      "The board pays for walks it commissioned, not for history. A payment you made before the bounty opened cannot claim it, and the claim is released.",
    matches: /predates the bounty/,
  },
  {
    check: "The transfer is the one the bounty asked for",
    refused_when:
      "the settlement carries no USDC transfer of exactly the captured amount from your payer to the payTo this store captured when it opened the bounty",
    then_what:
      "This is the honest loss mode, and the only one that costs a careful walker money: the door's price moved between the posting and your walk, so what you paid is real and unclaimable. Compare the live 402 against the bounty's amount_usd BEFORE you pay. The claim is released; the door keeps its price.",
    matches: /no USDC transfer of|carry no transfer of/,
  },
  {
    check: "The payout address passes the sanctions screen",
    refused_when:
      "the on-chain oracle identifies the address, or does not answer at all — rule 3 fails closed either way",
    then_what:
      "An identified address is refused and the refusal is recorded. A screen that did not answer is a wait, not a verdict: the claim is released and the same settlement can be claimed again when the oracle answers.",
    matches: /sanctions screen/,
  },
  {
    check: "The week's budget covers the reward",
    refused_when: "this week's payouts already reached the posted weekly budget",
    then_what:
      "The claim is released and the board reopens with the ISO week. Every read publishes spent_this_week_usd against weekly_budget_usd, so a week with no room left says so before you walk.",
    matches: /budget .* is spent/,
  },
];

/**
 * The catalogue as the board publishes it: prose only. The regexes
 * are the drift test's business and would serialize as empty objects
 * on the JSON door.
 */
export const BOUNTY_REFUSALS: readonly Omit<BountyRefusalNote, "matches">[] =
  BOUNTY_REFUSAL_CATALOGUE.map(({ matches: _matches, ...row }) => row);

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
  // The payout is Base on every rail, so the payout address is 0x on
  // every rail — checked before the bounty is even looked up.
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.payoutTo)) {
    throw new BountyRefused(
      "payout_to must be a 0x Base address — rewards pay in Base USDC whatever rail the door is on",
    );
  }
  const bounty = await kvGetJson<BountyRecord>(env.COUNTERS, 
    KV_KEYS.bounty(input.bountyId),
    "json",
  );
  if (!bounty) {
    throw new BountyRefused(
      "no bounty under that id — the board is /api/bounties",
    );
  }
  /*
   * THE BOUNTY'S RAIL DECIDES THE SHAPES (2026-09-05, the fourth rail).
   * Until today the hash and payer were checked against the 0x shape
   * before the bounty was read, which was right when every bounty was
   * EVM. A Solana door's settlement is a base58 signature paid by a
   * base58 wallet; the same shape check would refuse every honest
   * claim on it with a message about Base. So the record is read
   * first and the shapes are read against ITS rail.
   */
  const solanaRail = familyOf(bounty.network ?? "eip155:8453") === "solana";
  if (solanaRail) {
    if (!isSolanaSignature(input.txHash)) {
      throw new BountyRefused(
        "tx_hash must be a base58 Solana transaction signature — this bounty's door settles on Solana",
      );
    }
    if (!SOLANA_ADDRESS.test(input.payer)) {
      throw new BountyRefused(
        "payer must be a base58 Solana wallet — the owner of the token account that paid the door",
      );
    }
  } else {
    if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) {
      throw new BountyRefused("tx_hash must be a 0x 32-byte transaction hash");
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(input.payer)) {
      throw new BountyRefused("payer must be a 0x address on the bounty's EVM rail");
    }
  }
  if (bounty.status !== "open") {
    throw new BountyRefused(`that bounty is ${bounty.status}, not open`);
  }
  /*
   * A SECOND WALK HAS TO BE SOMEBODY ELSE (2026-09-08). On 09-08 one
   * automated wallet claimed ten of ten listings inside twenty
   * minutes, and every crowd-walked row in the corpus that week came
   * from two wallets in total. That walker is doing exactly what the
   * board asks and the evidence is real — but "drawn by strangers'
   * money" is a claim about a denominator, and a bounty posted to
   * re-walk a door buys nothing at all if the same wallet answers it.
   *
   * Checked against the board's own paid records rather than a
   * counter, so it stays true across a redeploy, and only on listings
   * posted with the flag: the ordinary board is unchanged and no
   * walker is turned away from a door they have not already been paid
   * for.
   */
  if (bounty.distinct_payer_required) {
    const already = (await listBountyRecords(env)).some(
      (record) =>
        record.domain === bounty.domain &&
        record.status === "paid" &&
        isSameAddress(record.claim?.payer ?? "", input.payer),
    );
    if (already) {
      throw new BountyRefused(
        "this listing is a second walk: it pays a wallet that has not already been paid for walking this door. Yours has. Nothing is spent and the listing stays open for somebody else",
      );
    }
  }
  if (now.toISOString() > bounty.expires_at) {
    throw new BountyRefused("that bounty expired unclaimed");
  }

  /*
   * ONE PAYOUT PER TRANSACTION, EVER — AND THE CLAIM HAS TO LAND
   * BEFORE THE SIGNATURE, NOT AFTER IT.
   *
   * Until 2026-08-25 this was a `get` here and a `put` a hundred
   * lines below, with a chain read and an EIP-3009 signature in
   * between. Four concurrent POSTs of the same claim body all saw an
   * empty key and all got a signed authorization — four distinct
   * nonces, so the USDC contract accepts every one. Measured: four
   * payouts for one $0.25 bounty on one settlement, against an
   * unauthenticated route.
   *
   * The weekly budget did not bound it either: `spent` was read here
   * and written there too, so four payouts advanced the counter by
   * ONE reward. `/bounties` publishes that counter, so the public
   * figure understated what the wallet had actually signed away.
   *
   * So the key is claimed first and read back. A loser refuses
   * without signing. If anything downstream refuses — the chain says
   * the settlement is not real, the budget is spent — the claim is
   * released, because a transaction that never paid out must stay
   * claimable.
   *
   * THIS IS NOT A MUTEX, and the first version of this comment said
   * it was. Workers KV is last-write-wins with edge-cached reads and
   * no compare-and-swap: two colos can each claim and each read back
   * their own claim. It narrows the window and makes the rare case
   * detectable; it does not close it. A Durable Object per tx hash
   * is the real answer.
   *
   * AND ONE GAP THIS DOES NOT COVER AT ALL, stated rather than
   * implied: only the TX key is claimed. Two concurrent claims of the
   * same bounty with two DIFFERENT real settlements both read
   * status "open" above and both pay. That is a separate defect with
   * no fix in this commit.
   */
  /*
   * The replay key is the transaction id, and the two id families
   * cannot collide (base58 has no 0x prefix), so the EVM keys keep
   * the shape every paid claim already wrote under. Solana signatures
   * are case-sensitive and are keyed as written, behind a `sol:`
   * prefix so the family is legible in the KV listing.
   */
  const txId = solanaRail ? input.txHash : input.txHash.toLowerCase();
  const txKey = KV_KEYS.bountyTx(solanaRail ? `sol:${txId}` : txId);
  const claimId = `${input.bountyId}:${(options.randomNonce ?? defaultNonce)()}`;
  if (await kvGet(env.COUNTERS, txKey)) {
    throw new BountyRefused(
      "that transaction has already been claimed — one payout per settlement, ever",
    );
  }
  await kvPut(env.COUNTERS, txKey, claimId);

  /*
   * A budget reservation taken and then abandoned would shrink the
   * week for everybody else, so the release gives both back — the
   * claim AND whatever was reserved against it.
   *
   * BOTH HALVES ARE CONDITIONAL, corrected 2026-08-25 hours after the
   * first version shipped:
   *
   *   The delete used to be unconditional. If two requests both
   *   believed they held the claim, the LOSER's refusal deleted the
   *   WINNER's key — so a settlement that had already been paid for
   *   became claimable again, by the very code enforcing "one payout
   *   per settlement, ever".
   *
   *   The budget used to be restored to a SNAPSHOT taken before the
   *   signature. A reservation that landed in between was erased —
   *   the same read-then-write defect this commit claimed to fix,
   *   moved from the happy path onto the rollback path. It gives back
   *   the DELTA now, off a fresh read, clamped at zero.
   */
  let reserved: { week: string; amount: number } | null = null;
  const releaseClaim = async () => {
    if ((await kvGet(env.COUNTERS, txKey)) === claimId) {
      await env.COUNTERS.delete(txKey);
    }
    if (reserved) {
      const current = await weekSpent(env, reserved.week);
      await kvPut(env.COUNTERS, 
        KV_KEYS.bountyBudget(reserved.week),
        String(Math.max(0, current - reserved.amount)),
      );
      reserved = null;
    }
  };

  // Every refusal below releases the claim: a settlement that never
  // paid out has to stay claimable, or one bad chain read burns a
  // walker's real purchase forever.
  try {
    /*
     * THE READBACK LIVES INSIDE THE TRY — and that placement is the
     * whole finding. In the first version it sat ABOVE this line, so
     * it was the one refusal path that never released, and it is the
     * path a STALE READ takes.
     *
     * Workers KV reads are edge-cached and eventually consistent: a
     * get after a put can return the old value with nobody else
     * involved. A real mystery shopper who really walked the door and
     * really settled on chain would be told "already claimed", get
     * nothing, and leave txKey holding a claim for a payout that
     * never happened — refusing every future attempt, theirs or
     * anyone's, forever, with no expiry and no operator path to clear
     * it.
     *
     * A different claim id means a genuine rival: refuse and leave
     * their claim alone. Anything else means our own write is not
     * visible, so release and let them try again.
     */
    const seen = await kvGet(env.COUNTERS, txKey);
    if (seen !== claimId) {
      if (seen) {
        throw new BountyRefused(
          "that transaction has already been claimed — one payout per settlement, ever",
        );
      }
      throw new BountyRefused(
        "the claim on that settlement could not be confirmed, so nothing was signed and nothing is spent — try again in a moment",
      );
    }
    // THE CHAIN'S PART: the settlement is real, succeeded, runs from
    // the claimed payer to the terms WE captured, and postdates the
    // bounty. This is what the reward pays for.
    // The bounty's own rail is the one the settlement must be on —
    // captured at open, defaulting Base for bounties older than the
    // third rail's parity build.
    let railLabel: string;
    let settledHeight: { settled_block: number } | { settled_slot: number };
    if (solanaRail) {
      /*
       * SOLANA HAS NO RECEIPT LOGS: the settled outcome is the
       * pre/post token balances, read per owner (the same reader the
       * attestation uses — one parser, not a third). The door's owner
       * must have been credited EXACTLY the captured amount and the
       * payer's owner debited at least it, in a transaction that did
       * not fail and landed after the bounty's opening slot.
       *
       * FINALITY IS CHECKED HERE AND NOT ON THE EVM PATH, on purpose:
       * getTransaction at "confirmed" can answer for a transaction the
       * cluster later drops. A reward signed against a dropped
       * settlement is money for nothing, so a claim inside the
       * finality window is refused, released, and told to come back.
       */
      const [facts, headSlot] = await Promise.all([
        solanaTransactionFacts(env, input.txHash),
        getSlot(env),
      ]);
      if (!facts) {
        throw new BountyRefused(
          `Solana shows no transaction under that signature — nothing verified, nothing paid. The bounty's captured rail is ${SOLANA_CHAIN}; a settlement on another chain cannot claim it`,
        );
      }
      if (facts.err) {
        throw new BountyRefused(
          "Solana shows that transaction failed — a failed transaction moved no USDC, so there is no settlement to pay for",
        );
      }
      if (headSlot - facts.slot < SOLANA_FINALITY_SLOTS) {
        throw new BountyRefused(
          `that settlement is ${Math.max(0, headSlot - facts.slot)} slots deep and the board pays only past ${SOLANA_FINALITY_SLOTS} — nothing is spent and the claim is released; try again in a minute`,
        );
      }
      if (facts.slot < (bounty.opened_slot ?? 0)) {
        throw new BountyRefused(
          "that settlement predates the bounty — the board pays for walks it commissioned, not history",
        );
      }
      const expected = BigInt(bounty.amount_atomic);
      const credited = facts.deltas.some(
        (delta) => delta.owner === bounty.pay_to && delta.delta === expected,
      );
      const debited = facts.deltas.some(
        (delta) => delta.owner === input.payer && delta.delta <= -expected,
      );
      if (!credited || !debited) {
        throw new BountyRefused(
          `the transaction's USDC balance changes carry no transfer of ${bounty.amount_atomic} atomic units from ${input.payer} to the door's captured payTo — the settlement the bounty asked for is not in this transaction`,
        );
      }
      railLabel = "Solana";
      settledHeight = { settled_slot: facts.slot };
    } else {
      const claimChain = evmChainOf(bounty.network) ?? BASE_EVM;
      const receipt = await getReceipt(env, input.txHash, claimChain);
      if (!receipt || receipt.status !== "0x1") {
        throw new BountyRefused(
          `${claimChain.label} shows no successful transaction under that hash — nothing verified, nothing paid. The bounty's captured rail is ${claimChain.caip2}; a settlement on another chain cannot claim it`,
        );
      }
      const receiptBlock = Number.parseInt(receipt.blockNumber ?? "0x0", 16);
      if (receiptBlock < bounty.opened_block) {
        throw new BountyRefused(
          "that settlement predates the bounty — the board pays for walks it commissioned, not history",
        );
      }
      const transfer = usdcTransfers(receipt, claimChain).find(
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
      railLabel = claimChain.label;
      settledHeight = { settled_block: receiptBlock };
    }

    /*
     * OUR OWN KNOCK, beside their claim. The settlement above is
     * proven; what the door looks like is something this store can
     * see for itself, so it looks — one unpaid GET, the census's
     * battery, fail-soft: a knock that cannot be taken changes
     * nothing about the payout. Dynamic import: ward-round must not
     * be a static dependency of the board (it imports nothing from
     * here today, and a cycle here is the kind that deadlocks a
     * worker on a bad day).
     */
    const houseProbe = await import("@/services/ward-round")
      .then(({ probeHost }) => probeHost(env, bounty.target_url))
      .then((probe) => ({
        verdict:
          probe.verdict === "not_probed" ? ("unreachable" as const) : probe.verdict,
        failed: probe.failed,
        advisories: probe.advisories,
        ...(probe.battery ? { battery: probe.battery } : {}),
        ...(probe.latency_ms !== undefined ? { latency_ms: probe.latency_ms } : {}),
        at: new Date().toISOString(),
      }))
      .catch(() => undefined);

    // Rule 3, outbound: the address OUR money goes to, screened, fail
    // closed. The oracle needs no key; an unanswered screen pays nobody.
    // Read over the same endpoint ladder as the receipt above — a 429
    // from the public endpoint alone refused every claim for ninety
    // minutes on 2026-09-03 while the authenticated keys sat idle.
    const screen =
      options.screen ??
      oracleScreen(rpcEndpoints(env), options.fetch ?? fetch);
    const screened = await screen(input.payoutTo);
    if (screened.listed !== false) {
      if (screened.listed === null) {
        // Silence pages; a listing is the screen working and does not.
        await raiseScreenUnavailable(
          env,
          `bounty claim ${bounty.bounty_id}`,
          screened.source,
        );
      }
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
    // RESERVE, then sign. Written after the signature, this counter lost
    // every concurrent increment but one, so the weekly cap bounded
    // nothing and /bounties published a figure below what was paid.
    reserved = { week: weekKey, amount: bounty.reward_usd };
    await kvPut(env.COUNTERS, 
      KV_KEYS.bountyBudget(weekKey),
      String(spent + bounty.reward_usd),
    );

    const signer =
      options.signer ??
      (await fieldSignerFromKey(env.FIELD_WALLET_KEY as string));
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
        // Base58 is case-sensitive: a Solana id is kept as written.
        tx_hash: txId,
        payer: solanaRail ? input.payer : input.payer.toLowerCase(),
        payout_to: input.payoutTo.toLowerCase(),
        claimed_at: now.toISOString(),
        ...settledHeight,
        ...(houseProbe ? { house_probe: houseProbe } : {}),
        ...(input.observation
          ? { observation: input.observation.slice(0, BOUNTY_OBSERVATION_CAP) }
          : {}),
        ...(sanitizeReport(input.report)
          ? { report: sanitizeReport(input.report) as WalkReport }
          : {}),
        authorization_nonce: authorization.nonce,
        authorization_valid_before: authorization.validBefore,
      },
    };
    // txKey already holds this claim and the budget is already reserved;
    // both were taken before the signature existed.
    await saveBounty(env, paid);

    return {
      bounty_id: bounty.bounty_id,
      reward_usd: bounty.reward_usd,
      what_was_verified: `The chain's part: transaction ${txId} succeeded on ${railLabel} and carries a USDC transfer of exactly $${usdcFromUnits(BigInt(bounty.amount_atomic))} from your wallet to the door's payTo as this store captured it when the bounty opened, in a ${solanaRail ? "slot" : "block"} after the bounty existed, never claimed before. That is what the reward pays for.`,
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
  } catch (error) {
    await releaseClaim();
    throw error;
  }
}

/**
 * DID THE WALKER REDEEM IT? (2026-09-04, the keeper: "we still have
 * to test that they can claim it, cause it's unclaimed.")
 *
 * "Paid" in this store's books means a signed authorization went out.
 * Whether the recipient ever submitted it is the chain's fact, and
 * until 09-04 nobody asked: the page said "still redeemable" of every
 * live payout whether it had been redeemed an hour ago or never.
 *
 * HOW IT ASKS, REWRITTEN 2026-09-08. The first version read
 * AuthorizationUsed logs from the bounty's opening block to the head.
 * That range grows by 43,200 blocks a day on Base, and by 09-08 the
 * four paid bounties opened on 09-01 each asked for ~300,000 blocks in
 * one call — a width every endpoint refuses outright. The desk showed
 * "unknown" on all four while two of them had really been redeemed and
 * $0.50 had really left the wallet; the wallet cover, counting unknown
 * as promised, said $1.00 was still owed. A blind instrument that
 * fails soft looks exactly like a quiet one.
 *
 * So the question goes to the token's own state — one eth_call per
 * paid bounty, no block range to be capped, no ladder to exhaust
 * (base-rpc's authorizationUsed). What it costs is the redeeming
 * transaction hash, which is a log fact and not a state fact: a
 * redeemed payout is now reported with its hash only when an earlier
 * reading already found one. The money question answers either way,
 * and a read that fails still answers "unknown", never "not
 * redeemed".
 */
export type PayoutRedemption =
  | { state: "redeemed"; tx_hash?: string }
  | { state: "unredeemed" }
  | { state: "unknown"; problem: string };

/** Calls in flight at once — bounded, the same courtesy the ward round keeps. */
const REDEMPTION_BATCH = 5;

export async function payoutRedemptions(
  env: Env,
  bounties: readonly BountyRecord[],
  cap = 25,
): Promise<Record<string, PayoutRedemption>> {
  const out: Record<string, PayoutRedemption> = {};
  const paid = bounties
    .filter((bounty) => bounty.status === "paid" && bounty.claim)
    .slice(0, cap);
  if (paid.length === 0) return out;
  if (!env.FIELD_WALLET_KEY) {
    for (const bounty of paid) {
      out[bounty.bounty_id] = {
        state: "unknown",
        problem: "no field wallet on this deployment to ask the chain about",
      };
    }
    return out;
  }
  const authorizer = (await fieldSignerFromKey(env.FIELD_WALLET_KEY)).address;
  for (let start = 0; start < paid.length; start += REDEMPTION_BATCH) {
    await Promise.all(
      paid.slice(start, start + REDEMPTION_BATCH).map(async (bounty) => {
        try {
          const used = await authorizationUsed(
            env,
            authorizer,
            bounty.claim!.authorization_nonce,
            BASE_EVM,
          );
          out[bounty.bounty_id] = used
            ? { state: "redeemed" }
            : { state: "unredeemed" };
        } catch (error) {
          out[bounty.bounty_id] = {
            state: "unknown",
            problem: String(error instanceof Error ? error.message : error).slice(0, 160),
          };
        }
      }),
    );
  }
  return out;
}

export function livePayouts(
  bounties: readonly BountyRecord[],
  redemptions: Readonly<Record<string, PayoutRedemption>>,
  now: Date,
): BountyRecord[] {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return bounties.filter(
    (bounty) =>
      bounty.status === "paid" &&
      Number(bounty.claim?.authorization_valid_before ?? "0") > nowSeconds &&
      redemptions[bounty.bounty_id]?.state !== "redeemed",
  );
}
