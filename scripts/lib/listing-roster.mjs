/**
 * THE ROSTER — does every listing this store CLAIMS still name it?
 * (2026-09-06, after the directory blitz was archived.)
 *
 * `src/store/trust-signals.ts` holds one hand-dated row per venue and
 * is served at `/.well-known/trust.json`. Every row is a claim on a
 * page we do not control, and nothing re-read them: a directory that
 * delists us, renames a slug, or quietly drops the row leaves our
 * claim standing and true-looking. That is not hypothetical — it is
 * the same failure that let one hand-kept venue list call mcpbeat
 * "not yet opened" while another file carried its two pages, and it
 * cost a session of unpicking by hand.
 *
 * The check is deliberately small: fetch each row's URL as a browser
 * would and ask whether the page still names the store. It is a
 * LIVENESS reading, never proof the listing is good — a page can name
 * us in a footer and list nothing.
 *
 * WHY A BASELINE RATHER THAN A THRESHOLD. Half these venues are
 * client-rendered, so their server HTML names nobody and a bare
 * "silent" would cry wolf every Saturday. The alarm is a row that
 * moved BACKWARDS from what it did last week — the same rule the
 * mirrors battery runs on, for the same reason.
 *
 * ⚑ RECORD THE BASELINE FROM SOMEWHERE WITH REAL EGRESS. The build
 * sandbox reaches almost none of these hosts — a run there reads 43
 * of 49 as `unreachable`, and recording THAT as the baseline would
 * bake in false rows, turn next week's honest reads into a wall of
 * "advanced", and hide a real delisting inside the noise. The
 * Saturday job runs in CI, which reaches them; `--record` is the
 * keeper's, from CI or a laptop, never from the agent's sandbox.
 *
 * STALENESS IS REPORTED, NEVER FAILED. A `confirmed` date is the
 * keeper's hand (rule 30); an old one is a prompt to go and look, not
 * a fact about the commit.
 *
 * A WALLED VENUE IS REPORTED, NEVER JUDGED (2026-09-17, the day the
 * ChatGPT plugin directory listed the verifier door). chatgpt.com
 * answers 403 to any read without a session, so this instrument can
 * never score that row better than "unreachable" — and a row that can
 * only ever read unreachable is not a false alarm (a new row is
 * neither regression nor advance) but something quieter and worse: a
 * permanent entry that looks like a broken listing and can never do
 * the one job the roster exists for. So a host on WALLED gets its own
 * state, outside the rungs. It is tallied and printed with its
 * reason, it never regresses and never advances, and the keeper's eye
 * is the confirmation (rule 30, same as the date). The moment such a
 * venue answers a plain read, it is judged like any other row.
 */
import { readMirror, visibleText } from "./listings.mjs";

/** Worst to best. A row that moves down this list is the alarm. */
export const ROSTER_STATES = Object.freeze(["unreachable", "silent", "holds"]);

/**
 * Not a rung. A row in this state is outside the ladder: this
 * instrument could not read the page, and that was expected.
 */
export const WALLED_STATE = "walled";

/**
 * Hosts that refuse an unauthenticated read, each with the reason in
 * one sentence. Add a host here only when the keeper has confirmed
 * the row by eye and the refusal is the venue's design, not an outage
 * — an outage is exactly what the ladder is for.
 */
export const WALLED = Object.freeze({
  "chatgpt.com": "answers 403 to any read without a ChatGPT session; the keeper confirms this row by eye",
});

/** The reason a URL's host is walled, or null when it is not. */
export function walledReason(url) {
  try {
    return WALLED[new URL(url).hostname] ?? null;
  } catch {
    return null;
  }
}

/** How old a `confirmed` date gets before the reading says to look again. */
export const STALE_AFTER_DAYS = 180;

/**
 * What counts as the page still naming us. Lowercase substrings, and
 * deliberately loose: `scvd` catches scvd.store, scvd-general-store,
 * store.scvd and @scvd/*, which is every spelling the venues use.
 */
export const STORE_MARKERS = Object.freeze(["scvd", "sean-claude van damme"]);

export function rankState(state) {
  return ROSTER_STATES.indexOf(state);
}

export function namesTheStore(text) {
  const lower = String(text ?? "").toLowerCase();
  return STORE_MARKERS.some((marker) => lower.includes(marker));
}

/** The rows as served. Tolerates a document with no roster in it. */
export function rosterFrom(trustJson) {
  const records = trustJson?.external_records;
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => typeof record?.url === "string" && record.url.startsWith("http"))
    .map((record) => ({
      url: record.url,
      registry: typeof record.registry === "string" ? record.registry : "",
      confirmed: typeof record.confirmed === "string" ? record.confirmed : null,
    }));
}

/** Whole days between a `confirmed` date and now; null when undated or unparseable. */
export function ageInDays(confirmed, now = new Date()) {
  if (!confirmed) return null;
  const then = Date.parse(`${confirmed}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * One row's state from one read. A walled host that refuses is
 * walled, not unreachable; a walled host that answers is read on its
 * merits, because the wall coming down is the day the roster can
 * finally watch that venue.
 */
export function stateOf(read, url = "") {
  if (!read.ok) return walledReason(url) ? WALLED_STATE : "unreachable";
  return namesTheStore(visibleText(read.text)) ? "holds" : "silent";
}

/**
 * A row that dropped a rung is a regression; one that climbed is news.
 * A row absent from the baseline is neither — it is new, and the first
 * reading is what it will be compared against next week.
 */
export function compareRoster(baseline, fresh) {
  const before = new Map((baseline?.records ?? []).map((row) => [row.url, row.state]));
  const regressions = [];
  const advances = [];
  for (const row of fresh.records) {
    const was = before.get(row.url);
    if (was === undefined || was === row.state) continue;
    // A walled reading on either side is not a rung, so it is neither
    // a fall nor a climb. The first plain read after a wall comes down
    // becomes next week's baseline, the same as any new row.
    if (was === WALLED_STATE || row.state === WALLED_STATE) continue;
    const move = { url: row.url, registry: row.registry, was, now: row.state };
    if (rankState(row.state) < rankState(was)) regressions.push(move);
    else advances.push(move);
  }
  return { regressions, advances };
}

/** Rows this instrument could not judge, each with the venue's reason. */
export function walledRows(fresh) {
  return fresh.records
    .filter((row) => row.state === WALLED_STATE)
    .map((row) => ({ ...row, reason: walledReason(row.url) }));
}

/** Rows whose `confirmed` date has aged past the window, oldest first. */
export function staleRows(fresh, staleAfterDays = STALE_AFTER_DAYS) {
  return fresh.records
    .filter((row) => row.age_days !== null && row.age_days >= staleAfterDays)
    .sort((a, b) => b.age_days - a.age_days);
}

/** The whole read: one trust.json, one fetch per row, one line each. */
export async function readRoster(base, fetchImpl = fetch, now = new Date()) {
  const trust = await readMirror(`${base}/.well-known/trust.json`, fetchImpl);
  let parsed = null;
  if (trust.ok) {
    try {
      parsed = JSON.parse(trust.text);
    } catch {
      parsed = null;
    }
  }
  const rows = rosterFrom(parsed);
  const records = [];
  for (const row of rows) {
    const read = await readMirror(row.url, fetchImpl);
    records.push({
      url: row.url,
      registry: row.registry,
      confirmed: row.confirmed,
      age_days: ageInDays(row.confirmed, now),
      status: read.status,
      state: stateOf(read, row.url),
    });
  }
  return { read_at: now.toISOString(), roster_read: trust.ok && parsed !== null, records };
}
