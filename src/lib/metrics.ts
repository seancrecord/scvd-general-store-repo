import { canonicalAddress } from "@/lib/addresses";
import { listKeys } from "@/lib/kv-list";
import { sendAlert } from "@/lib/alerts";
import { inferChannel, isHouseTraffic } from "@/lib/channel";
import type { ChannelSignals, HouseSignals } from "@/lib/channel";
import { bulkGetJson, bulkGetText } from "@/lib/kv-bulk";
import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
/**
 * The venue register is the allowlist for this file's ?src= counters.
 * The raw string still rides the EVENT row verbatim (a hand test wants
 * its own name); only the COUNTER key is bounded, because that key is
 * the one a stranger could otherwise mint without limit.
 */
import { venueCounterKey } from "@/store/venues";
import type { Channel, Env, PayerRecord } from "@/types";

/** Ceiling on a metric counters scan. Named because an unnamed cap is a silent one. */
const METRIC_KEY_CAP = 5000;
/** Ceiling on a payer rows scan. Named because an unnamed cap is a silent one. */
const PAYER_KEY_CAP = 5000;

/**
 * The instrumentation ledger (RUN1_SYNTHESIS §instrumentation, plus the
 * Phase 1 attribution pass). Aggregate counters live in COUNTERS under
 * metric:<YYYY-MM>:<kind>:<rest>, kinds carry an "h" suffix for house
 * traffic so organic counts stay clean. Every 402, settle, and verify
 * also writes one event row (evt:*) with channel/ua/referrer/item,
 * kept 90 days: the falsification instrument. Counters are
 * read-modify-write; a lost increment under contention is acceptable
 * chaos at this counter's line speed.
 */

const EVENT_TTL_SECONDS = 90 * 86400;

export function metricsMonth(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Every month the store has been open, oldest first — the loop bound
 * for any all-time counter scan.
 *
 * IT LIVES HERE, next to the counters it enumerates, rather than in
 * services/stats where it was born. Moving it broke a cycle rather than
 * tidied one: services/rails needs this bound to scan the rail
 * counters, services/stats imports rails to publish the split, and
 * rails importing stats back closed a loop that showed up as an
 * unrelated test timing out under load — a module graph deadlock
 * wearing a five-second timeout. lib/ does not import services/, which
 * is the rule that keeps that from happening again.
 */
export function monthsSinceOpening(now: Date = new Date()): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(2026, 6, 1));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  while (cursor.getTime() <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/** Collapses a gated path to a stable per-item metric key. */
export function itemKeyFromPath(path: string): string {
  if (path.startsWith("/api/buy/")) {
    return path.slice("/api/buy/".length);
  }
  return path.replace(/^\//, "").replace(/\//g, ":");
}

async function bump(env: Env, key: string): Promise<void> {
  await bumpBy(env, key, 1);
}

async function bumpBy(env: Env, key: string, amount: number): Promise<void> {
  const current = await env.COUNTERS.get(key);
  await env.COUNTERS.put(
    key,
    String((current ? parseInt(current, 10) : 0) + amount),
  );
}

/** Day key inside the month, for the trend table. */
function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(8, 10);
}

/** USDC stored as integer millionths so counters stay integers. */
const USDC_MICRO = 1_000_000;

export type MetricEventKind =
  | "challenge"
  | "settle"
  | "verify"
  | "porch"
  | "decline";

export interface MetricEvent {
  kind: MetricEventKind;
  item: string;
  channel: Channel;
  house: boolean;
  at: string;
  user_agent?: string;
  referrer?: string;
  /** Declared ?source= value, recorded verbatim as a claim. */
  declared_source?: string;
  /**
   * The visitor's Signature-Agent header, recorded verbatim AS A
   * CLAIM — the store does not fetch the named directory or verify
   * the signature, and nothing downstream may present this as
   * verified. Same posture as the guestbook's verified_identity:
   * stored as claimed, labeled as unverified. It exists to answer one
   * census question cheaply — are Web Bot Auth signers showing up at
   * this door at all — before any verifying machinery earns its keep.
   */
  signature_agent_claim?: string;
  /** decline events: the facilitator's reason, kept, not discarded. */
  note?: string;
}

export interface EventSignals extends ChannelSignals, HouseSignals {
  declaredSource?: string;
  /** Raw Signature-Agent header, if the visitor sent one. A claim. */
  signatureAgent?: string;
}

function buildEvent(
  env: Env,
  kind: MetricEventKind,
  item: string,
  signals: EventSignals,
): MetricEvent {
  const event: MetricEvent = {
    kind,
    item,
    channel: inferChannel(signals),
    house: isHouseTraffic(env, signals),
    at: new Date().toISOString(),
  };
  if (signals.userAgent) {
    event.user_agent = signals.userAgent.slice(0, 200);
  }
  if (signals.referrer) {
    event.referrer = signals.referrer.slice(0, 200);
  }
  if (signals.declaredSource) {
    event.declared_source = signals.declaredSource.slice(0, 40);
  }
  if (signals.signatureAgent) {
    event.signature_agent_claim = signals.signatureAgent.slice(0, 200);
  }
  return event;
}

async function writeEvent(env: Env, event: MetricEvent): Promise<void> {
  const key = `evt:${invertedTimestamp(Date.now())}:${Math.random().toString(36).slice(2, 8)}`;
  await env.COUNTERS.put(key, JSON.stringify(event), {
    expirationTtl: EVENT_TTL_SECONDS,
  });
}

/**
 * Bucket suffix: "" organic, "h" house, "i" infrastructure. House wins
 * (the keeper testing from a crawler UA is still the keeper); settles
 * never bucket as infrastructure, a crawler that pays is a customer.
 */
function bucketSuffix(event: MetricEvent, allowInfra: boolean): string {
  if (event.house) {
    return "h";
  }
  if (allowInfra && event.channel === "infrastructure") {
    return "i";
  }
  return "";
}

/** A 402 went out. The organic issued/settled gap is the price signal. */
export async function recordChallengeIssued(
  env: Env,
  path: string,
  signals: EventSignals = {},
): Promise<void> {
  const event = buildEvent(env, "challenge", itemKeyFromPath(path), signals);
  const suffix = bucketSuffix(event, true);
  await bump(env, KV_KEYS.metric(metricsMonth(), `402${suffix}`, event.item));

  // THE INFRASTRUCTURE DIET, 2026-07-28. A crawler 402 used to cost
  // three KV writes; it now costs one.
  //
  // NOT a rescue: Cloudflare is on Workers Paid, so no daily write cap
  // is biting. This is headroom and hygiene — at the observed volume
  // (one day alone put ~1,000 organic 402s through, with the noise
  // floor several times that) two of every three crawler writes bought
  // nothing, and a counter under contention loses increments whoever
  // is paying.
  //
  // The two writes dropped for infrastructure carry nothing the
  // remaining one doesn't:
  //
  //   src402i:<channel> — the channel is definitionally
  //     "infrastructure" for every one of these rows, so the key was a
  //     single counter incremented on every crawler hit. Maximum
  //     contention, zero information: it only ever equalled the sum of
  //     402i.
  //   the evt: row — the raw rows exist so the ORGANIC column can be
  //     re-read with a better crawler table later. A row already
  //     classified as machinery at write time has nothing to
  //     reclassify INTO. The rows that matter to the recount and the
  //     walk detector are the ones labelled organic, and every one of
  //     those is still written.
  //
  // What this costs, stated rather than hidden: /admin/census's
  // "walkers" list loses admitted crawlers. Its "undeclared walkers"
  // list — the only one that asks for work — is untouched, because
  // those rows are organic-labelled by definition.
  const isNoiseFloor = suffix === "i";
  if (!isNoiseFloor) {
    // Who's window-shopping, by channel, the diagnosis column for
    // "challenges without settles: shoppers or scanners?"
    await bump(
      env,
      KV_KEYS.metric(metricsMonth(), `src402${suffix}`, event.channel),
    );
  }
  if (suffix === "") {
    // Organic day counter for the trend table.
    await bump(env, KV_KEYS.metric(metricsMonth(), "d402", dayKey()));
  }
  if (event.declared_source && !event.house) {
    // ?src= venue markers: the free-papers measurement.
    await bump(
      env,
      KV_KEYS.metric(
        metricsMonth(),
        "venue",
        venueCounterKey(event.declared_source),
      ),
    );
  }
  if (!isNoiseFloor) {
    await writeEvent(env, event);
  }
}

/**
 * A signed payment was offered and turned away. The reason is the
 * instrument: it distinguishes "buyer's wallet is short" from "our
 * pipeline broke," which are different emergencies.
 */

/**
 * THE FIRST OUTSIDE SIGNATURE — fires once, ever.
 *
 * CV's refinement, 2026-07-29, and it changed the trigger: keyed to a
 * signature PRESENTED rather than a payment settled. A stranger who
 * tries and bounces is the same magnitude of news as one who clears,
 * and arguably more useful, because a decline is the thing we can still
 * fix. Waiting for a clean settle would have let the 2026-07-28 client
 * — the first outside wallet ever to try here — pass unflagged because
 * their client was malformed.
 *
 * HOUSE IS DECIDED BY THE SAME DEFINITION house-ledger.json PUBLISHES,
 * also his: `event.house` comes from isHouseTraffic over the wallet list
 * and the house secret, which is exactly what the public document
 * declares. A second private definition of "family" that could drift
 * from the published one is worse than no alarm.
 */
async function raiseFirstOutsideSignature(
  env: Env,
  event: MetricEvent,
  outcome: "settled" | "declined",
): Promise<void> {
  if (event.house) {
    return;
  }
  if (await env.COUNTERS.get(KV_KEYS.firstSignature)) {
    return;
  }
  await env.COUNTERS.put(
    KV_KEYS.firstSignature,
    JSON.stringify({ item: event.item, outcome, at: event.at }),
  );
  await sendAlert(env, {
    condition: "first_outside_signature",
    detail: `FIRST OUTSIDE PAYMENT SIGNATURE, EVER. A wallet that is not ours presented a signature at ${event.item} and it ${outcome}. Client: ${event.user_agent ?? "(no user-agent)"}. This is the event the front page has been waiting on. If it declined, /admin/declines names the field; if it settled, the First Dollar frame has filled and the books have their first organic row.`,
    key: "once",
  }).catch(() => undefined);
}

export async function recordPaymentDecline(
  env: Env,
  path: string,
  reason: string,
  signals: EventSignals = {},
): Promise<void> {
  const event = buildEvent(env, "decline", itemKeyFromPath(path), signals);
  event.note = reason.slice(0, 200);
  await bump(
    env,
    KV_KEYS.metric(
      metricsMonth(),
      `decl${bucketSuffix(event, false)}`,
      event.item,
    ),
  );
  await writeEvent(env, event);
  await raiseFirstOutsideSignature(env, event, "declined");
  if (!event.house) {
    // RAISE A HAND. An outside decline is the rarest and most valuable
    // event this store can have: somebody opened a wallet at our door
    // and did not get through. On 2026-07-28 a real buyer was turned
    // away three times and nothing said so — the reasons were in KV,
    // no surface read them, and no alarm fired. Deduped by item+reason
    // so a client hitting the same wall nags once every six hours
    // rather than on every attempt.
    await sendAlert(env, {
      condition: "payment_declined",
      detail: `A payment was offered at ${path} and declined: ${event.note}. Client: ${event.user_agent ?? "(no user-agent)"}. Somebody is trying to buy. The reading is at /admin/declines.`,
      key: `${event.item}:${event.note}`,
    }).catch(() => undefined);
  }
}

/**
 * Front-porch logging: one event row per free-tier visit. Paths and
 * headers only, no bodies, no cookies, nothing client-side. Rows use
 * unique keys (no counter contention); a per-isolate token bucket
 * caps writes at crawler volume, so porch counts are floors under
 * storm conditions. Paid events are never sampled.
 */
const PORCH_WRITES_PER_MINUTE = 100;
let porchBudgetMinute = "";
let porchBudgetUsed = 0;

export async function recordPorchVisit(
  env: Env,
  surface: string,
  signals: EventSignals = {},
): Promise<void> {
  const minute = new Date().toISOString().slice(0, 16);
  if (minute !== porchBudgetMinute) {
    porchBudgetMinute = minute;
    porchBudgetUsed = 0;
  }
  if (porchBudgetUsed >= PORCH_WRITES_PER_MINUTE) {
    return;
  }
  porchBudgetUsed += 1;
  const event = buildEvent(env, "porch", surface, signals);
  // Aggregate counter alongside the event row, so the porch table
  // reads from a handful of keys instead of scanning event rows.
  const suffix = bucketSuffix(event, true);
  await bump(
    env,
    KV_KEYS.metric(
      metricsMonth(),
      `porch${suffix}`,
      suffix === "" ? `${surface}:${event.channel}` : surface,
    ),
  );
  if (event.declared_source && !event.house) {
    await bump(
      env,
      KV_KEYS.metric(
        metricsMonth(),
        "venue",
        venueCounterKey(event.declared_source),
      ),
    );
  }
  // Same diet as the challenge path: a crawler reading the porch is
  // the noise floor, and the aggregate counter above already says how
  // much of it there was. The bell ledger and the porch surface tables
  // read organic rows, which are all still written.
  if (suffix !== "i") {
    await writeEvent(env, event);
  }
}

/** Somebody re-checked one of our signatures. Re-verification is demand. */
/**
 * HOW OLD THE ARTIFACT WAS WHEN SOMEBODY CHECKED IT, bucketed.
 *
 * THE QUESTION THIS ANSWERS, and it was called unanswerable earlier
 * tonight. Three pathways could bring an agent here unprompted: it
 * recognises a need and goes shopping (rare — needs an operator who
 * granted both open search AND spending autonomy), it knows us from
 * training data (closed; an unknown brand surfaces ~6% of the time
 * against a recognised one), or an artifact of ours travels and a
 * LATER agent acts on it. PROBLEMS.md #3 records the third as "no
 * prior art found, positive or negative" — genuinely unmeasured.
 *
 * We cannot measure it directly. /api/verify is an unauthenticated
 * GET, so we do not know who is asking and are not going to start
 * asking: no IPs, no cookies, no wallet on a read. That constraint is
 * not negotiable and it rules out attributing a caller.
 *
 * What we CAN see without identifying anybody is TIME. A certificate
 * checked minutes after minting is almost certainly its buyer looking
 * at what it just bought. A certificate checked three weeks later is
 * being read by somebody whose session did not mint it — the buying
 * context is long gone. That is artifact travel, observed without
 * knowing a single thing about who travelled with it.
 *
 * FOUR BUCKETS, so the key space is bounded no matter the volume, and
 * a proxy rather than a proof — stated as such wherever it is read.
 */
export function verifyAgeBucket(mintedIso: string, nowMs: number): string {
  const minted = Date.parse(mintedIso);
  if (!Number.isFinite(minted)) {
    return "unknown_age";
  }
  const hours = (nowMs - minted) / 3_600_000;
  if (hours < 1) return "under_1h";
  if (hours < 24) return "under_1d";
  if (hours < 24 * 7) return "under_1w";
  return "over_1w";
}

export async function recordVerifyCall(
  env: Env,
  artifactItem: string,
  signals: EventSignals = {},
  mintedIso?: string,
): Promise<void> {
  const event = buildEvent(env, "verify", artifactItem, signals);
  await bump(
    env,
    KV_KEYS.metric(
      metricsMonth(),
      `verify${bucketSuffix(event, true)}`,
      event.item,
    ),
  );
  /**
   * Organic only, and never for house traffic: our own re-checks would
   * be indistinguishable from a stranger's and would be the loudest
   * voice in a signal this quiet.
   */
  if (mintedIso && !event.house) {
    await bump(
      env,
      KV_KEYS.metric(
        metricsMonth(),
        "verifyage",
        verifyAgeBucket(mintedIso, Date.now()),
      ),
    );
  }
  await writeEvent(env, event);
}

/** Which PWID tier the buyer chose; elasticity signal. */
function tierLabel(paidUsdc: number, minimumUsdc: number): string {
  if (minimumUsdc <= 0) {
    return "1x";
  }
  const ratio = Math.round(paidUsdc / minimumUsdc);
  return ratio >= 5 ? "5x" : ratio >= 2 ? "2x" : "1x";
}

export interface SettlementSignals extends EventSignals {
  paidUsdc: number;
  minimumUsdc: number;
  /**
   * The chain the money actually arrived on, as the facilitator
   * reported it. Optional because a settle can come back without one;
   * an absent rail counts as a settle with no rail rather than as a
   * guess, same rule as an absent payer.
   */
  network?: string;
}

/**
 * THE RAIL METER, and why it lives at the till instead of on the
 * certificates where it started.
 *
 * The first cut of the storefront's Base/Solana split read the rail off
 * the certificates, because a certificate carries the settlement
 * network and is the only all-time record of it. That worked for every
 * sale that mints a certificate — and PENNY PAGES MINT NONE. The
 * Almanac, the Gazette's issues and the zodiac archive take real money
 * through this exact till and deliberately issue no artifact, so each
 * one landed in a third bucket on the front of the store labelled
 * "unattributed", which reads to a stranger like a chain we can't name
 * or money we lost. It was neither: it was a page we sold and did not
 * write the rail down for.
 *
 * A wording fix would have been a lie with a nicer font, and the hole
 * would have reopened the next time this store sold something that
 * mints nothing. So the measurement moved to the one place every
 * settle passes: this function, which is what PRODUCES the organic
 * count. The count and the rail are now written by the same call on
 * the same substrate — a sale that skipped this would not be an
 * organic sale either — so the two cannot come apart.
 *
 * Rails are collapsed to base/solana/other rather than stored raw: the
 * counter key is derived from a facilitator-supplied string, and an
 * unbounded key is one a stranger could mint without limit. "other"
 * is a real answer and gets its own counter rather than being dropped.
 */
export type SettlementRail = "base" | "solana" | "other";

export function railOf(network: string | undefined): SettlementRail | null {
  if (!network) {
    return null;
  }
  if (network.startsWith("solana")) {
    return "solana";
  }
  return network.startsWith("eip155") || network.startsWith("base")
    ? "base"
    : "other";
}

/** Money settled: count it, tier it, attribute it, remember the wallet. */
export async function recordSettlement(
  env: Env,
  path: string,
  signals: SettlementSignals,
): Promise<void> {
  const month = metricsMonth();
  const event = buildEvent(env, "settle", itemKeyFromPath(path), signals);
  // Settles never bucket as infrastructure: a crawler that pays is a customer.
  await bump(
    env,
    KV_KEYS.metric(month, `paid${bucketSuffix(event, false)}`, event.item),
  );
  await bump(
    env,
    KV_KEYS.metric(
      month,
      `tier${bucketSuffix(event, false)}`,
      `${event.item}:${tierLabel(signals.paidUsdc, signals.minimumUsdc)}`,
    ),
  );
  await bump(
    env,
    KV_KEYS.metric(month, `src${bucketSuffix(event, false)}`, event.channel),
  );
  /**
   * The rail, counted beside the sale rather than inferred from an
   * artifact the sale may not mint. The meter's start instant is
   * stamped by whichever settle gets here first and never moved: it is
   * the seam the certificate walk stops at, so no sale is counted on
   * both sides of it.
   */
  const rail = railOf(signals.network);
  if (rail) {
    if (!(await env.COUNTERS.get(KV_KEYS.railMeterStart))) {
      await env.COUNTERS.put(KV_KEYS.railMeterStart, event.at);
    }
    await bump(
      env,
      KV_KEYS.metric(month, `rail${bucketSuffix(event, false)}`, rail),
    );
    // The MONEY per rail, not just the count — the booked side of the
    // net-by-chain statement. House rides its own suffix as always,
    // but the statement reads both: chain inflow cannot tell family
    // money from a stranger's, so the side that faces it must not
    // either.
    await bumpBy(
      env,
      KV_KEYS.metric(month, `revrail${bucketSuffix(event, false)}`, rail),
      Math.round(signals.paidUsdc * USDC_MICRO),
    );
  }
  // Revenue, organic and house apart, in integer millionths of USDC.
  await bumpBy(
    env,
    KV_KEYS.metric(month, `rev${bucketSuffix(event, false)}`, "total"),
    Math.round(signals.paidUsdc * USDC_MICRO),
  );
  if (bucketSuffix(event, false) === "") {
    // The First Dollar: the empty frame by the register fills exactly
    // once, with the first organic settlement, forever.
    const frame = await env.COUNTERS.get(KV_KEYS.firstDollar);
    if (!frame) {
      await env.COUNTERS.put(
        KV_KEYS.firstDollar,
        JSON.stringify({
          item: event.item,
          paid_usdc: signals.paidUsdc,
          at: event.at,
        }),
      );
    }
    await bump(env, KV_KEYS.metric(month, "dpaid", dayKey()));
  }
  if (event.declared_source && !event.house) {
    await bump(
      env,
      KV_KEYS.metric(month, "venue", venueCounterKey(event.declared_source)),
    );
  }
  await writeEvent(env, event);
  await raiseFirstOutsideSignature(env, event, "settled");
  if (signals.payer) {
    await recordPayerSeen(env, signals.payer);
  } else {
    // Money moved and no wallet came back with it. Counted, so the gap
    // between settle counters and payer rows stays explainable instead
    // of becoming a mystery someone re-derives in six months.
    await bump(env, KV_KEYS.metric(month, "nopayer", event.item));
  }
}

async function recordPayerSeen(env: Env, address: string): Promise<void> {
  const canonical = canonicalAddress(address);
  const key = KV_KEYS.payer(canonical);
  const now = new Date().toISOString();
  let existing = await env.COUNTERS.get<PayerRecord>(key, "json");
  // Self-heal: rows written before the canonical-address fix live
  // under a lowercased key that, for a base58 address, is not the
  // real wallet. Fold that history into the canonical row and
  // delete the corrupted one, so one wallet never shows as two.
  const legacyKey = `${KV_KEYS.payerPrefix}${address.trim().toLowerCase()}`;
  if (legacyKey !== key) {
    const legacy = await env.COUNTERS.get<PayerRecord>(legacyKey, "json");
    if (legacy) {
      existing = existing
        ? {
            ...existing,
            purchases: existing.purchases + legacy.purchases,
            first_seen:
              legacy.first_seen < existing.first_seen
                ? legacy.first_seen
                : existing.first_seen,
          }
        : legacy;
      await env.COUNTERS.delete(legacyKey);
    }
  }
  const record: PayerRecord = existing
    ? {
        ...existing,
        address: canonical,
        last_seen: now,
        purchases: existing.purchases + 1,
      }
    : {
        address: canonical,
        first_seen: now,
        last_seen: now,
        purchases: 1,
      };
  await env.COUNTERS.put(key, JSON.stringify(record));
}

export interface LedgerRow {
  challenges: number;
  challengesHouse: number;
  challengesInfra: number;
  settled: number;
  settledHouse: number;
  verifies: number;
  verifiesHouse: number;
  verifiesInfra: number;
  tiers: Record<string, number>;
}

export interface MonthLedger {
  month: string;
  items: Record<string, LedgerRow>;
  /** channel -> organic settled count */
  channels: Record<string, number>;
  channelsHouse: Record<string, number>;
  /** channel -> 402s issued (organic / house / infrastructure). */
  channels402: Record<string, number>;
  channels402House: Record<string, number>;
  channels402Infra: Record<string, number>;
  /** day-of-month -> organic counts, the trend table. */
  days: Record<string, { challenges: number; settles: number }>;
  /** ?src= venue markers seen on organic traffic, verbatim claims. */
  venues: Record<string, number>;
  /**
   * item -> settles that arrived with no payer address. Named so the
   * gap between settle counters and payer rows stays explainable.
   */
  settlesWithoutPayer: Record<string, number>;
  /** USDC, organic and house apart. */
  revenueUsdc: number;
  revenueHouseUsdc: number;
}

function emptyRow(): LedgerRow {
  return {
    challenges: 0,
    challengesHouse: 0,
    challengesInfra: 0,
    settled: 0,
    settledHouse: 0,
    verifies: 0,
    verifiesHouse: 0,
    verifiesInfra: 0,
    tiers: {},
  };
}

/**
 * The founding $0.50 hello settle (2026-07-22, tx 0x47c8fee…50bc9c)
 * predates this instrumentation. Entered by hand as house/founding so
 * the books open complete.
 *
 * It is also the whole of the "off-by-one" the books have shown since
 * July, and it is not a bug: a settle counted here writes a counter,
 * and a settle that ran through recordSettlement ALSO writes a payer
 * row. This one never ran through recordSettlement, so it has the
 * counter and no payer row, permanently. Settle counters will
 * therefore always exceed the sum of payer purchases by exactly
 * FOUNDING_SETTLES_WITHOUT_PAYER_ROW. Any other gap is a real bug —
 * which is the point of naming this one, so the next discrepancy
 * cannot hide behind it.
 */
const FOUNDING_BACKFILL = { month: "2026-07", item: "hello" } as const;

/** The founding settle: on the counters, never on a payer row. */
export const FOUNDING_SETTLES_WITHOUT_PAYER_ROW = 1;

/**
 * THE RECONCILIATION: every settle the counters know, against every
 * purchase the payer rows know, all-time on both sides — the payer
 * rows have no month, so comparing them to one month's counters would
 * manufacture a discrepancy every time the calendar turned.
 *
 * Two differences are expected and both are named:
 *
 *   1. the founding settle, which predates the instrument entirely;
 *   2. settles the facilitator returned without a payer address, which
 *      bump a counter and have no wallet to write a row for.
 *
 * Anything left after those two is unexplained, and unexplained means
 * a counter moved without its row — the bug that would otherwise wait
 * until it reads "the books say 12, the wallet says 11."
 */
export interface SettleReconciliation {
  counter_settles: number;
  payer_purchases: number;
  founding: number;
  /** Settles that arrived with no payer address to attribute them to. */
  unattributed: number;
  /** counter − payer − founding − unattributed. Zero is healthy. */
  unexplained: number;
  /**
   * WHAT A ZERO HERE DOES NOT MEAN, carried on the output because a
   * number that reads healthy is worse than no number when it is
   * blind (problem ledger #18).
   *
   * Both sides of this reconciliation — the settle counters and the
   * payer rows — are written by recordSettlement, which runs BEFORE
   * the handler that mints the artifact. So a settled payment whose
   * delivery threw, returned a non-2xx, or never finished bumps both
   * sides equally and lands here as `unexplained: 0`. The books
   * balance and the buyer got nothing. Delivery is a different axis
   * and it has its own instrument.
   */
  does_not_cover: string;
  delivery_audit: string;
}

const RECONCILIATION_BLIND_SPOT =
  "This compares money-in against money-attributed. It does NOT cover DELIVERY: both sides are written before the handler that mints the artifact runs, so a sale that settled and delivered nothing balances here exactly like a healthy one. Delivery has its own instrument.";

/**
 * Reads its own payer rows rather than taking the desk's list, which
 * is truncated for display: a reconciliation that silently compares
 * against the first fifty wallets is worse than none.
 */
export async function reconcileSettles(
  env: Env,
): Promise<SettleReconciliation> {
  const [metrics, payerKeys] = await Promise.all([
    listKeys(env.COUNTERS, { prefix: "metric:", cap: METRIC_KEY_CAP }),
    listKeys(env.COUNTERS, { prefix: KV_KEYS.payerPrefix, cap: PAYER_KEY_CAP }),
  ]);
  const [metricValues, payerValues] = await Promise.all([
    bulkGetText(
      env.COUNTERS,
      metrics.names
        .filter((name) => {
          const kind = name.split(":")[2] ?? "";
          return kind === "paid" || kind === "paidh" || kind === "nopayer";
        }),
    ),
    bulkGetJson<PayerRecord>(
      env.COUNTERS,
      payerKeys.names,
    ),
  ]);

  let counterSettles = FOUNDING_SETTLES_WITHOUT_PAYER_ROW;
  let unattributed = 0;
  for (const [name, raw] of metricValues) {
    const value = parseInt(raw ?? "", 10);
    if (!Number.isFinite(value)) continue;
    if ((name.split(":")[2] ?? "") === "nopayer") {
      unattributed += value;
    } else {
      counterSettles += value;
    }
  }

  let payerPurchases = 0;
  for (const record of payerValues.values()) {
    if (record) payerPurchases += record.purchases;
  }

  return {
    counter_settles: counterSettles,
    payer_purchases: payerPurchases,
    founding: FOUNDING_SETTLES_WITHOUT_PAYER_ROW,
    unattributed,
    unexplained:
      counterSettles -
      payerPurchases -
      FOUNDING_SETTLES_WITHOUT_PAYER_ROW -
      unattributed,
    does_not_cover: RECONCILIATION_BLIND_SPOT,
    delivery_audit: "/admin/deliveries",
  };
}

/** Everything the month's counters know, organic and house apart. */
export async function readMonthLedger(
  env: Env,
  month: string = metricsMonth(),
): Promise<MonthLedger> {
  const ledger: MonthLedger = {
    month,
    items: {},
    channels: {},
    channelsHouse: {},
    channels402: {},
    channels402House: {},
    channels402Infra: {},
    days: {},
    venues: {},
    settlesWithoutPayer: {},
    revenueUsdc: 0,
    revenueHouseUsdc: 0,
  };
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.metricMonthPrefix(month),
    cap: METRIC_KEY_CAP,
  });
  const values = await bulkGetText(
    env.COUNTERS,
    listed.names,
  );
  for (const name of listed.names) {
    const value = parseInt(values.get(name) ?? "0", 10);
    const rest = name.slice(KV_KEYS.metricMonthPrefix(month).length);
    const [kind, ...parts] = rest.split(":");
    const tail = parts.join(":");
    if (kind?.startsWith("porch")) {
      continue; // The porch table reads these; the ledger doesn't.
    }
    if (kind === "d402" || kind === "dpaid") {
      const day = (ledger.days[tail] ??= { challenges: 0, settles: 0 });
      if (kind === "d402") day.challenges = value;
      else day.settles = value;
      continue;
    }
    if (kind === "venue") {
      ledger.venues[tail] = value;
      continue;
    }
    if (kind === "nopayer") {
      ledger.settlesWithoutPayer[tail] = value;
      continue;
    }
    if (kind === "rev" || kind === "revh") {
      const usdc = value / 1_000_000;
      if (kind === "rev") ledger.revenueUsdc += usdc;
      else ledger.revenueHouseUsdc += usdc;
      continue;
    }
    if (kind === "src") {
      ledger.channels[tail] = value;
      continue;
    }
    if (kind === "srch") {
      ledger.channelsHouse[tail] = value;
      continue;
    }
    if (kind === "src402") {
      ledger.channels402[tail] = value;
      continue;
    }
    if (kind === "src402h") {
      ledger.channels402House[tail] = value;
      continue;
    }
    if (kind === "src402i") {
      ledger.channels402Infra[tail] = value;
      continue;
    }
    if (kind === "tier" || kind === "tierh") {
      const splitAt = tail.lastIndexOf(":");
      const row = (ledger.items[tail.slice(0, splitAt)] ??= emptyRow());
      const tier =
        tail.slice(splitAt + 1) + (kind === "tierh" ? " (house)" : "");
      row.tiers[tier] = value;
      continue;
    }
    const row = (ledger.items[tail] ??= emptyRow());
    if (kind === "402") row.challenges = value;
    else if (kind === "402h") row.challengesHouse = value;
    else if (kind === "402i") row.challengesInfra = value;
    else if (kind === "paid") row.settled = value;
    else if (kind === "paidh") row.settledHouse = value;
    else if (kind === "verify") row.verifies = value;
    else if (kind === "verifyh") row.verifiesHouse = value;
    else if (kind === "verifyi") row.verifiesInfra = value;
  }
  if (month === FOUNDING_BACKFILL.month) {
    const row = (ledger.items[FOUNDING_BACKFILL.item] ??= emptyRow());
    row.settledHouse += 1;
    ledger.channelsHouse["direct (founding, by hand)"] =
      (ledger.channelsHouse["direct (founding, by hand)"] ?? 0) + 1;
  }
  return ledger;
}

/**
 * A ledger of zeroes, for when the read fails and a page still has to
 * render. Extracted 2026-07-30 from inside the office route, where it
 * sat as an inline literal — a second caller would have copied it, and
 * a copied shape drifts the same way a copied count does.
 */
export function emptyMonthLedger(month: string = metricsMonth()): MonthLedger {
  return {
    month,
    items: {},
    channels: {},
    channelsHouse: {},
    channels402: {},
    channels402House: {},
    channels402Infra: {},
    days: {},
    venues: {},
    settlesWithoutPayer: {},
    revenueUsdc: 0,
    revenueHouseUsdc: 0,
  };
}

export interface PorchLedger {
  /** surface -> bucket ("organic" | "house" | "infrastructure") -> count */
  surfaces: Record<string, Record<string, number>>;
  /** organic porch visits total */
  organicVisits: number;
  /** organic 402s per organic porch visit, the conversion story. */
  porchToPurchase: number | null;
  /** True when the row scan hit its cap; counts are floors. */
  truncated: boolean;
}

/**
 * The front-porch section, read from the monthly porch aggregates
 * (written alongside each event row) in one list + one bulk read.
 * Uniqueness is deliberately unavailable, no cookies, no IP
 * retention, so porch-to-purchase is organic 402s per organic
 * visit, stated as a rate, not unique heads.
 */
export async function readPorchLedger(
  env: Env,
  month: string = metricsMonth(),
): Promise<PorchLedger> {
  const porch: PorchLedger = {
    surfaces: {},
    organicVisits: 0,
    porchToPurchase: null,
    truncated: false,
  };
  const prefix = KV_KEYS.metricMonthPrefix(month);
  const listed = await listKeys(env.COUNTERS, { prefix, cap: METRIC_KEY_CAP });
  const names = listed.names
    .filter((name) => {
      const kind = name.slice(prefix.length).split(":")[0] ?? "";
      return kind.startsWith("porch") || kind === "src402";
    });
  const values = await bulkGetText(env.COUNTERS, names);
  let organicChallenges = 0;
  for (const name of names) {
    const value = parseInt(values.get(name) ?? "0", 10);
    const rest = name.slice(prefix.length);
    const [kind, ...parts] = rest.split(":");
    if (kind === "src402") {
      organicChallenges += value;
      continue;
    }
    if (kind === "porch") {
      // Organic rows carry surface:channel.
      const channel = parts.pop() ?? "unknown";
      const surfaceName = parts.join(":") || "unknown";
      const surface = (porch.surfaces[surfaceName] ??= {});
      surface["organic"] = (surface["organic"] ?? 0) + value;
      surface[`organic:${channel}`] =
        (surface[`organic:${channel}`] ?? 0) + value;
      porch.organicVisits += value;
      continue;
    }
    if (kind === "porchh" || kind === "porchi") {
      const bucket = kind === "porchh" ? "house" : "infrastructure";
      const surface = (porch.surfaces[parts.join(":")] ??= {});
      surface[bucket] = (surface[bucket] ?? 0) + value;
    }
  }
  if (porch.organicVisits > 0) {
    porch.porchToPurchase =
      Math.round((organicChallenges / porch.organicVisits) * 1000) / 1000;
  }
  return porch;
}

/**
 * THE PRICED EVENTS UP CLOSE — challenges, settles AND declines.
 *
 * Was challenges only, and that was a display gap with teeth. The desk
 * showed challenge ROWS beside settle COUNTERS and invited the reader to
 * compare them as though they described one thing; they describe two
 * different HTTP requests. A buyer's first request carries no payment
 * header and gets a 402; the second carries the signature and settles.
 * Those requests can legitimately differ in headers, so they can
 * legitimately differ in channel — a bare fetch that gets a price and
 * then retries through a client library that sets a user-agent is
 * "unknown" on the way in and "direct" on the way through.
 *
 * FOUND 2026-07-30 BY THE KEEPER on the first organic settle: the
 * Sources table showed it under "direct" while the event row on the
 * same page said "unknown". He read it as a reconciliation bug between
 * two aggregates. It was neither aggregate being wrong — it was that
 * NO SURFACE ANYWHERE SHOWED A SETTLE'S OWN ROW, so the nearest row
 * (its challenge) got read as the purchase.
 *
 * A page that makes a correct number look like a contradiction costs
 * the same as a wrong one, and is harder to stop believing.
 */
export async function listRecentPricedEvents(
  env: Env,
  limit = 15,
): Promise<MetricEvent[]> {
  // Newest first by key design; one list + one bulk read, bounded.
  const listed = await listKeys(env.COUNTERS, { prefix: "evt:", cap: 100 });
  const names = listed.names;
  const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
  const events: MetricEvent[] = [];
  for (const name of names) {
    if (events.length >= limit) {
      break;
    }
    const event = values.get(name);
    if (
      event?.kind === "challenge" ||
      event?.kind === "settle" ||
      event?.kind === "decline"
    ) {
      events.push(event);
    }
  }
  return events;
}

/**
 * EVERY PRICED EVENT FOR ONE ITEM — the answer to "it scrolled off."
 *
 * The desk shows the last fifteen priced events, newest first, which is
 * the right shape for a glance and the wrong shape for a question. On
 * 2026-07-30 the keeper went looking for the settle row of the store's
 * FIRST ORGANIC SALE and could not find it: a health-check bot had hit
 * eleven items fourteen minutes later and pushed it out of the window.
 * The row existed. The page just could not reach it.
 *
 * "The answer exists but scrolled off the page" is its own kind of
 * admin gap — not a wrong number, not a missing number, an unreachable
 * one — and re-pulling until it surfaces is not a lookup, it is a
 * lottery. This walks the raw rows for one item key and returns
 * everything, oldest included, with an explicit report of how far back
 * it got so a NOT FOUND can be told apart from a NOT REACHED.
 */
export interface ItemEventHistory {
  item: string;
  events: MetricEvent[];
  rows_scanned: number;
  /** True when the scan hit its cap with rows still unread. */
  capped: boolean;
  /** Timestamp of the oldest row reached, so "not found" has a floor. */
  oldest_row_seen: string | null;
}

export async function listEventsForItem(
  env: Env,
  item: string,
  scanCap = 4000,
): Promise<ItemEventHistory> {
  const history: ItemEventHistory = {
    item,
    events: [],
    rows_scanned: 0,
    capped: false,
    oldest_row_seen: null,
  };
  let cursor: string | undefined;
  while (history.rows_scanned < scanCap) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      if (history.rows_scanned >= scanCap) {
        history.capped = true;
        break;
      }
      const event = values.get(name);
      if (!event) continue;
      history.rows_scanned += 1;
      history.oldest_row_seen = event.at;
      if (event.item === item) {
        history.events.push(event);
      }
    }
    if (listed.list_complete || history.rows_scanned >= scanCap) {
      history.capped = history.capped || !listed.list_complete;
      break;
    }
    cursor = listed.cursor;
  }
  return history;
}

/**
 * Recent porch events for one surface, read from the raw 90-day rows
 * (the aggregates only count from their deploy; the rows remember).
 * Bounded scan: rare surfaces like the bell can sit deep in the log,
 * so this walks further than the challenge lister, still capped.
 */
export async function listRecentPorchEvents(
  env: Env,
  surface: string,
  limit = 25,
): Promise<MetricEvent[]> {
  const events: MetricEvent[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  const SCAN_CAP = 3000;
  while (events.length < limit && scanned < SCAN_CAP) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    scanned += names.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      if (events.length >= limit) {
        break;
      }
      const event = values.get(name);
      if (event?.kind === "porch" && event.item === surface) {
        events.push(event);
      }
    }
    if (listed.list_complete) {
      break;
    }
    cursor = listed.cursor;
  }
  return events;
}

export interface FirstDollar {
  item: string;
  paid_usdc: number;
  at: string;
}

/** What the frame by the register holds. Null means "It's waiting." */
export async function getFirstDollar(env: Env): Promise<FirstDollar | null> {
  return env.COUNTERS.get<FirstDollar>(KV_KEYS.firstDollar, "json");
}

/** Recent paying wallets, for the cohort/wash-filter review. */
export async function listPayers(env: Env, limit = 50): Promise<PayerRecord[]> {
  const listed = await listKeys(env.COUNTERS, { prefix: KV_KEYS.payerPrefix, cap: limit });
  const values = await bulkGetJson<PayerRecord>(
    env.COUNTERS,
    listed.names,
  );
  const payers: PayerRecord[] = [];
  for (const record of values.values()) {
    if (record) {
      payers.push(record);
    }
  }
  payers.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  return payers;
}
