#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  defaultTabPath,
  derive,
  monthlyOf,
  quietTools,
  readEvents,
  sidecarPath,
  trialsConvertingSoon,
  trialsPastEnd,
} from "./store.mjs";

/**
 * THE PAGER — the clock the product was described as having and did
 * not have.
 *
 * The gap, stated plainly: `trials_converting_soon` is push-shaped and
 * pull-triggered. "Midjourney charges you $30 in 3 days" is the whole
 * save, and until now it only arrived if the agent happened to ask on
 * the right day. An MCP server cannot wake anybody up — it is a child
 * process that speaks when spoken to — so a scheduler cannot live
 * inside it.
 *
 * So the clock lives OUTSIDE and the delivery is made provable
 * INSIDE, which is the same split the store already runs on: the rail
 * settles, the shop mints, and nothing is marked delivered on a hope.
 *
 *   cron / launchd / Task Scheduler / an agent hook
 *        └─ runs this file, which QUEUES what is due
 *   the agent's next touch of the tab, for any reason
 *        └─ carries the open pages back with it (the ride-along)
 *   the agent, having actually put them to the builder
 *        └─ acknowledges them, and only then are they spent
 *
 * A page handed to an agent that never spoke it is NOT delivered, and
 * the tab counts those days rather than assuming them away. That
 * count is the pager's own variability window: it is the difference
 * between what the clock knew and what the builder heard.
 */

/** Every kind of page, in the order a day's worth should be read. */
export const PAGE_KINDS = [
  "trial_converting", // preventable, and the whole product
  "trial_past_end", // already happened; the tab does not know what
  "unconfirmed", // a sweep found money nobody has looked at
  "quiet", // paying, and no sign of life
  "gap", // captured in a hurry, a field never filled
];

/**
 * `superseded` and `retired` are both terminal and mean OPPOSITE
 * things: superseded is the same worry re-raised fresher (the old
 * page's count is evidence of days unspoken), retired is the worry
 * no longer holding at all — canceled trial, filled gap, a worry
 * that crossed into another kind. Only superseded feeds
 * unspoken_pct; a moot page counted as "missed" would let resolved
 * worries inflate the instrument's failure number.
 */
const PAGE_STATES = ["queued", "handed_over", "acknowledged", "superseded", "retired"];

function pagesPath(tabPath) {
  return sidecarPath(tabPath, ".pages.jsonl");
}

function day(now) {
  return now.toISOString().slice(0, 10);
}

function money(amount) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/**
 * WHAT IS DUE, as lines a person can hear.
 *
 * The urgency numbers exist to answer one question — if only three
 * things get said today, which three — and they rank PREVENTABLE over
 * merely bad. A trial converting this afternoon outranks one that
 * converted last week, because only one of them can still be stopped.
 */
export function duePages(current, { horizonDays = 7 } = {}) {
  const now = current.now;
  const stamp = day(now);
  const pages = [];
  const push = (kind, toolName, urgency, line) =>
    pages.push({
      page_id: `${kind}:${toolName}:${stamp}`,
      kind,
      tool_name: toolName,
      urgency,
      line,
    });

  for (const trial of trialsConvertingSoon(current, horizonDays)) {
    const monthly = monthlyOf(trial.converts_to);
    const when =
      trial.days_left === 0
        ? "today"
        : trial.days_left === 1
          ? "tomorrow"
          : `in ${trial.days_left} days`;
    push(
      "trial_converting",
      trial.tool_name,
      1000 - trial.days_left * 5,
      monthly > 0
        ? `${trial.tool_name} charges you ${money(monthly)} ${when}.`
        : `${trial.tool_name}'s trial converts ${when}, and the tab was never told the price.`,
    );
  }

  for (const trial of trialsPastEnd(current)) {
    push(
      "trial_past_end",
      trial.tool_name,
      900 + Math.min(trial.days_since_end, 49),
      `${trial.tool_name}'s trial ended ${trial.days_since_end} days ago and the tab never learned what happened at the boundary.`,
    );
  }

  for (const tool of current.active) {
    if (tool.confirmed !== false) continue;
    const monthly = Math.round(monthlyOf(tool.price) * 100) / 100;
    push(
      "unconfirmed",
      tool.tool_name,
      500 + Math.min(monthly, 399),
      monthly > 0
        ? `${tool.tool_name}, ${money(monthly)} a month, came off a sweep and nobody has looked at it. Real?`
        : `${tool.tool_name} came off a sweep and nobody has looked at it. Real?`,
    );
  }

  for (const tool of quietTools(current)) {
    push(
      "quiet",
      tool.tool_name,
      300 + Math.min(tool.monthly_cost, 99),
      `${tool.tool_name} has taken ${money(tool.monthly_cost)} a month and shown no sign of life since ${String(tool.last_billing_at).slice(0, 10)}.`,
    );
  }

  for (const tool of current.active) {
    const missing = [...new Set(tool.history.flatMap((h) => h.incomplete ?? []))];
    if (missing.length === 0) continue;
    push("gap", tool.tool_name, 100, `${tool.tool_name} is still missing ${missing.join(" and ")}.`);
  }

  return pages.sort((a, b) => b.urgency - a.urgency);
}

function readPageLog(tabPath) {
  const file = pagesPath(tabPath);
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A torn line loses one page, never the ledger. Same posture as
      // the tab itself: unreadable rows are skipped and counted, not
      // grounds for refusing to answer.
    }
  }
  return rows;
}

function appendPage(tabPath, record) {
  const file = pagesPath(tabPath);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

/**
 * Replay, exactly like the tab: the page log is append-only and the
 * current state of a page is derived, so "what did the clock know on
 * the 3rd, and had anybody said it out loud yet" stays answerable.
 */
export function derivePages(rows) {
  const pages = new Map();
  for (const row of rows) {
    if (!row?.page_id || !PAGE_STATES.includes(row.state)) continue;
    const existing = pages.get(row.page_id);
    if (!existing) {
      pages.set(row.page_id, {
        page_id: row.page_id,
        kind: row.kind,
        tool_name: row.tool_name,
        urgency: row.urgency ?? 0,
        line: row.line,
        state: row.state,
        queued_at: row.state === "queued" ? row.at : undefined,
        handovers: row.state === "handed_over" ? 1 : 0,
      });
      continue;
    }
    if (row.state === "handed_over") {
      existing.handovers += 1;
      if (existing.state === "queued") existing.state = "handed_over";
      continue;
    }
    // Acknowledged and superseded are terminal; acknowledged wins,
    // because a page somebody actually heard was not missed just
    // because a fresher one queued behind it.
    if (existing.state === "acknowledged") continue;
    existing.state = row.state;
  }
  return pages;
}

/**
 * THE CLOCK'S JOB. Compute what is due, retire yesterday's version of
 * the same worry, and append only what is new.
 *
 * Supersession is what keeps a five-day-old trial warning from
 * stacking into five separate pages — but a superseded page that was
 * never acknowledged is not deleted, it is EVIDENCE. Its count is the
 * number of days the clock knew and the builder was not told.
 */
export function queueDue(tabPath = defaultTabPath(), { horizonDays = 7, now = new Date() } = {}) {
  const { events } = readEvents(tabPath);
  const current = { ...derive(events, now) };
  const due = duePages(current, { horizonDays });
  const known = derivePages(readPageLog(tabPath));
  const at = now.toISOString();
  const queued = [];

  /**
   * RETIRE WHAT NO LONGER HOLDS. Supersession below only fires when a
   * fresher page for the same worry queues — so a worry that resolved
   * (trial canceled, gap filled) or crossed into another kind left its
   * open page delivering a stale, now-false warning forever. Found by
   * the 2026-08-21 dark-team run. An open page whose (kind, tool) is
   * absent from today's due set is moot: retired, not superseded,
   * because moot is not missed.
   */
  const dueKeys = new Set(due.map((page) => `${page.kind}:${page.tool_name}`));
  for (const [id, old] of known) {
    const open = old.state === "queued" || old.state === "handed_over";
    if (open && !dueKeys.has(`${old.kind}:${old.tool_name}`)) {
      appendPage(tabPath, { page_id: id, state: "retired", at });
      old.state = "retired";
    }
  }

  for (const page of due) {
    if (known.has(page.page_id)) continue;
    for (const [id, old] of known) {
      const open = old.state === "queued" || old.state === "handed_over";
      if (open && old.kind === page.kind && old.tool_name === page.tool_name) {
        appendPage(tabPath, { page_id: id, state: "superseded", at });
        old.state = "superseded";
      }
    }
    appendPage(tabPath, { ...page, state: "queued", at });
    known.set(page.page_id, { ...page, state: "queued", queued_at: at, handovers: 0 });
    queued.push(page);
  }
  return { queued, checked_at: at, due_count: due.length };
}

/**
 * The open pages, worth most first, each carrying how long it has
 * been going unsaid.
 */
export function openPages(tabPath = defaultTabPath(), { limit = 3 } = {}) {
  const known = derivePages(readPageLog(tabPath));
  const missedBy = new Map();
  for (const page of known.values()) {
    if (page.state !== "superseded") continue;
    const key = `${page.kind}:${page.tool_name}`;
    missedBy.set(key, (missedBy.get(key) ?? 0) + 1);
  }
  const open = [...known.values()]
    .filter((page) => page.state === "queued" || page.state === "handed_over")
    .map((page) => ({
      page_id: page.page_id,
      kind: page.kind,
      tool_name: page.tool_name,
      line: page.line,
      urgency: page.urgency,
      handovers: page.handovers,
      days_unspoken: missedBy.get(`${page.kind}:${page.tool_name}`) ?? 0,
    }))
    .sort((a, b) => b.urgency - a.urgency);
  return { open, shown: open.slice(0, limit), total: open.length };
}

/**
 * HANDING OVER IS NOT DELIVERING. The ride-along records that the
 * pages reached an agent; it does not record that anybody heard them.
 * Once a day per page, so a chatty session does not inflate the count
 * into noise.
 */
export function recordHandover(tabPath, pages, now = new Date()) {
  const at = now.toISOString();
  const stamp = day(now);
  const rows = readPageLog(tabPath);
  const alreadyToday = new Set(
    rows
      .filter((row) => row.state === "handed_over" && String(row.at).slice(0, 10) === stamp)
      .map((row) => row.page_id),
  );
  for (const page of pages) {
    if (alreadyToday.has(page.page_id)) continue;
    appendPage(tabPath, { page_id: page.page_id, state: "handed_over", at });
  }
}

/**
 * The agent says it actually put these to the builder. Now they are
 * spent.
 *
 * ONLY OPEN PAGES. A page that already aged out unacknowledged is the
 * raw material of `unspoken_pct`, and letting it be acknowledged
 * afterwards would let the instrument's own failure be edited out of
 * the record after the fact — by the party the number is measuring.
 * The fresher page for the same worry is the one to answer; that one
 * is open, and acknowledging it is the honest move.
 */
export function acknowledgePages(tabPath, pageIds, now = new Date()) {
  const known = derivePages(readPageLog(tabPath));
  const at = now.toISOString();
  const spent = [];
  const unknown = [];
  const alreadySettled = [];
  for (const id of pageIds) {
    const page = known.get(id);
    if (!page) {
      unknown.push(id);
      continue;
    }
    if (page.state !== "queued" && page.state !== "handed_over") {
      alreadySettled.push({ page_id: id, state: page.state });
      continue;
    }
    appendPage(tabPath, { page_id: id, state: "acknowledged", at });
    page.state = "acknowledged";
    spent.push(id);
  }
  return {
    acknowledged: spent,
    unknown,
    ...(alreadySettled.length > 0 ? { already_settled: alreadySettled } : {}),
  };
}

/**
 * THE PAGER'S OWN HONESTY NUMBER. Pages the clock raised against
 * pages a builder was actually told about — the gap between knowing
 * and saying, which no amount of sweep coverage can measure.
 */
export function pagerCoverage(tabPath = defaultTabPath()) {
  const known = [...derivePages(readPageLog(tabPath)).values()];
  const raised = known.length;
  const spoken = known.filter((page) => page.state === "acknowledged").length;
  const openNow = known.filter(
    (page) => page.state === "queued" || page.state === "handed_over",
  ).length;
  const missed = known.filter((page) => page.state === "superseded").length;
  const retired = known.filter((page) => page.state === "retired").length;
  const settled = spoken + missed;
  return {
    pages_raised: raised,
    pages_acknowledged: spoken,
    pages_open: openNow,
    pages_missed: missed,
    // Worries that stopped holding before anybody spoke them —
    // outside unspoken_pct on purpose: moot is not missed.
    pages_retired: retired,
    unspoken_pct: settled === 0 ? null : Math.round((missed / settled) * 1000) / 10,
    note:
      "A page handed to an agent is not a page the builder heard. `pages_missed` counts the ones that aged out unacknowledged — the clock knew and nobody said it. Null until at least one page has settled either way, because a made-up zero is the worst answer available.",
  };
}

/**
 * THE CLI — what cron actually runs. Prints the open pages as plain
 * lines on stdout and nothing at all when there is nothing to say,
 * because a scheduled job that speaks every hour is a job the builder
 * silences within the week.
 */
export function runPager(argv = []) {
  const pathIndex = argv.indexOf("--path");
  const tabPath = pathIndex !== -1 && argv[pathIndex + 1] ? argv[pathIndex + 1] : defaultTabPath();
  // A mistyped flag must not silently mean "nothing is due" — that is
  // the one failure mode a warning system cannot have.
  const number = (flag, fallback) => {
    const index = argv.indexOf(flag);
    const parsed = index !== -1 ? Number(argv[index + 1]) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const horizonDays = number("--days", 7);
  const limit = number("--limit", 3);

  queueDue(tabPath, { horizonDays });
  const view = openPages(tabPath, { limit });
  const { shown, total } = view;
  if (argv.includes("--json")) {
    return JSON.stringify({ ...view, coverage: pagerCoverage(tabPath) }, null, 2);
  }
  if (shown.length === 0) return "";
  const lines = shown.map((page) =>
    page.days_unspoken > 0
      ? `${page.line} (${page.days_unspoken} days on the pager, never put to you)`
      : page.line,
  );
  if (total > shown.length) {
    lines.push(`${total - shown.length} more on the pager.`);
  }
  return lines.join("\n");
}

/*
 * The direct-run check resolves symlinks BEFORE comparing, because an
 * npm bin install IS a symlink: argv[1] arrives as the link in
 * node_modules/.bin while import.meta.url is the real file, and a
 * bare comparison concludes "imported, not run" — a pager that
 * silently prints nothing forever, which is the one failure mode a
 * warning system cannot have.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const out = runPager(process.argv.slice(2));
  if (out !== "") process.stdout.write(`${out}\n`);
}
