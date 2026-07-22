/**
 * Every KV key in one place, so nobody invents a second spelling.
 *
 * ORDERS     order:<id>, waitlist:<item>:<ts>, request:<id>,
 *            tip:<invertedTs>:<id>, gazette:<paddedIssue>,
 *            retired_word:<invertedTs>, phantom:<id>,
 *            letter:<invertedTs>:<id> (private; admin queue only)
 * GUESTBOOK  entry:<invertedTs>:<id>
 * COUNTERS   patron_number, bell_count, bell_ring:<who>:<day>,
 *            inventory:<item>:<week>, failed_item:<item>, week_note,
 *            digest:latest, gazette_issue_count, blessing_last,
 *            payment_nonce:<nonce> (TTL), bazaar_ext:<invertedTs> (TTL),
 *            patronage_note:<YYYY-MM>, metric:<YYYY-MM>:<kind>:<rest>,
 *            payer:<address>
 * PATRONS    patron:<number>, cert:<id>, stamp:<id>, anchor:<id>, pass:<id>,
 *            stamp_card:<nameSlug> (append-only visit-week log)
 * COUNTERS   stamp_condition:<week> (write-once, same week only)
 */
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
  retiredWord: (invertedTs: string): string => `retired_word:${invertedTs}`,
  retiredWordPrefix: "retired_word:",
  gazetteDraft: "gazette_draft",
  confession: (invertedTs: string, id: string): string =>
    `confession:${invertedTs}:${id}`,
  confessionPrefix: "confession:",
  phantomCheck: (checkId: string): string => `phantom:${checkId}`,
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
  gazetteWeeklyState: "gazette_weekly_state",
  gazetteCorrections: "gazette_corrections",
  letterSent: (who: string, day: string): string =>
    `letter_sent:${who}:${day}`,
  inventory: (itemId: string, weekKey: string): string =>
    `inventory:${itemId}:${weekKey}`,
  failedItem: (itemId: string): string => `failed_item:${itemId}`,
  failedItemPrefix: "failed_item:",
  weekNote: "week_note",
  latestDigest: "digest:latest",
  gazetteIssueCount: "gazette_issue_count",
  blessingLast: "blessing_last",
  paymentNonce: (nonce: string): string => `payment_nonce:${nonce}`,
  bazaarLedger: (invertedTs: string): string => `bazaar_ext:${invertedTs}`,
  bazaarLedgerPrefix: "bazaar_ext:",
  patronageNote: (month: string): string => `patronage_note:${month}`,
  metric: (month: string, kind: string, rest: string): string =>
    `metric:${month}:${kind}:${rest}`,
  metricMonthPrefix: (month: string): string => `metric:${month}:`,
  payer: (address: string): string => `payer:${address.toLowerCase()}`,
  payerPrefix: "payer:",

  patron: (patronNumber: number): string => `patron:${patronNumber}`,
  cert: (certId: string): string => `cert:${certId}`,
  stamp: (stampId: string): string => `stamp:${stampId}`,
  stampCard: (nameSlug: string): string => `stamp_card:${nameSlug}`,
  stampCondition: (weekKey: string): string => `stamp_condition:${weekKey}`,
  anchor: (anchorId: string): string => `anchor:${anchorId}`,
  patronagePass: (passId: string): string => `pass:${passId}`,
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
