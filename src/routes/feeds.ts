import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { listCorpus } from "@/services/corpus";
import { deriveWeeklyBrief } from "@/services/weekly-brief";
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
}

export const FEEDS: readonly FeedDescription[] = [
  {
    path: "/feeds/brief.xml",
    name: "The Week's Doors",
    what: "One entry per signed week: doors named, probed, payable and not, defects by name, the gaps counted against the observer. Each entry links the week's stable page.",
    cadence: "weekly, after the Sunday round",
  },
  {
    path: "/feeds/corpus.xml",
    name: "The corpus chain",
    what: "One entry per signed snapshot appended to the corpus, with its sequence, week and digest. Each entry links the snapshot's JSON, the bytes a signature covers.",
    cadence: "weekly, after the Sunday round",
  },
  {
    path: "/feeds/corrections.xml",
    name: "Corrections",
    what: "One entry per correction this store has published against itself: what was wrong, how long, who found it, what changed.",
    cadence: "when we get something wrong",
  },
  {
    path: "/feeds/disagreements.xml",
    name: "Disagreements",
    what: "One entry per divergence between this store's reading and another instrument's, with its state; both readings live on the page the entry links.",
    cadence: "from a named trigger, never on a timer",
  },
];

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

export async function briefEntries(env: Env, base: string): Promise<FeedEntry[]> {
  const records = await listCorpus(env);
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

export async function corpusEntries(env: Env, base: string): Promise<FeedEntry[]> {
  const records = await listCorpus(env);
  return records
    .map((record) => ({
      id: `${base}/corpus/${record.snapshot.sequence}.json`,
      title: `Snapshot ${record.snapshot.sequence}, week ${record.snapshot.week}`,
      link: `${base}/corpus/${record.snapshot.sequence}.json`,
      updated: record.snapshot.taken_at,
      summary: `Signed snapshot ${record.snapshot.sequence} of the corpus chain, week ${record.snapshot.week}, digest ${record.digest}${record.ots ? ", Bitcoin-anchored" : ""}. The linked JSON is the exact bytes the signature covers; verify with the store's public key or your own library.`,
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

const FEEDS_STANDFIRST =
  "Four Atom feeds, each derived when it is fetched from the same record the page it mirrors reads: the week's doors, the corpus chain, the corrections and the disagreements. Every entry links the page it came from, so a reader who arrives through a feed lands on the derivation and the denominator. Nothing here is a ranking, and no feed carries anything the pages do not.";

feedsRoutes.get("/feeds", (c) => {
  const base = c.env.STORE_BASE_URL;
  const rows = FEEDS.map((feed) => ({ ...feed, url: `${base}${feed.path}` }));
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ title: "Feeds", summary: FEEDS_STANDFIRST, feeds: rows, corrections: CORRECTIONS_POINTER });
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
        <p class="menu-meta">${escapeHtml(CORRECTIONS_POINTER)} JSON twin of this page at the same URL with <code>Accept: application/json</code>.</p>
      </section>`,
    }),
  );
});
