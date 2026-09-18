import { readBuyerSignals, type BuyerSignals } from "@/services/buyer-signals";
import { readDisclosureCensus, type DisclosureCensus } from "@/services/disclosure-census";
import { readDeclines } from "@/lib/declines";
import { readMonthLedger } from "@/lib/metrics";
import { metricsMonth } from "@/lib/metrics";
import { computeObservatory } from "@/services/observatory";
import { computePulse, type LatencyRoute } from "@/services/pulse";
import { readMcpClients } from "@/services/mcp-clients";
import { latestCorpusEntry } from "@/services/corpus-list";
import { currentWeekKey } from "@/lib/kv-keys";
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
 * WHAT THIS IS NOT. Not a publication surface. The draft is read on
 * /admin/open-for-business by the keeper, who writes the fix of the week in
 * his own words, cuts what the week does not support, and presses
 * publish himself (rule 30). Rule 34 is the reason the draft exists:
 * the Sunday read is half an hour when the tables are already laid.
 *
 * WHAT IT READS. Only readers that already exist and already serve
 * the admin desk — buyer signals, the disclosure census, the decline
 * desk, the month ledger, the observatory, the pulse, the MCP client
 * census, the latest signed corpus round. Each is read on its own
 * and a reader that fails leaves its section marked "not read", never
 * a zero pretending to be a count (rule 52).
 */

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
  month: string;
  drafted_at: string;
  number_of_the_week: { sentence: string; source: string } | null;
  sections: DraftSection[];
  /** Left blank on purpose: the keeper's pen. */
  fix_of_the_week: string;
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

function hungUp(signals: BuyerSignals | null, declines: Awaited<ReturnType<typeof readDeclines>> | null): DraftSection {
  const refusals = signals ? sum(signals.refusal) : 0;
  const byReason: Record<string, number> = {};
  if (signals) {
    for (const [k, n] of Object.entries(signals.refusal)) {
      const reason = k.split(":")[2] ?? "other";
      byReason[reason] = (byReason[reason] ?? 0) + n;
    }
  }
  const numbers: SectionNumber[] = [];
  if (signals) {
    numbers.push({ label: "pre-payment 400s this month", value: refusals });
    for (const [reason, n] of top(byReason, 4)) numbers.push({ label: `…${reason}`, value: n, of: refusals });
    numbers.push({ label: "purchases that bought a worked example as-is", value: sum(signals.examples) });
  }
  if (declines) {
    numbers.push({ label: "payments presented and declined (outside, all time on the desk)", value: declines.outside_count, note: declines.index_complete ? "index read to its end" : "scan capped; a floor" });
  }
  const rows = [
    ...(signals ? top(signals.refusal) : []),
    ...(declines ? top(declines.by_reason, 4).map(([k, n]) => [`decline:${k}`, n] as [string, number]) : []),
  ];
  return {
    heading: "Where they got hung up",
    lead: refusals === 0 && (!declines || declines.outside_count === 0)
      ? "Nobody was refused before paying this month, and nobody who paid was declined."
      : `${refusals} agents were refused before paying this month, ${byReason["missing"] ?? 0} for a field they left out, ${byReason["malformed"] ?? 0} for a field in the wrong shape, ${byReason["example"] ?? 0} for pasting the worked example back.`,
    numbers,
    rows,
    not_seen: [
      "A client that throws on its own spend cap, drops a rail its SDK never registered, or times out before the retry never reaches this door; it prints here as a 402 followed by silence.",
      "The refusal names the field, not the model that sent it; the disclosure block would, and this month it was left blank.",
    ],
    unread: !signals && !declines,
  };
}

function wentWell(signals: BuyerSignals | null, ledger: Awaited<ReturnType<typeof readMonthLedger>> | null, paid: DisclosureCensus | null): DraftSection {
  const numbers: SectionNumber[] = [];
  if (ledger) {
    const settles = sum(ledger.channels);
    numbers.push({ label: "organic settles this month", value: settles, note: ledger.truncated ? "ledger scan capped; a floor" : undefined });
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
    lead: all > 0
      ? `${over} of ${all} receipt re-checks came more than a week after minting: somebody the buyer showed the artifact to, checking it without us.`
      : "No receipt has been re-checked yet this month.",
    numbers,
    rows: signals ? top(signals.rail) : [],
    not_seen: [
      "A settle is a wallet, not a buyer: one buyer paying from two wallets counts twice, a facilitator settling for twenty counts once.",
      "Re-check age says when, not who; the store keeps no cookies and no IPs and cannot tell two readers apart.",
    ],
    unread: !signals && !ledger,
  };
}

function entryPoints(observatory: Awaited<ReturnType<typeof computeObservatory>> | null, clients: Record<string, number> | null, ledger: Awaited<ReturnType<typeof readMonthLedger>> | null, month: string): DraftSection {
  const numbers: SectionNumber[] = [];
  const rows: Array<[string, number]> = [];
  const thisMonth = observatory?.months.find((m) => m.month === month) ?? observatory?.months[0];
  if (thisMonth) {
    numbers.push({ label: "organic surface visits this month", value: thisMonth.organic_visits, note: thisMonth.truncated ? "ledger scan capped; a floor" : undefined });
    for (const s of [...thisMonth.surfaces].sort((a, b) => b.organic - a.organic).slice(0, ROW_CAP)) rows.push([s.surface, s.organic]);
  }
  if (ledger) {
    const challenges = sum(ledger.channels402);
    numbers.push({ label: "402s issued to organic traffic", value: challenges });
    for (const [channel, n] of top(ledger.channels402, 4)) numbers.push({ label: `…on the ${channel} channel`, value: n, of: challenges });
  }
  if (clients) {
    const handshakes = sum(clients);
    numbers.push({ label: "MCP handshakes, by client name", value: handshakes });
    for (const [client, n] of top(clients, 4)) numbers.push({ label: `…${client}`, value: n, of: handshakes });
  }
  return {
    heading: "Entry points",
    lead: thisMonth
      ? `Agents arrived through ${thisMonth.surfaces.length} counted surfaces this month; the top of the list is where a seller's own door should be legible first.`
      : "The observatory did not read this month.",
    numbers,
    rows,
    not_seen: [
      "Directory attribution is near-unmeasurable by design: a marker on the declared resource URL would corrupt the thing it measures.",
      "Context carryover, artifact citation and skill propagation arrive as fresh requests with no referrer; the counts here are floors on where agents actually learn of a door.",
    ],
    unread: !observatory && !ledger && !clients,
  };
}

function latency(pulse: Awaited<ReturnType<typeof computePulse>> | null, corpus: Awaited<ReturnType<typeof latestCorpusEntry>> | null): DraftSection {
  const numbers: SectionNumber[] = [];
  const rows: Array<[string, number]> = [];
  if (pulse) {
    for (const [route, r] of Object.entries(pulse.latency.routes) as Array<[string, LatencyRoute]>) {
      numbers.push({ label: `${route}: median ${rangeText(r.p50_ms_range)}, p95 ${rangeText(r.p95_ms_range)}`, value: r.samples, note: "samples; a floor" });
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
    numbers.push({ label: `doors probed in the signed round ${corpus.snapshot.week}`, value: probed });
    numbers.push({ label: "…that answered with a timing", value: answered, of: probed });
    for (const [bucket, n] of Object.entries(buckets)) rows.push([bucket, n]);
  }
  return {
    heading: "Latency and the silent turnaway",
    lead: corpus && answered > 0
      ? `${buckets["over_3s"] ?? 0} of ${answered} doors that answered the weekly round took more than three seconds. A stock client gives up on a door before it gives up on a price.`
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
 * many came referred from the subject itself, how many subjects were
 * read more than once, and which crawlers walked. Never a host name:
 * that table is the keeper's and stays on the signals page.
 */
function whoLooked(signals: BuyerSignals | null): DraftSection {
  const numbers: SectionNumber[] = [];
  const rows: Array<[string, number]> = [];
  let reads = 0;
  let self = 0;
  const byReader: Record<string, number> = {};
  if (signals) {
    for (const [k, n] of Object.entries(signals.pages)) {
      const [page, , reader, relation] = k.split(":");
      if (reader === "crawler") continue;
      reads += n;
      byReader[`${page ?? "page"} by ${reader ?? "unnamed"}`] = (byReader[`${page ?? "page"} by ${reader ?? "unnamed"}`] ?? 0) + n;
      if (relation === "self") self += n;
    }
    const repeats = Object.entries(signals.subjects).filter(([k, n]) => k !== "other" && n >= 2).length;
    numbers.push({ label: "reads of a host page or a passport by a browser or an agent", value: reads });
    numbers.push({ label: "…referred from the subject host itself", value: self, of: reads });
    numbers.push({ label: "hosts whose record was read more than once", value: repeats, of: Object.keys(signals.subjects).filter((k) => k !== "other").length });
    for (const [k, n] of top(byReader, 4)) rows.push([k, n]);
    for (const [k, n] of top(signals.crawlers, 4)) rows.push([`crawler ${k}`, n]);
  }
  return {
    heading: "Who looked at the record",
    lead: reads > 0
      ? `${reads} reads of a page about a door came from a browser or an agent this month, ${self} of them from the door itself: operators checking their own listing, which is the reader a seller should assume.`
      : "No page about a door has been read by anyone but a crawler this month.",
    numbers,
    rows,
    not_seen: [
      "A read is not a reader: with no cookie and no IP kept, two reads of one record may be one person twice or two people once, and the store does not try to tell.",
      "A crawler that reads every page once at the same count is an index walk, not interest; those are named by crawler and kept out of every number above.",
      "Hosts are never named here. The seller reading this is welcome to ask for its own record at /corpus/host/{host}, which is free.",
    ],
    unread: !signals,
  };
}

function numberOfTheWeek(signals: BuyerSignals | null, corpus: Awaited<ReturnType<typeof latestCorpusEntry>> | null): OpenForBusinessDraft["number_of_the_week"] {
  if (signals) {
    const over = signals.verify_age["over_1w"] ?? 0;
    const all = sum(signals.verify_age);
    if (all >= 20 && over > 0) {
      return { sentence: `${over} of ${all} receipt re-checks this month came more than a week after minting, from someone other than the buyer.`, source: "verify age counters, organic, this month" };
    }
    const refusals = sum(signals.refusal);
    if (refusals >= 10) {
      const [lead, n] = top(signals.refusal, 1)[0] ?? ["", 0];
      return { sentence: `${refusals} agents were refused before paying this month; the field that led was ${lead.replace(/:/g, " → ")} (${n}).`, source: "buyer signals, refusals" };
    }
  }
  if (corpus) {
    const hosts = corpus.snapshot.round.hosts;
    const ready = hosts.filter((h) => h.verdict === "ready").length;
    if (hosts.length > 0) return { sentence: `${ready} of ${hosts.length} listed x402 doors served a well-formed challenge in the signed round ${corpus.snapshot.week}.`, source: `corpus sequence ${corpus.snapshot.sequence}` };
  }
  return null;
}

export async function draftOpenForBusiness(env: Env, now: Date = new Date()): Promise<OpenForBusinessDraft> {
  const month = metricsMonth(now);
  const unread: string[] = [];
  const [signals, paid, declines, ledger, observatory, pulse, clients, corpus] = await Promise.all([
    attempt("buyer signals", unread, () => readBuyerSignals(env, month)),
    attempt("disclosure census", unread, () => readDisclosureCensus(env, "paid", month)),
    attempt("decline desk", unread, () => readDeclines(env)),
    attempt("month ledger", unread, () => readMonthLedger(env, month)),
    attempt("observatory", unread, () => computeObservatory(env, now)),
    attempt("pulse", unread, () => computePulse(env)),
    attempt("mcp client census", unread, () => readMcpClients(env, month)),
    attempt("corpus", unread, () => latestCorpusEntry(env)),
  ]);
  return {
    week: currentWeekKey(now),
    month,
    drafted_at: now.toISOString(),
    number_of_the_week: numberOfTheWeek(signals, corpus),
    sections: [
      hungUp(signals, declines),
      wentWell(signals, ledger, paid),
      entryPoints(observatory, clients, ledger, month),
      latency(pulse, corpus),
      whoLooked(signals),
    ],
    fix_of_the_week: "",
    unread,
  };
}

/** The draft as Markdown the keeper can paste, edit and sign. */
export function renderOpenForBusinessMarkdown(draft: OpenForBusinessDraft): string {
  const lines: string[] = [];
  lines.push(`# Open for Business — ${draft.week}`);
  lines.push("");
  lines.push(`_The week in agent buying, from the till at scvd.store and the doors it probes. Drafted ${draft.drafted_at.slice(0, 10)}; every number carries the denominator it came from, and every section names what it could not see._`);
  lines.push("");
  lines.push("## The number of the week");
  lines.push("");
  lines.push(draft.number_of_the_week ? `**${draft.number_of_the_week.sentence}** (${draft.number_of_the_week.source})` : "_The instruments did not produce one this week; the keeper picks it._");
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
  lines.push(draft.fix_of_the_week || "_Keeper's pen. One change a seller can make on Monday, with our own before and after._");
  lines.push("");
  if (draft.unread.length > 0) {
    lines.push(`_Readers that did not answer this draft: ${draft.unread.join(", ")}._`);
    lines.push("");
  }
  return lines.join("\n");
}
