import {
  BASE_EVM,
  POLYGON_EVM,
  getBlockNumber,
  usdcTransfersToAny,
  type EvmChain,
} from "@/lib/base-rpc";
import { latestWardRound, type WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * THE INFLOW CENSUS — does anyone actually PAY these asks?
 *
 * Ruled 2026-08-28, T1 ONLY, on the instrument audit's finding that
 * this store had captured every door's payTo since 2026-08-20 under
 * a comment calling inflows "the first honest signal of whether
 * anyone PAYS an ask, not just quotes one" — and had never once read
 * them. The readers ran daily, pointed at our own wallets and at the
 * wallets a customer paid us to read. Never at the addresses we
 * filed weekly.
 *
 * WHAT T1 MEANS AND WHY IT IS THE WHOLE OF IT. The keeper's ruling
 * carries a correction: the G2 tiers were ruled for ADVERTISEMENT
 * history — which doors advertise which address — and an inflow is a
 * different fact. Advertisement is what a party PUBLISHED about
 * itself, in its own 402. An inflow is what a party EARNED, which it
 * published nothing about. Both are public chain data; they are not
 * the same act, so this needed its own first ruling and got one:
 * counts, no addresses, no hosts, and never on a named door's page.
 *
 * The three reasons T2 stayed shut, recorded because the next person
 * to reach for it deserves them: a published zero is the modal case
 * in a market this young and the least reliable number we could
 * print (rule 52 — rotated address, a rail we do not read, a netting
 * facilitator, a door that opened Tuesday); shared and facilitator
 * wallets make an inflow unattributable to the door whose page it
 * would sit on; and "has been paid", published as a trust signal, is
 * bought for a few cents of self-payment, which makes it a signal we
 * could not defend.
 *
 * WHAT THIS COUNTS, EXACTLY: addresses that RECEIVED USDC in the
 * block window walked. Not doors that made sales. An inflow at an
 * advertised address is not proof of a purchase — it can be treasury
 * movement, a shared wallet, or an operator funding themselves — and
 * every rendering of this number has to carry that or it is a
 * revenue claim we did not measure.
 *
 * ────────────────────────────────────────────────────────────────
 * REBUILT 2026-08-28, THE SAME DAY, OFF ITS OWN FIRST READING.
 *
 * The first live run said "153 of 300 advertised addresses" while
 * its own caption named a denominator of 448, unioned a full Base
 * window with a half-length Polygon one as though they were one
 * rate, reported 8,714 transfers with no way to tell one busy wallet
 * from many, and printed a block count that disagreed with the
 * endpoints printed beside it. Four defects, three of them the exact
 * classes the audit that built this instrument was written to catch.
 * Every one is fixed below, and each fix is named where it lives.
 */

/**
 * How far back one run reads, per chain, in blocks — INCLUSIVE, so
 * the window really is this many blocks and not this many minus one.
 * Base and Polygon both mint at roughly 2s, so this is about a day
 * on either and the two chains' windows are comparable in TIME,
 * which is the only sense in which they are comparable at all.
 */
export const INFLOW_WINDOW_BLOCKS = 43_200;

/**
 * The most getLogs calls one run will spend per chain.
 *
 * WAS 40, AND 40 WAS WRONG. Polygon's providers answer a 500-block
 * span, so a day needs ~87 calls; Base's answer 2,000, so a day
 * needs ~22. The old budget stopped Polygon at 20,000 blocks —
 * under half the window Base got — and the reading then added the
 * two chains' recipients together as if they had been watched for
 * the same length of time. That is rule 52's defect exactly: a
 * capped reading published as a total.
 *
 * The number that actually binds is the Workers per-request
 * subrequest ceiling of 1,000, and the honest walk costs ~109
 * against it. 120 per chain covers both with room for the transport
 * retries, and leaves the ceiling far enough away that a split
 * (below) cannot reach it.
 */
export const INFLOW_SPAN_BUDGET = 120;

/**
 * A RUNAWAY GUARD, NOT A SAMPLE (the keeper's question, 2026-08-28:
 * "idk what's best practice for fix 4").
 *
 * The old constant was 300 and it SAMPLED: sort the advertised
 * addresses, keep the first 300, drop 148 of 448 on the floor. Two
 * things were wrong with it. It was unnecessary — eth_getLogs ORs an
 * array at a topic position, so watching 448 addresses costs the
 * same number of subrequests as watching 300, and the cap was
 * guarding a cost that did not exist. And because the slice was
 * taken off a sorted list, it excluded THE SAME 148 addresses every
 * week: a permanent hole, not a rotating sample.
 *
 * Best practice for a population you can enumerate is to enumerate
 * it. The real constraint is rows per response, and the answer to
 * that is adaptive splitting (see `readChunk`), which every serious
 * indexer uses: send the whole list, and bisect only on a refusal or
 * a suspiciously round row count. Full coverage; extra calls only on
 * the runs that need them.
 *
 * This ceiling is what is left of the cap: a bound so far above the
 * observed population (448) that it does not bind today. If it ever
 * does, the run does NOT quietly sample — it rotates the window by a
 * stable per-week offset so successive weeks cover different slices,
 * and says on the reading that it did.
 */
export const INFLOW_ADDRESS_CEILING = 2_000;

/** Chunks smaller than this are not worth bisecting further; a
 * chunk this size that still will not answer is recorded as our gap
 * rather than split into noise. */
const MIN_CHUNK = 25;

/**
 * Row counts that smell like a provider's undisclosed limit rather
 * than the truth. A getLogs that returns EXACTLY one of these was
 * probably truncated, and a truncated read counted as a complete one
 * is an under-count published as a fact. Split and re-ask.
 */
const SUSPECT_ROUND_COUNTS = new Set([1_000, 2_000, 5_000, 10_000]);

export interface InflowChainWindow {
  chain: string;
  /** Blocks actually covered by the spans this run spent. */
  from_block: number;
  to_block: number;
  /** ALWAYS `to_block - from_block + 1`. Derived from the endpoints
   * beside it rather than counted separately, because the first
   * version computed the two independently and they disagreed by one
   * on any chain whose walk reached the window (rule 46). */
  blocks: number;
  /** getLogs calls spent here, splits included. */
  calls: number;
  /** True when the span budget stopped the walk before the window. */
  truncated: boolean;
  /** Distinct advertised addresses that received on THIS chain. */
  received: number;
  /** Transfers seen on this chain. */
  transfers: number;
  /** Addresses in chunks that never answered, even split. Our gap. */
  addresses_unread: number;
  /** Set when the chain would not answer at all: our gap, never a
   * finding. */
  unread?: string;
}

export interface InflowCensus {
  observed_at: string;
  week: string;
  /** Distinct EVM addresses the round's doors advertised. */
  addresses_advertised: number;
  /**
   * THE DENOMINATOR, and the one the caption names. Equal to
   * `addresses_advertised` unless the ceiling bound.
   */
  addresses_checked: number;
  /** True only when the ceiling bound and this run watched a
   * rotating slice rather than the whole set. */
  addresses_capped: boolean;
  /**
   * Of `addresses_checked`, how many received at least one USDC
   * transfer inside the windows walked. NEVER "doors that sold".
   */
  addresses_received: number;
  /** Transfers seen, across both chains. */
  transfers_seen: number;
  /**
   * True when every chain reached its full window. When false the
   * chains were watched for different lengths of time and
   * `addresses_received` is a union across unequal windows — a
   * floor, not a rate. The renderers must not state a percentage
   * when this is false.
   */
  windows_equal: boolean;
  /**
   * THE SHAPE OF THE TRAFFIC, not just its volume (the first
   * reading's third defect: 8,714 transfers over 153 addresses, with
   * no way to tell 153 modest doors from three facilitator wallets
   * and 150 quiet ones — which is precisely the distinction the T2
   * ruling turns on). Counts only; no address is named or nameable
   * from these.
   */
  distribution: {
    /** Median transfers among addresses that received at least one. */
    median_transfers: number;
    /** The busiest single address's transfer count. */
    max_transfers: number;
    /** Share of all transfers held by the busiest tenth of
     * receiving addresses. Null when nothing was received. */
    top_decile_share_pct: number | null;
  };
  /** Per chain, what was actually covered — or why it was not. */
  windows: InflowChainWindow[];
  what_this_counts: string;
  what_this_is_not: string;
}

const WHAT_THIS_IS_NOT_BASE =
  "Not sales, not revenue, and not a fact about any named door. An inflow at an advertised address can be treasury movement, a shared or facilitator wallet, or an operator funding themselves — this store cannot tell those apart from a transfer, and does not guess. A zero is not evidence that nobody paid: an operator who rotated addresses, settles on a rail we do not read, nets through a facilitator, or opened after the window began is invisible here, and so is anyone whose payment fell outside it. Counts only, by ruling: no addresses, no hosts, and nothing about this rides on any single door's page.";

/** Every distinct 0x address the round's doors advertised. */
export function advertisedEvmAddresses(round: WardRound): string[] {
  const found = new Set<string>();
  for (const host of round.hosts ?? []) {
    for (const payTo of host.offer?.pay_to ?? []) {
      if (/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
        found.add(payTo.toLowerCase());
      }
    }
  }
  return [...found].sort();
}

/**
 * The watch list. Below the ceiling this is every advertised
 * address, in order. Above it the window ROTATES by a stable offset
 * derived from the week, so the set that goes unwatched changes from
 * week to week instead of being the same tail forever.
 */
export function watchList(
  advertised: readonly string[],
  week: string,
  ceiling: number = INFLOW_ADDRESS_CEILING,
): string[] {
  if (advertised.length <= ceiling) return [...advertised];
  let offset = 0;
  for (const char of week) {
    offset = (offset * 31 + char.charCodeAt(0)) % advertised.length;
  }
  const rotated = [...advertised.slice(offset), ...advertised.slice(0, offset)];
  return rotated.slice(0, ceiling);
}

/** A visible ceiling on calls, so an adaptive split cannot run away
 * into the Worker's subrequest budget without saying it did. */
function callBudget(limit: number) {
  let spent = 0;
  return {
    take(): boolean {
      if (spent >= limit) return false;
      spent += 1;
      return true;
    },
    spent: () => spent,
  };
}

/**
 * How many times a chain may refuse at MIN_CHUNK before the whole
 * chain is abandoned as unread. Without this, a provider that refuses
 * everything is ground through once per chunk per span, each grind
 * paying the transport layer's own endpoint retries and backoff. The
 * first draft of this splitter did exactly that and hung its own
 * tests — which is the cheapest possible place to learn it.
 */
const MAX_HARD_REFUSALS = 3;

/**
 * One chain's walk: spans backward from the head until the window or
 * the budget runs out, whichever binds first, reporting which did.
 * A chain that will not answer is recorded as OUR gap — the reading
 * loses that chain rather than quietly counting it as zero.
 *
 * ADAPTIVE, WITH MEMORY. The address list goes out whole; on a
 * refusal or a suspiciously round row count the chunk size HALVES and
 * the same slice is re-asked, and the size that worked is kept for
 * every later span. Discovery is paid once per run, not once per
 * span. This is what replaced the old address cap: the cap decided in
 * advance that a third of the market would go unwatched forever, to
 * avoid a refusal nobody had measured.
 */
async function walkChain(
  env: Env,
  chain: EvmChain,
  addresses: readonly string[],
  spanBudget: number,
): Promise<{ window: InflowChainWindow; perAddress: Map<string, number> }> {
  const perAddress = new Map<string, number>();
  const budget = callBudget(spanBudget);
  const unreadAddresses = new Set<string>();
  let head: number;
  try {
    head = await getBlockNumber(env, chain);
  } catch (error) {
    return {
      window: {
        chain: chain.label,
        from_block: 0,
        to_block: 0,
        blocks: 0,
        calls: 0,
        truncated: false,
        received: 0,
        transfers: 0,
        addresses_unread: addresses.length,
        unread: `head unreadable: ${String(error)}`,
      },
      perAddress,
    };
  }
  // Inclusive lower bound, so the intended window is exactly
  // INFLOW_WINDOW_BLOCKS blocks rather than one short of it.
  const target = Math.max(0, head - INFLOW_WINDOW_BLOCKS + 1);
  let to = head;
  let lowestWalked = head + 1;
  let transfers = 0;
  let chunkSize = Math.max(1, addresses.length);
  let hardRefusals = 0;
  let unread: string | undefined;

  outer: while (to >= target && budget.spent() < spanBudget) {
    const from = Math.max(target, to - chain.logSpan + 1);
    let index = 0;
    while (index < addresses.length) {
      if (!budget.take()) {
        for (const address of addresses.slice(index)) unreadAddresses.add(address);
        break;
      }
      const slice = addresses.slice(index, index + chunkSize);
      let rows: Array<{ to: string }> | null = null;
      try {
        rows = await usdcTransfersToAny(env, slice, from, to, chain);
      } catch {
        rows = null;
      }
      const suspect = rows !== null && SUSPECT_ROUND_COUNTS.has(rows.length);
      if (rows === null || suspect) {
        if (chunkSize > MIN_CHUNK) {
          // Halve and re-ask the SAME slice; the smaller size sticks
          // for the rest of the run.
          chunkSize = Math.max(MIN_CHUNK, Math.floor(chunkSize / 2));
          continue;
        }
        // As small as we go. This slice is our gap, not a zero.
        for (const address of slice) unreadAddresses.add(address);
        hardRefusals += 1;
        index += chunkSize;
        if (hardRefusals >= MAX_HARD_REFUSALS) {
          unread = `provider refused ${hardRefusals} reads at ${MIN_CHUNK} addresses; chain abandoned rather than ground`;
          break outer;
        }
        continue;
      }
      transfers += rows.length;
      for (const row of rows) {
        const key = row.to.toLowerCase();
        perAddress.set(key, (perAddress.get(key) ?? 0) + 1);
      }
      index += chunkSize;
    }
    lowestWalked = Math.min(lowestWalked, from);
    to = from - 1;
  }
  const walked = lowestWalked <= head;
  const fromBlock = walked ? lowestWalked : 0;
  const toBlock = walked ? head : 0;
  return {
    window: {
      chain: chain.label,
      from_block: fromBlock,
      to_block: toBlock,
      // DERIVED from the endpoints printed beside it, never counted
      // separately. The two disagreed by one in the first version.
      blocks: walked ? toBlock - fromBlock + 1 : 0,
      calls: budget.spent(),
      truncated: to >= target,
      received: perAddress.size,
      transfers,
      addresses_unread: unreadAddresses.size,
      ...(unread ? { unread } : {}),
    },
    perAddress,
  };
}

/** Median, max and top-decile share over the receiving addresses. */
function shapeOf(counts: number[]): InflowCensus["distribution"] {
  if (counts.length === 0) {
    return { median_transfers: 0, max_transfers: 0, top_decile_share_pct: null };
  }
  const sorted = [...counts].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
      : (sorted[middle] ?? 0);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const decile = Math.max(1, Math.ceil(sorted.length / 10));
  const topShare = sorted
    .slice(sorted.length - decile)
    .reduce((sum, value) => sum + value, 0);
  return {
    median_transfers: median,
    max_transfers: sorted[sorted.length - 1] ?? 0,
    top_decile_share_pct: total === 0 ? null : Math.round((topShare / total) * 100),
  };
}

/**
 * The caption, DERIVED (rule 46, and the first reading's worst
 * defect: a frozen paragraph naming 448 sat under a number computed
 * over 300). Every figure in this sentence is the figure the number
 * beside it was actually computed from.
 */
function whatThisCounts(facts: {
  addresses_received: number;
  addresses_checked: number;
  addresses_advertised: number;
  addresses_capped: boolean;
  windows_equal: boolean;
  windowsText: string;
}): string {
  const chains = facts.windows_equal
    ? `Both chains were walked over the same ${INFLOW_WINDOW_BLOCKS.toLocaleString()}-block window, roughly a day each.`
    : `THE CHAINS WERE NOT WATCHED EQUALLY, so this is a floor and not a rate: ${facts.windowsText}.`;
  const capped = facts.addresses_capped
    ? ` The advertised set of ${facts.addresses_advertised} exceeded this run's ceiling, so ${facts.addresses_checked} were watched on a window that rotates week to week; the unwatched remainder differs each week rather than being the same addresses forever.`
    : "";
  return (
    `${facts.addresses_received} of ${facts.addresses_checked} — addresses that RECEIVED USDC inside the block window each chain line names, out of the ${facts.addresses_checked} distinct EVM addresses this reading actually watched.` +
    capped +
    ` ${chains}` +
    ` Both numbers are here because a share without its denominator is how a market lies, and the windows are here because a walk cut short and a quiet day produce the same count.`
  );
}

/**
 * The reading. Derived at call time from the latest round's own
 * advertised addresses; nothing is stored, so nothing can be edited
 * into politeness between the walk and the page.
 */
export async function readInflowCensus(
  env: Env,
  now: Date = new Date(),
  /*
   * The span budget is a PARAMETER so the truncation path can be
   * driven directly. Raising the constant to 120 made truncation
   * unreachable from any plausible fixture — and a branch no test can
   * reach is a branch that rots, which is how the old budget shipped
   * mis-sized in the first place.
   */
  options: { spanBudget?: number } = {},
): Promise<InflowCensus | null> {
  const spanBudget = options.spanBudget ?? INFLOW_SPAN_BUDGET;
  const round = await latestWardRound(env);
  if (!round) return null;
  const advertised = advertisedEvmAddresses(round);
  const watched = watchList(advertised, round.week);

  const perAddress = new Map<string, number>();
  const windows: InflowChainWindow[] = [];
  let transfers = 0;
  for (const chain of [BASE_EVM, POLYGON_EVM]) {
    const walk = await walkChain(env, chain, watched, spanBudget);
    windows.push(walk.window);
    transfers += walk.window.transfers;
    for (const [address, count] of walk.perAddress) {
      perAddress.set(address, (perAddress.get(address) ?? 0) + count);
    }
  }

  /*
   * EQUAL MEANS THE SAME WINDOW, NOT A PARTICULAR SIZE. Every chain
   * must have reached the window it was asked for (nothing truncated,
   * nothing unread) AND all of them must have covered the same number
   * of blocks. Base and Polygon both mint at roughly 2s, so equal
   * blocks is equal TIME here; a chain with a different block time
   * would need converting before it joined this comparison.
   *
   * A short window that BOTH chains reached — early in a chain's life,
   * or in a fixture — is equal. A day on Base against eleven hours on
   * Polygon is not, and that is the case the first reading published
   * as a rate.
   */
  const windowsEqual =
    windows.every((window) => !window.truncated && !window.unread) &&
    new Set(windows.map((window) => window.blocks)).size === 1;
  const shape = shapeOf([...perAddress.values()]);
  const core = {
    observed_at: now.toISOString(),
    week: round.week,
    addresses_advertised: advertised.length,
    addresses_checked: watched.length,
    addresses_capped: watched.length < advertised.length,
    addresses_received: perAddress.size,
    transfers_seen: transfers,
    windows_equal: windowsEqual,
    windows,
    distribution: shape,
  };
  const windowsText = windows
    .map((window) => `${window.chain} covered ${window.blocks.toLocaleString()} blocks`)
    .join(" and ");

  /*
   * WORDS FOLLOW FACTS (rule 45). A top decile holding most of the
   * transfers is the facilitator-wallet shape the T2 ruling turns
   * on, and saying so belongs beside the number rather than in a
   * reader's head.
   */
  const skew =
    shape.top_decile_share_pct !== null && shape.top_decile_share_pct >= 50
      ? ` The busiest tenth of receiving addresses account for ${shape.top_decile_share_pct}% of all transfers seen, and the busiest single address for ${shape.max_transfers} of ${transfers}: that is the shape of shared or facilitator wallets in the list, not of many doors making small sales, and this reading cannot tell those apart.`
      : "";

  return {
    ...core,
    what_this_counts: whatThisCounts({
      addresses_received: core.addresses_received,
      addresses_checked: core.addresses_checked,
      addresses_advertised: core.addresses_advertised,
      addresses_capped: core.addresses_capped,
      windows_equal: core.windows_equal,
      windowsText,
    }),
    what_this_is_not: WHAT_THIS_IS_NOT_BASE + skew,
  };
}
