import { isHouseWallet } from "@/lib/channel";
import { currentWeekKey, KV_KEYS } from "@/lib/kv-keys";
import type { MetricEvent } from "@/lib/metrics";
import { listPayers } from "@/lib/metrics";
import { listGuestbook } from "@/services/guestbook";
import { listLetters } from "@/services/letters";
import { listFailedItems } from "@/services/requests";
import { listTips } from "@/services/tips";
import { MENU_ITEMS } from "@/store";
import type { Env, PaperState, TownDraft, TownEdition } from "@/types";

/**
 * The Town Gazette of Smokewire Crossing, per GAZETTE_SPEC canon.
 * Register: logbook with manners. Every line maps to a logged fact;
 * nothing invented, ever. Numbers exact. Everyone anonymous, everyone
 * dignified. House traffic never reported — family doesn't make the
 * paper. Sections appear even when empty; emptiness is reported.
 *
 * The cron assembles a DRAFT when the period clears 3+ organic events
 * (settles + signatures + letters + tips); the keeper edits and
 * publishes from the back room — publishing is a queue, always.
 * Lines in [brackets] are keeper slots; publish strips any that
 * remain, so no placeholder ever ships.
 */

const PAPER_FOUNDED = "2026-07-22T00:00:00.000Z";
export const ORGANIC_EVENT_THRESHOLD = 3;

async function getPaperState(env: Env): Promise<PaperState> {
  const state = await env.COUNTERS.get<PaperState>(KV_KEYS.paperState, "json");
  return (
    state ?? {
      last_bell: 0,
      menu_ids: [],
      failed_tally: {},
      period_start: PAPER_FOUNDED,
    }
  );
}

interface PaperFacts {
  periodStart: string;
  bellRings: number;
  settledByItem: Record<string, number>;
  busiestDay?: string;
  newFaces: number;
  triedTheDoor: Record<string, number>;
  signatures: string[];
  lettersReceived: number;
  shelvesAdded: string[];
  shelvesRetired: string[];
  corrections: string[];
  organicEvents: number;
}

const PRINTABLE_ITEM = /^[a-z0-9_\-.]{1,40}$/;
const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

async function collectFacts(env: Env): Promise<PaperFacts> {
  const state = await getPaperState(env);
  const since = state.period_start;

  const bellNow = parseInt(
    (await env.COUNTERS.get(KV_KEYS.bellCount)) ?? "0",
    10,
  );

  // Organic settles from the 90-day event rows.
  const settledByItem: Record<string, number> = {};
  const dayTally: Record<string, number> = {};
  const listed = await env.COUNTERS.list({ prefix: "evt:" });
  for (const key of listed.keys) {
    const event = await env.COUNTERS.get<MetricEvent>(key.name, "json");
    if (!event || event.kind !== "settle" || event.house || event.at < since) {
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
      triedTheDoor[PRINTABLE_ITEM.test(item) ? item : "(unprintable)"] =
        (triedTheDoor[PRINTABLE_ITEM.test(item) ? item : "(unprintable)"] ?? 0) + delta;
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
    (await env.COUNTERS.get<string[]>(KV_KEYS.paperCorrections, "json")) ?? [];

  const settleCount = Object.values(settledByItem).reduce((a, b) => a + b, 0);
  const facts: PaperFacts = {
    periodStart: since,
    bellRings: Math.max(0, bellNow - state.last_bell),
    settledByItem,
    newFaces,
    triedTheDoor,
    signatures,
    lettersReceived,
    shelvesAdded,
    shelvesRetired,
    corrections,
    organicEvents: settleCount + signatures.length + lettersReceived + tipsReceived,
  };
  if (busiestDay) {
    facts.busiestDay = busiestDay;
  }
  return facts;
}

function list(record: Record<string, number>): string {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");
}

/** Every section, every week. Emptiness is reported, not skipped. */
export function renderPaper(facts: PaperFacts, editionNumber: number): string {
  const settles = Object.values(facts.settledByItem).reduce((a, b) => a + b, 0);
  const doorLines = Object.entries(facts.triedTheDoor)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([item, count]) =>
        `"${item}" was asked for ${count === 1 ? "once" : `${count} times`}. Store had none.`,
    );
  return `# The Town Gazette of Smokewire Crossing — Edition No. ${editionNumber}

*Covering the period since ${facts.periodStart.slice(0, 10)}. Published from the counter.*

## FRONT COUNTER

${facts.bellRings === 0 ? "The bell kept its silence." : `The bell rang ${facts.bellRings} time${facts.bellRings === 1 ? "" : "s"}.`}
${facts.busiestDay ? `Most of the period's business came on a ${facts.busiestDay}.` : "The period kept no particular rhythm."}
[Weather line — keeper's, one at most. Delete if none.]

## THIS WEEK'S LEDGER

${settles === 0 ? "No purchases settled. The shelves kept their arrangement." : `${settles} purchase${settles === 1 ? "" : "s"} settled: ${list(facts.settledByItem)}.`}

## NEW FACES

${facts.newFaces === 0 ? "No new faces. The regulars were regular." : `${facts.newFaces} new patron wallet${facts.newFaces === 1 ? "" : "s"} arrived.`}

## TRIED THE DOOR

${doorLines.length === 0 ? "Nobody tried the door for what wasn't there." : doorLines.join("\n")}

## GUESTBOOK

${facts.signatures.length === 0 ? "Guestbook remained quiet." : `${facts.signatures.length} new signature${facts.signatures.length === 1 ? "" : "s"}: ${facts.signatures.join(", ")}.`}
[Mina's curation note — optional. Delete if none.]

## COUNTER NOTES

No confession reached the counter.
${facts.lettersReceived === 0 ? "The mailbox flag stayed down." : `${facts.lettersReceived} letter${facts.lettersReceived === 1 ? "" : "s"} arrived. Contents remain letters.`}

## SHELF CHANGES

${
  facts.shelvesAdded.length === 0 && facts.shelvesRetired.length === 0
    ? "The shelves stand as they stood."
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
[Inez's line, in Portuguese, untranslated — optional. Delete if none.]

## CORRECTIONS

${facts.corrections.length === 0 ? "The record stands uncorrected." : facts.corrections.join("\n")}
`;
}

/** Assemble a draft if the period earned one; the keeper decides the rest. */
export async function assembleDraft(
  env: Env,
  ignoreThreshold = false,
): Promise<TownDraft | null> {
  const facts = await collectFacts(env);
  if (!ignoreThreshold && facts.organicEvents < ORGANIC_EVENT_THRESHOLD) {
    return null;
  }
  const countRaw = await env.COUNTERS.get(KV_KEYS.paperEditionCount);
  const nextEdition = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  const draft: TownDraft = {
    week: currentWeekKey(),
    period_start: facts.periodStart,
    created_at: new Date().toISOString(),
    markdown: renderPaper(facts, nextEdition),
    organic_events: facts.organicEvents,
  };
  await env.ORDERS.put(KV_KEYS.paperDraft, JSON.stringify(draft));
  return draft;
}

export async function getDraft(env: Env): Promise<TownDraft | null> {
  return env.ORDERS.get<TownDraft>(KV_KEYS.paperDraft, "json");
}

/** No placeholder ever ships: bracketed keeper slots are stripped here. */
function stripKeeperSlots(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !/^\[.*\]$/.test(line.trim()))
    .join("\n");
}

/** The keeper's pen is final: publish takes the edited markdown as-is (minus slots). */
export async function publishEdition(
  env: Env,
  markdown: string,
): Promise<TownEdition> {
  const draft = await getDraft(env);
  const countRaw = await env.COUNTERS.get(KV_KEYS.paperEditionCount);
  const editionNumber = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  const edition: TownEdition = {
    edition_number: editionNumber,
    week: currentWeekKey(),
    date: new Date().toISOString(),
    period_start: draft?.period_start ?? PAPER_FOUNDED,
    markdown: stripKeeperSlots(markdown),
  };
  await env.ORDERS.put(
    KV_KEYS.paperEdition(editionNumber),
    JSON.stringify(edition),
  );
  await env.COUNTERS.put(KV_KEYS.paperEditionCount, String(editionNumber));

  // Snapshot so the next edition reports deltas from this close.
  const bellNow = parseInt(
    (await env.COUNTERS.get(KV_KEYS.bellCount)) ?? "0",
    10,
  );
  const state: PaperState = {
    last_bell: bellNow,
    menu_ids: MENU_ITEMS.map((item) => item.id),
    failed_tally: await listFailedItems(env),
    period_start: edition.date,
  };
  await env.COUNTERS.put(KV_KEYS.paperState, JSON.stringify(state));
  await env.COUNTERS.delete(KV_KEYS.paperCorrections);
  await env.ORDERS.delete(KV_KEYS.paperDraft);
  return edition;
}

export async function addCorrection(env: Env, correction: string): Promise<void> {
  const corrections =
    (await env.COUNTERS.get<string[]>(KV_KEYS.paperCorrections, "json")) ?? [];
  corrections.push(correction);
  await env.COUNTERS.put(KV_KEYS.paperCorrections, JSON.stringify(corrections));
}

export async function getEdition(
  env: Env,
  editionNumber: number,
): Promise<TownEdition | null> {
  if (!Number.isInteger(editionNumber) || editionNumber < 1) {
    return null;
  }
  return env.ORDERS.get<TownEdition>(
    KV_KEYS.paperEdition(editionNumber),
    "json",
  );
}

export async function listEditions(env: Env): Promise<TownEdition[]> {
  const listed = await env.ORDERS.list({ prefix: KV_KEYS.paperPrefix });
  const editions: TownEdition[] = [];
  for (const key of listed.keys) {
    const edition = await env.ORDERS.get<TownEdition>(key.name, "json");
    if (edition) {
      editions.push(edition);
    }
  }
  editions.sort((a, b) => b.edition_number - a.edition_number);
  return editions;
}
