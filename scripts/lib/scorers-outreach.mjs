/**
 * THE SCORERS' OUTREACH REGISTER, AS ONE RENDERER (2026-09-04).
 *
 * registry/scorers-outreach.json is the only hand-edited file in the
 * pair; registry/scorers-outreach.md is this function's output and
 * nothing else. `npm run outreach:build` re-renders after a JSON edit,
 * and the test compares the committed table against this exact string,
 * so a hand-edit to the markdown fails the build the same way a stale
 * table does. Nothing typed twice (house rule); the JSON is the fact,
 * the table is the look.
 */

/** One table row per system, in the register's own order. */
export function renderMarkdown(register) {
  const systems = Array.isArray(register.systems) ? register.systems : [];
  const cell = (value) => (value == null ? "—" : String(value).replaceAll("|", "\\|"));
  const lines = [
    "# Scorers' outreach — the register as a table",
    "",
    "<!-- Derived from registry/scorers-outreach.json by `npm run outreach:build`.",
    "     Never hand-edit this file: the test fails when the table and the JSON disagree. -->",
    "",
    `Seeded ${register.seeded}. Alphabetical by name, never a priority order.`,
    "",
    "WHO EXISTS, and nothing about what we did. This table is the DIRECTORY half of the",
    "register: the systems that score or list x402 doors, and where to write to them. It",
    "changes only when the list of systems changes, which is research and rare.",
    "",
    "The WORKING half — `note_sent`, `reply`, `cites_since` — lives only in the JSON, and",
    "`npm run outreach:check` prints it. That split is deliberate (2026-09-04): when the",
    "table carried the status too, stamping a send desynced it and failed the build, so the",
    "most ordinary act in the whole loop punished you for doing it. Now sending a note is a",
    "one-field edit that breaks nothing, and this file only needs rendering when a system",
    "joins or leaves.",
    "",
    "| Name | Contact |",
    "| --- | --- |",
    ...systems.map((s) => `| [${cell(s.name)}](${s.url}) | ${cell(s.contact)} |`),
    "",
  ];
  return lines.join("\n");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The problems with one entry, as a list; empty means the entry is complete. */
export function entryProblems(entry) {
  const problems = [];
  if (typeof entry?.name !== "string" || entry.name.trim() === "") problems.push("name must be a non-empty string");
  if (typeof entry?.url !== "string" || !entry.url.startsWith("https://")) problems.push("url must be an https URL");
  if (typeof entry?.what_it_scores !== "string" || entry.what_it_scores.trim() === "" || entry.what_it_scores.includes("\n"))
    problems.push("what_it_scores must be one sentence, no newlines");
  if (entry?.contact !== null && typeof entry?.contact !== "string") problems.push("contact must be a string or null");
  if (typeof entry?.found_on !== "string" || entry.found_on.trim() === "") problems.push("found_on must say where we learned of them");
  if (entry?.note_sent !== null && (typeof entry?.note_sent !== "string" || !DATE.test(entry.note_sent)))
    problems.push("note_sent must be a YYYY-MM-DD date or null");
  if (entry?.reply !== null && (typeof entry?.reply !== "string" || !/\d{4}-\d{2}-\d{2}/.test(entry.reply)))
    problems.push("reply must be null, or one sentence carrying a date");
  if (entry?.cites_since !== null && (typeof entry?.cites_since !== "string" || !DATE.test(entry.cites_since)))
    problems.push("cites_since must be a YYYY-MM-DD date or null");
  return problems;
}

/**
 * THE WATCHED SET (2026-09-04) — the only part of this register the
 * EDGE ever carries. The Worker used to import the whole file: 44 KB
 * of research bundled into every isolate to fetch, on the day it
 * landed, zero pages. What the cron needs is the rows the keeper has
 * written to, plus any already citing; everything else is the CLI's
 * business, swept from a machine with no subrequest budget.
 *
 * Derived, never hand-edited, and held to the register by the same
 * test that holds the table. Four fields, because a name, a URL and
 * two dates are all the watch reads.
 */
export function watchedRows(register) {
  return (register.systems ?? [])
    .filter((entry) => entry.note_sent !== null || entry.cites_since !== null)
    .map((entry) => ({
      name: entry.name,
      url: entry.url,
      note_sent: entry.note_sent,
      cites_since: entry.cites_since,
    }));
}

/** The derived file's exact bytes, so the builder and the test agree. */
export function renderWatched(register) {
  return `${JSON.stringify(
    {
      what_this_is:
        "Derived from registry/scorers-outreach.json by `npm run outreach:build` — the rows the Sunday citation watch fetches. Never hand-edit: the test fails when this and the register disagree. Empty until the keeper stamps a send.",
      rows: watchedRows(register),
    },
    null,
    2,
  )}\n`;
}
