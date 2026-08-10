import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  defaultTabPath,
  derive,
  monthlyOf,
  readEvents,
  sidecarPath,
} from "./store.mjs";

/**
 * CARD RECONCILIATION — the keeper's ruling (2026-08-10): a monthly
 * CSV export from the bank, by hand, is fine for now. The sweep
 * measures ITSELF (its own counting obligation, its own residue); a
 * card statement is GROUND TRUTH — money that actually left, decided
 * by a party with no stake in the tab looking complete. This is the
 * number `variability_pct` has been waiting to be checked against.
 *
 * The tab holds no bank code and never will, same law as the mail
 * sweep: a product that asks for banking credentials is a different
 * product with a different threat model. The builder exports the CSV,
 * the agent parses rows, and THIS tool gets structured charges —
 * dates, amounts, descriptors — through the same validated door as
 * every other write.
 *
 * IT RECONCILES, IT DOES NOT REPAIR. No tab entry is written from a
 * statement row: an unmatched charge is a question for the builder
 * (log it, or recognize it as not-a-tool), and a tool that stopped
 * charging is a question too (canceled, or a failed card — which is a
 * service about to die). The report converts uncertainty into cheap
 * questions; it never converts a guess into an entry.
 */

/** One record per reconciliation, appended, never overwritten. */
export function cardSidecar(path) {
  return sidecarPath(path, ".card.jsonl");
}

export function readCardHistory(path) {
  try {
    return readFileSync(cardSidecar(path), "utf8")
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

const CHARGE_CAP = 500;
const DESCRIPTOR_CAP = 200;

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** "OPENAI *API SVCS" and "openai-api" meet in the middle: alnum only. */
function normalized(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The tool a descriptor names, if any. Longest name wins so that
 * "openai-api" beats "openai" on a descriptor carrying both — the
 * more specific claim is the safer one. Substring only, deliberately:
 * fuzzy matching a bank descriptor is how someone else's charge gets
 * booked to your tool, and an unmatched row costs one question.
 */
export function toolForDescriptor(descriptor, toolNames) {
  const haystack = normalized(descriptor);
  if (haystack === "") return null;
  let best = null;
  for (const name of toolNames) {
    const needle = normalized(name);
    if (needle.length >= 3 && haystack.includes(needle)) {
      if (!best || needle.length > normalized(best).length) {
        best = name;
      }
    }
  }
  return best;
}

function validateStatement(input) {
  const problems = [];
  if (!isIsoDate(input?.statement_from) || !isIsoDate(input?.statement_to)) {
    problems.push(
      "statement_from and statement_to are required ISO dates — the statement's own window, off the export, not remembered.",
    );
  }
  const charges = input?.charges;
  if (!Array.isArray(charges) || charges.length === 0) {
    problems.push(
      "charges is required: [{date, amount, descriptor}] parsed from the bank's CSV. Every debit row in the window, unfiltered — a pre-filtered statement is the mail sweep's counting mistake with money on it.",
    );
    return problems;
  }
  if (charges.length > CHARGE_CAP) {
    problems.push(
      `charges holds ${charges.length} rows against a cap of ${CHARGE_CAP}. Split the statement; an unbounded row list is how a report becomes a bill.`,
    );
  }
  charges.slice(0, CHARGE_CAP).forEach((charge, index) => {
    if (!isIsoDate(charge?.date)) {
      problems.push(`charges[${index}].date must be an ISO date.`);
    }
    if (
      typeof charge?.amount !== "number" ||
      !Number.isFinite(charge.amount) ||
      charge.amount <= 0
    ) {
      problems.push(
        `charges[${index}].amount must be a positive number — the statement's debit amount. Credits and refunds stay off; this flow reconciles spend.`,
      );
    }
    if (typeof charge?.descriptor !== "string" || charge.descriptor.trim() === "") {
      problems.push(`charges[${index}].descriptor is required: the merchant string as the bank printed it.`);
    } else if (charge.descriptor.length > DESCRIPTOR_CAP) {
      problems.push(`charges[${index}].descriptor runs past ${DESCRIPTOR_CAP} characters.`);
    }
  });
  return problems;
}

const round = (value) => Math.round(value * 100) / 100;

export function reconcileCardStatement(input, path = defaultTabPath()) {
  const problems = validateStatement(input);
  if (problems.length > 0) {
    return { recorded: false, problems };
  }
  const { events } = readEvents(path);
  const state = derive(events);
  const toolNames = [...state.tools.keys()];

  const observedByTool = new Map();
  const unmatched = [];
  let statementTotal = 0;
  for (const charge of input.charges) {
    statementTotal += charge.amount;
    const name = toolForDescriptor(charge.descriptor, toolNames);
    if (!name) {
      unmatched.push({
        date: charge.date,
        amount: round(charge.amount),
        descriptor: charge.descriptor,
      });
      continue;
    }
    const row = observedByTool.get(name) ?? { observed: 0, charges: 0 };
    row.observed += charge.amount;
    row.charges += 1;
    observedByTool.set(name, row);
  }

  const matched = [];
  const meteredActuals = [];
  const inactiveCharged = [];
  for (const [name, row] of observedByTool) {
    const tool = state.tools.get(name);
    const entry = {
      tool_name: name,
      observed: round(row.observed),
      charges: row.charges,
    };
    if (tool.status === "inactive") {
      /**
       * A charge on a tool the tab holds as ENDED is the sharpest
       * finding a statement can produce: either the cancellation
       * never took, or the tab recorded one that never happened.
       * Both are the builder's to settle; neither is ours to guess.
       */
      inactiveCharged.push({
        ...entry,
        last_event: tool.last_event,
        last_event_at: tool.last_event_at,
      });
      continue;
    }
    const expected = round(monthlyOf(tool.price));
    if (tool.price?.basis === "metered") {
      // The statement is the ACTUAL the estimate has been waiting
      // for. Reported, never written back: the builder updates the
      // estimate if the gap tells them to.
      meteredActuals.push({
        ...entry,
        estimated_monthly: expected,
        delta: round(row.observed - expected),
      });
      continue;
    }
    matched.push({
      ...entry,
      expected_monthly: expected,
      ...(Math.abs(row.observed - expected) > 0.01
        ? {
            delta: round(row.observed - expected),
            delta_note:
              "Observed differs from the tab's price. A price change nobody logged, an annual charge landing in a monthly window, or a plan change — the statement knows THAT it differs, only the builder knows why.",
          }
        : {}),
    });
  }

  /**
   * THE OTHER DIRECTION, which no mail sweep can walk: a fixed
   * monthly tool whose charge never appears in a full-month window.
   * Canceled-but-not-logged, or a failing card — a service about to
   * die quietly. Only asserted when the window could actually have
   * contained the charge; metered tools have no fixed expectation and
   * are excluded by name.
   */
  const windowDays =
    (Date.parse(input.statement_to) - Date.parse(input.statement_from)) /
    (24 * 3600_000);
  const expectedNotSeen =
    windowDays >= 28
      ? state.active_paid
          .filter(
            (tool) =>
              tool.price?.period === "month" &&
              tool.price?.basis !== "metered" &&
              !observedByTool.has(tool.tool_name),
          )
          .map((tool) => ({
            tool_name: tool.tool_name,
            expected_monthly: round(monthlyOf(tool.price)),
            last_billing_at: tool.last_billing_at,
          }))
      : [];

  const unmatchedTotal = unmatched.reduce((sum, row) => sum + row.amount, 0);
  const variabilityPct =
    statementTotal > 0
      ? Math.round((unmatchedTotal / statementTotal) * 1000) / 10
      : null;

  const record = {
    at: new Date().toISOString(),
    window_from: input.statement_from,
    window_to: input.statement_to,
    charges: input.charges.length,
    statement_total: round(statementTotal),
    matched_tools: matched.length + meteredActuals.length,
    unmatched_count: unmatched.length,
    unmatched_total: round(unmatchedTotal),
    card_variability_pct: variabilityPct,
  };
  mkdirSync(dirname(cardSidecar(path)), { recursive: true });
  appendFileSync(cardSidecar(path), `${JSON.stringify(record)}\n`, "utf8");

  return {
    recorded: true,
    window: { from: input.statement_from, to: input.statement_to, days: Math.round(windowDays) },
    statement: { charges: input.charges.length, total: round(statementTotal) },
    matched,
    metered_actuals: meteredActuals,
    inactive_tool_charged: inactiveCharged,
    unmatched,
    expected_not_seen: expectedNotSeen,
    ...(windowDays < 28
      ? {
          expected_not_seen_note:
            "Window under 28 days, so absence proves nothing and the missing-charge list is empty by rule rather than by health.",
        }
      : {}),
    card_variability_pct: variabilityPct,
    variability_note:
      "Unmatched statement money over all statement money — the sweep's variability_pct asked of ground truth instead of mail. The two disagreeing is information: the sweep measures what was SAID, the statement what was TAKEN.",
    ground_truth_note:
      "Nothing was written to the tab. An unmatched charge is a question, not an entry: log it through capture_tool_event if it is a tool, recognize it if it is not. A tool charging after its cancel, or expected and unseen, is the builder's to settle with the vendor or the record.",
  };
}
