import { sendAlert } from "@/lib/alerts";
import { canonicalAddress } from "@/lib/addresses";
import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { computeStatsDiagnosed } from "@/services/stats";
import { computeNetStatement } from "@/services/net-statement";
import type { CertificateRecord, Env } from "@/types";

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
 *  1. EVERY CERTIFICATE'S SETTLE IS ON THE BOOKS (2026-09-05, in place
 *     of the counters-vs-rows compare that paged here until then). A
 *     certificate carrying a payer and a settlement transaction is
 *     proof money moved; the per-settle record under that wallet and
 *     transaction is the books saying so. A certificate with no record
 *     is a sale the till never booked — two Solana penny settles on
 *     2026-08-05 were exactly that, found by a person reading the
 *     buyers page — and the repair at POST /admin/repair/payer-settles
 *     books it from the certificate.
 *
 *     WHY THE OLD COMPARE NO LONGER PAGES. Counter settles minus payer
 *     purchases was meant to equal the founding settle plus the
 *     unattributed ones. It paged twice in a week and both times the
 *     cause was a lost read-modify-write on a shared KV key — the
 *     keeper's ruling of 2026-09-04 says that is not a books defect —
 *     and the count could not name a wallet either way. The three
 *     figures still sit on the books check, as floors with the
 *     certificates read beside them; they just no longer wake anyone.
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

/** Ceiling on the certificate walk; a walk that hits it says so. */
const CERT_SCAN_CAP = 5000;

export interface UnbookedCertificate {
  cert_id: string;
  item: string;
  payer: string;
  transaction: string;
  date: string;
}

/**
 * Certificates that name a settle the books never recorded: payer and
 * settlement_tx on the certificate, no payer_settle record under that
 * wallet and transaction. Certificates from before the records shipped
 * are covered by the backfill, which the keeper has pressed; a cert
 * this finds after that press is a sale the till missed outright.
 */
export async function certificatesWithoutSettleRecord(
  env: Env,
): Promise<{ certificates: UnbookedCertificate[]; truncated: boolean }> {
  const [certKeys, settleKeys] = await Promise.all([
    listKeys(env.PATRONS, { prefix: KV_KEYS.certPrefix, cap: CERT_SCAN_CAP }),
    listKeys(env.COUNTERS, { prefix: KV_KEYS.payerSettlePrefix(), cap: CERT_SCAN_CAP }),
  ]);
  const recorded = new Set(settleKeys.names);
  const certs = await bulkGetJson<CertificateRecord>(env.PATRONS, certKeys.names);
  const missing: UnbookedCertificate[] = [];
  for (const record of certs.values()) {
    const cert = record?.certificate;
    if (!cert?.payer || !cert.settlement_tx) continue;
    if (recorded.has(KV_KEYS.payerSettle(cert.payer, cert.settlement_tx))) continue;
    missing.push({
      cert_id: cert.cert_id,
      item: cert.item,
      payer: canonicalAddress(cert.payer),
      transaction: cert.settlement_tx,
      date: cert.date,
    });
  }
  missing.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { certificates: missing, truncated: certKeys.truncated || settleKeys.truncated };
}

export async function sweepBooksInvariants(env: Env): Promise<InvariantSweep> {
  const breaches: string[] = [];

  // 1. Every certificate that names a settle has its record.
  const unbooked = await certificatesWithoutSettleRecord(env);
  if (unbooked.certificates.length > 0) {
    const named = unbooked.certificates
      .slice(0, 5)
      .map((c) => `${c.cert_id} (${c.item}, ${c.payer}, ${c.transaction}, ${c.date.slice(0, 10)})`)
      .join("; ");
    breaches.push(
      `certificate-without-settle: ${unbooked.certificates.length} certificate(s) carry a payer and a settlement transaction that the books never recorded — ${named}${unbooked.certificates.length > 5 ? "; …" : ""}. Money moved and the till did not book it. POST /admin/repair/payer-settles books each one from its certificate${unbooked.truncated ? " (the scan hit its cap; the count is a floor)" : ""}.`,
    );
  }

  // 2 & 3. The rail records against the organic count.
  const { stats, rail_overshoot, hand_placements_unapplied } =
    await computeStatsDiagnosed(env);
  // A hand-placed sale that found no unplaced settle to stand on is a
  // wrong placement — on a store that has organic sales at all. An
  // empty store (every test store) trivially has nothing to place.
  if (hand_placements_unapplied > 0 && stats.organic_settlements > 0) {
    breaches.push(
      `hand-placement-unapplied: RAILS_ENTERED_BY_HAND places ${hand_placements_unapplied} sale(s) by hash, but the books hold fewer organic settles without a rail than that. Either a placement names a sale the till never counted, or a record now places it too — the split leaves all of them out until a person reads the list against the chain.`,
    );
  }
  if (rail_overshoot) {
    breaches.push(
      `rail-overshoot: the rail records claim ${rail_overshoot.rail_total} organic sale(s) but the counters know ${rail_overshoot.organic}. The storefront is correctly refusing to print the split, and that refusal is this defect's only other witness.`,
    );
  }
  const rail = stats.organic_by_rail;
  if (
    rail &&
    rail.base + rail.polygon + rail.solana + rail.rail_not_recorded !==
      stats.organic_settlements
  ) {
    breaches.push(
      `rail-identity: published split ${rail.base}+${rail.polygon}+${rail.solana}+${rail.rail_not_recorded} ≠ organic ${stats.organic_settlements}. The construction that guarantees this identity has been broken by a change somewhere upstream.`,
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

  // 6. The trade receivable: the running counter the order door reads
  // for its credit ceiling against a recount of every live delivery
  // and payout row (2026-09-03, the trade counter). Same discipline as
  // the credit liability above, sign flipped: a receivable the books
  // disagree with themselves about is money nobody is chasing.
  try {
    const { TRADE_PARTNERS } = await import("@/store/trade-counter");
    const { tradeAccountSummary, tradeOutstandingCents } = await import(
      "@/services/trade-counter"
    );
    for (const partner of TRADE_PARTNERS) {
      if (partner.mode !== "live") continue;
      const summary = await tradeAccountSummary(env, partner);
      if (summary.truncated) continue;
      const counter = await tradeOutstandingCents(env, partner);
      const recount = Math.round(summary.outstanding_usd * 100);
      if (Math.abs(counter - recount) > 1) {
        breaches.push(
          `trade-receivable (${partner.id}): the credit-ceiling counter says $${counter / 100} outstanding but the delivery and payout rows say $${recount / 100}. A delivery or a payout moved without its counter step, or a race got unlucky; the rows are the truth and the counter is re-seated from them by the statement desk.`,
        );
      }
    }
  } catch {
    // A watchdog; its own failure must not page as a books breach.
  }

  const sweep: InvariantSweep = {
    checked: 6,
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
