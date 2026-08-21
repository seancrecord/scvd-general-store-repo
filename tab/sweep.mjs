import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { recordCoverage } from "./coverage.mjs";
import { captureEvent, defaultTabPath, sidecarPath } from "./store.mjs";

/**
 * THE SWEEP LEDGER — the counting obligation becomes machinery.
 *
 * SWEEP.md is the contract; this file is what holds a sweep to it.
 * The contract's load-bearing rule — count as you go, one bucket per
 * message, publish the residue — lived as a paragraph an agent was
 * trusted to follow, which is another way of saying it lived nowhere.
 * A sweep that tallied at the end from memory produced numbers that
 * could not be checked against anything, and `matched` was whatever
 * the agent SAID it wrote rather than what the tab received.
 *
 * So the tally moves inside: the agent classifies each message and
 * reports the verdicts here in batches; this ledger counts them,
 * refuses the malformed ones OUT LOUD, writes the matched entries
 * through the same quarantined capture lane as every other caller,
 * and at the finish derives the coverage record from what actually
 * happened. `scanned` is the count of verdicts accepted; `matched`
 * is the count of entries the tab took. The books balance by
 * construction, because nobody's memory is in the loop.
 *
 * What stays honest by statement rather than construction: a sweep
 * that pre-filters — reads mail it never reports here — shrinks its
 * own denominator, and no tally can see mail it was never told about.
 * That limit is named in the finish note rather than papered over.
 *
 * NO MAIL CODE lives here, per the contract's first line. Verdicts
 * in, counts and writes out. Message bodies never arrive at all, and
 * the fields that could smuggle vendor prose (problem_solved,
 * captured_text, notes) are refused at this door on top of the
 * store's own quarantine — the belt under that buckle.
 */

const BUCKETS = ["matched", "unmatched_transactional", "not_transactional"];

/** Six shapes a receipt can honestly claim; consent is not one of them. */
const SWEEP_EVENTS = [
  "trial_started",
  "paid_started",
  "renewed",
  "canceled",
  "price_changed",
  "adopted",
];

/** What a matched verdict may carry to the tab. Closed, not advisory.
 * previous_price arrived 2026-08-21: the list advertised
 * price_changed but dropped the one field that event requires, so
 * every swept price change was silently demoted to an unparsed blob
 * and the burn kept the stale price (dark team). */
const ENTRY_FIELDS = [
  "tool_name",
  "event",
  "price",
  "previous_price",
  "trial_ends",
  "category",
  "confidence",
  "occurred_at",
];

/** A batch bigger than this is a sweep trying to tally from memory. */
export const SWEEP_BATCH_CAP = 200;

const isIsoDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}/.test(value) &&
  Number.isFinite(Date.parse(value));

function sweepSidecar(path) {
  return sidecarPath(path, ".sweep.jsonl");
}

function readSweepLog(path) {
  try {
    return readFileSync(sweepSidecar(path), "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function appendSweepRecord(path, record) {
  const sidecar = sweepSidecar(path);
  mkdirSync(dirname(sidecar), { recursive: true });
  appendFileSync(sidecar, `${JSON.stringify(record)}\n`, "utf8");
}

/** One sweep's standing, derived by replay like everything else here. */
function sweepState(path, sweepId) {
  const state = {
    exists: false,
    closed: false,
    seen: new Set(),
    counts: { matched: 0, not_transactional: 0 },
    unmatched: [],
    attributed: 0,
    windowFrom: null,
    windowTo: null,
    addresses: new Set(),
  };
  for (const record of readSweepLog(path)) {
    if (record.sweep_id !== sweepId) continue;
    state.exists = true;
    if (record.kind === "close") {
      state.closed = true;
      continue;
    }
    if (record.kind !== "batch") continue;
    if (!state.windowFrom || record.window_from < state.windowFrom) {
      state.windowFrom = record.window_from;
    }
    if (!state.windowTo || record.window_to > state.windowTo) {
      state.windowTo = record.window_to;
    }
    for (const address of record.addresses_swept ?? []) {
      state.addresses.add(address);
    }
    for (const message of record.messages ?? []) {
      if (message.duplicate) continue;
      state.seen.add(message.message_id);
      if (message.bucket === "unmatched_transactional") {
        state.unmatched.push({
          amount: message.amount,
          currency: message.currency,
          sender: message.sender,
        });
      } else {
        state.counts[message.bucket] += 1;
      }
      if (message.bucket === "matched" && Number.isFinite(message.amount)) {
        state.attributed += message.amount;
      }
    }
  }
  return state;
}

function runningTotals(state) {
  const scanned =
    state.counts.matched +
    state.counts.not_transactional +
    state.unmatched.length;
  return {
    scanned_so_far: scanned,
    matched: state.counts.matched,
    unmatched_transactional: state.unmatched.length,
    not_transactional: state.counts.not_transactional,
  };
}

/**
 * One verdict, checked against the contract. Returns the row to store
 * or the refusal — never both, never silence.
 */
function checkMessage(message, state, batchSeen, source) {
  const id = typeof message?.message_id === "string" ? message.message_id.trim() : "";
  if (id === "" || id.length > 200) {
    return { problems: ["message_id is required (the letter's own id, up to 200 chars) — it is the dedupe key that stops a re-found receipt becoming a second charge."] };
  }
  if (!BUCKETS.includes(message.bucket)) {
    return {
      problems: [
        `bucket must be one of ${BUCKETS.join(", ")} — there is no fourth bucket. A message that fits none of the three is a finding about the contract; report it, do not invent a place for it.`,
      ],
    };
  }
  if (state.seen.has(id) || batchSeen.has(id)) {
    // Counted once, reported honestly — a re-sent verdict is not an error.
    return { row: { message_id: id, bucket: message.bucket, duplicate: true } };
  }
  if (message.bucket === "matched") {
    const entry = message.entry;
    if (!entry || typeof entry !== "object") {
      return { problems: ["a matched message needs its entry — that is what matched means."] };
    }
    const problems = [];
    for (const field of ["problem_solved", "captured_text", "notes"]) {
      if (entry[field] !== undefined) {
        problems.push(
          `entry.${field} is refused at this door: a swept entry carries the closed vocabulary, numbers, dates and a message id — never prose, and never the vendor's words about what problem it solves. See SWEEP.md.`,
        );
      }
    }
    if (typeof entry.tool_name !== "string" || entry.tool_name.trim() === "") {
      problems.push("entry.tool_name is required (sender domain, normalized lowercase).");
    }
    if (!SWEEP_EVENTS.includes(entry.event)) {
      problems.push(`entry.event must be one of ${SWEEP_EVENTS.join(", ")}.`);
    }
    if (entry.occurred_at !== undefined && !isIsoDate(entry.occurred_at)) {
      problems.push("entry.occurred_at must be an ISO date (the letter's own date).");
    }
    // Refused loudly so the sweep RESUBMITS with both prices, instead
    // of the capture lane demoting the change to an unparsed blob and
    // the tally booking it as a silent success.
    if (entry.event === "price_changed" && (entry.price === undefined || entry.previous_price === undefined)) {
      problems.push(
        "entry.event price_changed needs BOTH price and previous_price — a change with one price is not a change, it is a number.",
      );
    }
    if (problems.length > 0) return { problems };
    const capture = { source };
    for (const field of ENTRY_FIELDS) {
      if (entry[field] !== undefined) capture[field] = entry[field];
    }
    // The letter's date is a claim about the past, marked as one.
    if (capture.occurred_at !== undefined) capture.retroactive = true;
    capture.dedupe_key = id;
    const written = captureEvent(state.tabPath, capture);
    const row = { message_id: id, bucket: "matched" };
    /**
     * ATTRIBUTED MEANS MONEY MOVED AND WAS RECORDED. The old line
     * booked entry.price.amount for every matched verdict: trial
     * conversion claims and canceled tools' prices (no money moved in
     * this window), and entries the capture lane demoted with the
     * price deleted (money never recorded). Both inflated
     * attributed_amount and understated variability (dark team
     * 2026-08-21).
     */
    const moneyMoved = entry.event === "paid_started" || entry.event === "renewed";
    const keptPrice = written.duplicate ? entry.price : written.entry?.price;
    if (moneyMoved && Number.isFinite(keptPrice?.amount)) {
      row.amount = keptPrice.amount;
    }
    if (Array.isArray(written.incomplete) && written.incomplete.length > 0) {
      // The tally shows what the write lost, instead of reading as a
      // clean success while the ledger holds a gap.
      row.incomplete = written.incomplete;
    }
    if (written.duplicate) {
      // Matched HERE even though the tab wrote nothing: the same
      // receipt found by an earlier sweep is still this window's mail.
      row.write_deduped = true;
      row.entry_id = written.existing_entry_id;
    } else {
      row.entry_id = written.entry?.entry_id;
    }
    return { row };
  }
  if (message.bucket === "unmatched_transactional") {
    if (!Number.isFinite(message.amount) || message.amount < 0) {
      return { problems: ["unmatched_transactional needs the amount the letter carried — money-shaped mail with no number is not a measurement of the blind spot."] };
    }
    return {
      row: {
        message_id: id,
        bucket: "unmatched_transactional",
        amount: message.amount,
        currency: String(message.currency ?? "USD").slice(0, 8),
        sender: String(message.sender ?? "").slice(0, 120),
      },
    };
  }
  if (message.entry !== undefined) {
    return { problems: ["not_transactional cannot carry an entry — a message with no money in it has nothing to put on the tab. If it matched a tool, its bucket is matched."] };
  }
  return { row: { message_id: id, bucket: "not_transactional" } };
}

/**
 * THE TALLY — verdicts in batches, counts out, matched entries
 * written through the quarantined capture lane as they arrive.
 * Refused verdicts are returned with reasons and NOT counted: fix
 * them and resubmit, because a verdict dropped on the floor is the
 * pre-filter hole dug from inside.
 */
export function sweepTally(input, path = defaultTabPath()) {
  const sweepId = typeof input?.sweep_id === "string" ? input.sweep_id.trim().slice(0, 60) : "";
  if (sweepId === "") {
    return { accepted: 0, error: "sweep_id is required — the tally is per sweep, and a count with no owner is nobody's books." };
  }
  if (!isIsoDate(input?.window_from) || !isIsoDate(input?.window_to)) {
    return { accepted: 0, error: "window_from and window_to are required ISO dates on every batch — the window is fixed before the reading starts (SWEEP.md, order of operations)." };
  }
  const source = input?.source === "historical_pass" ? "historical_pass" : "mail_sweep";
  if (!Array.isArray(input?.messages) || input.messages.length === 0) {
    return { accepted: 0, error: "messages must be a non-empty array of verdicts." };
  }
  if (input.messages.length > SWEEP_BATCH_CAP) {
    return { accepted: 0, error: `${input.messages.length} verdicts in one call — the cap is ${SWEEP_BATCH_CAP}. Batching exists so the count happens as you go, not at the end from memory.` };
  }
  const state = sweepState(path, sweepId);
  if (state.closed) {
    return { accepted: 0, error: `Sweep "${sweepId}" is finished and its coverage is on the record. A new window is a new sweep_id.` };
  }
  state.tabPath = path;
  const rows = [];
  const refused = [];
  const batchSeen = new Set();
  let duplicates = 0;
  input.messages.forEach((message, index) => {
    const verdict = checkMessage(message, state, batchSeen, source);
    if (verdict.problems) {
      refused.push({ index, message_id: message?.message_id ?? null, problems: verdict.problems });
      return;
    }
    batchSeen.add(verdict.row.message_id);
    if (verdict.row.duplicate) duplicates += 1;
    rows.push(verdict.row);
  });
  if (rows.length > 0) {
    appendSweepRecord(path, {
      kind: "batch",
      sweep_id: sweepId,
      at: new Date().toISOString(),
      source,
      window_from: input.window_from,
      window_to: input.window_to,
      addresses_swept: Array.isArray(input?.addresses_swept)
        ? input.addresses_swept.map((a) => String(a).slice(0, 120))
        : [],
      messages: rows,
    });
  }
  const after = sweepState(path, sweepId);
  return {
    accepted: rows.length - duplicates,
    duplicates,
    refused,
    running: runningTotals(after),
    ...(refused.length > 0
      ? {
          note: "Refused verdicts were NOT counted. Fix and resubmit them — a verdict quietly dropped here is exactly the pre-filter the coverage number exists to catch.",
        }
      : {}),
  };
}

/**
 * THE FINISH — the coverage record, derived rather than declared.
 * Everything record_coverage asks for comes off the ledger: nobody
 * restates a number they already reported once.
 */
export function sweepFinish(input, path = defaultTabPath()) {
  const sweepId = typeof input?.sweep_id === "string" ? input.sweep_id.trim().slice(0, 60) : "";
  const state = sweepState(path, sweepId);
  if (!state.exists) {
    return { finished: false, error: `No tally on record for sweep "${sweepId}" — nothing to finish.` };
  }
  if (state.closed) {
    return { finished: false, error: `Sweep "${sweepId}" is already finished; its coverage record stands. A new window is a new sweep_id.` };
  }
  const totals = runningTotals(state);
  const coverage = recordCoverage(
    {
      scanned: totals.scanned_so_far,
      matched: totals.matched,
      not_transactional: totals.not_transactional,
      attributed_amount: Math.round(state.attributed * 100) / 100,
      unmatched_transactional: state.unmatched,
      window_from: state.windowFrom,
      window_to: state.windowTo,
      addresses_swept: [...state.addresses].sort(),
    },
    path,
  );
  appendSweepRecord(path, {
    kind: "close",
    sweep_id: sweepId,
    at: new Date().toISOString(),
  });
  return {
    finished: true,
    sweep_id: sweepId,
    ...totals,
    coverage,
    what_this_cannot_see:
      "The tally counts what was reported to it. Mail read but never brought here shrinks the denominator from outside, and no ledger can count letters it was never told about — that honesty stays on the sweep, per SWEEP.md.",
  };
}
