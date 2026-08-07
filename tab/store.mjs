import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * THE TAB's storage engine: one JSONL file, append-only, replayed.
 *
 * Every design decision here is a line from THE_TAB.md made literal:
 * the server validates everything (no tab drift — the disease this
 * product treats), the server stamps its own timestamps (agents can
 * lie about time; the file can't), current state is derived by
 * replay and never stored (derived-not-typed is law here for the
 * same reason it is law on the storefront), and nothing in this
 * module ever touches the network. Contribution lives elsewhere,
 * deliberately.
 */

export const SCHEMA_VERSION = "0.2";

export const EVENTS = [
  "trial_started",
  "paid_started",
  "canceled",
  "replaced",
  "renewed",
  "price_changed",
  "consent_changed",
];

/**
 * SIGNUP FRICTION (the keeper's meta-pain, 2026-08-08): the agent
 * could not create the Twitter account, because Twitter wants a
 * phone — and that is not a Twitter fact, it is a fact about EVERY
 * tool, worth a controlled vocabulary. The tab tracks not just what
 * the builder signs up for but what an agent CANNOT sign up for
 * without a human. Observation-shaped, per design principle 6: a
 * friction score says what the signup path demanded, never whether
 * the tool deserves the demand.
 */
export const FRICTION = [
  "agent_native", // API key, no human needed
  "email_only", // an agent with an inbox can do it
  "phone_required", // a human's phone number gates the door
  "kyc_required", // identity, bank, documents
  "human_only", // no API, no agent path at all
];

export const CATEGORIES = [
  "llm",
  "agent-framework",
  "image-gen",
  "video-gen",
  "seo",
  "aso",
  "analytics",
  "hosting",
  "database",
  "email",
  "social-scheduling",
  "design",
  "dev-tool",
  "mcp-server",
  "api-service",
  "streaming",
  "music",
  "news",
  "vpn",
  "storage",
  "domain",
  "other",
];

export function defaultTabPath() {
  return process.env.TAB_PATH ?? `${homedir()}/.scvd/tab.jsonl`;
}

function newEntryId() {
  return `tab_${randomBytes(8).toString("hex")}`;
}

/** Plain edit distance, for the closest-category suggestion. */
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

export function closestCategory(raw) {
  let best = CATEGORIES[0];
  let bestScore = Infinity;
  for (const category of CATEGORIES) {
    const score = distance(String(raw).toLowerCase(), category);
    if (score < bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPrice(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    typeof value.currency === "string" &&
    ["month", "year", "week", "once"].includes(value.period)
  );
}

/**
 * Validation is the whole reason writes go through tools. Returns a
 * list of human-useful problems; empty means the write may append.
 * The messages are for an AGENT to read and repair from, so each one
 * names the field, the rule, and where applicable the fix.
 */
export function validateEvent(input) {
  const problems = [];
  const event = input?.event;

  if (event === "consent_changed") {
    if (typeof input.contribute !== "boolean") {
      problems.push("consent_changed needs contribute: true|false.");
    }
    return problems;
  }

  if (!input || typeof input.tool_name !== "string" || input.tool_name.trim() === "") {
    problems.push("tool_name is required: the tool's canonical lowercase name.");
  } else if (input.tool_name !== input.tool_name.toLowerCase()) {
    problems.push(
      `tool_name must be lowercase: "${input.tool_name.toLowerCase()}".`,
    );
  }
  if (!EVENTS.includes(event) || event === "consent_changed") {
    problems.push(
      `event must be one of ${EVENTS.filter((e) => e !== "consent_changed").join(", ")}.`,
    );
  }
  if (typeof input?.problem_solved !== "string" || input.problem_solved.trim() === "") {
    problems.push(
      "problem_solved is required: what the builder was trying to do, in their words.",
    );
  }
  if (!CATEGORIES.includes(input?.category)) {
    problems.push(
      `category "${input?.category}" is not in the vocabulary — closest match: "${closestCategory(input?.category ?? "")}".`,
    );
  }
  if (event === "trial_started" && !isIsoDate(input?.trial_ends)) {
    problems.push(
      "trial_started requires trial_ends (ISO date) — the warning date is the whole point of logging a trial.",
    );
  }
  if ((event === "paid_started" || event === "renewed") && !isPrice(input?.price)) {
    problems.push(
      `${event} requires price: {amount, currency, period: month|year|week|once}.`,
    );
  }
  if (event === "price_changed") {
    if (!isPrice(input?.price) || !isPrice(input?.previous_price)) {
      problems.push(
        "price_changed requires BOTH price and previous_price — a change with one price is not a change, it is a number.",
      );
    }
  }
  if (event === "replaced" && (typeof input?.replaced_with !== "string" || input.replaced_with.trim() === "")) {
    problems.push(
      "replaced requires replaced_with: the successor tool. Logged against the OUTGOING tool.",
    );
  }
  if (input?.occurred_at !== undefined) {
    if (input?.retroactive !== true) {
      problems.push(
        "occurred_at is only allowed with retroactive: true — it is a claim about the past, and the file marks claims as claims.",
      );
    } else if (!isIsoDate(input.occurred_at)) {
      problems.push("occurred_at must be an ISO date.");
    }
  }
  if (input?.price !== undefined && !isPrice(input.price)) {
    problems.push("price must be {amount, currency, period: month|year|week|once}.");
  }
  if (input?.signup_friction !== undefined && !FRICTION.includes(input.signup_friction)) {
    problems.push(
      `signup_friction must be one of ${FRICTION.join(", ")} — what the signup path DEMANDED, not an opinion about it.`,
    );
  }
  return problems;
}

/** Read every entry. Bad lines are collected, never fatal — one
 * corrupt row must not blind the whole instrument. */
export function readEvents(path) {
  if (!existsSync(path)) {
    return { events: [], badLines: 0 };
  }
  const events = [];
  let badLines = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      badLines += 1;
    }
  }
  return { events, badLines };
}

/** Validate, stamp, append. The only writer in the whole product. */
export function appendEvent(path, input) {
  const problems = validateEvent(input);
  if (problems.length > 0) {
    return { logged: false, problems };
  }
  // Input spreads FIRST so the envelope always wins: a caller-supplied
  // server_timestamp, entry_id or schema_version is overwritten, never
  // honored. The first cut had this backwards and the "agents can lie
  // about time; the file can't" test caught its own principle being
  // violated by spread order — which is exactly what it was for.
  const entry = {
    ...input,
    entry_id: newEntryId(),
    server_timestamp: new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  return { logged: true, entry };
}

/** The date an event claims for itself: the retroactive claim when
 * present (displayed as a claim), the server's stamp otherwise. */
export function eventDate(event) {
  return (event.retroactive && event.occurred_at) || event.server_timestamp;
}

function monthly(price) {
  if (!price) return 0;
  if (price.period === "month") return price.amount;
  if (price.period === "year") return price.amount / 12;
  if (price.period === "week") return (price.amount * 52) / 12;
  return 0; // "once" is not a burn.
}

/**
 * Replay the log into current state. Derived at read, never stored.
 */
export function derive(events, now = new Date()) {
  const tools = new Map();
  const drift = [];
  let consent = false;

  for (const event of events) {
    if (event.event === "consent_changed") {
      consent = event.contribute === true;
      continue;
    }
    const name = event.tool_name;
    if (!name) continue;
    const tool = tools.get(name) ?? {
      tool_name: name,
      status: "inactive",
      category: event.category,
      problem_solved: event.problem_solved,
      price: null,
      trial_ends: null,
      signup_friction: null,
      since: null,
      ever_paid: false,
      first_commitment: null,
      last_event: null,
      last_event_at: null,
      history: [],
    };
    const at = eventDate(event);
    tool.category = event.category ?? tool.category;
    tool.problem_solved = event.problem_solved ?? tool.problem_solved;
    tool.signup_friction = event.signup_friction ?? tool.signup_friction;
    switch (event.event) {
      case "trial_started":
        tool.status = "active_trial";
        tool.trial_ends = event.trial_ends;
        tool.since = at;
        tool.first_commitment = tool.first_commitment ?? at;
        break;
      case "paid_started":
        tool.status = "active_paid";
        tool.price = event.price;
        tool.since = tool.since ?? at;
        tool.first_commitment = tool.first_commitment ?? at;
        tool.ever_paid = true;
        break;
      case "renewed":
        tool.status = "active_paid";
        tool.price = event.price ?? tool.price;
        tool.ever_paid = true;
        break;
      case "canceled":
      case "replaced":
        tool.status = "inactive";
        break;
      case "price_changed":
        tool.price = event.price;
        drift.push({
          tool_name: name,
          date: at,
          previous_price: event.previous_price,
          price: event.price,
        });
        break;
    }
    tool.last_event = event.event;
    tool.last_event_at = at;
    tool.history.push({
      event: event.event,
      date: at,
      retroactive: event.retroactive === true || undefined,
      problem_solved: event.problem_solved,
      notes: event.notes,
      price: event.price,
      replaced_with: event.replaced_with,
    });
    tools.set(name, tool);
  }

  const active = [...tools.values()].filter((t) => t.status !== "inactive");
  const activePaid = active.filter((t) => t.status === "active_paid");
  const burn = activePaid.reduce((sum, t) => sum + monthly(t.price), 0);

  return {
    tools,
    consent,
    active,
    active_paid: activePaid,
    monthly_burn: { amount: Math.round(burn * 100) / 100, currency: "USD" },
    drift,
    now,
  };
}

/** Trials whose conversion lands inside the horizon. The headline. */
export function trialsConvertingSoon(state, days = 7) {
  const horizon = state.now.getTime() + days * 24 * 3600_000;
  return state.active
    .filter(
      (t) =>
        t.status === "active_trial" &&
        t.trial_ends &&
        Date.parse(t.trial_ends) <= horizon,
    )
    .map((t) => ({
      tool_name: t.tool_name,
      trial_ends: t.trial_ends,
      days_left: Math.max(
        0,
        Math.ceil((Date.parse(t.trial_ends) - state.now.getTime()) / (24 * 3600_000)),
      ),
      problem_solved: t.problem_solved,
    }))
    .sort((a, b) => a.days_left - b.days_left);
}

export function weeksBetween(fromIso, to) {
  return Math.max(
    0,
    Math.round((to.getTime() - Date.parse(fromIso)) / (7 * 24 * 3600_000)),
  );
}

/**
 * The delta that WOULD be contributed for a just-logged event, or
 * null when the event isn't contributable. Built here so the write
 * response and a deliberate later contribution can never disagree
 * about the shape — one function, one wire format.
 */
export function deltaFor(entry, state) {
  const week = eventDate(entry).slice(0, 10);
  if (entry.event === "trial_started" || entry.event === "paid_started") {
    const opened = {
      kind: "opened",
      tool_name: entry.tool_name,
      category: entry.category,
      week: isoWeekOf(week),
    };
    // The agent-readiness index rides the opened delta: a fact about
    // the TOOL's door, carrying nothing about the builder.
    if (entry.signup_friction) {
      opened.signup_friction = entry.signup_friction;
    }
    return opened;
  }
  if (entry.event === "canceled" || entry.event === "replaced") {
    const tool = state.tools.get(entry.tool_name);
    const outcome =
      entry.event === "replaced"
        ? "replaced"
        : tool?.ever_paid
          ? "canceled_post_conversion"
          : "canceled_pre_conversion";
    const delta = {
      kind: "outcome",
      tool_name: entry.tool_name,
      category: entry.category,
      outcome,
      weeks_held: tool?.first_commitment
        ? weeksBetween(tool.first_commitment, state.now)
        : 0,
    };
    if (entry.event === "replaced") {
      delta.replaced_with = entry.replaced_with;
    }
    return delta;
  }
  return null;
}

/** ISO week key like 2026-W32 — the delta's only notion of time. */
export function isoWeekOf(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
