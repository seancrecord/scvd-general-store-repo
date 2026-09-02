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
  /**
   * THE DOOR BANK: every discovery-declared resource URL the ward has
   * ever seen, kept so a feed that breaks (the 2026-08-05 pagination
   * collapse, still unrepaired on 2026-08-18: 100 rows, coverage
   * suspect every round) cannot take our observation breadth down with
   * it. A door once DECLARED by the directory is a door we may knock
   * on at indexer cadence — the bank remembers the declaration, never
   * invents one. One key, same law as the register above, same R2
   * graduation trigger if it ever stops fitting.
   */
  wardDoorBank: "ward_door_bank",
  /**
   * THE LONG WALK's one piece of state (2026-08-19): the current
   * week's roster, cursor, and accumulated results. ONE key, holding
   * its own week — a new week's first pass overwrites it, so there is
   * no per-week key litter and no previous-week arithmetic to get
   * wrong. At full-universe scale this value runs a few megabytes,
   * comfortably inside KV's 25 MB value ceiling; the SNAPSHOTS it
   * produces are what graduated to R2, not the working state.
   */
  longWalkState: "long_walk_state",
  /**
   * THE OUTREACH LEDGER (2026-08-19): the keeper's private work queue
   * state for telling operators their own door is broken. One key,
   * host → {workflow status, published contact strings}. It records
   * OUR workflow (drafted/sent/replied/fixed/skip) and contacts the
   * operator PUBLISHED for exactly this purpose (security.txt), never
   * a verdict history or a score on anyone — rule 43 holds: the
   * observations live in the rounds, dated; this is just where the
   * hand keeps its place. Sends are the keeper's alone (rule 30).
   */
  outreachLedger: "outreach_ledger",
  /** The trust panel's hourly-recomputed half (corpus count + gallery). */
  trustPanelCache: "trust_panel_cache",
  /** Latest buyer-commissioned passport-refresh observation per host. */
  passportRefresh: (host: string) => `passport_refresh:${host}`,
  /** The hosted trust profile's current term, latest-only per host. */
  trustProfile: (host: string) => `trust_profile:${host}`,
  /**
   * THE PUBLIC REGISTRY TALLY (2026-08-19): the market desk's
   * aggregates, one row per published week, served at /registry. ONE
   * key, bounded at 104 weeks — counts and percentiles only, never a
   * host or operator name (the builder strips the named top list
   * before anything is stored). Rows land here only on the keeper's
   * publish press, never on the clock (rule 30).
   */
  registryPulse: "registry_pulse",
  /** The published inflow tally — the keeper's press, rule 30. */
  inflowPulse: "inflow_pulse",
  /** The reading last RENDERED to the keeper, so the press can
   * publish the number he actually looked at rather than a fresh
   * walk he has never seen. Short-lived by design. */
  inflowPending: "inflow_pending",
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
   * The ecosystem reports' OTS anchors: body digest and proof state
   * per report, ONE key holding all of them — same law as the
   * population register, because the shelf is compiled in and will
   * number a handful ever, so a key per report would buy a write loop
   * and a scan for nothing. COUNTERS beside the store's other anchor
   * bookkeeping. No chain, never scanned.
   */
  reportAnchors: "report_anchors",
  /**
   * A purchased point-in-time service audit: the signed report, the
   * certificate that bound its evidence hash, nothing else. PATRONS
   * namespace beside the cert. No prefix scan anywhere touches these
   * (no sweep, no upgrade pass — the record is terminal at write).
   */
  serviceAudit: (auditId: string): string => `service_audit:${auditId}`,
  /**
   * A signed discovery_coherence envelope pointed at someone else's
   * catalogs. PATRONS, terminal at write. The SKU is not priced yet;
   * the instrument writes here so a purchase door can bind `attests`.
   */
  discoveryReport: (reportId: string): string => `discovery_report:${reportId}`,
  /**
   * Latest unsigned catalog look per host. COUNTERS, latest-wins —
   * the next inventory of the same origin compares against this, then
   * overwrites it. Not a watch and not a signed artifact.
   */
  discoverySnapshot: (host: string): string => `discovery_snapshot:${host}`,
  discoverySnapshotPrefix: "discovery_snapshot:",
  /**
   * Latest discovery_coherence citation per host, for the passport
   * to derive. COUNTERS, latest-wins. Written on a join, never on
   * GET /passport/{host}.
   */
  hostDiscoveryModule: (host: string): string =>
    `discovery_module:${host}`,
  hostDiscoveryModulePrefix: "discovery_module:",
  /**
   * A purchased signature-agent card: the signed directory
   * observation and the certificate that bound its evidence hash.
   * PATRONS, terminal at write, never scanned — the Once-Over's
   * storage shape, pointed at Web Bot Auth directories.
   */
  signatureAgentCard: (cardId: string): string =>
    `signature_agent_card:${cardId}`,
  /**
   * A purchased on-page audit: the signed page observation and the
   * certificate that bound its evidence hash. PATRONS, terminal at
   * write, never scanned — the Once-Over's storage shape, pointed at
   * a page instead of a payment door.
   */
  onpageAudit: (auditId: string): string => `onpage_audit:${auditId}`,

  /** The signed payment dry run (#96), served free forever. */
  goodBuyerReading: (readingId: string): string => `good_buyer:${readingId}`,
  /**
   * A purchased launch check: the signed stage-by-stage record of one
   * real purchase attempt from the field wallet, and the certificate
   * that bound its evidence hash. PATRONS, terminal at write, never
   * scanned — the walkabout productized for one door.
   */
  launchCheck: (checkId: string): string => `launch_check:${checkId}`,
  /**
   * The Opening Day bundle (roadmap S3, 2026-09-01): the certificate
   * that bound the launch walk, the watch it opened, and the host —
   * one small row so one URL can name all three. ORDERS, keyed by
   * the certificate id the buyer holds.
   */
  openingDay: (certId: string): string => `opening_day:${certId}`,
  /**
   * A purchased provenance check (N4): the signed named join and the
   * certificate that bound it. PATRONS, terminal at write.
   */
  provenanceCheck: (id: string): string => `provenance_check:${id}`,
  /**
   * The free self-audit, counted as an ask and never as an asker: one
   * integer per ISO week. COUNTERS.
   */
  provenanceSelfAudits: (week: string): string => `prov_self:${week}`,
  /**
   * A purchased wallet statement: the signed transfer record and the
   * certificate that bound its evidence hash. PATRONS, terminal at
   * write, never scanned — the reconciliation's storage shape pointed
   * at a whole wallet window instead of one transaction.
   */
  walletStatement: (statementId: string): string =>
    `wallet_statement:${statementId}`,
  /**
   * A purchased mandate: the signed record of claimed authorization,
   * and the certificate that bound its evidence hash. PATRONS,
   * terminal at write, never scanned — read back one at a time when a
   * later purchase cites its id, which the buy door resolves before
   * charging.
   */
  mandate: (mandateId: string): string => `mandate:${mandateId}`,
  /**
   * The bounty board (BOUNTY_BOARD.md): keeper-posted bounties, the
   * per-week payout budget, and the one-payout-per-transaction guard.
   * COUNTERS. The bounty scan is bounded by the board's own scale —
   * a handful of keeper-posted rows a week, capped at listing time.
   */
  bounty: (bountyId: string): string => `bounty:${bountyId}`,
  bountyPrefix: "bounty:",
  bountyBudget: (weekKey: string): string => `bounty_budget:${weekKey}`,
  bountyTx: (txLower: string): string => `bounty_tx:${txLower}`,
  /**
   * Regulars' credit (services/store-credit.ts): the per-wallet
   * rebate balance, the outstanding-liability aggregate the books
   * watch, and the single-use cash-out challenge. COUNTERS. Keys are
   * canonical addresses — the wallet IS the loyalty card.
   */
  credit: (canonicalWallet: string): string => `credit:${canonicalWallet}`,
  creditPrefix: "credit:",
  creditOutstanding: "credit_outstanding_atomic",
  creditChallenge: (addressLower: string): string =>
    `credit_challenge:${addressLower}`,
  /**
   * A purchased settlement reconciliation: the signed observation and
   * the certificate that bound its evidence hash. PATRONS beside the
   * cert, terminal at write, same as the service audit — no sweep and
   * no upgrade pass touches these.
   */
  settlementReconciliation: (reconciliationId: string): string =>
    `settlement_reconciliation:${reconciliationId}`,
  /**
   * A purchased case file (roadmap N8, 2026-09-02): the signed assembly
   * and the certificate that bound its evidence hash. PATRONS beside
   * the cert, terminal at write. The query key beside it is the
   * idempotency index — same tx and same mandate inside a day is the
   * same case — written with a one-day TTL so it expires on its own.
   */
  caseFile: (caseId: string): string => `case_file:${caseId}`,
  caseFileQuery: (digest: string): string => `case_file_query:${digest}`,
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
  /**
   * A standing note (G2 ruling §5): the subject's own dated statement,
   * riding beside our observation. Subject is `host:<host>` or
   * `wallet:<pay-to digest>` — never a verbatim address.
   */
  standingNote: (subject: string): string => `standing_note:${subject}`,
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
  /**
   * WHICH CERTIFICATE A SETTLEMENT MINTED — a keyed row, written at
   * mint, because the alternative was a scan that goes blind.
   *
   * certIdForSettlement used to walk every cert: row up to a 2000 cap
   * and DISCARD `truncated`, so past 2000 certificates it answered
   * "no certificate" for a settlement that had one. Its caller is the
   * paid-retry lane, whose whole job is to not mint twice against one
   * payment — so a false null there is a second signed certificate,
   * a second patron number, and a second credit accrual on the same
   * money. Certificates are written with no TTL, so that set only
   * grows.
   */
  settlementCert: (txLower: string): string => `settle_cert:${txLower}`,
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
