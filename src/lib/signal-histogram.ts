/**
 * THE CONCENTRATION HISTOGRAM (2026-09-21) — the one number the
 * September read lacked, in the only form the house can publish.
 *
 * A sweep reads every page once in one format and moves on;
 * evaluation comes back, and comes back for the other twin. So the
 * breakthrough question — is anyone READING these pages, or is an
 * index walking them — is answered by how many subjects were read in
 * more than one format and how many crossed a repeat threshold, over
 * the month's subject count. Fractions with their denominator, never
 * a host name (open-for-business.ts: hosts are never named on a
 * public surface), derived from the per-subject map and nothing
 * else: no cookie, no IP, no per-visitor row.
 *
 * Pure: a map of `${subject}:${format}` → reads in, a histogram out,
 * so the admin page, the public observatory and the weekly issue
 * cannot come to different totals from the same rows.
 */

export interface ConcentrationHistogram {
  /** Subjects with at least one read by a browser, an agent or a fetcher this month. */
  subjects: number;
  /** Subjects read in exactly one format, two formats, all three. */
  by_formats: { one: number; two: number; three: number };
  /** Subjects with at least N reads across every format. */
  repeat: { at_least_2: number; at_least_5: number; at_least_10: number };
  /** Total reads behind the histogram, so a mean can be checked. */
  reads: number;
  /** Reads that landed in the overflow bucket, when the map was capped; zero on the ledger. */
  overflow: number;
}

/** Per-subject totals from the per-format map: what the older readers (the page, the weekly) still expect. */
export function subjectTotals(subjectFormats: Record<string, number>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [key, n] of Object.entries(subjectFormats)) {
    const subject = key === "other" ? "other" : key.slice(0, key.lastIndexOf(":") > 0 ? key.lastIndexOf(":") : key.length);
    totals[subject] = (totals[subject] ?? 0) + n;
  }
  return totals;
}

/** How many formats each subject was read in. */
export function subjectFormatCounts(subjectFormats: Record<string, number>): Record<string, number> {
  const formats: Record<string, Set<string>> = {};
  for (const key of Object.keys(subjectFormats)) {
    if (key === "other") continue;
    const cut = key.lastIndexOf(":");
    const subject = cut > 0 ? key.slice(0, cut) : key;
    const format = cut > 0 ? key.slice(cut + 1) : "unknown";
    (formats[subject] ??= new Set()).add(format);
  }
  return Object.fromEntries(Object.entries(formats).map(([subject, set]) => [subject, set.size]));
}

export function concentrationHistogram(subjectFormats: Record<string, number>): ConcentrationHistogram {
  const totals = subjectTotals(subjectFormats);
  const formats = subjectFormatCounts(subjectFormats);
  const histogram: ConcentrationHistogram = {
    subjects: 0,
    by_formats: { one: 0, two: 0, three: 0 },
    repeat: { at_least_2: 0, at_least_5: 0, at_least_10: 0 },
    reads: 0,
    overflow: totals["other"] ?? 0,
  };
  for (const [subject, reads] of Object.entries(totals)) {
    if (subject === "other") continue;
    histogram.subjects += 1;
    histogram.reads += reads;
    const n = formats[subject] ?? 1;
    if (n >= 3) histogram.by_formats.three += 1;
    else if (n === 2) histogram.by_formats.two += 1;
    else histogram.by_formats.one += 1;
    if (reads >= 2) histogram.repeat.at_least_2 += 1;
    if (reads >= 5) histogram.repeat.at_least_5 += 1;
    if (reads >= 10) histogram.repeat.at_least_10 += 1;
  }
  return histogram;
}
