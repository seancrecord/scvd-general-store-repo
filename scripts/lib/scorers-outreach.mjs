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
    'The note to send is the one on the desk under "For scorers and marketplaces"; `note sent` records',
    "the date the keeper says he sent it, and only then. `cites since` stays empty until",
    "`npm run outreach:check` reads one of our row URLs or the cite_json shape on their page.",
    "",
    "| Name | Contact | Note sent | Reply | Cites since |",
    "| --- | --- | --- | --- | --- |",
    ...systems.map(
      (s) => `| [${cell(s.name)}](${s.url}) | ${cell(s.contact)} | ${cell(s.note_sent)} | ${cell(s.reply)} | ${cell(s.cites_since)} |`,
    ),
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
