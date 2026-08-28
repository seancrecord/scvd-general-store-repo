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
 */

/**
 * How far back one run reads, per chain, in blocks. Base mints a
 * block every ~2s and Polygon every ~2s, so this is roughly a day on
 * both. The number is a BUDGET, not a horizon: at Base's 2,000-block
 * span it costs ~22 getLogs, at Polygon's 500 about 86, and the
 * Worker's hard subrequest ceiling is 1,000. The window each run
 * actually covered is reported on the reading rather than assumed,
 * because a walk that was cut short and a quiet day look identical
 * in the count alone.
 */
export const INFLOW_WINDOW_BLOCKS = 43_200;

/**
 * The most getLogs calls one run will spend per chain. Binds before
 * the window does on a chain with a short span, and when it binds
 * the reading says the window was truncated — a cap that cannot be
 * seen in the output is the defect this store keeps finding.
 */
export const INFLOW_SPAN_BUDGET = 40;

/** Addresses watched in one run. The topic filter ORs them in a
 * single call, but a list without a ceiling is a request nobody
 * sized; when it binds, the reading says so. */
export const INFLOW_ADDRESS_CAP = 300;

export interface InflowChainWindow {
  chain: string;
  /** Blocks actually covered by the spans this run spent. */
  from_block: number;
  to_block: number;
  blocks: number;
  /** True when the span budget stopped the walk before the window. */
  truncated: boolean;
  /** Set when the chain would not answer: our gap, never a finding. */
  unread?: string;
}

export interface InflowCensus {
  observed_at: string;
  week: string;
  /**
   * THE DENOMINATOR. Distinct EVM addresses the round's doors
   * advertised, after dedupe and the cap below.
   */
  addresses_checked: number;
  /** Advertised addresses the round carried, before the cap. */
  addresses_advertised: number;
  /** True when the cap bound and the check saw a subset. */
  addresses_capped: boolean;
  /**
   * Of `addresses_checked`, how many received at least one USDC
   * transfer inside the window walked. NEVER "doors that sold".
   */
  addresses_received: number;
  /** Transfers seen, so a reader can tell one busy address from many. */
  transfers_seen: number;
  /** Per chain, what was actually covered — or why it was not. */
  windows: InflowChainWindow[];
  what_this_counts: string;
  what_this_is_not: string;
}

const WHAT_THIS_COUNTS =
  "Addresses that RECEIVED USDC inside the block window each chain line names, out of the distinct EVM addresses the week's probed doors advertised in their own 402s. Both numbers are here because a share without its denominator is how a market lies, and the window is here because a walk cut short and a quiet day produce the same count.";

const WHAT_THIS_IS_NOT =
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
 * One chain's walk: spans backward from the head until the window or
 * the budget runs out, whichever binds first, reporting which did.
 * A chain that will not answer is recorded as OUR gap — the reading
 * loses that chain rather than quietly counting it as zero.
 */
async function walkChain(
  env: Env,
  chain: EvmChain,
  addresses: readonly string[],
): Promise<{ window: InflowChainWindow; received: Set<string>; transfers: number }> {
  const received = new Set<string>();
  let transfers = 0;
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
        truncated: false,
        unread: `head unreadable: ${String(error)}`,
      },
      received,
      transfers: 0,
    };
  }
  const target = Math.max(0, head - INFLOW_WINDOW_BLOCKS);
  let to = head;
  let spans = 0;
  let unread: string | undefined;
  while (to > target && spans < INFLOW_SPAN_BUDGET) {
    const from = Math.max(target, to - chain.logSpan + 1);
    try {
      const logs = await usdcTransfersToAny(env, addresses, from, to, chain);
      transfers += logs.length;
      for (const log of logs) received.add(log.to.toLowerCase());
    } catch (error) {
      // The window stops where our read stopped, and says why.
      unread = `spans stopped early: ${String(error)}`;
      break;
    }
    to = from - 1;
    spans += 1;
  }
  const covered = head - Math.max(to, target);
  return {
    window: {
      chain: chain.label,
      from_block: Math.max(to + 1, target),
      to_block: head,
      blocks: Math.max(0, covered),
      truncated: to > target,
      ...(unread ? { unread } : {}),
    },
    received,
    transfers,
  };
}

/**
 * The reading. Derived at call time from the latest round's own
 * advertised addresses; nothing is stored, so nothing can be edited
 * into politeness between the walk and the page.
 */
export async function readInflowCensus(
  env: Env,
  now: Date = new Date(),
): Promise<InflowCensus | null> {
  const round = await latestWardRound(env);
  if (!round) return null;
  const advertised = advertisedEvmAddresses(round);
  const watched = advertised.slice(0, INFLOW_ADDRESS_CAP);

  const received = new Set<string>();
  const windows: InflowChainWindow[] = [];
  let transfers = 0;
  for (const chain of [BASE_EVM, POLYGON_EVM]) {
    const walk = await walkChain(env, chain, watched);
    windows.push(walk.window);
    transfers += walk.transfers;
    for (const address of walk.received) received.add(address);
  }

  return {
    observed_at: now.toISOString(),
    week: round.week,
    addresses_checked: watched.length,
    addresses_advertised: advertised.length,
    addresses_capped: advertised.length > watched.length,
    addresses_received: received.size,
    transfers_seen: transfers,
    windows,
    what_this_counts: WHAT_THIS_COUNTS,
    what_this_is_not: WHAT_THIS_IS_NOT,
  };
}
