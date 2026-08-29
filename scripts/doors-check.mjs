#!/usr/bin/env node
/**
 * npm run doors:check — is the store still reachable down all six
 * roads an agent can take, and are the roads themselves still the
 * ones worth building for?
 *
 * TWO LOOPS, ON PURPOSE, because they fail differently.
 *
 *   THE FAST LOOP is this battery: every criterion in
 *   scripts/lib/doors.mjs read against the live store, weekly, by a
 *   machine. It catches a door that CLOSED — an expired origin trial,
 *   a registry listing gone stale, a redesign that dropped the
 *   landmarks a generic tool holds onto.
 *
 *   THE SLOW LOOP is the review: every ninety days each door's
 *   assumptions get re-read by a human against the named sources in
 *   its `watch` list. It catches a door that MOVED — a spec that
 *   renamed a field, a new resident agent worth declaring for, a road
 *   that stopped mattering. No probe can see this, and a green battery
 *   against stale criteria is the most confident possible way to be
 *   wrong.
 *
 * READ-ONLY, and it stays that way. It fetches public pages of our own
 * store plus one public registry lookup. It buys nothing, signs
 * nothing, and writes nothing anywhere unless a human types --record.
 *
 * Usage, from the repo root:
 *
 *   npm run doors:check                    # read the live store, compare, report
 *   npm run doors:check -- --base=http://localhost:8787
 *   npm run doors:check -- --json          # the observation, for a pipe
 *   npm run doors:check -- --record        # write it down as the new baseline
 *   npm run doors:check -- --review=webmcp # mark one door re-read today
 *
 * EXIT CODES, because CI branches on them:
 *   0  nothing fell, no review overdue
 *   1  a criterion that was met is no longer met, OR a door's review
 *      is overdue. Both are work; neither is a crash.
 *   2  the run could not reach a verdict at all.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  AS_A_BROWSER,
  DOORS,
  OBSERVATION_FRESH_DAYS,
  REVIEW_EVERY_DAYS,
  compare,
  readDoors,
  reviewsDue,
  sweepRooms,
} from "./lib/doors.mjs";

const RECORD = new URL("../docs/six-doors/observation.json", import.meta.url);
const DAY = 86_400_000;

const args = process.argv.slice(2);
const flag = (name) => args.some((arg) => arg === `--${name}`);
const value = (name) => {
  const found = args.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};

const base = (value("base") ?? "https://scvd.store").replace(/\/$/, "");
const asJson = flag("json");
const recording = flag("record");
const reviewing = value("review");

/* ── the snapshot ────────────────────────────────────────────────────
 * Every fetch is allowed to fail. A row that never landed carries its
 * error, and every reader turns that into `unknown` rather than a
 * finding — the store's own rule about lookups that cannot see
 * everything, applied to the checker that watches the store.
 */
async function get(url, init) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "user-agent": "scvd-doors-check/1.0 (+https://scvd.store)",
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Not every door answers JSON; that is not an error here.
    }
    return {
      ok: response.ok,
      status: response.status,
      bytes: new TextEncoder().encode(text).length,
      text,
      json,
    };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message ?? error) };
  }
}

/** The MCP door answers JSON-RPC, and may answer it as an event stream. */
async function mcpToolsList() {
  const row = await get(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  if (row.json || !row.text) return row;
  // An SSE answer carries the payload on a `data:` line.
  const data = /^data:\s*(\{.*\})\s*$/m.exec(row.text);
  if (data) {
    try {
      return { ...row, json: JSON.parse(data[1]) };
    } catch {
      return row;
    }
  }
  return row;
}

async function collect() {
  const [
    home,
    openapi,
    apiCatalog,
    x402,
    llms,
    agentsMd,
    robots,
    sitemap,
    webmcpScript,
    mcpTools,
    preflightNoAuth,
    registry,
  ] = await Promise.all([
    get(`${base}/`, { headers: AS_A_BROWSER }),
    get(`${base}/openapi.json`),
    get(`${base}/.well-known/api-catalog`),
    get(`${base}/.well-known/x402.json`),
    get(`${base}/llms.txt`),
    get(`${base}/agents.md`),
    get(`${base}/robots.txt`),
    get(`${base}/sitemap.xml`),
    get(`${base}/webmcp.js`),
    mcpToolsList(),
    // An empty body on a free instrument: the question is whether an
    // anonymous caller gets told what is wrong, or told who to be.
    get(`${base}/api/preflight/v2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    get("https://registry.modelcontextprotocol.io/v0/servers?search=scvd"),
  ]);
  const rooms = await sweepRooms(sitemap.text, base, get);
  return {
    home,
    openapi,
    apiCatalog,
    x402,
    llms,
    agentsMd,
    robots,
    sitemap,
    webmcpScript,
    mcpTools,
    preflightNoAuth,
    registry,
    rooms,
    // The manifest a republish would actually send. Read from disk
    // rather than described in prose, so the registry criterion
    // compares two real strings instead of a keyword against a hope.
    serverJson: readServerJson(),
  };
}

/** server.json, or null — an unreadable manifest is `unknown`, not a finding. */
function readServerJson() {
  try {
    return JSON.parse(
      readFileSync(new URL("../server.json", import.meta.url), "utf8"),
    );
  } catch {
    return null;
  }
}

/* ── the record ─────────────────────────────────────────────────────── */

function loadRecord() {
  try {
    return JSON.parse(readFileSync(RECORD, "utf8"));
  } catch {
    return null;
  }
}

function writeRecord(record) {
  mkdirSync(dirname(RECORD.pathname), { recursive: true });
  writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
}

/* ── the report ─────────────────────────────────────────────────────── */

const MARK = { met: "·", partial: "~", unmet: "✗", unknown: "?" };

function report(observation, diff, due, previous) {
  const lines = [];
  lines.push(`THE SIX DOORS — ${base}, read ${observation.taken_at.slice(0, 10)}`);
  lines.push("");
  for (const door of observation.doors) {
    const total = door.criteria.length;
    const stance = door.stance ? `  [${door.stance}]` : "";
    lines.push(
      `${door.number}. ${door.name} — ${door.tally.met}/${total} met${
        door.tally.partial ? `, ${door.tally.partial} partial` : ""
      }${door.tally.unmet ? `, ${door.tally.unmet} unmet` : ""}${
        door.tally.unknown ? `, ${door.tally.unknown} unknown` : ""
      }${stance}`,
    );
    for (const criterion of door.criteria) {
      lines.push(`     ${MARK[criterion.verdict]} ${criterion.id}: ${criterion.note}`);
    }
    lines.push("");
  }

  if (previous) {
    const age = Math.floor(
      (Date.parse(observation.taken_at) - Date.parse(previous.taken_at)) / DAY,
    );
    lines.push(
      `Baseline recorded ${previous.taken_at.slice(0, 10)} (${age} days ago; an observation is fresh for ${OBSERVATION_FRESH_DAYS}).`,
    );
  } else {
    lines.push("No baseline recorded yet — run with --record to lay one down.");
  }
  for (const row of diff.regressions) {
    lines.push(`  FELL     ${row.key}: ${row.was} → ${row.now} — ${row.note}`);
  }
  for (const row of diff.improvements) {
    lines.push(`  ROSE     ${row.key}: ${row.was} → ${row.now}`);
  }
  for (const row of diff.added) {
    lines.push(`  NEW      ${row.key}: ${row.now}`);
  }
  for (const row of diff.removed) {
    lines.push(`  RETIRED  ${row.key}`);
  }
  lines.push("");

  if (due.length === 0) {
    lines.push(`Reviews: none due (every ${REVIEW_EVERY_DAYS} days).`);
  } else {
    lines.push(`REVIEWS DUE — ${due.length} door(s). This is the half no probe does:`);
    for (const door of due) {
      lines.push(
        `  ${door.name} — ${
          door.days_since_review === null
            ? "never reviewed"
            : `${door.days_since_review} days since the last read`
        }`,
      );
      for (const watch of door.watch) {
        lines.push(`      ${watch.what}`);
        lines.push(`        where: ${watch.where}`);
        lines.push(`        why:   ${watch.why}`);
      }
    }
    lines.push("");
    lines.push(
      "  Re-read the sources, change the criteria if the ground moved, then:",
    );
    lines.push(
      `      npm run doors:check -- --review=<door id>   # ${DOORS.map((door) => door.id).join(", ")}`,
    );
  }
  return lines.join("\n");
}

/* ── run ─────────────────────────────────────────────────────────────── */

const now = Date.now();
const record = loadRecord();

// --review marks a door re-read and writes nothing else. Kept separate
// from the battery so that "I looked at this" can never be a side
// effect of a probe run: a human read the sources, or nobody did.
if (reviewing) {
  if (!DOORS.some((door) => door.id === reviewing)) {
    console.error(
      `No door called "${reviewing}". Doors: ${DOORS.map((door) => door.id).join(", ")}`,
    );
    process.exit(2);
  }
  const next = record ?? { reviewed_at: {} };
  next.reviewed_at = { ...(next.reviewed_at ?? {}), [reviewing]: new Date(now).toISOString() };
  writeRecord(next);
  console.log(`${reviewing} marked reviewed ${new Date(now).toISOString().slice(0, 10)}.`);
  process.exit(0);
}

const snapshot = await collect();
const observation = readDoors(snapshot, now);
const diff = compare(record, observation);
const due = reviewsDue(record, now);

if (asJson) {
  console.log(JSON.stringify({ base, observation, diff, reviews_due: due }, null, 2));
} else {
  console.log(report(observation, diff, due, record));
}

if (recording) {
  writeRecord({
    ...observation,
    base,
    reviewed_at: record?.reviewed_at ?? {},
  });
  if (!asJson) console.log(`\nRecorded to ${RECORD.pathname}.`);
}

// A door we could not read is not a door that fell. Only real falls and
// overdue reviews are worth a red build; everything else is a report.
const unreadable = observation.doors.every(
  (door) => door.tally.met + door.tally.partial + door.tally.unmet === 0,
);
if (unreadable) process.exit(2);
process.exit(diff.regressions.length > 0 || due.length > 0 ? 1 : 0);
