import { isHouseWallet } from "@/lib/channel";
import { currentWeekKey, KV_KEYS } from "@/lib/kv-keys";
import type { MetricEvent } from "@/lib/metrics";
import { listPayers } from "@/lib/metrics";
import {
  nextApprovedConfession,
  setConfessionStatus,
} from "@/services/confessions";
import { catIsOut, treatsThisWeek } from "@/services/porch";
import { listGuestbook } from "@/services/guestbook";
import { listLetters } from "@/services/letters";
import { listFailedItems } from "@/services/requests";
import { listTips } from "@/services/tips";
import { seasonWeekFor } from "@/services/zodiac";
import { MENU_ITEMS } from "@/store";
import type { Env, GazetteDraft, GazetteState, TownEdition } from "@/types";

/**
 * The Gazette's weekly edition press, per GAZETTE_SPEC canon.
 * Register: logbook with manners — observation, response, ordinary
 * resolution. Every line maps to a logged fact; nothing invented,
 * ever. Numbers exact. Everyone anonymous, everyone dignified. House
 * traffic never reported — family doesn't make the paper. Sections
 * appear every edition; emptiness is reported, not skipped.
 *
 * Per THE_NINETY: auto-assembly is GATED behind the first week with
 * 3+ organic events; until then (and after), the keeper can hand-set
 * an edition from the back room. The cron provides data; the draft
 * lands in the keeper queue; publishing is a keeper gate, always.
 * Residents follow CHARACTER_CANON: a resident line appears only when
 * their surface has something real to say, once per issue max; here
 * they are bracketed keeper slots (their canon lives in the back
 * office) and publish strips any bracket that remains. Roger's
 * presence line is mechanical, from his own schedule — never quoted,
 * no inner life, by absence as often as presence.
 */

const PAPER_FOUNDED = "2026-07-22T00:00:00.000Z";
export const ORGANIC_EVENT_THRESHOLD = 3;

async function getState(env: Env): Promise<GazetteState> {
  const state = await env.COUNTERS.get<GazetteState>(
    KV_KEYS.gazetteWeeklyState,
    "json",
  );
  return (
    state ?? {
      last_bell: 0,
      menu_ids: [],
      failed_tally: {},
      period_start: PAPER_FOUNDED,
    }
  );
}

interface EditionFacts {
  periodStart: string;
  bellRings: number;
  /** Organic front-porch visits in the period (aggregate only). */
  porchCrossings: number;
  settledByItem: Record<string, number>;
  busiestDay?: string;
  newFaces: number;
  triedTheDoor: Record<string, number>;
  signatures: string[];
  lettersReceived: number;
  shelvesAdded: string[];
  shelvesRetired: string[];
  corrections: string[];
  /** "out" | "elsewhere" | undefined (absence as often as presence). */
  rogerLine?: string;
  /** Treats left on the porch rail this week. Aggregate only. */
  treatsLeft: number;
  /** Keeper-approved confession slated for COUNTER NOTES, if any. */
  confessionLine?: string;
  confessionId?: string;
  organicEvents: number;
}

const PRINTABLE_ITEM = /^[a-z0-9_\-.]{1,40}$/;
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Roger, mechanically: sampled from his own deterministic schedule. */
function rogerPresence(periodStart: string): string | undefined {
  const start = Date.parse(periodStart);
  const end = Date.now();
  let out = 0;
  let hours = 0;
  for (let t = start; t < end; t += 3600_000) {
    hours += 1;
    if (catIsOut(new Date(t))) {
      out += 1;
    }
  }
  if (hours < 24) {
    return undefined;
  }
  const fraction = out / hours;
  if (fraction >= 0.45) {
    return "The cat was seen most days.";
  }
  if (fraction <= 0.3) {
    return "The cat was not much seen.";
  }
  return undefined;
}

async function collectFacts(env: Env): Promise<EditionFacts> {
  const state = await getState(env);
  const since = state.period_start;

  const bellNow = parseInt(
    (await env.COUNTERS.get(KV_KEYS.bellCount)) ?? "0",
    10,
  );

  // Organic settles + porch crossings from the 90-day event rows.
  const settledByItem: Record<string, number> = {};
  const dayTally: Record<string, number> = {};
  let porchCrossings = 0;
  const listed = await env.COUNTERS.list({ prefix: "evt:", limit: 1000 });
  for (const key of listed.keys) {
    const event = await env.COUNTERS.get<MetricEvent>(key.name, "json");
    if (!event || event.house || event.at < since) {
      continue;
    }
    if (event.kind === "porch" && event.channel !== "infrastructure") {
      porchCrossings += 1;
      continue;
    }
    if (event.kind !== "settle") {
      continue;
    }
    settledByItem[event.item] = (settledByItem[event.item] ?? 0) + 1;
    const day = DAY_NAMES[new Date(event.at).getUTCDay()] ?? "Sunday";
    dayTally[day] = (dayTally[day] ?? 0) + 1;
  }
  const busiestDay = Object.entries(dayTally).sort((a, b) => b[1] - a[1])[0]?.[0];

  const payers = await listPayers(env, 200);
  const newFaces = payers.filter(
    (payer) => payer.first_seen >= since && !isHouseWallet(env, payer.address),
  ).length;

  const failedNow = await listFailedItems(env);
  const triedTheDoor: Record<string, number> = {};
  for (const [item, count] of Object.entries(failedNow)) {
    const delta = count - (state.failed_tally[item] ?? 0);
    if (delta > 0) {
      const name = PRINTABLE_ITEM.test(item) ? item : "(unprintable)";
      triedTheDoor[name] = (triedTheDoor[name] ?? 0) + delta;
    }
  }

  const guestbook = await listGuestbook(env, 200);
  const signatures = guestbook
    .filter((entry) => entry.date >= since)
    .map((entry) => entry.name);

  const letters = await listLetters(env);
  const lettersReceived = letters.filter(
    (letter) => letter.record.date >= since,
  ).length;

  const tips = await listTips(env);
  const tipsReceived = tips.filter((tip) => tip.record.date >= since).length;

  const currentIds = MENU_ITEMS.map((item) => item.id);
  const previousIds = state.menu_ids;
  const shelvesAdded =
    previousIds.length === 0
      ? []
      : currentIds.filter((id) => !previousIds.includes(id));
  const shelvesRetired = previousIds.filter((id) => !currentIds.includes(id));

  const corrections =
    (await env.COUNTERS.get<string[]>(KV_KEYS.gazetteCorrections, "json")) ??
    [];

  const settleCount = Object.values(settledByItem).reduce((a, b) => a + b, 0);
  const facts: EditionFacts = {
    periodStart: since,
    bellRings: Math.max(0, bellNow - state.last_bell),
    porchCrossings,
    settledByItem,
    newFaces,
    triedTheDoor,
    signatures,
    lettersReceived,
    shelvesAdded,
    shelvesRetired,
    corrections,
    treatsLeft: await treatsThisWeek(env),
    organicEvents:
      settleCount + signatures.length + lettersReceived + tipsReceived,
  };
  if (busiestDay) {
    facts.busiestDay = busiestDay;
  }
  const roger = rogerPresence(since);
  if (roger) {
    facts.rogerLine = roger;
  }
  // One keeper-approved confession per edition at most; printed at publish.
  const confession = await nextApprovedConfession(env);
  if (confession) {
    facts.confessionLine = `One confession, approved for print: "${confession.confession}" ${confession.sign_as ? `— ${confession.sign_as}` : "— unsigned"}`;
    facts.confessionId = confession.id;
  }
  return facts;
}

function list(record: Record<string, number>): string {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");
}

/** LOOKING AHEAD is mechanical too: the calendar is a logged fact. */
function lookingAhead(): string[] {
  const nextSeasonWeek = Math.min(seasonWeekFor() + 1, 13);
  return [
    `The Systems Almanac turns to Season One, week ${nextSeasonWeek}, on Monday.`,
    "Weekly shelves restock Monday.",
    "The keeper reads requests and letters on Sunday.",
  ];
}

/** Every section, every edition. Emptiness is reported, not skipped. */
export function renderEdition(facts: EditionFacts, editionNumber: number): string {
  const settles = Object.values(facts.settledByItem).reduce((a, b) => a + b, 0);
  const doorLines = Object.entries(facts.triedTheDoor)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([item, count]) =>
        `"${item}" was asked for ${count === 1 ? "once" : `${count} times`}. Store had none.`,
    );
  return `# The Gazette — Edition No. ${editionNumber}

*The town's paper of record, covering the period since ${facts.periodStart.slice(0, 10)}. Set from the store's own books.*

## FRONT COUNTER

${facts.porchCrossings === 0 ? "The front step went uncrossed." : `The front step was crossed ${facts.porchCrossings} time${facts.porchCrossings === 1 ? "" : "s"}.`}
${facts.bellRings === 0 ? "Bell did not ring." : `Bell rang ${facts.bellRings} time${facts.bellRings === 1 ? "" : "s"}.`}
${facts.busiestDay ? `Most of the period's business came on a ${facts.busiestDay}.` : "The period kept no particular rhythm."}
${facts.treatsLeft > 0 ? `${facts.treatsLeft} treat${facts.treatsLeft === 1 ? " was" : "s were"} left on the porch rail. All were gone by morning.` : ""}
${facts.rogerLine ?? ""}
[Weather line — keeper's, one at most. Delete if none.]

## THIS WEEK'S LEDGER

${settles === 0 ? "No purchases settled. Shelves kept their arrangement." : `${settles} purchase${settles === 1 ? "" : "s"} settled: ${list(facts.settledByItem)}.`}

## NEW FACES

${facts.newFaces === 0 ? "No new faces. The regulars were regular." : `${facts.newFaces} new patron wallet${facts.newFaces === 1 ? "" : "s"} arrived.`}

## TRIED THE DOOR

${doorLines.length === 0 ? "Nobody tried the door for what wasn't there." : doorLines.join("\n")}

## GUESTBOOK

${facts.signatures.length === 0 ? "Guestbook remained quiet." : `${facts.signatures.length} new signature${facts.signatures.length === 1 ? "" : "s"}: ${facts.signatures.join(", ")}.`}
${facts.signatures.length > 0 ? "[Mina's curation note — only if she has something real to say. Delete if none.]" : ""}

## COUNTER NOTES

${facts.confessionLine ?? "No confession reached the counter."}
${facts.lettersReceived === 0 ? "The mailbox flag stayed down." : `${facts.lettersReceived} letter${facts.lettersReceived === 1 ? "" : "s"} arrived. Contents remain letters.`}

## SHELF CHANGES

${
  facts.shelvesAdded.length === 0 && facts.shelvesRetired.length === 0
    ? "Shelves stand as they stood."
    : [
        facts.shelvesAdded.length > 0
          ? `Added: ${facts.shelvesAdded.join(", ")}.`
          : "",
        facts.shelvesRetired.length > 0
          ? `Retired: ${facts.shelvesRetired.join(", ")}.`
          : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n")
}
[Owen Pike's changelog line — only if the docs changed. Delete if none.]
[Inez's repair line, in Portuguese, untranslated — only if something was repaired. Delete if none.]

## CORRECTIONS

${facts.corrections.length === 0 ? "The record stands uncorrected." : facts.corrections.join("\n")}

## LOOKING AHEAD

${lookingAhead().join("\n")}
[Keeper's note — one line, optional. Delete if none.]
`;
}

/**
 * Assemble a draft into the keeper queue. Auto-assembly (the cron)
 * honors THE_NINETY gate; the keeper's hand-set lever does not.
 */
export async function assembleDraft(
  env: Env,
  handSet = false,
): Promise<GazetteDraft | null> {
  const facts = await collectFacts(env);
  if (!handSet && facts.organicEvents < ORGANIC_EVENT_THRESHOLD) {
    return null;
  }
  const countRaw = await env.COUNTERS.get(KV_KEYS.gazetteIssueCount);
  const nextEdition = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  const draft: GazetteDraft = {
    week: currentWeekKey(),
    period_start: facts.periodStart,
    created_at: new Date().toISOString(),
    markdown: renderEdition(facts, nextEdition),
    organic_events: facts.organicEvents,
  };
  if (facts.confessionId) {
    draft.confession_id = facts.confessionId;
  }
  await env.ORDERS.put(KV_KEYS.gazetteDraft, JSON.stringify(draft));
  return draft;
}

export async function getDraft(env: Env): Promise<GazetteDraft | null> {
  return env.ORDERS.get<GazetteDraft>(KV_KEYS.gazetteDraft, "json");
}

/** No placeholder ever ships: bracketed keeper slots are stripped here. */
function stripKeeperSlots(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !/^\[.*\]$/.test(line.trim()))
    .join("\n");
}

/**
 * The keeper's pen is final. Publishes onto the same Gazette rack as
 * the tip dispatches — one paper, one issue numbering, one penny.
 */
export async function publishEdition(
  env: Env,
  markdown: string,
): Promise<TownEdition> {
  const draft = await getDraft(env);
  const countRaw = await env.COUNTERS.get(KV_KEYS.gazetteIssueCount);
  const issueNumber = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  const edition: TownEdition = {
    issue_number: issueNumber,
    title: `The Gazette — Edition No. ${issueNumber}`,
    date: new Date().toISOString(),
    week: currentWeekKey(),
    period_start: draft?.period_start ?? PAPER_FOUNDED,
    markdown: stripKeeperSlots(markdown),
    contributors: [],
    tip_ids: [],
  };
  await env.ORDERS.put(
    KV_KEYS.gazetteIssue(issueNumber),
    JSON.stringify(edition),
  );
  await env.COUNTERS.put(KV_KEYS.gazetteIssueCount, String(issueNumber));

  // Snapshot so the next edition reports deltas from this close.
  const bellNow = parseInt(
    (await env.COUNTERS.get(KV_KEYS.bellCount)) ?? "0",
    10,
  );
  const state: GazetteState = {
    last_bell: bellNow,
    menu_ids: MENU_ITEMS.map((item) => item.id),
    failed_tally: await listFailedItems(env),
    period_start: edition.date,
  };
  await env.COUNTERS.put(KV_KEYS.gazetteWeeklyState, JSON.stringify(state));
  await env.COUNTERS.delete(KV_KEYS.gazetteCorrections);
  if (draft?.confession_id) {
    // Printed at publish, not at draft — a discarded draft prints nothing.
    await setConfessionStatus(env, draft.confession_id, "printed");
  }
  await env.ORDERS.delete(KV_KEYS.gazetteDraft);
  return edition;
}

export async function addCorrection(env: Env, correction: string): Promise<void> {
  const corrections =
    (await env.COUNTERS.get<string[]>(KV_KEYS.gazetteCorrections, "json")) ??
    [];
  corrections.push(correction);
  await env.COUNTERS.put(
    KV_KEYS.gazetteCorrections,
    JSON.stringify(corrections),
  );
}
