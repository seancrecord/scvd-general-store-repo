import { sendAlert } from "@/lib/alerts";
import { reconcileSettles } from "@/lib/metrics";
import { computeStatsDiagnosed } from "@/services/stats";
import { computeNetStatement } from "@/services/net-statement";
import type { Env } from "@/types";

/**
 * THE BOOKS INVARIANT SWEEP (enforcement item #1, 2026-08-07): the
 * identities this store publishes, checked hourly by the machine
 * instead of by the keeper reading his own pages.
 *
 * Every books incident this store has logged was two substrates
 * drifting apart, found by a person: the keeper caught 88−85≠3 by
 * reading two pages against each other; he caught the rail bucket by
 * reading the storefront as a stranger. The identities were already
 * enforced — but in TESTS, against simulated counters. Nothing walked
 * the PRODUCTION counters and said so when an identity stopped
 * holding. This is that instrument. It publishes nothing and repairs
 * nothing; it is the smoke detector, not the fire brigade.
 *
 * WHAT IT HOLDS, and why each one:
 *
 *  1. THE SETTLE RECONCILIATION: counter settles minus payer purchases
 *     equals the founding settle plus the settles that arrived without
 *     a payer address. Anything else means a counter moved without its
 *     row. The check existed; it ran only when the office page loaded,
 *     which meant it ran when somebody was already looking.
 *
 *  2. THE RAIL TALLY NEVER OVERSHOOTS THE ORGANIC COUNT. The public
 *     path handles overshoot by dropping the split — absent is honest
 *     — but a dropped split IS the finding: two records of the same
 *     sales disagree. Before this sweep, that signal was discarded at
 *     the exact moment it was discovered.
 *
 *  3. THE PUBLISHED SPLIT SUMS TO THE FIGURE BESIDE IT. Holds by
 *     construction today; the belt costs one addition and catches the
 *     refactor that breaks the construction, which is precisely how
 *     the 88−85 defect shipped.
 *
 *  4. NO COMPLETED MONTH BOOKS MORE ON A CHAIN THAN THE CHAIN SHOWS.
 *     From the net statement: observed inflow legitimately EXCEEDS
 *     booked revenue (dust, keeper transfers — named on the statement,
 *     no alarm). The reverse, on a month both meters covered end to
 *     end, means money was booked that no wallet received: either an
 *     RPC gap or the books inventing revenue, and both are pageable.
 *     The current month is exempt (the walk trails the till by up to
 *     an hour), as are months either meter only partially covered.
 *
 * Alerts ride the existing P1 machinery, keyed per invariant so a
 * standing breach pages once per dedupe window rather than hourly,
 * and a SECOND broken invariant is its own page.
 */

export interface InvariantSweep {
  checked: number;
  breaches: string[];
  at: string;
}

/** Sub-cent tolerance: micro-USDC rounding is not a books defect. */
const CENT = 0.01;

export async function sweepBooksInvariants(env: Env): Promise<InvariantSweep> {
  const breaches: string[] = [];

  // 1. Settle counters against payer rows, all-time on both sides.
  const settles = await reconcileSettles(env);
  if (settles.unexplained !== 0) {
    breaches.push(
      `settle-reconciliation: ${settles.unexplained} settle(s) unexplained — counter says ${settles.counter_settles}, payer rows say ${settles.payer_purchases}, founding ${settles.founding}, unattributed ${settles.unattributed}. A counter moved without its row (or a row without its counter).`,
    );
  }

  // 2 & 3. The rail records against the organic count.
  const { stats, rail_overshoot } = await computeStatsDiagnosed(env);
  if (rail_overshoot) {
    breaches.push(
      `rail-overshoot: the rail records claim ${rail_overshoot.rail_total} organic sale(s) but the counters know ${rail_overshoot.organic}. The storefront is correctly refusing to print the split, and that refusal is this defect's only other witness.`,
    );
  }
  const rail = stats.organic_by_rail;
  if (
    rail &&
    rail.base + rail.solana + rail.rail_not_recorded !==
      stats.organic_settlements
  ) {
    breaches.push(
      `rail-identity: published split ${rail.base}+${rail.solana}+${rail.rail_not_recorded} ≠ organic ${stats.organic_settlements}. The construction that guarantees this identity has been broken by a change somewhere upstream.`,
    );
  }

  // 4. Booked-but-never-arrived, per chain, completed fully-metered months only.
  const net = await computeNetStatement(env);
  const currentMonth = new Date().toISOString().slice(0, 7);
  for (const chain of ["base", "solana"] as const) {
    const side = net[chain];
    if (!side.observed_since || !net.booked_since) {
      continue; // A meter that has not started cannot convict anybody.
    }
    const bothLiveFrom =
      side.observed_since > net.booked_since
        ? side.observed_since
        : net.booked_since;
    // The month a meter started mid-way is partial by definition, so
    // the first month this check may judge is the one AFTER the later
    // epoch — and never the current one, which the walk still trails.
    const lastPartialMonth = bothLiveFrom.slice(0, 7);
    for (const row of side.months) {
      if (row.month >= currentMonth) continue;
      if (row.month <= lastPartialMonth) continue;
      if (row.booked_usdc - row.observed_inflow_usdc > CENT) {
        breaches.push(
          `booked-exceeds-chain (${chain}, ${row.month}): the till booked $${row.booked_usdc} settled on ${chain} but the walk saw only $${row.observed_inflow_usdc} arrive. Money the books claim and no wallet received — an RPC gap or worse, and both deserve a person.`,
        );
      }
    }
  }

  // 5. The regulars'-credit liability: the published aggregate against
  // a recount of every wallet's balance. A loyalty program whose books
  // disagree with themselves is a real store's oldest rot, so the
  // aggregate the credit endpoint publishes gets the same treatment as
  // every other number here: recomputed from rows, breach on drift
  // beyond dust (the aggregate's writes are unguarded against KV races
  // by design at this scale — a cent of tolerance is that honesty).
  try {
    const { listKeys } = await import("@/lib/kv-list");
    const { bulkGetJson } = await import("@/lib/kv-bulk");
    const { KV_KEYS } = await import("@/lib/kv-keys");
    const { creditOutstandingAtomic } = await import(
      "@/services/store-credit"
    );
    const listed = await listKeys(env.COUNTERS, {
      prefix: KV_KEYS.creditPrefix,
      cap: 2000,
    });
    const rows = await bulkGetJson<{ balance_atomic: string }>(
      env.COUNTERS,
      listed.names.filter((name) => !name.startsWith("credit_")),
    );
    let recount = 0n;
    for (const row of rows.values()) {
      if (row?.balance_atomic) recount += BigInt(row.balance_atomic);
    }
    const aggregate = await creditOutstandingAtomic(env);
    const drift = aggregate > recount ? aggregate - recount : recount - aggregate;
    if (drift > 10_000n && !listed.truncated) {
      breaches.push(
        `credit-liability: the published outstanding-credit aggregate ($${Number(aggregate) / 1e6}) disagrees with the per-wallet recount ($${Number(recount) / 1e6}) by more than a cent. One of the store's IOUs moved without its ledger row, or a race got unlucky twice the same way.`,
      );
    }
  } catch {
    // The recount is a watchdog; its own failure must not page as a
    // books breach. It reruns next hour.
  }

  const sweep: InvariantSweep = {
    checked: 5,
    breaches,
    at: new Date().toISOString(),
  };
  for (const breach of breaches) {
    const kind = breach.slice(0, breach.indexOf(":"));
    await sendAlert(env, {
      condition: "books_invariant",
      detail: `${breach} Nothing on any public page is wrong yet — surfaces derive or drop rather than publish a contradiction — but the books beneath them disagree with themselves, and that only ever gets older.`,
      key: kind,
    }).catch(() => {
      // The finding is recomputed next hour; the page is the courtesy.
    });
  }
  return sweep;
}
