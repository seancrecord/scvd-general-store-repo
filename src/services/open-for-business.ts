import { readBuyerSignals, type BuyerSignals } from "@/services/buyer-signals";
import { readDisclosureCensus, type DisclosureCensus } from "@/services/disclosure-census";
import { readDeclines } from "@/lib/declines";
import { isInfrastructureUserAgent } from "@/lib/channel";
import { readMonthLedger } from "@/lib/metrics";
import { observeSurfaces } from "@/services/observatory";
import { computePulse, type LatencyRoute } from "@/services/pulse";
import { MCP_CLIENT_CAP, readMcpClients } from "@/services/mcp-clients";
import { latestCorpusEntry } from "@/services/corpus-list";
import { currentWeekKey, previousWeekKey, weekKeyMonday } from "@/lib/kv-keys";
import { findOpenForBusinessIssue, saveOpenForBusinessIssue, type OpenForBusinessIssue } from "@/services/open-for-business-store";
import { renderWeekChangesMarkdown, weekBounds, weekChanges, type PullsFetcher, type WeekChanges } from "@/services/week-changes";
import { OPEN_FOR_BUSINESS_OPENED, OPEN_FOR_BUSINESS_WEEK_COUNTERS_SINCE } from "@/store/copy/open-for-business";
import type { Env } from "@/types";

/**
 * OPEN FOR BUSINESS — the weekly issue, drafted by the instruments.
 *
 * The name is the keeper's (2026-09-18, rule 7): "Open for Business",
 * because the issue is about a seller's door being open to agents
 * and not merely unlocked.
 *
 * WHAT THIS IS. A seller's weekly: what agents did at this store's
 * till and at the doors the store probes, where they got hung up,
 * what went well, which surfaces they arrived through, what the
 * clocks saw, and one change a seller can make on Monday. Every
 * number carries the denominator it came from; nothing here ranks a
 * door or names one that did not consent. It is the position line
 * pointed at sellers: how not to turn agents away silently.
 *
 * HOW IT GOES ON THE SHELF (the keeper's ruling, 2026-09-18, later
 * the same day). The draft is read on /admin/open-for-business, where
 * the keeper can edit it and press publish himself. If he has not,
 * the first hourly firing after an ISO week closes puts that week's
 * draft on the shelf as it stands (publishClosedWeek below): rule 30
 * amended by the keeper for this shelf, because rule 34 is the harder
 * constraint and a week that never went up sells nothing. His levers
 * are the ones that remain: publish early with his own edits, which
 * the press never overwrites, and take any issue down.
 *
 * THE FIX OF THE WEEK is derived, by the same ruling: the week's
 * merged pull requests, titles as written, dated (week-changes.ts).
 * What we changed at our own door is the one list of Monday-sized
 * changes the store can stand behind without a pen.
 *
 * WHAT IT READS. Only readers that already exist and already serve
 * the admin desk — buyer signals, the disclosure census, the decline
 * desk, the ledger, the porch surfaces, the pulse, the MCP client
 * census, the latest signed corpus round — each under the ISO week's
 * key (the week twin, since 2026-09-28; lib/kv-keys.ts) rather than
 * the month's. Each is read on its own and a reader that fails leaves
 * its section marked "not read", never a zero pretending to be a
 * count (rule 52).
 */

/**
 * THE COUNTED WINDOW (2026-09-28, twice in one day). Every reader
 * behind this issue kept one key per month, so a weekly could not
 * read a week: the first cut of this window read the month to date
 * that held most of the week and printed its dates. The keeper
 * wanted the full fix, so every writer the issue reads now bumps a
 * week twin beside the month (lib/kv-keys.ts: a period is a month
 * or an ISO week, and a week gets its own prefix), and the issue
 * reads its own week and nothing else.
 *
 * The window is still carried and printed, because it is not always
 * the whole week: on the desk the week is open and the counters run
 * to the drafting day, and the twins began on a date
 * (OPEN_FOR_BUSINESS_WEEK_COUNTERS_SINCE), so the first issue counts
 * from that day. A week with no counted days marks every section
 * unread rather than printing zeros (rule 52).
 */
export interface CountedWindow {
  /** The period the counters are read under: the ISO week. */
  week: string;
  /** First and last day counted, ISO dates, inclusive; `to` is before `from` when nothing was counted. */
  from: string;
  to: string;
  days: number;
  /** True when the window is the whole week: the week closed, and the twins were live for all of it. */
  whole: boolean;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function countedWindow(week: string, now: Date): CountedWindow {
  const monday = isoDay(weekKeyMonday(week));
  const sunday = isoDay(weekCloseInstant(week));
  const asOf = isoDay(new Date(Math.min(now.getTime(), weekCloseInstant(week).getTime())));
  const from = monday < OPEN_FOR_BUSINESS_WEEK_COUNTERS_SINCE ? OPEN_FOR_BUSINESS_WEEK_COUNTERS_SINCE : monday;
  const to = asOf < sunday ? asOf : sunday;
  const days = to < from ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return { week, from, to, days, whole: from === monday && to === sunday };
}

/** The window as it reads in a label or a sentence: "2026-10-01 to 2026-10-04". */
export function windowSpan(window: CountedWindow): string {
  return `${window.from} to ${window.to}`;
}

export interface SectionNumber {
  label: string;
  value: number;
  of?: number;
  note?: string;
}

export interface DraftSection {
  heading: string;
  /** One or two sentences the instruments can stand behind. */
  lead: string;
  numbers: SectionNumber[];
  /** Rows the section shows, capped; keys are already shapes, never values. */
  rows: Array<[string, number]>;
  /** What this section could not see. Always present (the position line). */
  not_seen: string[];
  /** True when the reader behind this section failed; the numbers above are then absent. */
  unread: boolean;
}

export interface OpenForBusinessDraft {
  week: string;
  /** The days the week's counters cover, printed beside every number. */
  window: CountedWindow;
  drafted_at: string;
  number_of_the_week: { sentence: string; source: string } | null;
  sections: DraftSection[];
  /** Derived from the week's merged pull requests, as markdown; the keeper may replace it before publishing. */
  fix_of_the_week: string;
  /** The rows behind fix_of_the_week, with the honest flag. */
  changes: WeekChanges;
  /** Readers that failed, by name, so the page can say so. */
  unread: string[];
}

const ROW_CAP = 8;

function top(map: Record<string, number>, cap = ROW_CAP): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, cap);
}

function sum(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

async function attempt<T>(name: string, unread: string[], work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    unread.push(name);
    return null;
  }
}

function rangeText(range: [number, number | null] | null): string {
  if (!range) return "no samples";
  return range[1] === null ? `${range[0]}ms or more` : `${range[0]}–${range[1]}ms`;
}

function hungUp(signals: BuyerSignals | null, declines: Awaited<ReturnType<typeof readDeclines>> | null, paid: DisclosureCensus | null, window: CountedWindow): DraftSection {
  const span = windowSpan(window);
  const refusals = signals ? sum(signals.refusal) : 0;
  const byReason: Record<string, number> = {};
  /*
   * "OTHER" IS TWO THINGS, and until 2026-09-28 the lead named
   * neither: a value that was present, passed its pattern and was
   * refused anyway, and — the larger share — a 400 whose body carried
   * a code and no input field at all, which recordInputRefusal files
   * with the code in the field slot and "other" as the reason. On the
   * September draft that bucket was 235 of 501 and the lead said
   * every one was "refused for a field". The top code is named now,
   * off the same key.
   */
  const otherByField: Record<string, number> = {};
  if (signals) {
    for (const [k, n] of Object.entries(signals.refusal)) {
      const [, field, reason] = k.split(":");
      byReason[reason ?? "other"] = (byReason[reason ?? "other"] ?? 0) + n;
      if ((reason ?? "other") === "other") otherByField[field ?? "unnamed"] = (otherByField[field ?? "unnamed"] ?? 0) + n;
    }
  }
  const numbers: SectionNumber[] = [];
  if (signals) {
    numbers.push({ label: `pre-payment 400s, ${span}`, value: refusals });
    for (const [reason, n] of top(byReason, 4)) numbers.push({ label: `…${reason}`, value: n, of: refusals });
    const [leadCode, leadCodeCount] = top(otherByField, 1)[0] ?? ["", 0];
    if (leadCodeCount > 0) numbers.push({ label: `…of the "other" refusals, the code or field that led: ${leadCode}`, value: leadCodeCount, of: byReason["other"] ?? 0 });
    numbers.push({ label: "purchases that bought a worked example as-is", value: sum(signals.examples) });
  }
  if (declines) {
    numbers.push({ label: `payments presented and declined (outside, ${span})`, value: declines.outside_count, note: declines.index_complete ? "index read to its end" : "scan capped; a floor" });
  }
  const rows = [
    ...(signals ? top(signals.refusal) : []),
    ...(declines ? top(declines.by_reason, 4).map(([k, n]) => [`decline:${k}`, n] as [string, number]) : []),
  ];
  const other = byReason["other"] ?? 0;
  const [leadCode, leadCodeCount] = top(otherByField, 1)[0] ?? ["", 0];
  const otherClause = other === 0
    ? ""
    : leadCodeCount > 0
      ? `, and ${other} for something other than a field's shape, most often \`${leadCode}\` (${leadCodeCount})`
      : `, and ${other} for something other than a field's shape`;
  return {
    heading: "Where they got hung up",
    lead: refusals === 0 && (!declines || declines.outside_count === 0)
      ? `Nobody was refused before paying between ${window.from} and ${window.to}, and nobody who paid was declined.`
      : `${refusals} agents were refused before paying between ${window.from} and ${window.to}: ${byReason["missing"] ?? 0} for a field they left out, ${byReason["malformed"] ?? 0} for a field in the wrong shape, ${byReason["example"] ?? 0} for pasting the worked example back${otherClause}. Beside them ${sum(signals?.refusal_machinery ?? {})} refusals went to self-identified machinery — censuses, linters and observatories walking the input contracts — counted here and kept out of the number above, because whether a conformance walker can satisfy a contract is evidence about the challenge and was never a lost sale.`,
    numbers,
    rows,
    not_seen: [
      "A client that throws on its own spend cap, drops a rail its SDK never registered, or times out before the retry never reaches this door; it prints here as a 402 followed by silence.",
      paid
        ? `The refusal names the field, not the model that sent it; the disclosure block would, and ${paid.disclosed} of ${paid.offered} buyers filled it between ${window.from} and ${window.to}.`
        : "The refusal names the field, not the model that sent it; the disclosure block would, and the disclosure census was not read for this draft.",
      "The rows keep no client string, so how many distinct clients sent these refusals is not known here.",
    ],
    unread: !signals && !declines,
  };
}

function wentWell(signals: BuyerSignals | null, ledger: Awaited<ReturnType<typeof readMonthLedger>> | null, paid: DisclosureCensus | null, window: CountedWindow): DraftSection {
  const span = windowSpan(window);
  const numbers: SectionNumber[] = [];
  if (ledger) {
    const settles = sum(ledger.channels);
    numbers.push({ label: `organic settles, ${span}`, value: settles, note: ledger.truncated ? "ledger scan capped; a floor" : undefined });
    for (const [channel, n] of top(ledger.channels, 4)) numbers.push({ label: `…via ${channel}`, value: n, of: settles });
  }
  if (signals) {
    numbers.push({ label: "receipt re-checks over a week after minting (organic)", value: signals.verify_age["over_1w"] ?? 0, of: sum(signals.verify_age) });
    numbers.push({ label: "purposes written on certificates", value: signals.purposes.length });
  }
  if (paid) {
    numbers.push({ label: "buyers who filled the disclosure block", value: paid.disclosed, of: paid.offered });
  }
  const over = signals?.verify_age["over_1w"] ?? 0;
  const all = signals ? sum(signals.verify_age) : 0;
  return {
    heading: "What went well",
    // Age says when, not who (the gap line below): the lead stops at the age and says what the age makes likelier, never who read.
    lead: all > 0
      ? `${over} of ${all} receipt re-checks between ${window.from} and ${window.to} came more than a week after minting. Age says when, not who: a week on, the reader is more often somebody the buyer showed the artifact to than the buyer, and the store cannot tell which.`
      : `No receipt was re-checked between ${window.from} and ${window.to}.`,
    numbers,
    rows: signals ? top(signals.rail) : [],
    not_seen: [
      "A settle is a wallet, not a buyer: one buyer paying from two wallets counts twice, a facilitator settling for twenty counts once.",
      "Re-check age says when, not who; the store keeps no cookies and no IPs and cannot tell two readers apart.",
    ],
    unread: !signals && !ledger,
  };
}

function entryPoints(surfaces: Awaited<ReturnType<typeof observeSurfaces>> | null, clients: Record<string, number> | null, ledger: Awaited<ReturnType<typeof readMonthLedger>> | null, window: CountedWindow): DraftSection {
  const span = windowSpan(window);
  const numbers: SectionNumber[] = [];
  const rows: Array<[string, number]> = [];
  if (surfaces) {
    numbers.push({ label: `organic surface visits, ${span}`, value: surfaces.organic_visits, note: surfaces.truncated ? "ledger scan capped; a floor" : undefined });
    for (const s of [...surfaces.surfaces].sort((a, b) => b.organic - a.organic).slice(0, ROW_CAP)) rows.push([s.surface, s.organic]);
  }
  /*
   * THE TILL AGAINST THE DOOR (2026-09-28). The 402s issued and the
   * settles used to sit in different sections and were never put
   * side by side; the ratio between them is the one number a seller
   * reading an issue called "how not to turn agents away silently"
   * actually wants. It is a floor on the turnaway, not a conversion
   * rate: a 402 is a quote, not an attempt, and the silence after
   * one is the gap the first section names.
   */
  let challenges = 0;
  let settles = 0;
  if (ledger) {
    challenges = sum(ledger.channels402);
    settles = sum(ledger.channels);
    numbers.push({ label: `402s issued to organic traffic, ${span}`, value: challenges });
    numbers.push({ label: "…that ended in an organic settle", value: settles, of: challenges });
    for (const [channel, n] of top(ledger.channels402, 4)) numbers.push({ label: `…on the ${channel} channel: settles of 402s`, value: ledger.channels[channel] ?? 0, of: n });
  }
  /*
   * MACHINERY AT THE MCP DOOR (2026-09-28). The refusal desk learned
   * on 2026-09-21 to keep self-identified machinery on its own map;
   * the handshake census had not, so a probe walking the tool list
   * on a loop sat beside a coding agent in the same "handshakes"
   * number, and the overflow row "other" led the top four, which
   * tells a seller nothing. The client name goes through the same
   * machinery table the user-agent does: a name the table does not
   * hold stays on the client side, and the gap line says so.
   */
  const organic: Record<string, number> = {};
  const machinery: Record<string, number> = {};
  let overflow = 0;
  if (clients) {
    for (const [name, n] of Object.entries(clients)) {
      if (name === "other") overflow += n;
      else if (isInfrastructureUserAgent(name)) machinery[name] = n;
      else organic[name] = n;
    }
    const handshakes = sum(organic);
    numbers.push({ label: "MCP handshakes from clients not in the machinery table", value: handshakes });
    for (const [client, n] of top(organic, 4)) numbers.push({ label: `…${client}`, value: n, of: handshakes });
    numbers.push({ label: "MCP handshakes from self-identified machinery", value: sum(machinery) });
    for (const [client, n] of top(machinery, 2)) numbers.push({ label: `…${client}`, value: n, of: sum(machinery) });
    if (overflow > 0) numbers.push({ label: `MCP handshakes from names past the census cap of ${MCP_CLIENT_CAP}`, value: overflow, note: "unnamed; neither side above" });
  }
  const tillClause = ledger && challenges > 0
    ? settles > 0
      ? ` Of ${challenges} 402s issued to organic traffic, ${settles} settled: one settle for every ${Math.round(challenges / settles)} challenges, and a 402 is a quote, not an attempt.`
      : ` Of ${challenges} 402s issued to organic traffic, none settled; a 402 is a quote, not an attempt.`
    : "";
  return {
    heading: "Entry points",
    lead: (surfaces
      ? `Agents arrived through ${surfaces.surfaces.length} counted surfaces between ${window.from} and ${window.to}; the top of the list is where a seller's own door should be legible first.`
      : `The porch did not read ${window.week}.`) + tillClause,
    numbers,
    rows,
    not_seen: [
      "Directory attribution is near-unmeasurable by design: a marker on the declared resource URL would corrupt the thing it measures.",
      "Context carryover, artifact citation and skill propagation arrive as fresh requests with no referrer; the counts here are floors on where agents actually learn of a door.",
      "A 402 followed by silence is not a lost sale the store can see: a client that never meant to pay and one that gave up on the price print the same.",
      "A client name is machinery only when the machinery table holds it; a directory that pings the door on a loop under a name the table does not know is counted beside the clients.",
    ],
    unread: !surfaces && !ledger && !clients,
  };
}

function latency(pulse: Awaited<ReturnType<typeof computePulse>> | null, corpus: Awaited<ReturnType<typeof latestCorpusEntry>> | null): DraftSection {
  const numbers: SectionNumber[] = [];
  const rows: Array<[string, number]> = [];
  if (pulse) {
    for (const [route, r] of Object.entries(pulse.latency.routes) as Array<[string, LatencyRoute]>) {
      // The value is the timing, the note is the sample count: the other way round read as a count of nothing.
      if (r.p95_ms_range) {
        numbers.push({ label: `${route}: p95, at most (ms)`, value: r.p95_ms_range[1] ?? r.p95_ms_range[0], note: `${r.p95_ms_range[1] === null ? `${r.p95_ms_range[0]}ms or more; ` : ""}median ${rangeText(r.p50_ms_range)}; ${r.samples} samples, a floor` });
      } else {
        numbers.push({ label: `${route}: samples`, value: r.samples, note: "no timing range" });
      }
    }
  }
  let probed = 0;
  let answered = 0;
  const buckets: Record<string, number> = {};
  if (corpus) {
    for (const host of corpus.snapshot.round.hosts) {
      probed += 1;
      if (typeof host.latency_ms === "number") {
        answered += 1;
        const bucket = host.latency_ms < 500 ? "under_500ms" : host.latency_ms < 1000 ? "under_1s" : host.latency_ms < 3000 ? "under_3s" : "over_3s";
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      }
    }
    numbers.push({ label: `doors probed in the latest signed round, ${corpus.snapshot.week}`, value: probed });
    numbers.push({ label: "…that answered with a timing", value: answered, of: probed });
    for (const [bucket, n] of Object.entries(buckets)) rows.push([bucket, n]);
  }
  return {
    heading: "Latency and the silent turnaway",
    lead: corpus && answered > 0
      ? `${buckets["over_3s"] ?? 0} of ${answered} doors that answered the latest signed round (${corpus.snapshot.week}) took more than three seconds. A stock client gives up on a door before it gives up on a price.`
      : "No signed round with timings was on file.",
    numbers,
    rows,
    not_seen: [
      "Our own clock measures our own doors; the independent monitor named on /pulse owes us no favours and is the number to quote.",
      "A probe is one GET at one moment: a door that answered slowly here can answer fast a minute later, and this is not an uptime claim.",
    ],
    unread: !pulse && !corpus,
  };
}

/**
 * WHO LOOKED AT THE RECORD (2026-09-18). Aggregates only: how many
 * reads the pages about a host drew from browsers and agents, how
 * many came referred from the subject itself, how concentrated the
 * reading was, and which crawlers walked. Never a host name: that
 * table is the keeper's and stays on the signals page.
 *
 * THE SWEEP (2026-09-28). The September draft printed 6,774 of
 * 6,775 hosts "read more than once" off the per-subject totals, at
 * about fourteen reads a host with none referred from the host
 * itself: an unnamed fetcher walking every page, classed as an
 * agent because the machinery table did not know it. The
 * concentration histogram (lib/signal-histogram.ts) was built on
 * 2026-09-21 to tell exactly that walk from a return and names this
 * file as a consumer; this section now reads it. Two reads is not
 * a repeat when every host has two; five and ten are the thresholds
 * it publishes, beside the mean, and the lead calls a walk a walk
 * when the shape is one (SWEEP_SHARE below).
 */
/** Share of hosts at two or more reads above which the spread is an index walking, not interest. */
const SWEEP_SHARE = 0.9;
const SWEEP_MIN_HOSTS = 20;

function whoLooked(signals: BuyerSignals | null, window: CountedWindow): DraftSection {
  const numbers: SectionNumber[] = [];
  const rows: Array<[string, number]> = [];
  let reads = 0;
  let self = 0;
  const byReader: Record<string, number> = {};
  const h = signals?.histogram ?? null;
  const perHost = h && h.subjects > 0 ? Math.round((h.reads / h.subjects) * 10) / 10 : 0;
  const sweep = h !== null && h.subjects >= SWEEP_MIN_HOSTS && h.repeat.at_least_2 >= h.subjects * SWEEP_SHARE;
  if (signals && h) {
    for (const [k, n] of Object.entries(signals.pages)) {
      const [page, , reader, relation] = k.split(":");
      if (reader === "crawler") continue;
      reads += n;
      byReader[`${page ?? "page"} by ${reader ?? "unnamed"}`] = (byReader[`${page ?? "page"} by ${reader ?? "unnamed"}`] ?? 0) + n;
      if (relation === "self") self += n;
    }
    numbers.push({ label: `reads of a host page or a passport by a browser or an agent, ${windowSpan(window)}`, value: reads });
    numbers.push({ label: "…referred from the subject host itself", value: self, of: reads });
    numbers.push({ label: "hosts read five or more times", value: h.repeat.at_least_5, of: h.subjects });
    numbers.push({ label: "hosts read ten or more times", value: h.repeat.at_least_10, of: h.subjects });
    numbers.push({ label: "hosts read in more than one format", value: h.by_formats.two + h.by_formats.three, of: h.subjects });
    numbers.push({ label: "reads per host, mean", value: perHost, note: "an even count on nearly every host is a walk" });
    if (h.overflow > 0) numbers.push({ label: "reads past the subject map cap", value: h.overflow, note: "hosts uncounted above" });
    for (const [k, n] of top(byReader, 4)) rows.push([k, n]);
    for (const [k, n] of top(signals.crawlers, 4)) rows.push([`crawler ${k}`, n]);
  }
  const selfClause = self > 0
    ? `${self} of them referred from the door itself: an operator checking their own listing, the one read the store can name as interest.`
    : "none of them referred from the door itself, so nothing here can be read as an operator checking their own listing.";
  const shapeClause = h && h.subjects > 0
    ? sweep
      ? ` ${h.repeat.at_least_2} of ${h.subjects} hosts were read at least twice, at about ${perHost} reads a host: reads spread over nearly every host at the same depth are an index walking, not a seller reading. ${h.repeat.at_least_10} hosts were read ten or more times.`
      : ` ${h.repeat.at_least_5} of ${h.subjects} hosts were read five or more times, ${h.repeat.at_least_10} ten or more, at about ${perHost} reads a host.`
    : "";
  return {
    heading: "Who looked at the record",
    lead: reads > 0
      ? `${reads} reads of a page about a door came from a browser or an agent between ${window.from} and ${window.to}, ${selfClause}${shapeClause}`
      : `No page about a door was read by anyone but a crawler between ${window.from} and ${window.to}.`,
    numbers,
    rows,
    not_seen: [
      "A read is not a reader: with no cookie and no IP kept, two reads of one record may be one person twice or two people once, and the store does not try to tell.",
      "A crawler that names itself is kept out of every number above; a fetcher that does not name itself and walks every page counts as an agent here, and the mean reads per host is the number that gives it away.",
      "Hosts are never named here. The seller reading this is welcome to ask for its own record at /corpus/host/{host}, which is free.",
    ],
    unread: !signals,
  };
}

function numberOfTheWeek(signals: BuyerSignals | null, corpus: Awaited<ReturnType<typeof latestCorpusEntry>> | null, window: CountedWindow): OpenForBusinessDraft["number_of_the_week"] {
  const span = windowSpan(window);
  if (signals) {
    const over = signals.verify_age["over_1w"] ?? 0;
    const all = sum(signals.verify_age);
    if (all >= 20 && over > 0) {
      // The one line a stranger reads free stops at the age: who read is not in the data (the went-well gap line).
      return { sentence: `${over} of ${all} receipt re-checks between ${window.from} and ${window.to} came more than a week after minting.`, source: `verify age counters, organic, ${span}` };
    }
    const refusals = sum(signals.refusal);
    if (refusals >= 10) {
      const [lead, n] = top(signals.refusal, 1)[0] ?? ["", 0];
      return { sentence: `${refusals} agents were refused before paying between ${window.from} and ${window.to}; the field that led was ${lead.replace(/:/g, " → ")} (${n}).`, source: `buyer signals, refusals, ${span}` };
    }
  }
  if (corpus) {
    const hosts = corpus.snapshot.round.hosts;
    const ready = hosts.filter((h) => h.verdict === "ready").length;
    if (hosts.length > 0) return { sentence: `${ready} of ${hosts.length} listed x402 doors served a well-formed challenge in the signed round ${corpus.snapshot.week}.`, source: `corpus sequence ${corpus.snapshot.sequence}` };
  }
  return null;
}

export async function draftOpenForBusiness(env: Env, now: Date = new Date(), pulls?: PullsFetcher): Promise<OpenForBusinessDraft> {
  const week = currentWeekKey(now);
  const window = countedWindow(week, now);
  const unread: string[] = [];
  if (window.days === 0) {
    // Nothing counted: the week closed before the twins were live. Every reader is "not read", never zero (rule 52).
    const changes = await attempt("the week's changes", unread, () => weekChanges(env, week, now, pulls));
    return emptyDraft(week, window, now, changes, unread);
  }
  // The decline desk is scanned by date, not by period key: the window's days, and no earlier.
  const dayAfter = new Date(Date.parse(`${window.to}T00:00:00Z`) + 86_400_000).toISOString();
  const [signals, paid, declines, ledger, surfaces, pulse, clients, corpus, changes] = await Promise.all([
    attempt("buyer signals", unread, () => readBuyerSignals(env, week)),
    attempt("disclosure census", unread, () => readDisclosureCensus(env, "paid", week)),
    attempt("decline desk", unread, () => readDeclines(env, undefined, { since: `${window.from}T00:00:00.000Z`, before: dayAfter })),
    attempt("week ledger", unread, () => readMonthLedger(env, week)),
    attempt("porch surfaces", unread, () => observeSurfaces(env, week)),
    attempt("pulse", unread, () => computePulse(env)),
    attempt("mcp client census", unread, () => readMcpClients(env, week)),
    attempt("corpus", unread, () => latestCorpusEntry(env)),
    attempt("the week's changes", unread, () => weekChanges(env, week, now, pulls)),
  ]);
  const weekChangeRows: WeekChanges = changes ?? { week, read: false, read_at: now.toISOString(), rows: [], truncated: false };
  if (changes && !changes.read) unread.push("the week's changes");
  return {
    week,
    window,
    drafted_at: now.toISOString(),
    number_of_the_week: numberOfTheWeek(signals, corpus, window),
    sections: [
      hungUp(signals, declines, paid, window),
      wentWell(signals, ledger, paid, window),
      entryPoints(surfaces, clients, ledger, window),
      latency(pulse, corpus),
      whoLooked(signals, window),
    ],
    fix_of_the_week: renderWeekChangesMarkdown(weekChangeRows),
    changes: weekChangeRows,
    unread,
  };
}

/** A week with no counted days: every section unread, the fix of the week still derived. */
function emptyDraft(week: string, window: CountedWindow, now: Date, changes: WeekChanges | null, unread: string[]): OpenForBusinessDraft {
  const weekChangeRows: WeekChanges = changes ?? { week, read: false, read_at: now.toISOString(), rows: [], truncated: false };
  if (changes && !changes.read) unread.push("the week's changes");
  const gone = `The week counters went live on ${OPEN_FOR_BUSINESS_WEEK_COUNTERS_SINCE}; this week closed before that, and nothing was counted for it.`;
  const section = (heading: string): DraftSection => ({ heading, lead: gone, numbers: [], rows: [], not_seen: [gone], unread: true });
  return {
    week,
    window,
    drafted_at: now.toISOString(),
    number_of_the_week: null,
    sections: ["Where they got hung up", "What went well", "Entry points", "Latency and the silent turnaway", "Who looked at the record"].map(section),
    fix_of_the_week: renderWeekChangesMarkdown(weekChangeRows),
    changes: weekChangeRows,
    unread,
  };
}

/** The last instant of an ISO week, UTC: the draft for a closed week is laid as of then. */
export function weekCloseInstant(week: string): Date {
  return new Date(weekBounds(week).end.getTime() - 1000);
}

/** The week the hourly press would put up next, and when: the current week, on its first firing after it closes. */
export function nextAutomaticIssue(now: Date = new Date()): { week: string; at: string } {
  const week = currentWeekKey(now);
  const end = weekBounds(week).end;
  return { week, at: new Date(end.getTime() + 30 * 60 * 1000).toISOString() };
}

export interface ClosedWeekPress {
  week: string;
  outcome: "published" | "already_on_shelf" | "before_opening" | "nothing_counted" | "refused";
  issue?: OpenForBusinessIssue;
  refused?: string;
}

/**
 * THE MONDAY PRESS. On each hourly firing, the week that has just
 * closed goes on the shelf if it is not there already. Idempotent per
 * week: a keeper-published issue, or one an earlier firing put up,
 * is never overwritten. Weeks that closed before the shelf opened are
 * skipped, so the first deploy does not sell a week nobody drafted;
 * so are weeks the week counters never saw (2026-09-28).
 */
export async function publishClosedWeek(env: Env, now: Date = new Date(), pulls?: PullsFetcher): Promise<ClosedWeekPress> {
  const week = previousWeekKey(currentWeekKey(now));
  const closedOn = weekCloseInstant(week).toISOString().slice(0, 10);
  if (closedOn < OPEN_FOR_BUSINESS_OPENED) return { week, outcome: "before_opening" };
  const held = await findOpenForBusinessIssue(env, week);
  if (held) return { week, outcome: "already_on_shelf", issue: held };
  // A week the twins never counted is not sold: an issue of "not read" five times over is not an issue.
  if (countedWindow(week, weekCloseInstant(week)).days === 0) return { week, outcome: "nothing_counted" };
  const draft = await draftOpenForBusiness(env, weekCloseInstant(week), pulls);
  const result = await saveOpenForBusinessIssue(env, {
    week,
    markdown: renderOpenForBusinessMarkdown(draft),
    today: now.toISOString().slice(0, 10),
  });
  if (result.refused) return { week, outcome: "refused", refused: result.refused };
  return { week, outcome: "published", issue: result.saved! };
}

/** Monday of the week, for the page. */
export function weekMondayIso(week: string): string {
  return weekKeyMonday(week).toISOString().slice(0, 10);
}

/** The draft as Markdown the keeper can paste, edit and sign. */
export function renderOpenForBusinessMarkdown(draft: OpenForBusinessDraft): string {
  const lines: string[] = [];
  lines.push(`# Open for Business — ${draft.week}`);
  lines.push("");
  lines.push("## The number of the week");
  lines.push("");
  lines.push(draft.number_of_the_week ? `**${draft.number_of_the_week.sentence}** (${draft.number_of_the_week.source})` : "_The instruments did not produce one this week; the keeper picks it._");
  lines.push("");
  /*
   * The standing line is a blockquote, not prose, so the free line on
   * the index (the first prose after the number of the week, per
   * open-for-business-store.ts) is a fact of the week and not the
   * same sentence every week. It also names the counted window once,
   * because the first issue and an open week count fewer than seven days.
   */
  lines.push(`> _The week in agent buying, from the till at scvd.store and the doors it probes. Drafted ${draft.drafted_at.slice(0, 10)}. Counted ${draft.window.days === 0 ? `nothing: the week counters went live on ${OPEN_FOR_BUSINESS_WEEK_COUNTERS_SINCE}` : `${draft.window.from} to ${draft.window.to}, ${draft.window.days} days${draft.window.whole ? ", the whole week" : ""}`}. Every number carries the denominator it came from, and every section names what it could not see._`);
  lines.push("");
  for (const section of draft.sections) {
    lines.push(`## ${section.heading}`);
    lines.push("");
    if (section.unread) {
      lines.push("_Not read this week: the instrument behind this section did not answer._");
      lines.push("");
      continue;
    }
    lines.push(section.lead);
    lines.push("");
    for (const n of section.numbers) {
      lines.push(`- ${n.label}: **${n.value}**${n.of !== undefined ? ` of ${n.of}` : ""}${n.note ? ` (${n.note})` : ""}`);
    }
    if (section.rows.length > 0) {
      lines.push("");
      lines.push("| row | count |");
      lines.push("|---|---|");
      for (const [k, n] of section.rows) lines.push(`| \`${k}\` | ${n} |`);
    }
    lines.push("");
    lines.push("What this section did not see:");
    for (const gap of section.not_seen) lines.push(`- ${gap}`);
    lines.push("");
  }
  lines.push("## The fix of the week");
  lines.push("");
  lines.push(draft.fix_of_the_week || renderWeekChangesMarkdown(draft.changes));
  lines.push("");
  if (draft.unread.length > 0) {
    lines.push(`_Readers that did not answer this draft: ${draft.unread.join(", ")}._`);
    lines.push("");
  }
  return lines.join("\n");
}
