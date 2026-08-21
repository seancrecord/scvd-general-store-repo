import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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

/**
 * The vocabulary an entry was written under, so a reader can tell
 * which fields COULD be present without probing for them. It moves on
 * additive growth too, not only on breaks — a frozen string while the
 * field set triples tells a reader nothing. Old values are accepted
 * forever; anything that would break an existing reader is a v1.
 */
export const SCHEMA_VERSION = "0.8";

export const EVENTS = [
  "trial_started",
  "paid_started",
  /**
   * ADOPTED — a free tool taken up. v0.2 had no way to say this: the
   * enum assumed every commitment involved money, so CV's very first
   * real use (logging The Tab itself, which is free) had to reach for
   * trial_started with an invented conversion date, and the product
   * dutifully raised a warning about a charge that will never come.
   * The workaround was worse than the gap — paid_started with
   * {amount: 0} validates, then lands in active_paid and tells the
   * pooled corpus a paid signup happened. Free tools are a large
   * share of the builder-tool economy and the ones most likely to be
   * agent_native, so the index would have been wrong exactly where it
   * matters most.
   */
  "adopted",
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

/**
 * WHERE AN ENTRY CAME FROM. Coverage accounting needs this: "what
 * fed the burn number" is one of the six countable facts the audit
 * publishes about its own completeness.
 */
export const SOURCES = [
  "manual", // the builder said it, in a sentence
  "capture", // a fragment, /log-shaped, gaps allowed
  "mail_sweep", // extracted from a receipt
  "historical_pass", // the six-month backward sweep
];

/**
 * HOW MUCH THE ENTRY'S NUMBERS ARE WORTH. `stated` means a human or
 * a receipt said it outright; `inferred` means something read it out
 * of ambiguous text. The annual/monthly confusion is why this exists
 * — $240/yr read as $240/mo is a 12x error in the only number the
 * product is judged on, and an inferred price must be visibly
 * inferred rather than quietly averaged into the total.
 */
export const CONFIDENCE = ["stated", "inferred"];

/**
 * WHAT KIND OF NUMBER `price` IS HOLDING (v0.8, the keeper's ruling
 * 2026-08-10: the burn total MAY contain an estimate — leaving the
 * metered bills out made it incomplete; marking them makes it honest).
 *
 * The two shapes that were never clocks (SCHEMA.md's known hole,
 * found logging a real stack by hand): a usage-based bill has no
 * fixed amount, and a free tier's paid path has a price nobody is
 * paying. Both were representable only by lying — inventing a fixed
 * number for one, dropping the number entirely for the other.
 *
 *   `fixed`   — the amount is the bill. Absent means fixed, so every
 *               pre-0.8 entry keeps its meaning unchanged.
 *   `metered` — the amount is the builder's ESTIMATE of a bill that
 *               varies with usage. It enters the burn AND the burn
 *               says how much of itself is estimate.
 *   `free_with_paid_path` — the tool is free today; the amount is
 *               what the paid path would cost if engaged. Allowed
 *               only on `adopted`, never enters the burn — same law
 *               as `converts_to`: a claim about the future is not a
 *               charge.
 */
export const BASIS = ["fixed", "metered", "free_with_paid_path"];

/**
 * The placeholder for a field only the builder can fill. Capture
 * writes it, the quarantine REQUIRES it on anything a sweep found,
 * and it lands in `incomplete` so the drip asks at a convenient
 * moment rather than the extractor guessing.
 */
export const UNSAID = "(not said yet)";

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

/**
 * THE ONLY PLACE A SIDECAR FILENAME IS BUILT.
 *
 * The coverage record lives beside the tab, and the first cut spliced
 * a suffix onto the raw path string — which reaches this module from
 * TAB_PATH or --path, i.e. from outside the program. CodeQL called it
 * (high, path expression from an uncontrolled source) and it was
 * right to: a path is not a string, and treating it like one is how
 * a "sidecar" ends up somewhere else entirely.
 *
 * So the directory is taken from the tab's own resolved location and
 * the filename is REBUILT from a sanitized basename plus a fixed
 * suffix. Whatever arrives, what comes out is one file, beside the
 * tab, named after it.
 */
export function sidecarPath(tabPath, suffix) {
  const resolved = resolve(String(tabPath));
  const safeBase = basename(resolved).replace(/[^A-Za-z0-9._-]/g, "_");
  const safeSuffix = String(suffix).replace(/[^A-Za-z0-9._-]/g, "");
  return join(dirname(resolved), `${safeBase}${safeSuffix}`);
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

/**
 * THE BILLING CLOCKS. One list, exported, so the validator, the two
 * error messages and every schema that names them cannot drift apart
 * — the first cut spelled the vocabulary out in four places, which is
 * four chances to add a period and forget one.
 *
 * `quarter` arrived after a real stack was logged by hand and hit the
 * refusal (2026-08-08). Quarterly billing is common and the shape is
 * identical to the others — a fixed amount on a fixed clock — so the
 * refusal was buying nothing and costing an agent silent arithmetic,
 * which is the inferred-arithmetic class `confidence` exists to flag.
 *
 * The two shapes still NOT here are the ones that are not clocks at
 * all: usage-based, and a free tier with a paid path. Neither is a
 * missing period; both are "there is no fixed number", and forcing
 * them onto a clock would put a guess inside the burn with nothing
 * marking which part was guessed. Recorded in SCHEMA.md, not patched.
 */
export const PERIODS = ["month", "quarter", "year", "week", "once"];

function isPrice(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    typeof value.currency === "string" &&
    PERIODS.includes(value.period) &&
    // Absent means fixed; present must be in the vocabulary.
    (value.basis === undefined || BASIS.includes(value.basis))
  );
}

/**
 * Field caps (red team F5, 2026-08-08): an unbounded free-text field
 * is how a metric becomes a bill — the outline's own warning — and
 * bounded lines are also what makes append atomicity REAL on POSIX
 * (one write under the atomic size), which is what makes "the server
 * owns the file" an honest sentence rather than a hope.
 */
const CAPS = {
  tool_name: 80,
  captured_text: 2000,
  dedupe_key: 200,
  problem_solved: 500,
  notes: 2000,
  payment_method: 200,
  source_url: 500,
  replaced_with: 80,
};

/**
 * Validation is the whole reason writes go through tools. Returns a
 * list of human-useful problems; empty means the write may append.
 * The messages are for an AGENT to read and repair from, so each one
 * names the field, the rule, and where applicable the fix.
 */
export function validateEvent(input) {
  const problems = [];
  const event = input?.event;

  for (const [field, cap] of Object.entries(CAPS)) {
    if (typeof input?.[field] === "string" && input[field].length > cap) {
      problems.push(`${field} runs past ${cap} characters. Trim it to the good part.`);
    }
  }

  /**
   * THE QUARANTINE, and it is a schema rule rather than a filter.
   *
   * The agent speaks stored fields back in chat, so a field holding a
   * stranger's prose is a stranger addressing the agent — the
   * markdown-image exfil class, unmodified. Scrubbing that text is the
   * losing half of the fight; the winning half is giving it no field
   * to land in. A receipt's wording is the VENDOR's, not the
   * builder's, so nothing is lost by refusing to keep it: mail-sourced
   * entries carry the closed vocabulary, numbers and dates, and that
   * is all.
   *
   * `problem_solved` is the residue and is named as such in THE_TAB.md
   * — it is required, it is free text, and a sweep that fills it from
   * the letter rather than from the builder puts vendor prose back in
   * the ledger. Closed since 2026-08-10: the sweep is built
   * (sweep.mjs, the sweep_tally/sweep_finish lane), and on swept
   * sources this field must be exactly "(not said yet)" — enforced
   * below, pinned by the residue tests.
   */
  const swept = input?.source === "mail_sweep" || input?.source === "historical_pass";
  if (swept) {
    for (const field of ["captured_text", "notes"]) {
      if (typeof input?.[field] === "string" && input[field].trim() !== "") {
        problems.push(
          `${field} may not be set on a ${input.source} entry: a letter's own words never enter the tab. Keep the numbers, the dates and the closed fields.`,
        );
      }
    }
    /**
     * AND THE RESIDUE, CLOSED. `problem_solved` was the one field the
     * quarantine could not police: required, free text, and a sweep
     * filling it from the letter puts vendor prose back through the
     * front door with nothing in the schema able to tell the two
     * apart.
     *
     * So on a swept entry it must be the placeholder, and the cost of
     * that is nothing real: a receipt does not say what problem it
     * solved for the builder. Only the builder does. `(not said yet)`
     * is what capture already writes, it lands in `incomplete`, and
     * the drip asks at a convenient moment — which was always the
     * design, now with no way around it.
     */
    if (typeof input?.problem_solved === "string" && input.problem_solved !== UNSAID) {
      problems.push(
        `problem_solved must be "${UNSAID}" on a ${input.source} entry: it is the builder's own words about what they were trying to do, and a letter does not contain them. Leave it and the rounds will ask.`,
      );
    }
  }

  if (event === "consent_changed") {
    if (typeof input.contribute !== "boolean") {
      problems.push("consent_changed needs contribute: true|false.");
    }
    return problems;
  }

  if (!input || typeof input.tool_name !== "string" || input.tool_name.trim() === "") {
    problems.push("tool_name is required: the tool's canonical lowercase name.");
  } else if (input.tool_name !== input.tool_name.trim().toLowerCase()) {
    // Trim AND case: " Ahrefs" and "ahrefs" must never become two
    // tools — a near-duplicate key splits one history into two lies.
    problems.push(
      `tool_name must be lowercase with no surrounding whitespace: "${input.tool_name.trim().toLowerCase()}".`,
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
      `${event} requires price: {amount, currency, period: ${PERIODS.join("|")}}.`,
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
    problems.push(
      `price must be {amount, currency, period: ${PERIODS.join("|")}, basis?: ${BASIS.join("|")}}.`,
    );
  }
  /**
   * THE BASIS FENCE, both directions. free_with_paid_path on a paying
   * event is a contradiction (money moved, so it is not free), and a
   * price on `adopted` without it is the old lie the enum refused —
   * a priced free signup would tell the pooled index money changed
   * hands. The one legal combination is exactly the gap the keeper's
   * ruling closed: adopted + the price the paid path WOULD cost.
   */
  if (
    input?.price?.basis === "free_with_paid_path" &&
    event !== "adopted"
  ) {
    problems.push(
      "basis free_with_paid_path belongs on adopted only: it marks the price a FREE tool's paid path would cost. If money is actually moving, the basis is fixed or metered.",
    );
  }
  if (input?.previous_price?.basis === "free_with_paid_path") {
    problems.push(
      "previous_price cannot have basis free_with_paid_path — a price that was charged was never the free tier's hypothetical.",
    );
  }
  if (event === "adopted" && input?.price !== undefined && input?.price?.basis !== "free_with_paid_path") {
    problems.push(
      "adopted is for a FREE tool and must carry no price — unless the price marks the paid path with basis: \"free_with_paid_path\", which never enters the burn. If money changes hands it is paid_started or trial_started.",
    );
  }
  if (input?.confirmed !== undefined && typeof input.confirmed !== "boolean") {
    problems.push("confirmed must be true or false.");
  }
  if (input?.private !== undefined && typeof input.private !== "boolean") {
    problems.push("private must be true or false.");
  }
  if (input?.source !== undefined && !SOURCES.includes(input.source)) {
    problems.push(`source must be one of ${SOURCES.join(", ")}.`);
  }
  if (input?.confidence !== undefined && !CONFIDENCE.includes(input.confidence)) {
    problems.push(`confidence must be one of ${CONFIDENCE.join(", ")}.`);
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

/**
 * THE DEDUPE KEY — the requirement that only appears once a SWEEP
 * exists. A mail sweep re-finds the same receipt on every pass, and
 * nothing in v0.2 stopped one trial being logged three times. A
 * triple-counted subscription silently inflates the burn figure,
 * which is the one number the product is judged on — the same defect
 * class as a typed tally, arriving by a different road.
 *
 * The caller supplies it (a message id is cleanest); when it does
 * not, one is derived from the facts that make an event the same
 * event: tool, kind, and the day it happened.
 */
export function dedupeKeyFor(input, at) {
  if (typeof input?.dedupe_key === "string" && input.dedupe_key.length > 0) {
    return input.dedupe_key;
  }
  return `${input?.tool_name}|${input?.event}|${String(at).slice(0, 10)}`;
}

/** Validate, stamp, append. The only writer in the whole product. */
export function appendEvent(path, input) {
  const problems = validateEvent(input);
  if (problems.length > 0) {
    return { logged: false, problems };
  }
  const at = input.retroactive && input.occurred_at
    ? input.occurred_at
    : new Date().toISOString();
  const key = input.event === "consent_changed" ? null : dedupeKeyFor(input, at);
  if (key) {
    const { events } = readEvents(path);
    const already = events.find((entry) => entry.dedupe_key === key);
    if (already) {
      return {
        logged: false,
        duplicate: true,
        existing_entry_id: already.entry_id,
        problems: [
          `Already logged as ${already.entry_id} (${key}). Nothing written — a re-found receipt must not become a second charge in the burn number.`,
        ],
      };
    }
  }
  // Input spreads FIRST so the envelope always wins: a caller-supplied
  // server_timestamp, entry_id or schema_version is overwritten, never
  // honored. The first cut had this backwards and the "agents can lie
  // about time; the file can't" test caught its own principle being
  // violated by spread order — which is exactly what it was for.
  /**
   * CONFIRMED, BY DEFAULT ACCORDING TO WHO SPOKE.
   *
   * A human saying it — manual, or a /log fragment they typed — is
   * confirmed on arrival; they were there. Anything a SWEEP found is
   * a claim about a receipt, and a receipt is a letter anyone can
   * send: unconfirmed until a person looks. This is what keeps a
   * forged "welcome to X" from reaching the pooled corpus by itself.
   *
   * It does not keep it out of the tab — a swept entry still counts
   * toward YOUR burn, because it probably is your money and a wrong
   * number you can see beats a missing one you can't.
   */
  const source = input.source ?? "manual";
  const confirmed =
    typeof input.confirmed === "boolean"
      ? input.confirmed
      : source === "manual" || source === "capture";
  const entry = {
    ...input,
    source,
    confirmed,
    entry_id: newEntryId(),
    server_timestamp: new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    ...(key ? { dedupe_key: key } : {}),
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  return { logged: true, entry };
}

/**
 * CAPTURE — the lane that must never refuse.
 *
 * The validator is what makes the tab trustworthy and it is exactly
 * wrong at the moment of capture: if `/log seedance` bounces with
 * "problem_solved is required", nobody types it a second time, and
 * the product dies of correctness. So capture takes whatever came,
 * fills what it can, RECORDS WHAT IS MISSING BY NAME, and writes.
 *
 * The gaps are not swept under: `incomplete` is a list the rounds
 * read back, so the agent chases the missing field at a convenient
 * moment instead of interrogating somebody who has five seconds of
 * attention and a browser tab still open.
 */
export function captureEvent(path, input) {
  const incomplete = [];
  const draft = { ...input };
  draft.source = SOURCES.includes(draft.source) ? draft.source : "capture";
  draft.event = EVENTS.includes(draft.event) && draft.event !== "consent_changed"
    ? draft.event
    : (incomplete.push("event"), "adopted");
  if (typeof draft.tool_name === "string") {
    draft.tool_name = draft.tool_name.trim().toLowerCase();
  }
  if (typeof draft.problem_solved !== "string" || draft.problem_solved.trim() === "") {
    incomplete.push("problem_solved");
    draft.problem_solved = UNSAID;
  }
  if (!CATEGORIES.includes(draft.category)) {
    incomplete.push("category");
    draft.category = "other";
  }
  // A trial with no end date cannot warn anybody, which is the whole
  // product — so it is named as missing rather than invented.
  if (draft.event === "trial_started" && !isIsoDate(draft.trial_ends)) {
    incomplete.push("trial_ends");
    draft.event = "adopted";
    delete draft.trial_ends;
  }
  if ((draft.event === "paid_started" || draft.event === "renewed") && !isPrice(draft.price)) {
    incomplete.push("price");
    draft.event = "adopted";
    delete draft.price;
  }
  if (
    draft.event === "adopted" &&
    draft.price !== undefined &&
    !(isPrice(draft.price) && draft.price.basis === "free_with_paid_path")
  ) {
    // A price on a free adoption is dropped UNLESS it is a well-formed
    // paid-path marker — the one combination v0.8 made legal.
    delete draft.price;
  }
  if (incomplete.length > 0) {
    draft.incomplete = incomplete;
  }
  const result = appendEvent(path, draft);
  if (result.logged || result.duplicate) {
    return { ...result, incomplete };
  }
  /**
   * LAST RESORT — and the two bugs the red team found here, because
   * "never refuses" was false in exactly this branch (F3, F5).
   *
   * F3: the fallback derived its dedupe key from tool+event+DAY, so
   * the SECOND unparseable capture in a day collided with the first
   * and was dropped as a duplicate — silently, by the one lane whose
   * whole contract is that nothing is ever lost.
   *
   * F5: every fallback shared the name "unparsed-capture", so all of
   * them replayed into a single pseudo-tool and distinct failures
   * became one indistinguishable blob.
   *
   * Both fixed by giving each rescue its own identity: a unique
   * dedupe key, and a name carrying the fragment that produced it.
   */
  /**
   * THE QUARANTINE BYPASS THIS LANE WAS, until it was looked at.
   *
   * The fallback relabelled everything `source: "capture"` and kept
   * the raw fragment. So a sweep calling this with a vendor's prose
   * would have its entry REFUSED for carrying prose — and then the
   * rescue would write that same prose under a source the quarantine
   * does not police. The stricter the front door, the more traffic
   * through the back one.
   *
   * A swept fragment now stays swept, and keeps nothing but the shape
   * of its own failure.
   */
  const swept = input?.source === "mail_sweep" || input?.source === "historical_pass";
  const raw = swept
    ? null
    : String(input?.captured_text ?? JSON.stringify(input ?? {})).slice(0, 2000);
  /*
   * The slug is built by SPLITTING on runs of non-slug characters
   * rather than by replacing and then trimming the dashes back off.
   * `/^-+|-+$/` is quadratic on a long run of dashes — the engine
   * re-tries the `-+$` branch from every position — and the string it
   * runs on is a caller's fragment, so a hostile `/log` of ten
   * thousand hyphens is a free stall in the one lane that must never
   * refuse. Split-filter-join is a single linear pass and cannot
   * emit a leading, trailing, or doubled dash in the first place.
   */
  let slug = String(input?.tool_name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-")
    .slice(0, 40);
  if (slug.endsWith("-")) slug = slug.slice(0, -1); // the cut can land on one
  return appendEvent(path, {
    tool_name: slug ? `unparsed-${slug}` : "unparsed-capture",
    event: "adopted",
    problem_solved: swept ? UNSAID : "(capture could not be shaped; raw text kept)",
    category: "other",
    source: swept ? input.source : "capture",
    ...(swept ? {} : { captured_text: raw, notes: result.problems?.join(" ")?.slice(0, 2000) }),
    dedupe_key: `unparsed:${randomBytes(8).toString("hex")}`,
    incomplete: ["everything"],
  });
}

/** The date an event claims for itself: the retroactive claim when
 * present (displayed as a claim), the server's stamp otherwise. */
export function eventDate(event) {
  return (event.retroactive && event.occurred_at) || event.server_timestamp;
}

export function monthlyOf(price) {
  if (!price) return 0;
  if (price.period === "month") return price.amount;
  if (price.period === "quarter") return price.amount / 3;
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
      // What the trial SAYS it will cost when it converts. Kept apart
      // from `price` on purpose: it is a claim about the future, it is
      // not being charged yet, and it must never reach the burn. But
      // without it the pager's one load-bearing line — "midjourney
      // charges you $30 in 3 days" — has no number in it, which is
      // most of why anybody would run this.
      converts_to: null,
      // What the paid path WOULD cost, on a tool being used free.
      // Same law as converts_to: a claim about the future, never
      // the burn. v0.8, the free-with-paid-path half of the ruling.
      paid_path: null,
      trial_ends: null,
      signup_friction: null,
      sources: new Set(),
      confidence: null,
      confirmed: true,
      private: false,
      renewals_seen: 0,
      last_billing_at: null,
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
    tool.confidence = event.confidence ?? tool.confidence;
    tool.sources.add(event.source ?? "manual");
    // Unconfirmed is sticky until somebody confirms; private is
    // sticky once set, because un-marking it should be deliberate.
    if (event.confirmed === false) tool.confirmed = false;
    if (event.confirmed === true) tool.confirmed = true;
    if (event.private === true) tool.private = true;
    // A signup after an inactive spell opens a NEW commitment (red
    // team F4): the epoch resets, so a re-trial a year after a cancel
    // is measured and classified on its own life, not the old one's.
    const reopening = tool.status === "inactive" && tool.history.length > 0;
    switch (event.event) {
      case "trial_started":
        tool.status = "active_trial";
        tool.trial_ends = event.trial_ends;
        tool.converts_to = event.price ?? tool.converts_to;
        tool.since = at;
        tool.first_commitment = reopening ? at : (tool.first_commitment ?? at);
        if (reopening) tool.ever_paid = false;
        break;
      case "adopted":
        // Free, and the status says so rather than hiding in paid.
        tool.status = "active_free";
        // The validator only lets a price through here when it is the
        // paid-path marker; it lands beside the tool, never in price.
        tool.paid_path = event.price ?? tool.paid_path;
        tool.since = reopening ? at : (tool.since ?? at);
        tool.first_commitment = reopening ? at : (tool.first_commitment ?? at);
        break;
      case "paid_started":
        tool.status = "active_paid";
        tool.price = event.price;
        tool.since = reopening ? at : (tool.since ?? at);
        tool.first_commitment = reopening ? at : (tool.first_commitment ?? at);
        tool.ever_paid = true;
        tool.last_billing_at = at;
        break;
      case "renewed":
        tool.status = "active_paid";
        tool.price = event.price ?? tool.price;
        tool.ever_paid = true;
        // Renewals are the heartbeat the silence detector listens for.
        tool.renewals_seen += 1;
        tool.last_billing_at = at;
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
      /**
       * The gaps ride the history or they are swept under: the pager's
       * gap pages read history[].incomplete, and until 2026-08-21 this
       * builder dropped the field the capture rounds worked to record —
       * so the one mechanism built to keep SCHEMA.md's "the gaps are
       * not swept under" promise never fired, for any tool, ever.
       * Found by CV's clock-advance exercise.
       */
      incomplete:
        Array.isArray(event.incomplete) && event.incomplete.length > 0
          ? event.incomplete
          : undefined,
    });
    tools.set(name, tool);
  }

  for (const tool of tools.values()) {
    tool.source_list = [...tool.sources].sort();
  }
  const active = [...tools.values()].filter((t) => t.status !== "inactive");
  const activePaid = active.filter((t) => t.status === "active_paid");
  const burn = activePaid.reduce((sum, t) => sum + monthlyOf(t.price), 0);
  /**
   * THE ESTIMATED SHARE, beside the total rather than inside a
   * footnote. The keeper's ruling lets a metered estimate into the
   * burn on one condition — that the number says which part of
   * itself is a guess — so the split rides the figure everywhere the
   * figure goes, and a reader who ignores it was at least shown it.
   */
  const estimated = activePaid
    .filter((t) => t.price?.basis === "metered")
    .reduce((sum, t) => sum + monthlyOf(t.price), 0);

  return {
    tools,
    consent,
    active,
    active_paid: activePaid,
    monthly_burn: {
      amount: Math.round(burn * 100) / 100,
      currency: "USD",
      estimated_amount: Math.round(estimated * 100) / 100,
      ...(estimated > 0
        ? {
            estimate_note:
              "estimated_amount is the metered share of the total: builder's estimates of bills that vary with usage, included because leaving them out made the total incomplete, marked because including them unmarked would make it a guess.",
          }
        : {}),
    },
    drift,
    now,
  };
}

/**
 * Monthly burn AS OF a past date — the trajectory read, and the one
 * thing no subscription tracker can do. The tab holds EVENTS, not
 * balances, so "what was I paying in March, and which signups
 * account for the difference" is a replay, not a guess.
 */
export function burnAt(events, asOf) {
  const cutoff = asOf.getTime();
  const upTo = events.filter((event) => {
    const at = eventDate(event);
    return at ? Date.parse(at) <= cutoff : false;
  });
  return derive(upTo, asOf).monthly_burn.amount;
}

/**
 * Active tools that have gone quiet past their own billing rhythm.
 *
 * ONLY for tools whose renewals we have actually seen: if the tab has
 * never observed a receipt for something, silence says nothing about
 * it and flagging it would flood the report with noise. Where we HAVE
 * seen the heartbeat, its absence is a real question — cancelled, or
 * a card that failed, which is a service about to die and worth
 * knowing on its own. It is a question, never a verdict: annual
 * billing, a vendor that stopped emailing, and a broken sweep all
 * look identical from here.
 */
export function quietTools(state, cyclesAllowed = 2) {
  return state.active
    .filter((tool) => {
      if (tool.renewals_seen < 1 || !tool.last_billing_at) return false;
      const period = tool.price?.period;
      /**
       * Every billing period with a heartbeat gets the same silence
       * check — until 2026-08-21 only month and week did, so a
       * quarterly or annual sub (domains, hosting, the classic
       * forgotten renewals) could go quiet forever unflagged. Found
       * by CV seeding a quarterly tool and advancing the clock 2.5
       * years to zero pages. "once" stays excluded on purpose: a
       * one-time purchase has no cycle whose absence means anything.
       */
      const cycleMs =
        period === "month"
          ? 30 * 24 * 3600_000
          : period === "week"
            ? 7 * 24 * 3600_000
            : period === "quarter"
              ? 91 * 24 * 3600_000
              : period === "year"
                ? 365 * 24 * 3600_000
                : null;
      if (cycleMs === null) return false;
      return (
        state.now.getTime() - Date.parse(tool.last_billing_at) >
        cyclesAllowed * cycleMs
      );
    })
    .map((tool) => ({
      tool_name: tool.tool_name,
      last_billing_at: tool.last_billing_at,
      renewals_seen: tool.renewals_seen,
      monthly_cost: Math.round(monthlyOf(tool.price) * 100) / 100,
    }));
}

/**
 * NEAR-DUPLICATE TOOL NAMES — break #7 of the coverage enumeration.
 * "openai" and "openai-llc" split one history into two, and both
 * halves look half-dead: the burn double-counts and check_before_
 * signup misses the history it exists to surface.
 *
 * Detected, never auto-merged. Merging two genuinely different tools
 * is a worse error than showing a duplicate, and the tab's whole
 * posture is to convert uncertainty into a cheap question rather
 * than a confident wrong answer.
 */
const ALIAS_SCAN_CAP = 200;

export function possibleAliases(state) {
  // Capped (F7): O(n^2) edit distance on every audit is fine at a
  // builder's scale and is not fine unbounded. An unnamed cap is a
  // silent one, so it is named and reported when it binds.
  const names = [...state.tools.keys()].slice(0, ALIAS_SCAN_CAP);
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = names[i];
      const b = names[j];
      const gap = distance(a, b);
      const shorter = Math.min(a.length, b.length);
      const contained = a.startsWith(b) || b.startsWith(a);
      if (shorter >= 4 && (gap <= 2 || contained)) {
        pairs.push({ names: [a, b], edit_distance: gap });
      }
    }
  }
  return pairs;
}

/** Trials whose conversion lands inside the horizon. The headline. */
export function trialsConvertingSoon(state, days = 7) {
  const horizon = state.now.getTime() + days * 24 * 3600_000;
  return state.active
    .filter(
      (t) =>
        t.status === "active_trial" &&
        t.trial_ends &&
        Date.parse(t.trial_ends) >= state.now.getTime() &&
        Date.parse(t.trial_ends) <= horizon,
    )
    .map((t) => ({
      tool_name: t.tool_name,
      trial_ends: t.trial_ends,
      days_left: Math.max(
        0,
        Math.ceil((Date.parse(t.trial_ends) - state.now.getTime()) / (24 * 3600_000)),
      ),
      converts_to: t.converts_to,
      problem_solved: t.problem_solved,
    }))
    .sort((a, b) => a.days_left - b.days_left);
}

/**
 * Trials whose end date has PASSED with no resolution logged. The
 * first cut left these in the converting list at days_left 0 forever
 * — a warning that never resolves teaches the reader to ignore
 * warnings. Split out instead, with the honest framing: the tab does
 * not know what happened at the boundary; only a logged event does.
 */
export function trialsPastEnd(state) {
  return state.active
    .filter(
      (t) =>
        t.status === "active_trial" &&
        t.trial_ends &&
        Date.parse(t.trial_ends) < state.now.getTime(),
    )
    .map((t) => ({
      tool_name: t.tool_name,
      trial_ends: t.trial_ends,
      days_since_end: Math.floor(
        (state.now.getTime() - Date.parse(t.trial_ends)) / (24 * 3600_000),
      ),
      problem_solved: t.problem_solved,
    }))
    .sort((a, b) => b.days_since_end - a.days_since_end);
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
  /**
   * THE CORPUS GATE. Two kinds of entry never produce a suggestion:
   *
   *   PRIVATE — the therapy app, the job hunt, the competitor you
   *   evaluated. Logged locally if you want it; it leaves the box
   *   over nobody's dead body.
   *
   *   UNCONFIRMED — a swept receipt nobody has looked at. Forged
   *   receipts are corpus poisoning with a mail client, and the
   *   cheapest defence is that machine-found claims do not become
   *   published statistics on their own.
   *
   * Enforced here, at the only place a suggestion is born, rather
   * than trusted to the caller.
   */
  /**
   * ASKED OF THE TOOL, NOT THE ENTRY — the leak this exact test
   * caught. `private` is set once, at signup, and is sticky on the
   * tool; the CANCELLATION event months later carries no flag of its
   * own. Checking the entry alone meant a private tool stayed private
   * right up until the moment it ended, and then published the most
   * revealing fact about itself: that you quit it, and when.
   *
   * The derived record is the authority for both flags, and the
   * entry can only ever add to them.
   */
  const known = state.tools?.get(entry.tool_name);
  if (entry.private === true || known?.private === true) return null;
  if (entry.confirmed === false || known?.confirmed === false) return null;
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
      // Measured to the EVENT's own date, never to now (red team F3):
      // a retroactive cancel backfilled months later must report the
      // weeks the commitment actually ran — the dogfood's first
      // session is exactly this shape, and now-based math would have
      // corrupted the first corpus entries ever written.
      weeks_held: tool?.first_commitment
        ? weeksBetween(tool.first_commitment, new Date(eventDate(entry)))
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
