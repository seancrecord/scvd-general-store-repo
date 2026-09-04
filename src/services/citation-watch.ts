import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import {
  judgePage,
  type CitationJudgement,
  type CitingSystem,
  type Fetched,
  type OutreachEntry,
} from "@/lib/citations";
import CITING_SYSTEMS_FILE from "@/store/citing-systems.json";
import OUTREACH_REGISTER from "../../registry/scorers-outreach.json";
import type { Env } from "@/types";

/**
 * THE CITATION WATCH ON THE SUNDAY PRESS (2026-09-04; the keeper:
 * "can we not just automate this weekly check in admin?").
 *
 * Two lists, one check, and since 2026-09-04 neither is typed twice.
 * The CITED REGISTER (src/store/citing-systems.json) is what /scorers
 * renders, and an entry whose page stops citing us is `gone` — the
 * page would then be making a claim its check no longer supports.
 * The OUTREACH REGISTER (registry/scorers-outreach.json, the keeper's
 * own sheet, rendered to a table by `npm run outreach:build`) holds
 * every system that scores or lists x402 doors; the watch reads the
 * ones we WROTE TO, plus any already carrying a row. One of those
 * starting to carry a row is the news the keeper was waiting on: it
 * pages, and it is printed on /admin/outreach beside the queue it
 * came from. Until then it is `silent`, which is not a finding. A
 * page that could not be read is `unreadable` and neither pages nor
 * counts.
 *
 * WHY THE WRITTEN-TO SET and not all 101: the cron watches who we
 * spoke to, which is the set where an answer is expected and which
 * costs one subrequest each. `npm run outreach:check` sweeps the
 * whole register from the keeper's machine, where no subrequest
 * budget applies. Same file, same matcher, two reaches.
 *
 * Nothing here edits either file: the watch reads, judges, stores
 * one report, and pages. Moving a prospect into the register is the
 * keeper's hand, against the five listing facts, so that /scorers
 * never names an occupant the keeper did not look at.
 */

export interface CitationWatchRow extends CitationJudgement {
  kind: "listed" | "prospect";
  /** Listed: the date first seen. Prospect: the date noted. */
  dated: string;
}

export interface CitationWatchReport {
  version: 1;
  checked_at: string;
  base: string;
  rows: CitationWatchRow[];
  /** Pages cited now that were not cited on the previous report. */
  newly_cited: string[];
  /** Listed systems gone now that were cited on the previous report. */
  newly_gone: string[];
}

const READ_TIMEOUT_MS = 10_000;
/** Bound the page read so a hostile or enormous page cannot fill memory. */
const READ_CAP_BYTES = 2_000_000;

function listedSystems(): CitingSystem[] {
  const systems = (CITING_SYSTEMS_FILE as { systems?: unknown }).systems;
  return Array.isArray(systems) ? (systems as CitingSystem[]) : [];
}

/** Every row of the outreach register, as written. */
export function outreachRegister(): OutreachEntry[] {
  const systems = (OUTREACH_REGISTER as { systems?: unknown }).systems;
  return Array.isArray(systems) ? (systems as OutreachEntry[]) : [];
}

/**
 * The rows the Sunday watch actually fetches: the ones the keeper has
 * sent the note to, plus any already carrying a row (so a citation
 * going away is caught too). A page nobody wrote to and that has
 * never cited is the CLI sweep's business, not the cron's.
 */
export function watchedProspects(): OutreachEntry[] {
  return outreachRegister().filter((entry) => entry.note_sent !== null || entry.cites_since !== null);
}

async function readPage(url: string, base: string): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": `scvd-citation-watch/1 (+${base}/scorers)`, accept: "text/html, application/json;q=0.9, */*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    const text = (await response.text()).slice(0, READ_CAP_BYTES);
    return { status: response.status, text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readCitationWatch(env: Env): Promise<CitationWatchReport | null> {
  return kvGetJson<CitationWatchReport>(env.COUNTERS, KV_KEYS.citationWatch, "json");
}

/**
 * The report from the two lists and what their pages say now,
 * compared against the previous report so the news is the DELTA,
 * not the rows: a prospect cited for the first time, a listed system
 * whose citation went away. The first report ever counts every cited
 * page as new, because nobody had been told.
 */
export function judgeWatch(
  pages: { listed: { system: CitingSystem; fetched: Fetched }[]; prospects: { prospect: OutreachEntry; fetched: Fetched }[] },
  previous: CitationWatchReport | null,
  base: string,
  now: Date,
): CitationWatchReport {
  const rows: CitationWatchRow[] = [
    ...pages.listed.map(({ system, fetched }) => ({
      kind: "listed" as const,
      dated: system.since,
      ...judgePage(system.name, system.cites_at, fetched, system.base ?? base, "gone"),
    })),
    ...pages.prospects.map(({ prospect, fetched }) => ({
      kind: "prospect" as const,
      dated: prospect.note_sent ?? prospect.cites_since ?? "",
      ...judgePage(prospect.name, prospect.url, fetched, base, "silent"),
    })),
  ];
  const before = new Map((previous?.rows ?? []).map((row) => [row.url, row.verdict]));
  const newly_cited = rows.filter((row) => row.verdict === "cited" && before.get(row.url) !== "cited").map((row) => row.url);
  const newly_gone = rows.filter((row) => row.verdict === "gone" && before.get(row.url) === "cited").map((row) => row.url);
  return { version: 1, checked_at: now.toISOString(), base, rows, newly_cited, newly_gone };
}

export async function runCitationWatch(env: Env, now: Date = new Date()): Promise<CitationWatchReport> {
  const base = env.STORE_BASE_URL.replace(/\/$/, "");
  const previous = await readCitationWatch(env);
  const listed = await Promise.all(
    listedSystems().map(async (system) => ({ system, fetched: await readPage(system.cites_at, base) })),
  );
  const prospects = await Promise.all(
    watchedProspects().map(async (prospect) => ({ prospect, fetched: await readPage(prospect.url, base) })),
  );
  const report = judgeWatch({ listed, prospects }, previous, base, now);
  await kvPut(env.COUNTERS, KV_KEYS.citationWatch, JSON.stringify(report));

  for (const url of report.newly_cited) {
    const row = report.rows.find((entry) => entry.url === url);
    if (!row) continue;
    await sendAlert(env, {
      condition: "citation_seen",
      key: url,
      detail:
        row.kind === "prospect"
          ? `${row.name} started carrying a row: ${url} cites ${row.citations.slice(0, 3).join(", ")}. Set cites_since on their row in registry/scorers-outreach.json, and if it meets the five listing facts add them to src/store/citing-systems.json with this URL and today's date; nothing else is typed.`
          : `${row.name} cites again at ${url}: ${row.citations.slice(0, 3).join(", ")}.`,
    });
  }
  for (const url of report.newly_gone) {
    const row = report.rows.find((entry) => entry.url === url);
    if (!row) continue;
    await sendAlert(env, {
      condition: "citation_seen",
      key: `gone:${url}`,
      detail: `${row.name} no longer cites the corpus at ${url}. /scorers is naming an occupant its check no longer supports: remove the entry from src/store/citing-systems.json or find the new citing URL. npm run citations:check fails until then.`,
    });
  }
  return report;
}
