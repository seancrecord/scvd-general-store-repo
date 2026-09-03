/**
 * HOSTS THAT ASKED NOT TO HAVE A PAGE (2026-09-03, the keeper's
 * ruling: publish a page per observed host, and a host may ask to be
 * delisted).
 *
 * Delisting takes the PAGE down, not the record: the signed corpus
 * rows are what they are, /corpus/host/{host}.json still answers,
 * and the aggregates still count the host. What changes is that the
 * HTML page says "delisted on this date at the operator's request",
 * links nothing further, and leaves the sitemap — so the corpus and
 * the page never disagree, and a delisted host is not made to vanish
 * as if it had never been observed. Asking is the notice desk
 * (/notice) or the contact address; the keeper adds the row.
 *
 * Typed by hand on purpose: each row is a decision with a date, the
 * same shape as the orphan guard's written reasons.
 */
export interface Delisting {
  host: string;
  /** ISO date the page came down. */
  on: string;
  /** Who asked, in the store's words; never the operator's own text. */
  reason: string;
}

export const DELISTED_HOSTS: readonly Delisting[] = [];

export function delisting(
  host: string,
  list: readonly Delisting[] = DELISTED_HOSTS,
): Delisting | undefined {
  const lower = host.toLowerCase();
  return list.find((entry) => entry.host.toLowerCase() === lower);
}
