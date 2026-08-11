/**
 * Every KV key in one place, so nobody invents a second spelling.
 *
 * ORDERS     order:<id>, waitlist:<item>:<ts>, request:<id>,
 *            tip:<invertedTs>:<id>, gazette:<paddedIssue>,
 *            refund:<id>, phantom:<id>,
 *            letter:<invertedTs>:<id> (private; admin queue only)
 * GUESTBOOK  entry:<invertedTs>:<id>
 * COUNTERS   patron_number, bell_count, bell_ring:<who>:<day>,
 *            inventory:<item>:<week>, failed_item:<item>, week_note,
 *            digest:latest, gazette_issue_count, blessing_last,
 *            payment_nonce:<nonce> (TTL), bazaar_ext:<invertedTs> (TTL),
 *            patronage_note:<YYYY-MM>, metric:<YYYY-MM>:<kind>:<rest>,
 *            payer:<address>
 * PATRONS    patron:<number>, cert:<id>, stamp:<id>, anchor:<id>, pass:<id>,
 *            lucky:<id> (signed lucky records; the card is the record),
 *            stamp_card:<nameSlug> (append-only visit-week log)
 * COUNTERS   stamp_condition:<week> (write-once, same week only)
 */
import { canonicalAddress } from "@/lib/addresses";

export const KV_KEYS = {
  order: (orderId: string): string => `order:${orderId}`,
  waitlist: (itemId: string, timestamp: number): string =>
    `waitlist:${itemId}:${timestamp}`,
  waitlistPrefix: (itemId?: string): string =>
    itemId ? `waitlist:${itemId}:` : "waitlist:",
  commissionRequest: (id: string): string => `request:${id}`,
  requestPrefix: "request:",
  orderPrefix: "order:",

  tip: (invertedTs: string, id: string): string => `tip:${invertedTs}:${id}`,
  tipPrefix: "tip:",
  gazetteIssue: (issueNumber: number): string =>
    `gazette:${String(issueNumber).padStart(6, "0")}`,
  gazettePrefix: "gazette:",
  refund: (refundId: string): string => `refund:${refundId}`,
  refundPrefix: "refund:",
  closer: (invertedTs: string): string => `closer:${invertedTs}`,
  closerPrefix: "closer:",
  stockUnit: (itemId: string, unitId: string): string =>
    `stock:${itemId}:${unitId}`,
  stockPrefix: (itemId: string): string => `stock:${itemId}:`,
  bestowedName: (slug: string): string => `bestowed_name:${slug}`,
  grudgeEntry: (invertedTs: string): string => `grudge:${invertedTs}`,
  grudgePrefix: "grudge:",
  gazetteDraft: "gazette_draft",
  foundingEdition: "founding_edition",
  confession: (invertedTs: string, id: string): string =>
    `confession:${invertedTs}:${id}`,
  confessionPrefix: "confession:",
  // The train fills front to back, so tags key by FORWARD timestamp:
  // KV lists ascending, which puts the oldest tag first, which is the
  // front of the train. Every other queue here is newest-first.
  trainTag: (ts: string, id: string): string => `train:${ts}:${id}`,
  trainTagPrefix: "train:",
  phantomCheck: (checkId: string): string => `phantom:${checkId}`,
  standingWatch: (watchId: string): string => `watch:${watchId}`,
  standingWatchPrefix: "watch:",
  conformanceWatch: (watchId: string): string => `cwatch:${watchId}`,
  conformanceWatchPrefix: "cwatch:",
  wardRound: (week: string): string => `ward:${week}`,
  wardRoundLatest: "ward_latest",
  wardRoundPrevious: "ward_previous",
  /**
   * THE POPULATION REGISTER: every host any directory has ever listed,
   * with first_seen / last_seen / gone_at. ONE key holding the whole
   * register, because at tens of hosts a key per host is waste and the
   * census reads all of them every round anyway.
   *
   * When this stops fitting comfortably in one value it is the corpus's
   * already-named R2 graduation trigger arriving — enumerating the whole
   * universe IS "snapshots stop being weekly-and-small". The storage move
   * travels with that growth rather than surprising us at the ceiling.
   */
  populationRegister: "population_register",
  phantomPrefix: "phantom:",
  letter: (invertedTs: string, id: string): string =>
    `letter:${invertedTs}:${id}`,
  letterPrefix: "letter:",
  letterById: (letterId: string): string => `letter_id:${letterId}`,

  guestbookEntry: (invertedTs: string, id: string): string =>
    `entry:${invertedTs}:${id}`,
  guestbookPrefix: "entry:",

  patronNumber: "patron_number",
  bellCount: "bell_count",
  bellRing: (who: string, day: string): string => `bell_ring:${who}:${day}`,
  lettersReceived: "letters_received",
  lettersAnswered: "letters_answered",
  porchSits: (day: string): string => `porch_sits:${day}`,
  porchTreats: (day: string): string => `porch_treats:${day}`,
  gazetteWeeklyState: "gazette_weekly_state",
  gazetteCorrections: "gazette_corrections",
  letterSent: (who: string, day: string): string => `letter_sent:${who}:${day}`,
  inventory: (itemId: string, weekKey: string): string =>
    `inventory:${itemId}:${weekKey}`,
  failedItem: (itemId: string): string => `failed_item:${itemId}`,
  failedItemPrefix: "failed_item:",
  weekNote: "week_note",
  /** Keeper-written almanac pages, added from the office. ORDERS. */
  almanacEntry: (slug: string): string => `almanac_entry:${slug}`,
  almanacEntryPrefix: "almanac_entry:",
  keeperLastSeen: "keeper_last_seen",
  /**
   * When the keeper last LOOKED at the alarm trail. Rows that first
   * fired after it are marked NEW, so "have I seen this?" stops being
   * answered by memory and eyeballing.
   */
  alarmsLastRead: "alarms_last_read",
  /**
   * Failed /admin logins from ONE address. Per-address on purpose:
   * see the throttle in routes/admin.ts — a global counter would hand
   * a stranger the keeper's own front door.
   */
  adminFailByIp: (ip: string): string => `admin_fail_ip:${ip}`,
  adminFailIpPrefix: "admin_fail_ip:",
  shutterOverride: "shutter_override",
  firstDollar: "first_dollar",
  /**
   * The rail split snapshot: organic sales counted by the chain they
   * settled on, walked off the certificates on the cron and read as ONE
   * key by the front of the store. The walk itself is a scan of every
   * certificate; doing it on each storefront render would put ninety KV
   * reads behind a page a crawler hits for free.
   */
  railSplit: "rail_split",
  /**
   * WHEN THE TILL STARTED WRITING DOWN THE RAIL. Set once, by the
   * first settle that records one, and never again.
   *
   * This is the seam between two records and it has to be a stored
   * instant rather than a date in the source, or the two would overlap
   * and one sale would be counted on two rails. Certificates are the
   * only rail record for anything settled BEFORE this moment; the till
   * is the record for everything at or after it. A cert dated on the
   * far side of this line is skipped by the walk, because the till
   * already counted that sale.
   */
  railMeterStart: "rail_meter_start",
  /**
   * When the chain-side inflow meter started counting, per chain. Set
   * once by the first reconciliation pass that banks an inflow sum;
   * published on the net statement so "no inflow recorded" before this
   * instant reads as "not yet metered" rather than "no money arrived".
   */
  inflowMeterStart: (chain: string): string => `inflow_meter_start:${chain}`,
  /** Fires the outside-signature alarm exactly once, ever. */
  firstSignature: "first_outside_signature",
  latestDigest: "digest:latest",
  gazetteIssueCount: "gazette_issue_count",
  blessingLast: "blessing_last",
  paymentNonce: (nonce: string): string => `payment_nonce:${nonce}`,
  /** Idempotency replay cache: surface + payer + sha256(key). */
  idempotency: (surface: string, payer: string, keyHash: string): string =>
    `idem:${surface}:${payer}:${keyHash}`,
  /** Single-use claims-door challenge nonce, per wallet address. */
  claimChallenge: (address: string): string => `claim_challenge:${address}`,
  /** The external-anchor hash chain; keys sort by zero-padded sequence. */
  anchorLogPrefix: "anchor_log:",
  /**
   * The corpus chain: weekly ward-round observations frozen, signed,
   * hash-linked and OTS-stamped. Its own prefix, its own chain —
   * never grafted into the key-history anchor log, whose schema
   * outside verifiers reproduce byte for byte.
   */
  corpusPrefix: "corpus_log:",
  /**
   * A patron's purchased Bitcoin anchor: their digest, their label
   * (untrusted), the OTS proof state. PATRONS namespace beside the
   * certificate the purchase minted. Independent records, no chain —
   * a stranger's proof should not be coupled to our bookkeeping.
   */
  patronAnchor: (anchorId: string): string => `patron_anchor:${anchorId}`,
  patronAnchorPrefix: "patron_anchor:",
  /**
   * A purchased point-in-time service audit: the signed report, the
   * certificate that bound its evidence hash, nothing else. PATRONS
   * namespace beside the cert. No prefix scan anywhere touches these
   * (no sweep, no upgrade pass — the record is terminal at write).
   */
  serviceAudit: (auditId: string): string => `service_audit:${auditId}`,
  /**
   * A purchased signature-agent card: the signed directory
   * observation and the certificate that bound its evidence hash.
   * PATRONS, terminal at write, never scanned — the Once-Over's
   * storage shape, pointed at Web Bot Auth directories.
   */
  signatureAgentCard: (cardId: string): string =>
    `signature_agent_card:${cardId}`,
  /**
   * A purchased settlement reconciliation: the signed observation and
   * the certificate that bound its evidence hash. PATRONS beside the
   * cert, terminal at write, same as the service audit — no sweep and
   * no upgrade pass touches these.
   */
  settlementReconciliation: (reconciliationId: string): string =>
    `settlement_reconciliation:${reconciliationId}`,
  /**
   * A settled sale whose goods have not gone out yet. Exists only
   * between settlement and delivery — a row that outlives the grace
   * period is money taken without delivery (problem ledger #18).
   */
  /**
   * AN INDEX OF OPEN LABOR, so the bench can count what is promised
   * without walking every order the store has ever taken.
   *
   * The bench first derived its count from the `order:` prefix, which
   * grows with EVERY sale forever (instant items included) — so the
   * scan would truncate on success and the ceiling would quietly stop
   * binding. This prefix holds one key per unfinished human-labor
   * order and is deleted on completion, so its size is bounded by the
   * ceiling itself rather than by the store's lifetime.
   *
   * The orders remain the truth. This is only how the bench finds
   * them, and a rebuild pass reconciles the two.
   *
   * ONE KEY, not one per order, for the same reason the population
   * register is one key: the list is bounded by the ceiling itself, so
   * a key apiece would be a write loop and a list scan bought for
   * nothing.
   */
  openLaborIndex: "open_labor_index",
  deliveryIntent: (id: string): string => `delivery:${id}`,
  deliveryIntentPrefix: "delivery:",
  bazaarLedger: (invertedTs: string): string => `bazaar_ext:${invertedTs}`,
  bazaarLedgerPrefix: "bazaar_ext:",
  patronageNote: (month: string): string => `patronage_note:${month}`,
  metric: (month: string, kind: string, rest: string): string =>
    `metric:${month}:${kind}:${rest}`,
  metricMonthPrefix: (month: string): string => `metric:${month}:`,
  // Canonical, not lowercased: base58 Solana addresses are
  // case-sensitive and a lowercased key orphans the true address.
  // See lib/addresses.ts; legacy lowercased rows are merged by
  // recordPayerSeen and the payer-case repair.
  payer: (address: string): string => `payer:${canonicalAddress(address)}`,
  payerPrefix: "payer:",

  patron: (patronNumber: number): string => `patron:${patronNumber}`,
  cert: (certId: string): string => `cert:${certId}`,
  certPrefix: "cert:",
  /**
   * How far the bank reconciliation has walked Base. Stored rather
   * than derived: re-walking history every hour would eventually stop
   * running, and an instrument that stops running is the defect the
   * check exists to catch (problem ledger #4).
   */
  reconcileCursor: "reconcile_cursor",
  /**
   * THE TAB's pooled corpus (layer 3): one row per accepted anonymized
   * delta. Kind and category ride IN THE KEY so sample sizes derive
   * from a key listing alone — no bulk read to publish a count. The
   * category segment is sanitized to a safe charset before it joins
   * the key; the value keeps the delta verbatim.
   */
  tabDelta: (kind: string, safeCategory: string, id: string): string =>
    `tab_delta:${kind}:${safeCategory}:${id}`,
  tabDeltaPrefix: "tab_delta:",
  /** The pool's daily intake counter — the flood gate, not a metric. */
  tabPoolDay: (isoDay: string): string => `tab_pool_day:${isoDay}`,
  /**
   * A settled sale whose goods went out WITHOUT minting a certificate
   * — the penny pages (Almanac, Gazette issues, Zodiac archive). The
   * chain walk answers "is there an artifact for this money" by
   * reading certificates, so a delivered penny sale used to page the
   * keeper as possibly-undelivered money. These rows are the penny
   * shelf's counterpart of the certificate: written at DELIVERY (the
   * 2xx with the goods in it), never at settle time, so the walk can
   * still catch money that moved and bought nothing. The hash rides
   * in the key; TTL-bounded because the walk only ever needs a row
   * while its block can still come up in a pass.
   */
  settledDelivery: (txLower: string): string => `settled_delivery:${txLower}`,
  settledDeliveryPrefix: "settled_delivery:",
  /**
   * Block ranges the Base walk moved PAST without reading (problem
   * ledger #22): when the cursor falls more than RECONCILE_MAX_SPAN
   * behind the head, the clamp discards the gap — and the walk only
   * ever goes forward, so nothing revisits it. One key holding every
   * hole, because a hole cannot be detected after the fact: this
   * record is the only evidence the range was never swept, and any
   * published coverage claim either cites it or lies.
   */
  reconcileSkippedRanges: "reconcile_skipped_ranges",
  stamp: (stampId: string): string => `stamp:${stampId}`,
  stampCard: (nameSlug: string): string => `stamp_card:${nameSlug}`,
  stampCondition: (weekKey: string): string => `stamp_condition:${weekKey}`,
  anchor: (anchorId: string): string => `anchor:${anchorId}`,
  patronagePass: (passId: string): string => `pass:${passId}`,
  lucky: (luckyId: string): string => `lucky:${luckyId}`,
  luckyPrefix: "lucky:",
} as const;

/**
 * Guestbook entries are listed newest-first by storing an inverted timestamp
 * (KV lists lexicographically ascending).
 */
export function invertedTimestamp(now: number): string {
  return String(9999999999999 - now).padStart(13, "0");
}

/** The Monday a given ISO week key starts on, as a UTC date. */
export function weekKeyMonday(weekKey: string): Date {
  const [yearPart, weekPart] = weekKey.split("-W");
  const year = parseInt(yearPart ?? "0", 10);
  const week = parseInt(weekPart ?? "0", 10);
  // Jan 4 is always in ISO week 1; walk back to that week's Monday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** The ISO week key immediately before the given one, across years. */
export function previousWeekKey(weekKey: string): string {
  const monday = weekKeyMonday(weekKey);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return currentWeekKey(monday);
}

/** ISO week key like "2026-W29" so inventory resets weekly on its own. */
export function currentWeekKey(date: Date = new Date()): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
