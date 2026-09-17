import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { derivedFromCorpus, type CorpusRecord } from "@/services/corpus-list";
import { deriveWeeklyBrief } from "@/services/weekly-brief";
import { effectivePassportObservation } from "@/services/passport";
import type { SubjectHistory } from "@/services/subject-history";
import { CORRECTIONS, CORRECTIONS_POINTER } from "@/store/corrections";
import { DISAGREEMENTS } from "@/store/disagreements";
import type { Env, HonoEnv } from "@/types";

/**
 * THE FEEDS (2026-09-03, roadmap V2). Four Atom feeds, each derived at
 * request from the same store the page it mirrors reads — never a
 * second copy of anything:
 *
 *   /feeds/brief.xml          one entry per signed week, The Week's Doors
 *   /feeds/corpus.xml         one entry per signed snapshot on the chain
 *   /feeds/corrections.xml    one entry per correction, newest first
 *   /feeds/disagreements.xml  one entry per divergence on the record
 *
 * And one per host (2026-09-17), derived from the same replay the
 * per-host history page reads:
 *
 *   /feeds/host/{host}.xml    one entry per change in what the chain
 *                             recorded about ONE door — first probe,
 *                             every verdict change, every change in
 *                             the set of addresses it asks to be paid at
 *
 * WHY ATOM AND WHY NOW. Aggregators, newsletters and the agents that
 * poll feeds pick a site up without being told about it; every entry
 * here links the page it came from, so a reader who arrives through
 * a feed lands on the derivation and the denominator, not a summary.
 * Atom rather than RSS because Atom requires a dated `updated` on
 * every entry and a stable `id`, which is what a dated record wants.
 *
 * NEVER A RANKING. The brief feed says how many doors were payable of
 * how many probed; it does not name a best door. Entries are in date
 * order, newest first, because that is what a feed reader expects,
 * and for no other reason.
 */
export const feedsRoutes = new Hono<HonoEnv>();

export interface FeedEntry {
  id: string;
  title: string;
  link: string;
  /** ISO 8601. */
  updated: string;
  summary: string;
}

export interface FeedDescription {
  path: string;
  name: string;
  /** What the feed carries, in one line, for the index page and the atlas. */
  what: string;
  /** How often a poller can expect a new entry. */
  cadence: string;
  /** Requests this feed serves, shared with the ARD catalog. */
  representativeQueries: string[];
}

export const FEEDS: readonly FeedDescription[] = [
  {
    path: "/feeds/brief.xml",
    name: "The Week's Doors",
    what: "One entry per signed week: doors named, probed, payable and not, defects by name, the gaps counted against the observer. Each entry links the week's stable page.",
    cadence: "weekly, after the Sunday round",
    representativeQueries: [
      "subscribe to weekly x402 endpoint census summaries",
      "follow weekly counts of x402 doors probed and payment challenges observed",
    ],
  },
  {
    path: "/feeds/corpus.xml",
    name: "The corpus chain",
    what: "One entry per signed snapshot appended to the corpus, with its sequence, week and digest. Each entry links the snapshot's JSON, the bytes a signature covers.",
    cadence: "weekly, after the Sunday round",
    representativeQueries: [
      "subscribe to new signed x402 corpus snapshots",
      "follow additions to the x402 observation chain with snapshot digests",
    ],
  },
  {
    path: "/feeds/corrections.xml",
    name: "Corrections",
    what: "One entry per correction this store has published against itself: what was wrong, how long, who found it, what changed.",
    cadence: "when we get something wrong",
    representativeQueries: [
      "subscribe to corrections SCVD publishes about its own work",
      "get an Atom update when SCVD fixes a reported mistake",
    ],
  },
  {
    path: "/feeds/disagreements.xml",
    name: "Disagreements",
    what: "One entry per divergence between this store's reading and another instrument's, with its state; both readings live on the page the entry links.",
    cadence: "from a named trigger, never on a timer",
    representativeQueries: [
      "follow disagreements between SCVD and other verification instruments",
      "subscribe to published differences between x402 endpoint observations",
    ],
  },
];

/**
 * THE PER-HOST FEED (2026-09-17). Read off robinsaige.com's record of
 * this store's own MCP door, which offers "subscribe to its change
 * feed — outcome changes and confirmed drift, no account needed" per
 * subject. That is the right shape for a depender: an agent that
 * relies on ONE door does not want the week's census, it wants to be
 * woken when that door's record moves. This store had the record —
 * /corpus/host/{host}.json replays every verdict change and every
 * pay-to change — and no way to poll one host without polling the
 * whole chain.
 *
 * WHAT AN ENTRY IS. A change in what the signed chain recorded about
 * the host: the first probe on record, each verdict transition
 * (ready → not_ready and back), and each change in the set of
 * receiving addresses the door's own 402 named (as digests, per the
 * G2 ruling — never the address). A week with no entry is either an
 * unchanged verdict or a week we did not walk; the per-host history
 * the feed links says which, and this feed does not pretend to.
 *
 * NOT IN `FEEDS`. That array is the four fixed-path feeds the ARD
 * catalog lists as documents; a template with a hostname in it is
 * not a document, so it is described here and advertised beside the
 * four rather than among them.
 */
export const HOST_FEED: FeedDescription = {
  path: "/feeds/host/{host}.xml",
  name: "One host's changes",
  what: "One entry per change in what the signed chain recorded about one host: the first probe, every verdict change, every change in the set of addresses the door asks to be paid at (as digests). Each entry links the host's history page, where every round we missed carries its reason.",
  cadence: "weekly at most, after the Sunday round; silent while nothing changed",
  representativeQueries: [
    "subscribe to changes in one x402 endpoint's readiness verdict",
    "be notified when an x402 door I depend on changes its receiving address",
  ],
};

/**
 * Pure over the replayed history. Ids are anchored on the history page
 * by week and kind, which is stable because the chain records one row
 * per host per week and a signed week never changes.
 */
export function hostEntriesOf(history: SubjectHistory, base: string): FeedEntry[] {
  const host = history.host;
  const page = `${base}/corpus/host/${host}`;
  const entries: FeedEntry[] = [];
  const firstProbed = history.timeline.find((round) => round.probed && round.verdict);
  if (firstProbed) {
    const failed = firstProbed.failed ?? [];
    entries.push({
      id: `${page}#${firstProbed.week}-first-probe`,
      title: `${host}: first probe on record, ${firstProbed.verdict}`,
      link: page,
      updated: firstProbed.observed_at ?? firstProbed.taken_at,
      summary: `First probed round on the signed chain: verdict ${firstProbed.verdict} in week ${firstProbed.week}, snapshot ${firstProbed.sequence} (${firstProbed.entry_url}). ${failed.length === 0 ? "No failing checks named." : `Failing checks: ${failed.join(", ")}.`} Later entries are changes only; a week with none is unchanged or unwalked, and the history page says which. Not a ranking.`,
    });
  }
  for (const change of history.verdict_changes) {
    entries.push({
      id: `${page}#${change.week}-verdict`,
      title: `${host}: ${change.from} → ${change.to}`,
      link: page,
      updated: change.at,
      summary: `Verdict changed from ${change.from} to ${change.to} in week ${change.week}, observed ${change.at}. The row, its failing checks and the snapshot it sits in are at ${page}.json. A change is a dated observation of a moment, not a rating.`,
    });
  }
  for (const change of history.pay_to?.changes ?? []) {
    const round = history.timeline.find((entry) => entry.sequence === change.sequence);
    if (!round) continue;
    entries.push({
      id: `${page}#${change.week}-pay-to`,
      title: `${host}: receiving address set changed`,
      link: page,
      updated: round.observed_at ?? round.taken_at,
      summary: `The set of addresses this door's own 402 asks to be paid at differed from the previous captured round: ${change.from.length} digest${change.from.length === 1 ? "" : "s"} before, ${change.to.length} after, in week ${change.week} (snapshot ${change.sequence}). Digests and how to match one against the door's current payTo are in ${page}.json; the address itself is not published here. This feed cannot tell a rotated wallet from a hijacked door — it says the set differed.`,
    });
  }
  return entries.sort((a, b) => b.updated.localeCompare(a.updated));
}

const FEED_AUTHOR = "scvd.store";

function isoDate(date: string): string {
  // Dates on the stores are YYYY-MM-DD; Atom wants a full timestamp.
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date;
}

function firstSentence(text: string, cap = 140): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > cap ? `${sentence.slice(0, cap - 1)}…` : sentence;
}

/** Atom 1.0, hand-assembled: every text node escaped, nothing else clever. */
export function renderAtom(options: {
  base: string;
  path: string;
  title: string;
  subtitle: string;
  pageLink: string;
  entries: FeedEntry[];
}): string {
  const updated =
    options.entries.map((entry) => entry.updated).sort().at(-1) ?? new Date().toISOString();
  const entries = options.entries
    .map(
      (entry) => `  <entry>
    <id>${escapeHtml(entry.id)}</id>
    <title>${escapeHtml(entry.title)}</title>
    <link rel="alternate" href="${escapeHtml(entry.link)}"/>
    <updated>${escapeHtml(entry.updated)}</updated>
    <summary>${escapeHtml(entry.summary)}</summary>
  </entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escapeHtml(`${options.base}${options.path}`)}</id>
  <title>${escapeHtml(options.title)}</title>
  <subtitle>${escapeHtml(options.subtitle)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeHtml(`${options.base}${options.path}`)}"/>
  <link rel="alternate" type="text/html" href="${escapeHtml(options.pageLink)}"/>
  <updated>${escapeHtml(updated)}</updated>
  <author><name>${FEED_AUTHOR}</name></author>
${entries}
</feed>
`;
}

export function briefEntries(env: Env, base: string): Promise<FeedEntry[]> {
  return derivedFromCorpus(env, "feed-brief", (records) => briefEntriesOf(records, base));
}

export function briefEntriesOf(records: CorpusRecord[], base: string): FeedEntry[] {
  const { known_weeks } = deriveWeeklyBrief(records, base);
  const entries: FeedEntry[] = [];
  for (const week of known_weeks) {
    const { brief } = deriveWeeklyBrief(records, base, week);
    if (!brief) continue;
    entries.push({
      id: `${base}/corpus/round/${brief.week}`,
      title: `Week ${brief.week}: ${brief.doors.payable} of ${brief.doors.probed} probed doors payable`,
      link: `${base}/corpus/round/${brief.week}`,
      updated: brief.taken_at,
      summary: `${brief.doors.listed} doors named, ${brief.doors.probed} probed, ${brief.doors.payable} payable and ${brief.doors.not_payable} not, ${brief.doors.unreachable} unreachable; ${brief.defects.length} defect class${brief.defects.length === 1 ? "" : "es"} named; ${brief.our_gaps.not_probed} named and not probed, counted against us. Signed snapshot ${brief.sequence}. Not a ranking.`,
    });
  }
  return entries.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function corpusEntries(env: Env, base: string): Promise<FeedEntry[]> {
  return derivedFromCorpus(env, "feed-corpus", (records) => corpusEntriesOf(records, base));
}

export function corpusEntriesOf(records: CorpusRecord[], base: string): FeedEntry[] {
  return records
    .map((record) => ({
      id: `${base}/corpus/${record.snapshot.sequence}.json`,
      title: `Snapshot ${record.snapshot.sequence}, week ${record.snapshot.week}`,
      link: `${base}/corpus/${record.snapshot.sequence}.json`,
      updated: record.snapshot.taken_at,
      summary: `Signed snapshot ${record.snapshot.sequence} of the corpus chain, week ${record.snapshot.week}, digest ${record.digest}. Timestamp: ${record.ots?.status ?? "not submitted"}${record.ots?.status === "complete" ? " (proof available; verify against Bitcoin independently)" : ""}. The linked JSON contains the signed snapshot; recompute its canonical bytes and verify with the store's public key or your own library.`,
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export function correctionEntries(base: string): FeedEntry[] {
  return [...CORRECTIONS]
    .map((correction, index) => ({
      id: `${base}/corrections#${correction.date}-${index}`,
      title: `${correction.date}: ${firstSentence(correction.what_was_wrong)}`,
      link: `${base}/corrections`,
      updated: isoDate(correction.date),
      summary: `What was wrong: ${correction.what_was_wrong} How long: ${correction.how_long} Found by: ${correction.found_by} What changed: ${correction.what_changed}`,
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export function disagreementEntries(base: string): FeedEntry[] {
  return [...DISAGREEMENTS]
    .map((entry) => ({
      id: `${base}/disagreements#${entry.id}`,
      title: `${entry.subject} — ${entry.state.replace(/_/g, " ")}`,
      link: `${base}/disagreements#${entry.id}`,
      updated: isoDate(entry.published_on),
      summary: `Trigger: ${entry.trigger} Ours (${entry.ours.instrument}): ${entry.ours.said} Theirs (${entry.theirs.instrument}): ${entry.theirs.said} State: ${entry.state}, resting on ${entry.state_rests_on} Sent to the other side ${entry.sent_privately_on}, published ${entry.published_on}.`,
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

function atomResponse(c: { body: (body: string, status: number, headers: Record<string, string>) => Response }, xml: string): Response {
  return c.body(xml, 200, {
    "Content-Type": "application/atom+xml; charset=utf-8",
    "Cache-Control": "public, max-age=900",
  });
}

feedsRoutes.get("/feeds/brief.xml", async (c) => {
  const base = c.env.STORE_BASE_URL;
  return atomResponse(
    c,
    renderAtom({
      base,
      path: "/feeds/brief.xml",
      title: "The Week's Doors — scvd.store",
      subtitle: `One entry per signed week of the x402 corpus: doors named, probed, payable and not, defects by name, the gaps counted against the observer. Never a ranking. ${CORRECTIONS_POINTER}`,
      pageLink: `${base}/corpus/brief`,
      entries: await briefEntries(c.env, base),
    }),
  );
});

feedsRoutes.get("/feeds/corpus.xml", async (c) => {
  const base = c.env.STORE_BASE_URL;
  return atomResponse(
    c,
    renderAtom({
      base,
      path: "/feeds/corpus.xml",
      title: "The corpus chain — scvd.store",
      subtitle: `One entry per signed snapshot appended to the corpus, each linking the exact bytes its signature covers. ${CORRECTIONS_POINTER}`,
      pageLink: `${base}/corpus`,
      entries: await corpusEntries(c.env, base),
    }),
  );
});

feedsRoutes.get("/feeds/corrections.xml", (c) => {
  const base = c.env.STORE_BASE_URL;
  return atomResponse(
    c,
    renderAtom({
      base,
      path: "/feeds/corrections.xml",
      title: "Corrections — scvd.store",
      subtitle: "Every correction this store has published against itself: what was wrong, how long, who found it, what changed so it cannot recur silently.",
      pageLink: `${base}/corrections`,
      entries: correctionEntries(base),
    }),
  );
});

feedsRoutes.get("/feeds/disagreements.xml", (c) => {
  const base = c.env.STORE_BASE_URL;
  return atomResponse(
    c,
    renderAtom({
      base,
      path: "/feeds/disagreements.xml",
      title: "Disagreements — scvd.store",
      subtitle: `Where this store's reading and another instrument's diverge, both readings with their derivations; never published as settled while it is not. ${CORRECTIONS_POINTER}`,
      pageLink: `${base}/disagreements`,
      entries: disagreementEntries(base),
    }),
  );
});

/**
 * GET /feeds/host/{host}.xml — one door's changes, as Atom. The same
 * refusal the history page gives for a host the chain never carried:
 * a feed for a host we have never met would be an empty promise with
 * our name on it.
 */
feedsRoutes.get("/feeds/host/:file{.+\\.xml}", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const host = c.req.param("file").replace(/\.xml$/, "").toLowerCase();
  if (!host || host.length > 253 || !/^[a-z0-9.:_-]+$/i.test(host)) {
    return c.json(
      { error: `Ask for a host, e.g. ${base}/feeds/host/example.com.xml. The hosts the chain has met are at ${base}/doors.` },
      400,
    );
  }
  const { history } = await effectivePassportObservation(c.env, host);
  if (history.rounds_since_first_sighting === 0 && !history.listing) {
    return c.json(
      {
        error: `The chain has never carried ${host}, so there is nothing to subscribe to. Every host it has is at ${base}/doors; the per-host history is ${base}/corpus/host/{host}.json.`,
        doors: `${base}/doors`,
      },
      404,
    );
  }
  const path = `/feeds/host/${host}.xml`;
  return atomResponse(
    c,
    renderAtom({
      base,
      path,
      title: `${host} — changes on the record, scvd.store`,
      subtitle: `One entry per change in what the signed chain recorded about ${host}: first probe, verdict changes, receiving-address changes. Silent while nothing changed; a missed week is named on the history page with its reason, never here as a change. ${CORRECTIONS_POINTER}`,
      pageLink: `${base}/corpus/host/${host}`,
      entries: hostEntriesOf(history, base),
    }),
  );
});

const FEEDS_STANDFIRST =
  "Four Atom feeds, each derived when it is fetched from the same record the page it mirrors reads: the week's doors, the corpus chain, the corrections and the disagreements — and one per host, at /feeds/host/{host}.xml, that moves only when that door's record does. Every entry links the page it came from, so a reader who arrives through a feed lands on the derivation and the denominator. Nothing here is a ranking, and no feed carries anything the pages do not.";

feedsRoutes.get("/feeds", (c) => {
  const base = c.env.STORE_BASE_URL;
  const rows = FEEDS.map((feed) => ({ ...feed, url: `${base}${feed.path}` }));
  /*
   * Hoisted so the markdown twin below renders the same
   * object the JSON serves rather than a second copy.
   */
  const pagePayload = {
    title: "Feeds",
    summary: FEEDS_STANDFIRST,
    feeds: rows,
    per_host: { ...HOST_FEED, url_template: `${base}${HOST_FEED.path}` },
    corrections: CORRECTIONS_POINTER,
  };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/feeds",
      title: "Feeds",
      description: "Four Atom feeds derived from the store's own record: the week's doors, the corpus chain, the corrections and the disagreements. Never a ranking.",
      document: pagePayload as unknown as Record<string, unknown>,
    });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(pagePayload);
  }
  return c.html(
    renderSimplePage({
      title: "Feeds",
      description:
        "Four Atom feeds derived from the store's own record: the week's doors, the corpus chain, the corrections and the disagreements. Never a ranking.",
      path: "/feeds",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(FEEDS_STANDFIRST)}</p>
      </section>
      <section>
        <ul class="menu-desc">${rows
          .map(
            (feed) =>
              `<li><a href="${escapeHtml(feed.path)}"><strong>${escapeHtml(feed.name)}</strong></a> <code>${escapeHtml(feed.path)}</code> — ${escapeHtml(feed.what)} <em>${escapeHtml(feed.cadence)}.</em></li>`,
          )
          .join("")}</ul>
      </section>
      <section>
        <h2>One host at a time</h2>
        <p class="menu-desc"><strong>${escapeHtml(HOST_FEED.name)}</strong> <code>${escapeHtml(HOST_FEED.path)}</code> — ${escapeHtml(HOST_FEED.what)} <em>${escapeHtml(HOST_FEED.cadence)}.</em> The page it mirrors is <code>/corpus/host/{host}</code>, and every passport page advertises its host's feed in its head.</p>
      </section>
      <section>
        <p class="menu-meta">${escapeHtml(CORRECTIONS_POINTER)} JSON twin of this page at the same URL with <code>Accept: application/json</code>.</p>
      </section>`,
    }),
  );
});
