import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { bulkGetJson } from "@/lib/kv-bulk";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { isHouseWallet } from "@/lib/channel";
import { BASE_USDC, rpcEndpoints } from "@/lib/base-rpc";
import { payToDigest } from "@/lib/pay-to-digest";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { bountyLock, BOUNTY_LOCK_SECONDS } from "@/services/bounty-claim-locks";
import {
  oracleScreen,
  raiseScreenUnavailable,
  fieldSignerFromKey,
  type SanctionsScreen,
  type FieldSigner,
} from "@/services/launch-check";
import {
  STUDY_SCENARIOS,
  scenarioById,
  type ScenarioTarget,
  type StudyScenario,
} from "@/store/study-scenarios";
import type { Env } from "@/types";

/**
 * THE FIELD STUDY (FIELD_STUDY.md) — the bounty board turned around.
 *
 * The board pays strangers to walk SOMEBODY ELSE'S door and hand back
 * what they saw. This pays strangers to walk OURS, and the difference
 * is not the direction of the money: it is what the store can prove.
 *
 * At a bounty the store has no transcript and says so — the settlement
 * is on a chain we can read, everything else is the walker's claim,
 * tiered below anything the house walked. Here, every purchase the
 * researcher cites is a row IN OUR OWN BOOKS. We do not have to trust
 * a word of their report to know which surface they came through,
 * which protocol paid, which rail settled, what they bought, when, and
 * whether it settled at all. That is a stronger evidence tier than the
 * board has ever been able to offer, and it is the whole reason this
 * instrument is worth paying for.
 *
 * WHAT WE ARE ACTUALLY BUYING, and it is not bugs. Bugs are welcome
 * and there is a field for them, but a defect report is a by-product.
 * What this store cannot get any other way is the JOURNEY: which door
 * an agent tried first, what it read before it opened a wallet, where
 * it gave up, what it would have used instead, and which model on
 * which harness was making those calls. None of that is in a server
 * log. Our logs record what succeeded; the expensive question is what
 * nearly did not, and only the agent that nearly gave up knows.
 *
 * SO IT IS DECLARED FIRST, THEN OBSERVED. Enrolment happens BEFORE a
 * cent is spent: the researcher says who they are, what model, what
 * harness, what they were told to do and why they are here. Then they
 * shop. Then they debrief. The store holds their stated intent beside
 * its own record of what actually happened, and the gap between the
 * two is the finding. A retrospective survey cannot produce that gap
 * — it only produces the story the agent tells afterwards.
 *
 * WHAT THE REWARD PAYS FOR, precisely, and the line this inherits
 * from the board: VERIFIED FACTS ONLY. Legs we found in our own
 * books, distinct surfaces we observed, distinct rails we observed.
 * The questionnaire is checked for COMPLETENESS — every required
 * answer present, non-empty, within its cap — and never for quality,
 * because a store that paid more for answers it liked would be buying
 * the answers it wanted and calling the result research. A thin
 * honest answer and a thick flattering one are worth exactly the same
 * here, and that is not generosity, it is the only way the corpus
 * stays worth reading.
 *
 * THE BUDGET IS ITS OWN. The board's $10 a week is untouched: this
 * counts against a separate weekly cap under its own KV key, so a
 * busy week of studies can never quietly eat the money set aside for
 * door walks, and neither instrument can hide the other's spend on
 * the keeper's desk.
 */

/** Weekly payout budget for studies. Separate from the board's. ⚑ keeper dial. */
export const STUDY_WEEKLY_BUDGET_USD = 25;
/**
 * The most one study can earn, however complete. The dial itself lives
 * in store/field-study-copy.ts, where the money sentence that quotes it
 * can interpolate it rather than type it — an outbound promise with a
 * hand-typed figure in it is exactly what the claims register exists to
 * catch. Re-exported here so the rest of the instrument reads its dials
 * from one place. ⚑ keeper dial (in that file).
 */
export { STUDY_MAX_REWARD_USD } from "@/store/field-study-copy";
import { STUDY_MAX_REWARD_USD } from "@/store/field-study-copy";
/** Paid for a complete, verified debrief with at least one good leg. */
export const STUDY_BASE_REWARD_USD = 0.5;
/** Per verified leg, up to the count below. */
export const STUDY_LEG_REWARD_USD = 0.2;
/** Legs beyond this still ride the record; they stop adding money. */
export const STUDY_LEGS_COUNTED = 5;
/** Per distinct OBSERVED surface beyond the first. */
export const STUDY_SURFACE_BONUS_USD = 0.15;
/** Per distinct OBSERVED rail beyond the first. */
export const STUDY_RAIL_BONUS_USD = 0.1;
/** Payout authorizations expire on their own: seven days. */
export const STUDY_AUTH_VALID_SECONDS = 7 * 24 * 3600;
/**
 * HOW LONG AN ENROLMENT STANDS. Long enough for an agent to shop at
 * its own pace across several surfaces, short enough that the roster
 * is a live list and not an archive. A lapsed enrolment costs nothing
 * and can be re-taken; nothing is lost but the study id.
 */
export const STUDY_WINDOW_HOURS = 72;
/** Legs one debrief may cite. Past this the debrief is refused, not truncated. */
export const STUDY_LEG_CAP = 12;
/** Free-text caps. A debrief is a report, not a filesystem. */
export const STUDY_ANSWER_CAP = 800;
export const STUDY_NOTE_CAP = 600;
export const STUDY_DEFECT_CAP = 10;
export const STUDY_DEFECT_LENGTH = 400;
/**
 * HOW LONG A SCENARIO STANDS once the keeper puts it live. Long enough
 * that opening one is not a chore to repeat, short enough that a shelf
 * nobody is walking empties itself rather than advertising studies the
 * store stopped caring about. Re-opening is one button. ⚑ keeper dial.
 */
export const STUDY_SCENARIO_DAYS = 28;
/**
 * THE SURFACES A RESEARCHER MAY DECLARE, and why the list is closed.
 *
 * An open string here would give us a column nobody can count — six
 * spellings of "the MCP one" and no way to total them. The closed list
 * is also the study's actual curriculum: these are the ways into this
 * store, and a study that touches several of them is worth more than
 * one that buys the same thing five times, because the question is
 * which way is WORST, and that needs at least two.
 *
 * DECLARED, NEVER TRUSTED. Our books record the door (http, mcp, ucp)
 * and the protocol (x402, mpp) for every settled purchase. Four of the
 * surfaces below land on `door: "http"` and are indistinguishable
 * there — a WebMCP call and a hand-rolled curl are the same request by
 * the time we see it. So the declaration is kept as THEIRS and the
 * books are kept as OURS, side by side, and the reward's coverage
 * bonuses are computed from ours alone.
 */
/**
 * PROMOTED, NOT COPIED (2026-09-21). This list was the only correct
 * six-way vocabulary in the tree and exactly one instrument used it.
 * It now lives in lib/surfaces.ts beside the rail axis it was always
 * half of, and the study reads it from there — so the office can count
 * the same six things the study asks about, and the study's column
 * cannot drift from whatever the office decides a surface is.
 *
 * The names are re-exported under their old spellings: every reference
 * below, and every stored study row, keeps meaning what it meant.
 */
import {
  BUYER_SURFACES,
  BUYER_SURFACE_NOTES,
  type BuyerSurface,
} from "@/lib/surfaces";

export const STUDY_SURFACES = BUYER_SURFACES;
export const STUDY_SURFACE_NOTES = BUYER_SURFACE_NOTES;
export type StudySurface = BuyerSurface;

/**
 * WHERE THE AGENT IS RUNNING, as a closed list for the same reason.
 * The keeper's question was literally "if they're on clawhub or hermes
 * or something else" — this is that column, and `other` carries a free
 * field so the list can be wrong without the answer being lost.
 */
export const STUDY_HARNESSES = [
  "clawhub",
  "hermes",
  "openai",
  "claude_code",
  "cursor",
  "langchain",
  "crewai",
  "autogen",
  "custom",
  "other",
] as const;
export type StudyHarness = (typeof STUDY_HARNESSES)[number];

export const STUDY_AUTONOMY = ["unsupervised", "human_in_loop", "supervised"] as const;
export type StudyAutonomy = (typeof STUDY_AUTONOMY)[number];

export const STUDY_FUNDING = ["own_wallet", "operator_wallet", "test_funds"] as const;
export type StudyFunding = (typeof STUDY_FUNDING)[number];

/**
 * THE ROSTER — asked at enrolment, BEFORE any money moves.
 *
 * Every field here is required, and that is a deliberate departure
 * from the bounty board, where the report is optional because the
 * reward is already decided by the chain. Here the answers ARE the
 * goods. A study that will not say what model it is has nothing to
 * sell us; refusing it at the door costs the agent nothing (enrolment
 * is free and re-takeable) and costs us nothing either, where a paid
 * blank would cost us the price and the corpus row both.
 *
 * `why` rides on each field and is published on the enrolment door, so
 * an agent deciding whether to answer can see what the answer buys
 * rather than being asked to trust us with it.
 */
export const STUDY_ROSTER_FIELDS: ReadonlyArray<{
  field: keyof StudyRoster;
  what: string;
  why: string;
  choices?: readonly string[];
}> = [
  {
    field: "model",
    what: "the model making these calls, as precisely as you can name it",
    why: "every usability finding in this store's files is currently 'an agent struggled here' with no way to tell whether that is one model's blind spot or everyone's. A model column turns anecdotes into a comparison.",
  },
  {
    field: "harness",
    what: "the platform or framework you are running on",
    why: "a door can be flawless and still unreachable from one runtime — a client that will not send a header, a registry that caches a stale card. We cannot see which runtime called us; you can.",
    choices: STUDY_HARNESSES,
  },
  {
    field: "harness_other",
    what: "name it, when the list above does not — otherwise leave it out",
    why: "the list will be wrong. A wrong list that swallows the answer is worse than one that admits it.",
  },
  {
    field: "operator",
    what: "who runs you — a person, a company, or 'self' if nobody is watching",
    why: "so a finding can be traced back to someone who can confirm it, and so the roster is not a wall of anonymous claims.",
  },
  {
    field: "task",
    what: "what you were actually told to do, in the words you were given",
    why: "this is the field nothing else can replace. Our logs know what you bought; only you know what you were sent here FOR, and the gap between those two is the entire finding.",
  },
  {
    field: "purpose",
    what: "why buying something here serves that task",
    why: "an agent that cannot answer this is one our shelf copy failed, and we would rather read that sentence than guess at it.",
  },
  {
    field: "autonomy",
    what: "is a human approving these purchases, or not",
    why: "an unsupervised agent and a supervised one meet completely different frictions, and a confirmation step that helps one blocks the other. Today we cannot tell them apart at all.",
    choices: STUDY_AUTONOMY,
  },
  {
    field: "funding",
    what: "whose money is in the wallet",
    why: "spend caps and approval rules travel with the money. A refusal that looks like our bug is often somebody's policy, and we have been unable to tell.",
    choices: STUDY_FUNDING,
  },
  {
    field: "found_via",
    what: "how you got here — a directory, a search, a link, an operator's instruction",
    why: "the store is listed in a dozen indexes and has no idea which of them a real agent has ever used to arrive.",
  },
  {
    field: "prior_x402",
    what: "true or false: had you paid any x402 door before today",
    why: "a first-timer's friction and a veteran's are different problems with different fixes, and we have been reading them as one number.",
  },
];

export interface StudyRoster {
  model: string;
  harness: StudyHarness;
  harness_other?: string;
  operator: string;
  task: string;
  purpose: string;
  autonomy: StudyAutonomy;
  funding: StudyFunding;
  found_via: string;
  prior_x402: boolean;
}

/**
 * THE DEBRIEF — asked after the shopping, and every one of these is a
 * question our own instruments structurally cannot answer.
 *
 * The test each question had to pass to be here: could the store learn
 * this from its own logs? If yes, it is not asked. We know what you
 * bought and when. We do not know what you read first, which step you
 * retried four times, or what you would have used instead of us — and
 * those are the three that change what we build next.
 */
export const STUDY_DEBRIEF_FIELDS: ReadonlyArray<{
  field: keyof StudyDebriefAnswers;
  what: string;
  why: string;
}> = [
  {
    field: "first_read",
    what: "the first thing you read here, and whether it told you the price",
    why: "we publish nine entry documents and do not know which one an agent actually opens first, so we have been maintaining all nine as if each were the front door.",
  },
  {
    field: "price_read",
    what: "where you found the price before you paid, and whether it matched what the door then charged",
    why: "a price that is discoverable only by triggering a 402 is a price the agent found by opening its wallet. If that is what happened, say so — it is a defect even when every number is correct.",
  },
  {
    field: "hardest_step",
    what: "the step that cost you the most attempts, and what you tried before it worked",
    why: "our logs keep the successful call. The four that preceded it are the ones worth money, and they are invisible here.",
  },
  {
    field: "abandoned",
    what: "anything you started and did not finish, and why you stopped — 'nothing' is a real and complete answer",
    why: "abandonment is the one outcome that leaves no trace in our books at all. A purchase never attempted is indistinguishable from a purchase never wanted.",
  },
  {
    field: "surprises",
    what: "what this store did that you did not expect, good or bad",
    why: "the cheapest finding in the world and the one no checklist ever produces, because a checklist can only ask about what we already thought of.",
  },
  {
    field: "compared_to",
    what: "what you would have used instead if this store were not here",
    why: "we do not know what we are an alternative TO, which means every claim we make about being worth the price is currently unanchored.",
  },
  {
    field: "would_return",
    what: "true or false, and one line on why",
    why: "the only question here with a number for an answer, and the one the keeper will read first.",
  },
];

export interface StudyDebriefAnswers {
  first_read: string;
  price_read: string;
  hardest_step: string;
  abandoned: string;
  surprises: string;
  compared_to: string;
  would_return: string;
}

/** A defect noticed along the way. Welcome, never required, never priced. */
export interface StudyDefect {
  /** Where: a path, a tool name, a surface. Their words. */
  where: string;
  /** What went wrong, in one line. */
  what: string;
  /** Their own severity call. Theirs, and labelled so — we do not grade it. */
  severity?: "blocking" | "annoying" | "cosmetic";
}

/** A cited purchase, before the store has looked it up. */
export interface StudyLegInput {
  purchase_id: string;
  status_token: string;
  /** Which way in they believe they came. Theirs. */
  surface: StudySurface;
  /** Anything about this specific leg. Theirs. */
  note?: string;
}

/**
 * A LEG, AFTER THE BOOKS ANSWERED. Two halves on one row and never
 * blended: `declared` is the researcher's, `observed` is ours, read
 * out of the purchase record their own token opened.
 */
export interface StudyLeg {
  purchase_id: string;
  declared: { surface: StudySurface; note?: string };
  observed: {
    /** The door our books recorded: http, mcp or ucp. */
    door: "http" | "mcp" | "ucp";
    /** The payment protocol our books recorded: x402 or mpp. */
    protocol: string;
    /** The rail the terms named, verbatim. */
    network: string;
    /** The path bought. Never the request body — that is the buyer's. */
    path: string;
    /** The item id, where the record carried one. */
    item?: string;
    /** Settled, or not. Only settled legs count toward a reward. */
    settled: boolean;
    created_at: string;
    /** The paying wallet as a salted digest. Never verbatim — the G2 ruling. */
    payer_digest: string;
  };
  /**
   * WHERE THE TWO HALVES DISAGREE, named rather than resolved. A
   * declared `ucp` that our books recorded as `door: "http"` is not a
   * lie and is not refused: it is a finding about what an agent
   * believes it is using, which is exactly the kind of thing this
   * study exists to surface. Recorded, published, never penalised.
   */
  mismatch?: string;
}

export interface StudyRecord {
  study_id: string;
  /** Opened at enrolment; the window runs from here. */
  enrolled_at: string;
  expires_at: string;
  roster: StudyRoster;
  status: "enrolled" | "debriefed" | "expired";
  /**
   * WHERE THE REWARD GOES, AND IT IS OPTIONAL HERE (2026-09-21).
   *
   * It was required at enrolment so a wallet this store cannot pay
   * would learn so before spending its own money. The reasoning was
   * sound and the cost was the whole instrument: it was the first
   * thing the door checked, so every refused body reported it, and
   * thirteen agents were told to hand over a wallet address before
   * they had been told anything else about the study.
   *
   * That is the shape of a scam, and a careful agent is right to stop
   * there — which means the requirement was selecting against exactly
   * the carefulness this store advertises. The money moves at the
   * debrief; the address is needed at the debrief. It can be given
   * here, and it is screened early as a courtesy when it is.
   */
  payout_to?: string;
  /**
   * THE SCENARIO THIS STUDY ENROLLED UNDER, if any. Bound at enrolment
   * and never afterwards: a walk that could pick its scenario at the
   * debrief would be picking the one its purchases happened to satisfy,
   * which is choosing the question after seeing the answer. Absent on
   * an open study, which is always allowed — the shelf is a set of
   * invitations, not a gate.
   */
  scenario?: string;
  /**
   * THE TOKEN IS NEVER STORED. Only its sha256 is, so the roster this
   * store publishes and the desk the keeper reads can both walk every
   * record without either of them holding a bearer credential for a
   * payout. The token exists in exactly two places: the enrolment
   * response, and the researcher's own memory.
   */
  token_sha256: string;
  debrief?: {
    at: string;
    answers: StudyDebriefAnswers;
    /** The scenario's own questions, answered. Present only under one. */
    scenario_answers?: Record<string, string>;
    legs: StudyLeg[];
    defects?: StudyDefect[];
    reward_usd: number;
    /** How the number was reached, published beside it. */
    reward_breakdown: StudyReward;
    authorization_nonce: string;
    authorization_valid_before: string;
  };
}

/** The reward, derived and shown — never a figure without its arithmetic. */
export interface StudyReward {
  base_usd: number;
  legs_counted: number;
  legs_usd: number;
  /** Distinct OBSERVED surfaces (door+protocol pairs), and what they paid. */
  surfaces: string[];
  surfaces_usd: number;
  /** Distinct OBSERVED rails, and what they paid. */
  rails: string[];
  rails_usd: number;
  /**
   * THE SCENARIO'S OWN BONUS, and it is a separate line on purpose.
   * It pays only when the target is met AND the target exists: a
   * scenario our books cannot confirm carries no bonus at all, never a
   * smaller one, because a bonus on an unverifiable condition is a
   * bounty on claiming it rather than walking it.
   */
  scenario?: {
    id: string;
    /** Null when the scenario has no target for us to check. */
    target_met: boolean | null;
    bonus_usd: number;
    /** What we looked for, or why there was nothing to look for. */
    how: string;
  };
  /** Before the per-study ceiling. */
  subtotal_usd: number;
  /** After it. This is what was signed. */
  total_usd: number;
  capped: boolean;
}

/** One thing wrong with a body, named where a parser can reach it. */
export interface StudyProblem {
  field: string;
  /** What is wrong with what arrived. */
  problem: string;
  /** What a good value looks like. */
  expected?: string;
  /** What the answer buys this store — the field's own reason. */
  why?: string;
}

/**
 * A REFUSAL THAT NAMES EVERY PROBLEM AT ONCE (2026-09-21).
 *
 * THIRTEEN REFUSALS AND NOT ONE ENROLMENT, on the instrument's first
 * two days, and every one of them reported `payout_to`. That number
 * is the finding, and it is not thirteen agents who all forgot a
 * wallet: `payout_to` was simply the FIRST thing the door checked, so
 * every malformed body in the world came back saying the same word.
 * A door that reports only its first complaint is a door an agent has
 * to knock on nine times to enter, learning one requirement per
 * refusal — and it hid twelve other diagnoses behind the first one,
 * which is why the desk could not say what was really going wrong.
 *
 * So a refusal now carries the WHOLE list. One round trip, every
 * field named, each with what was expected and what the answer buys.
 * The single-string message stays for readers that only print
 * `error`, and it is built from the same list rather than typed
 * beside it.
 *
 * The lesson is the one this whole instrument was built to collect,
 * arriving at our own door before a single researcher got through it:
 * our logs recorded thirteen refusals and could not tell us what the
 * agents were actually trying to do.
 */
export class StudyRefused extends Error {
  readonly problems: readonly StudyProblem[];
  constructor(message: string, problems: readonly StudyProblem[] = []) {
    super(message);
    this.problems = problems;
  }
}

/** Internal: "there is nothing to screen", not a failure of the screen. */
class SkipScreen extends Error {}

/** Gathers problems instead of throwing at the first one. */
class ProblemList {
  private readonly problems: StudyProblem[] = [];

  add(problem: StudyProblem): void {
    this.problems.push(problem);
  }

  get length(): number {
    return this.problems.length;
  }

  /** Throw one refusal carrying every problem, or return cleanly. */
  throwIfAny(lead: string): void {
    if (this.problems.length === 0) return;
    const named = this.problems
      .map((entry) => `\`${entry.field}\`: ${entry.problem}`)
      .join(" · ");
    throw new StudyRefused(
      `${lead} ${this.problems.length === 1 ? "One field needs fixing" : `${this.problems.length} fields need fixing`}, all of them here so one more call is enough: ${named}`,
      this.problems,
    );
  }
}

/**
 * EVERY WAY THIS DOOR SAYS NO, WRITTEN DOWN (the board's habit, kept).
 * A refusal an agent cannot anticipate is a refusal that costs them a
 * walk they had already paid for, so the whole list is published on
 * the enrolment door and the debrief door alike.
 */
export const STUDY_REFUSALS: readonly { refusal: string; why: string }[] = [
  {
    refusal: "an enrolment field is missing or blank",
    why: "the answers are the goods here, not a courtesy attached to them. Enrolment is free and re-takeable, so a refusal at this door costs a walk nothing; a paid blank would cost the price and the corpus row both. The refusal names EVERY field that needs fixing at once, in `problems`, so one more call is always enough.",
  },
  {
    refusal: "a payout address at the debrief that is missing, malformed, or a house wallet",
    why: "the reward is signed at the debrief, so the address is needed at the debrief. It is OPTIONAL at enrolment on purpose: asking a stranger for a wallet before telling them anything is the shape of a scam, and a careful agent is right to stop there. Give it at either door; the debrief's wins if you give it at both.",
  },
  {
    refusal: "the enrolment window has lapsed",
    why: `a study stands ${STUDY_WINDOW_HOURS} hours so the roster is a live list rather than an archive. Enrol again and shop again — nothing is lost but the id, and purchases made under the lapsed enrolment can be cited under the new one if they still postdate it.`,
  },
  {
    refusal: "a cited purchase is not in our books, or the status token does not open it",
    why: "the purchase id and its private status token are handed back with every purchase this store makes. Without both we are not verifying anything, we are taking dictation.",
  },
  {
    refusal: "a cited purchase predates the enrolment",
    why: "the study is prospective on purpose. Declared-then-observed is the entire instrument; a purchase made before you told us what you were trying to do cannot test the gap between the two.",
  },
  {
    refusal: "a cited purchase was already counted by another study",
    why: "one purchase, one study, ever. The same guard the bounty board keeps on settlement transactions, for the same reason: the evidence is bought once.",
  },
  {
    refusal: "no cited purchase settled",
    why: "a debrief with nothing verified behind it is a survey response, and this store does not pay for survey responses. Note: an ABANDONED purchase is not this — tell us about it in `abandoned`, cite the legs that did settle, and the study pays in full.",
  },
  {
    refusal: "the payout address is on the sanctions screen, or the screen did not answer",
    why: "rule 3, outbound, fail closed. An unanswered screen pays nobody and the enrolment stands — try the debrief again when it answers.",
  },
  {
    refusal: "the payout address is a house wallet",
    why: "the keeper's own runs are how this store tests itself and they are already written down as house tests. Paying ourselves for them would put family money in the organic column and make the research worthless to read.",
  },
  {
    refusal: "this payout address already debriefed a study this ISO week",
    why: "one study per wallet per week. Ten studies from one wallet is one perspective bought ten times, and the coverage this instrument sells is the number of DIFFERENT agents, never the number of rows.",
  },
  {
    refusal: "the week's study budget is spent",
    why: `studies draw on their own weekly cap ($${STUDY_WEEKLY_BUDGET_USD}), kept apart from the bounty board's so neither can eat the other. It reopens with the ISO week.`,
  },
];

export interface StudyOptions {
  signer?: FieldSigner;
  screen?: SanctionsScreen;
  now?: Date;
  randomNonce?: () => string;
  fetch?: typeof fetch;
}

function defaultNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function newStudyId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `sty_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function newStudyToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Trim, cap, and refuse the empty. Used on every required answer. */
function requiredText(value: unknown, field: string, cap: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StudyRefused(
      `\`${field}\` is required and was ${value === undefined ? "not sent" : "blank"}. Every question on this study is answerable in a sentence, and an unanswered one is the one thing that stops a debrief being paid — see the field's own \`why\` on the enrolment door for what it buys.`,
    );
  }
  return value.trim().slice(0, cap);
}

function optionalText(value: unknown, cap: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, cap);
}

function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  field: string,
): T {
  if (typeof value === "string" && (choices as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new StudyRefused(
    `\`${field}\` must be one of: ${choices.join(", ")}. A closed list here is not bureaucracy — an open string gives us a column nobody can total, which is the same as not asking.`,
  );
}

function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * WHAT WE ASK A STUDY TO DO, published at enrolment. It is a BRIEF
 * and not a contract: nothing here is a condition of payment, and a
 * study that manages one purchase on one rail and answers honestly is
 * paid its base and welcome. The ladder exists because coverage is
 * genuinely worth more — one surface tells us a surface works, two
 * tell us which one is worse — and saying so plainly beats hiding the
 * arithmetic and then paying an amount nobody can predict.
 */
export function studyBrief(base: string) {
  return {
    scenarios_note:
      "The store keeps a shelf of predetermined scenarios, and whichever the keeper has put live are published on /api/field-study under `scenarios`. A scenario NEVER picks your product — you buy whatever you like — it names a CONDITION of the walk, because the condition is what is being measured. Naming one at enrolment is optional and an open study is always welcome at the same ordinary reward. Where our own books can confirm the condition, the scenario carries a bonus and states exactly what we will look for; where they cannot, it carries NO bonus and says why, because paying for a condition we cannot check would be paying for the claim rather than the walk.",
    what_we_want:
      "Shop this store the way you would actually shop it, several different ways, and then tell us what the shopping was like. We can already see what you bought. We cannot see what you read first, which step you retried, or what you would have used instead — and those are what we are paying for.",
    steps: [
      "1. Enrol before you spend anything. POST /api/study/enrol with the roster below. It is free, no payment and no wallet is opened, and it returns a study_id and a private study_token. No payout address is asked for here — the reward is signed at the debrief, so the address is wanted there. Enrolling first is what makes this a study rather than a survey: you state the intent, then we watch what happens.",
      `2. Buy a few things, in DIFFERENT ways. The surfaces are ${STUDY_SURFACES.join(", ")} and the rails are whichever the door quotes you. Keep the purchase_id and status_token handed back by each purchase — those are how we verify the leg against our own books, and without them we are taking dictation.`,
      "3. Note any defect you hit. There is a field for it. It is not required and it is not priced — a defect report is a by-product here, not the product.",
      `4. Debrief within ${STUDY_WINDOW_HOURS} hours. POST /api/study/debrief with your study_id, study_token, a payout_to you control, the legs you bought and the answers. The reward is signed and returned in that same response.`,
    ],
    the_ladder: {
      base_usd: STUDY_BASE_REWARD_USD,
      per_verified_leg_usd: STUDY_LEG_REWARD_USD,
      legs_counted_max: STUDY_LEGS_COUNTED,
      per_extra_surface_usd: STUDY_SURFACE_BONUS_USD,
      per_extra_rail_usd: STUDY_RAIL_BONUS_USD,
      ceiling_usd: STUDY_MAX_REWARD_USD,
      note: "Surfaces and rails are counted from what OUR BOOKS observed, never from what the debrief declared — so the ladder cannot be climbed by typing. The questionnaire is checked for completeness and never for quality: a thin honest answer and a thick flattering one are worth exactly the same, which is the only way the resulting corpus is worth reading.",
    },
    what_the_reward_pays_for:
      "Verified legs in our own books, distinct observed surfaces, distinct observed rails, and a complete set of answers. Nothing here is a judgement on what you wrote.",
    what_it_does_not_pay_for:
      "Finding bugs. Report them — there is a field, and we want them — but they are not priced, because a bounty on defects buys a report that finds defects.",
    surfaces: STUDY_SURFACES.map((surface) => ({
      surface,
      what: STUDY_SURFACE_NOTES[surface],
    })),
    roster_asked_at_enrolment: STUDY_ROSTER_FIELDS,
    questions_asked_at_debrief: STUDY_DEBRIEF_FIELDS,
    refusals: STUDY_REFUSALS,
    doors: {
      enrol: `${base}/api/study/enrol`,
      debrief: `${base}/api/study/debrief`,
      board: `${base}/api/field-study`,
      room: `${base}/field-study`,
    },
  };
}

async function listStudyRecords(env: Env): Promise<StudyRecord[]> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.studyPrefix,
    cap: 300,
  });
  const values = await bulkGetJson<StudyRecord>(env.COUNTERS, listed.names);
  return [...values.values()].filter((record): record is StudyRecord =>
    Boolean(record),
  );
}

async function saveStudy(env: Env, record: StudyRecord): Promise<void> {
  await kvPut(env.COUNTERS, KV_KEYS.study(record.study_id), JSON.stringify(record));
}

/** Budget spent on studies this week, in USD. One key per ISO week. */
async function studyWeekSpent(env: Env, weekKey: string): Promise<number> {
  const raw = await kvGet(env.COUNTERS, KV_KEYS.studyBudget(weekKey));
  const parsed = Number.parseFloat(raw ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Status is DERIVED from the clock on every read, never from a cron.
 * The board learned this the hard way: a stored "open" that no sweep
 * ever flipped is a listing that refuses the claim it advertised.
 */
export function studyStatusAt(record: StudyRecord, now: Date): StudyRecord["status"] {
  if (record.status === "debriefed") return "debriefed";
  return new Date(record.expires_at).getTime() <= now.getTime() ? "expired" : "enrolled";
}

/**
 * ENROL. Free, prospective, and the only place the roster is taken.
 *
 * The payout address is asked for HERE rather than at the debrief, and
 * the reason is kindness rather than bookkeeping: it is screened at
 * enrolment, so an agent whose wallet this store cannot pay finds out
 * before it spends its own money, not after. A screen that cannot be
 * reached does not refuse the enrolment — it is re-run at the debrief
 * where the money actually moves, and fails closed there.
 */
export async function enrolStudy(
  env: Env,
  input: Record<string, unknown>,
  options: StudyOptions = {},
): Promise<{ study_id: string; study_token: string; record: StudyRecord; advisory?: string }> {
  const now = options.now ?? new Date();
  const found = new ProblemList();
  const reasons = new Map(STUDY_ROSTER_FIELDS.map((entry) => [entry.field, entry.why]));
  const why = (field: string): string | undefined => reasons.get(field as keyof StudyRoster);

  /*
   * OPTIONAL, AND SCREENED WHEN GIVEN. An address that is present and
   * malformed is still a problem worth naming — silently dropping it
   * would let a researcher believe a reward was routed somewhere it
   * was not.
   */
  let payoutTo: string | undefined;
  const givenPayout = input["payout_to"];
  if (givenPayout !== undefined && givenPayout !== null && givenPayout !== "") {
    if (!isEvmAddress(givenPayout)) {
      found.add({
        field: "payout_to",
        problem: "this is not a 0x Base address. It is OPTIONAL here — leave it out entirely and give it at the debrief instead, where the money actually moves.",
        expected: "0x followed by 40 hex characters, an address you control",
        why: "rewards pay in Base USDC as a signed EIP-3009 authorization you redeem yourself; the store holds no gas and broadcasts nothing, so there is nowhere else for it to go",
      });
    } else if (isHouseWallet(env, givenPayout)) {
      found.add({
        field: "payout_to",
        problem: "that is a house wallet.",
        expected: "a wallet that is not the keeper's own",
        why: "the keeper's runs are already written down as house tests; paying ourselves would put family money in the organic column and make the study worthless to read",
      });
    } else {
      payoutTo = givenPayout.toLowerCase();
    }
  }

  const text = (field: keyof StudyRoster, cap: number): string => {
    const value = input[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      found.add({
        field,
        problem: value === undefined ? "not sent." : "sent empty.",
        expected: STUDY_ROSTER_FIELDS.find((entry) => entry.field === field)?.what,
        why: why(field),
      });
      return "";
    }
    return value.trim().slice(0, cap);
  };
  const pick = <T extends string>(field: keyof StudyRoster, choices: readonly T[]): T => {
    const value = input[field];
    if (typeof value === "string" && (choices as readonly string[]).includes(value)) {
      return value as T;
    }
    found.add({
      field,
      problem: value === undefined ? "not sent." : `\`${String(value).slice(0, 40)}\` is not one of the accepted values.`,
      expected: `one of: ${choices.join(", ")}`,
      why: why(field),
    });
    return choices[0]!;
  };

  const harness = pick("harness", STUDY_HARNESSES);
  const harnessOther = optionalText(input["harness_other"], STUDY_NOTE_CAP);
  if ((harness === "other" || harness === "custom") && !harnessOther) {
    found.add({
      field: "harness_other",
      problem: `required because \`harness\` is \`${harness}\`.`,
      expected: "the name of the platform or framework you run on",
      why: "the list will be wrong sometimes, and a wrong list that swallows the answer is worse than one that admits it",
    });
  }
  const priorX402 = input["prior_x402"];
  if (typeof priorX402 !== "boolean") {
    found.add({
      field: "prior_x402",
      problem: priorX402 === undefined ? "not sent." : "must be a JSON boolean, not a string.",
      expected: "true or false",
      why: why("prior_x402"),
    });
  }

  const roster: StudyRoster = {
    model: text("model", STUDY_NOTE_CAP),
    harness,
    ...(harnessOther ? { harness_other: harnessOther } : {}),
    operator: text("operator", STUDY_NOTE_CAP),
    task: text("task", STUDY_ANSWER_CAP),
    purpose: text("purpose", STUDY_ANSWER_CAP),
    autonomy: pick("autonomy", STUDY_AUTONOMY),
    funding: pick("funding", STUDY_FUNDING),
    found_via: text("found_via", STUDY_NOTE_CAP),
    prior_x402: priorX402 === true,
  };

  /*
   * EVERY PROBLEM, ONCE. Thrown here rather than at each check so a
   * researcher fixes the whole body in one more call instead of
   * discovering the requirements one refusal at a time.
   */
  found.throwIfAny(
    "This enrolment was not opened, and nothing was spent — enrolment is free and re-takeable.",
  );

  /*
   * THE EARLY SCREEN, and it is advisory ON PURPOSE. A sanctions
   * oracle that cannot be reached must never cost a researcher their
   * enrolment — nothing has been paid yet and nothing is at risk. It
   * fails closed at the debrief, where money actually moves. What this
   * read buys is the ONE case worth catching early: a wallet that is
   * listed, told so before it spends anything of its own.
   */
  let advisory: string | undefined;
  try {
    // Only when one was given: the screen has nothing to read otherwise,
    // and an address withheld here is screened at the debrief like any
    // other, fail closed, where the money actually moves.
    if (!payoutTo) throw new SkipScreen();
    const screen = options.screen ?? oracleScreen(rpcEndpoints(env), options.fetch ?? fetch);
    const screened = await screen(payoutTo);
    if (screened.listed === true) {
      throw new StudyRefused(
        `the payout address is identified on the sanctions screen (${screened.source}); no enrolment is opened and nothing was spent. This is checked again before any payout, and it fails closed there.`,
      );
    }
    if (screened.listed === null) {
      advisory =
        "The sanctions screen did not answer just now, so this enrolment was opened without it. It is checked again at the debrief and fails closed there — if it is still silent then, the debrief is refused and nothing is lost but the wait.";
    }
  } catch (error) {
    if (error instanceof StudyRefused) throw error;
    if (!(error instanceof SkipScreen)) {
      advisory =
        "The sanctions screen could not be reached at enrolment. It is re-run and fails closed at the debrief.";
    }
  }
  if (!payoutTo) {
    advisory =
      "No payout address was given, which is fine: enrolment does not need one. Bring a 0x Base address to the debrief as `payout_to` and the reward is signed to it there, after it is sanctions-screened.";
  }

  /*
   * THE SCENARIO, BOUND HERE OR NEVER. Optional — an open study is
   * always allowed and the shelf is a set of invitations rather than a
   * gate — but if one is named it must be LIVE now, because a walker
   * who enrolled under a scenario the keeper had already taken down
   * would be answering questions nobody is reading.
   */
  let scenarioId: string | undefined;
  const namedScenario = input["scenario"];
  if (typeof namedScenario === "string" && namedScenario.trim().length > 0) {
    const live = await liveScenario(env, namedScenario.trim(), now);
    if (!live) {
      throw new StudyRefused(
        `\`${namedScenario.trim().slice(0, 60)}\` is not a scenario that is live right now. Read the open shelf on /api/field-study under \`scenarios\` and name one of those, or leave \`scenario\` out entirely — an open study is always welcome and pays the same ordinary reward.`,
      );
    }
    scenarioId = live.id;
  }

  const study_token = newStudyToken();
  const record: StudyRecord = {
    study_id: newStudyId(),
    enrolled_at: now.toISOString(),
    expires_at: new Date(now.getTime() + STUDY_WINDOW_HOURS * 3600 * 1000).toISOString(),
    roster,
    status: "enrolled",
    ...(payoutTo ? { payout_to: payoutTo } : {}),
    ...(scenarioId ? { scenario: scenarioId } : {}),
    token_sha256: await sha256Hex(study_token),
  };
  await saveStudy(env, record);
  return { study_id: record.study_id, study_token, record, ...(advisory ? { advisory } : {}) };
}

/**
 * THE TOKEN CHECK, constant-time. The study token is a bearer
 * credential for a payout, so a length-leaking compare here would be
 * the kind of hole the purchase records already learned to close
 * (paid-recovery's readPurchase uses timingSafeEqual for the same
 * reason and against the same attacker).
 */
async function tokenOpens(record: StudyRecord, token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
  const bytes = new TextEncoder();
  const given = bytes.encode(await sha256Hex(token));
  const held = bytes.encode(record.token_sha256);
  return given.length === held.length && crypto.subtle.timingSafeEqual(given, held);
}

/**
 * ONE CITED PURCHASE, AGAINST OUR OWN BOOKS.
 *
 * This is the part the bounty board cannot do and the reason a study
 * is worth more per row than a walk. There is no chain read here and
 * no trust extended: the researcher hands back the purchase id and
 * the private status token this store itself issued at the moment of
 * sale, and we open our own record with them. What comes out —
 * door, protocol, rail, path, item, settled or not, when — is ours.
 *
 * WHAT IS DELIBERATELY NOT READ OFF THE RECORD: the `request` field,
 * which holds the buyer's exact query or full MCP arguments. It is
 * theirs, it can hold anything, and this study has no use for it. The
 * payer address is read but never kept verbatim — it rides as the
 * same salted digest the ward round uses, so the row is born sealed.
 */
async function verifyLeg(
  env: Env,
  record: StudyRecord,
  input: StudyLegInput,
): Promise<StudyLeg> {
  if (!/^[a-f0-9]{64}$/.test(input.purchase_id) || !/^[a-f0-9]{64}$/.test(input.status_token)) {
    throw new StudyRefused(
      `leg \`${input.purchase_id.slice(0, 16)}…\`: a purchase_id and a status_token are both 64 hex characters, handed back together with every purchase this store makes. Without both we are not verifying a leg, we are taking dictation.`,
    );
  }
  let saved: string | null;
  try {
    saved = await purchaseIntentStore(env, input.purchase_id).readPurchase(input.status_token);
  } catch {
    throw new StudyRefused(
      "the purchase journal could not be read just now. Nothing is lost and nothing was paid — present the same debrief again in a minute; the enrolment stands until it expires.",
    );
  }
  if (!saved) {
    throw new StudyRefused(
      `leg \`${input.purchase_id.slice(0, 16)}…\` is not in our books under that status token. The pair is returned with every purchase and with every decline; if you have one and not the other, the leg cannot be verified and citing it would be us signing for something we did not check.`,
    );
  }
  const purchase = JSON.parse(saved) as PurchaseIntent;

  /*
   * PROSPECTIVE, OR NOTHING. A purchase made before the enrolment
   * cannot test the declared-then-observed gap that is this entire
   * instrument — it is a receipt looking for a survey. Refused by the
   * clock, with the two timestamps printed so the refusal is checkable
   * rather than asserted.
   */
  if (new Date(purchase.created_at).getTime() < new Date(record.enrolled_at).getTime()) {
    throw new StudyRefused(
      `leg \`${input.purchase_id.slice(0, 16)}…\` was bought at ${purchase.created_at}, before this study enrolled at ${record.enrolled_at}. The study is prospective on purpose: you state the intent, then we watch what happens. Enrol again and this purchase can be cited under the new enrolment if it postdates it — or simply cite the legs you bought after enrolling.`,
    );
  }

  const settled = purchase.state === "settled";
  const protocol =
    purchase.version === 1 ? "x402" : (purchase.payment_context?.protocol ?? "unknown");
  const network = String(
    (purchase.terms as { network?: unknown } | undefined)?.network ?? "unknown",
  );

  /*
   * THE DISAGREEMENT, NAMED AND NOT RESOLVED. Four of the six
   * declarable surfaces land on `door: "http"` in our books — a
   * WebMCP call and a hand-rolled curl are the same request by the
   * time we see it — so a mismatch here is usually our blindness
   * rather than their error. It is recorded because "what an agent
   * BELIEVES it is using" is itself a finding this study exists to
   * collect, and it never costs a cent.
   */
  const expectedDoor: Readonly<Record<StudySurface, readonly string[]>> = {
    x402_http: ["http"],
    mpp: ["http", "mcp", "ucp"],
    ucp: ["ucp"],
    webmcp: ["http"],
    mcp: ["mcp"],
    a2a: ["http", "mcp"],
  };
  const mismatch = expectedDoor[input.surface].includes(purchase.door)
    ? undefined
    : `declared \`${input.surface}\`, our books recorded \`door: ${purchase.door}\`. Both are kept. Four of the declarable surfaces are indistinguishable at our end, so this is at least as likely to be our blindness as your error — it is recorded as a finding, and it costs nothing.`;

  return {
    purchase_id: purchase.id,
    declared: {
      surface: input.surface,
      ...(input.note ? { note: input.note } : {}),
    },
    observed: {
      door: purchase.door,
      protocol,
      network,
      path: purchase.path,
      ...(purchase.item?.id ? { item: purchase.item.id } : {}),
      settled,
      created_at: purchase.created_at,
      payer_digest: await payToDigest(purchase.payer ?? ""),
    },
    ...(mismatch ? { mismatch } : {}),
  };
}

/**
 * DID OUR OWN BOOKS SHOW WHAT THE SCENARIO ASKED FOR?
 *
 * Every branch reads VERIFIED legs only — the rows this store already
 * confirmed against its own purchase records — and never a word the
 * researcher wrote. A scenario target is therefore exactly as
 * trustworthy as the base reward, which is the property that let it
 * carry money at all.
 *
 * The one branch that pays for a failure is `unsettled_leg`, and it
 * requires a settled leg beside it: a debrief with nothing but
 * abandonment is refused upstream, and rightly — but a walker who
 * bought something AND handed us the id of the thing they gave up on
 * has given this store the one outcome its books are structurally
 * blind to.
 */
export function scenarioTargetMet(
  legs: readonly StudyLeg[],
  target: ScenarioTarget,
): boolean {
  const settled = legs.filter((leg) => leg.observed.settled);
  switch (target.kind) {
    case "door":
      return settled.some((leg) => leg.observed.door === target.door);
    case "protocol":
      return settled.some((leg) => leg.observed.protocol === target.protocol);
    case "rail_other_than":
      return settled.some(
        (leg) => leg.observed.network.toLowerCase() !== target.network.toLowerCase(),
      );
    case "distinct_rails":
      return (
        new Set(settled.map((leg) => leg.observed.network.toLowerCase())).size >=
        target.count
      );
    case "distinct_doors":
      return new Set(settled.map((leg) => leg.observed.door)).size >= target.count;
    case "distinct_items":
      return (
        new Set(
          settled
            .map((leg) => leg.observed.item)
            .filter((item): item is string => Boolean(item)),
        ).size >= target.count
      );
    case "legs":
      return settled.length >= target.count;
    case "spread_hours": {
      if (settled.length < 2) return false;
      const times = settled
        .map((leg) => new Date(leg.observed.created_at).getTime())
        .sort((a, b) => a - b);
      return times[times.length - 1]! - times[0]! >= target.hours * 3600 * 1000;
    }
    case "unsettled_leg":
      return settled.length > 0 && legs.some((leg) => !leg.observed.settled);
  }
}

/** What we looked for, in words, printed beside the verdict. */
export function scenarioTargetSentence(target: ScenarioTarget): string {
  switch (target.kind) {
    case "door":
      return `a settled purchase through the ${target.door} door, as our own books recorded it`;
    case "protocol":
      return `a settled purchase paid under the ${target.protocol} protocol, as our own books recorded it`;
    case "rail_other_than":
      return `a settled purchase on any rail other than ${target.network}`;
    case "distinct_rails":
      return `settled purchases spanning at least ${target.count} distinct rails`;
    case "distinct_doors":
      return `settled purchases spanning at least ${target.count} distinct doors`;
    case "distinct_items":
      return `settled purchases of at least ${target.count} distinct catalogue items`;
    case "legs":
      return `at least ${target.count} settled purchases`;
    case "spread_hours":
      return `a first and last settled purchase at least ${target.hours} hours apart`;
    case "unsettled_leg":
      return "a cited purchase that did NOT settle, beside at least one that did";
  }
}

/**
 * THE ARITHMETIC, IN ONE PLACE AND EXPORTED so the room, the debrief
 * response and the test all read the same function rather than three
 * copies of the same sum. Every input is an OBSERVED fact: a leg
 * counts when our books say it settled, a surface counts as the
 * door+protocol pair our books recorded, a rail counts as the network
 * the terms named. Nothing the researcher typed reaches this.
 */
export function studyReward(
  legs: readonly StudyLeg[],
  scenario?: StudyScenario | null,
): StudyReward {
  const settled = legs.filter((leg) => leg.observed.settled);
  const legsCounted = Math.min(settled.length, STUDY_LEGS_COUNTED);
  const surfaces = [
    ...new Set(settled.map((leg) => `${leg.observed.door}+${leg.observed.protocol}`)),
  ].sort();
  const rails = [...new Set(settled.map((leg) => leg.observed.network.toLowerCase()))].sort();
  const base = settled.length > 0 ? STUDY_BASE_REWARD_USD : 0;
  const legsUsd = legsCounted * STUDY_LEG_REWARD_USD;
  const surfacesUsd = Math.max(0, surfaces.length - 1) * STUDY_SURFACE_BONUS_USD;
  const railsUsd = Math.max(0, rails.length - 1) * STUDY_RAIL_BONUS_USD;
  const round = (n: number): number => Math.round(n * 100) / 100;

  /*
   * THE SCENARIO LINE. A scenario with no target pays nothing extra —
   * not a reduced bonus, none — and says so in `how` rather than
   * leaving a zero for the reader to interpret. A scenario whose
   * target our books did not show pays nothing extra either, and the
   * ordinary reward is untouched: missing a scenario target is not a
   * penalty, it is simply the bonus not being earned, and the walk is
   * still worth what the walk was worth.
   */
  let scenarioLine: StudyReward["scenario"];
  let bonus = 0;
  if (scenario) {
    if (!scenario.target) {
      scenarioLine = {
        id: scenario.id,
        target_met: null,
        bonus_usd: 0,
        how: `This scenario carries no bonus, because our books cannot confirm the condition it asks for. ${scenario.unverifiable_because ?? ""} The ordinary study reward below is unaffected and is what this walk is worth.`.trim(),
      };
    } else {
      const met = settled.length > 0 && scenarioTargetMet(legs, scenario.target);
      bonus = met ? scenario.bonus_usd : 0;
      scenarioLine = {
        id: scenario.id,
        target_met: met,
        bonus_usd: round(bonus),
        how: met
          ? `Our own books show ${scenarioTargetSentence(scenario.target)}. The bonus is paid on that reading and on nothing you wrote.`
          : `Our own books do not show ${scenarioTargetSentence(scenario.target)}, so the scenario bonus is not earned. Nothing is deducted for it — the ordinary reward below is untouched, and the answers you sent are kept and published either way.`,
      };
    }
  }

  const subtotal = round(base + legsUsd + surfacesUsd + railsUsd);
  /*
   * THE CEILING BITES THE LADDER, NOT THE BONUS. Capping the two
   * together would let a well-covered walk silently swallow the
   * scenario reward, so a walker who did the harder thing would be
   * paid exactly the same as one who did not — which is the whole
   * point of the bonus, undone by an ordering accident.
   */
  const total = round(Math.min(subtotal, STUDY_MAX_REWARD_USD) + bonus);
  return {
    ...(scenarioLine ? { scenario: scenarioLine } : {}),
    base_usd: round(base),
    legs_counted: legsCounted,
    legs_usd: round(legsUsd),
    surfaces,
    surfaces_usd: round(surfacesUsd),
    rails,
    rails_usd: round(railsUsd),
    subtotal_usd: round(subtotal + bonus),
    total_usd: total,
    capped: subtotal > STUDY_MAX_REWARD_USD,
  };
}

export interface DebriefInput {
  study_id: string;
  study_token: string;
  legs: StudyLegInput[];
  answers: Record<string, unknown>;
  /**
   * WHERE THE REWARD GOES, when the enrolment did not carry one — and
   * it may override one that did, because a researcher who changed
   * wallets between enrolling and debriefing should not have to
   * abandon a walk they already paid for.
   */
  payout_to?: unknown;
  /** The scenario's own questions, when the study enrolled under one. */
  scenario_answers?: Record<string, unknown>;
  defects?: StudyDefect[];
}

export interface DebriefResult {
  study_id: string;
  reward_usd: number;
  reward_breakdown: StudyReward;
  legs: StudyLeg[];
  what_was_verified: string;
  what_was_not: string;
  your_answers_are: string;
  /** Present when the study enrolled under a scenario: how it went. */
  scenario?: {
    id: string;
    title: string;
    target_met: boolean | null;
    bonus_usd: number;
    how: string;
  };
  defects_recorded: number;
  payout: {
    method: "eip3009_transfer_with_authorization";
    asset: string;
    chain: string;
    authorization: Record<string, string>;
    signature: string;
    how_to_redeem: string;
  };
}

/** The debrief's shape, read into the required answers or refused. */
function readAnswers(raw: Record<string, unknown>): StudyDebriefAnswers {
  const answers: Partial<StudyDebriefAnswers> = {};
  for (const entry of STUDY_DEBRIEF_FIELDS) {
    answers[entry.field] = requiredText(raw[entry.field], entry.field, STUDY_ANSWER_CAP);
  }
  return answers as StudyDebriefAnswers;
}

/**
 * THE SCENARIO'S OWN QUESTIONS, required when one was enrolled under.
 *
 * Required for the same reason the standard set is: under a scenario,
 * these ARE the goods. Somebody enrolled under "cold arrival" and left
 * `first_ninety_seconds` blank has handed back an ordinary study, and
 * the ordinary study is what the base reward already pays for.
 *
 * Checked for presence and nothing else, exactly like the standard
 * answers, and for the same reason: completeness is a fact, quality is
 * an opinion, and only one of those is safe to attach money to.
 */
function readScenarioAnswers(
  scenario: StudyScenario,
  raw: Record<string, unknown> | undefined,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const ask of scenario.asks) {
    answers[ask.field] = requiredText(
      (raw ?? {})[ask.field],
      `scenario_answers.${ask.field}`,
      STUDY_ANSWER_CAP,
    );
  }
  return answers;
}

function readDefects(raw: unknown): StudyDefect[] {
  if (!Array.isArray(raw)) return [];
  const out: StudyDefect[] = [];
  for (const entry of raw.slice(0, STUDY_DEFECT_CAP)) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const where = optionalText(row["where"], STUDY_DEFECT_LENGTH);
    const what = optionalText(row["what"], STUDY_DEFECT_LENGTH);
    if (!where || !what) continue;
    const severity = row["severity"];
    out.push({
      where,
      what,
      ...(severity === "blocking" || severity === "annoying" || severity === "cosmetic"
        ? { severity }
        : {}),
    });
  }
  return out;
}

/**
 * DEBRIEF, VERIFY, PAY. The one door here that moves money, and it is
 * ordered the way the bounty board's claim door is ordered, for the
 * same reasons and after the same bruises:
 *
 *   lock        one debrief per study at a time, in a Durable Object,
 *               because read-then-write on KV is the version that does
 *               not work (bounty-claim-locks.ts says why at length).
 *   shape       the answers and the legs, refused before any chain or
 *               oracle is touched — a malformed body should cost this
 *               store nothing and the researcher no wait.
 *   books       every leg against our own purchase records.
 *   guards      one purchase per study ever; one study per wallet per
 *               ISO week.
 *   screen      the payout address, fail closed.
 *   reserve     the week's budget, BEFORE the signature, because the
 *               board lost every concurrent increment but one when it
 *               was written after and published a figure below what it
 *               had paid.
 *   sign        last. Nothing after this line can fail and leave the
 *               store having signed for a record it did not save.
 */
export async function debriefStudy(
  env: Env,
  input: DebriefInput,
  options: StudyOptions = {},
): Promise<DebriefResult> {
  const now = options.now ?? new Date();
  if (!env.FIELD_WALLET_KEY && !options.signer) {
    throw new StudyRefused(
      "this deployment has no paying wallet configured, so the field study is read-only and no debrief can pay. Nothing was spent by presenting this.",
    );
  }

  const record = await kvGetJson<StudyRecord>(
    env.COUNTERS,
    KV_KEYS.study(String(input.study_id)),
  );
  if (!record || !(await tokenOpens(record, input.study_token))) {
    throw new StudyRefused(
      "no enrolled study opens with that study_id and study_token. Both are returned together by /api/study/enrol and neither is recoverable — enrol again (it is free) and cite the purchases you make after that.",
    );
  }
  if (record.status === "debriefed") {
    throw new StudyRefused(
      `study ${record.study_id} has already been debriefed and paid. One debrief per study, ever — the same guard the bounty board keeps on settlement transactions, and for the same reason: the evidence is bought once.`,
    );
  }
  if (studyStatusAt(record, now) === "expired") {
    throw new StudyRefused(
      `this enrolment lapsed at ${record.expires_at} (a study stands ${STUDY_WINDOW_HOURS} hours). Enrol again — it is free and takes one call — and cite the purchases that postdate the new enrolment. Nothing is lost but the id.`,
    );
  }

  // The shape, before anything expensive. A malformed body should cost
  // this store no oracle call and the researcher no wait.
  if (!Array.isArray(input.legs) || input.legs.length === 0) {
    throw new StudyRefused(
      "`legs` must name at least one purchase you made under this enrolment, each as {purchase_id, status_token, surface}. A debrief with nothing verifiable behind it is a survey response, and this store does not pay for survey responses.",
    );
  }
  if (input.legs.length > STUDY_LEG_CAP) {
    throw new StudyRefused(
      `\`legs\` names ${input.legs.length} purchases; ${STUDY_LEG_CAP} is the most one debrief may cite. This is refused rather than truncated on purpose — a silently dropped leg is a leg you would believe was counted.`,
    );
  }
  const legInputs: StudyLegInput[] = input.legs.map((leg, index) => {
    if (typeof leg !== "object" || leg === null) {
      throw new StudyRefused(`leg ${index + 1} is not an object.`);
    }
    const row = leg as unknown as Record<string, unknown>;
    return {
      purchase_id: String(row["purchase_id"] ?? ""),
      status_token: String(row["status_token"] ?? ""),
      surface: oneOf(row["surface"], STUDY_SURFACES, `legs[${index}].surface`),
      ...(optionalText(row["note"], STUDY_NOTE_CAP)
        ? { note: optionalText(row["note"], STUDY_NOTE_CAP) }
        : {}),
    };
  });
  const seen = new Set<string>();
  for (const leg of legInputs) {
    if (seen.has(leg.purchase_id)) {
      throw new StudyRefused(
        `purchase ${leg.purchase_id.slice(0, 16)}… is cited twice in this debrief. One purchase is one leg; citing it twice would pay twice for one piece of evidence.`,
      );
    }
    seen.add(leg.purchase_id);
  }
  /*
   * THE ADDRESS IS RESOLVED HERE, because here is where the money
   * moves. The debrief's own `payout_to` wins over the enrolment's:
   * an agent that changed wallets mid-study should not have to throw
   * the walk away. Every check the enrolment door used to run happens
   * here too — shape, house wallet, and the sanctions screen below,
   * which fails closed.
   */
  const payoutTo = ((): string => {
    const given = input.payout_to;
    if (given !== undefined && given !== null && given !== "") {
      if (!isEvmAddress(given)) {
        throw new StudyRefused(
          "`payout_to` is not a 0x Base address. Rewards pay in Base USDC as a signed EIP-3009 authorization you redeem yourself, so there is nowhere else for it to go. Nothing was spent and the study still stands — present the debrief again with a good address.",
          [{ field: "payout_to", problem: "not a 0x Base address.", expected: "0x followed by 40 hex characters, an address you control" }],
        );
      }
      return given.toLowerCase();
    }
    if (record.payout_to) return record.payout_to;
    throw new StudyRefused(
      "no payout address. It is optional at enrolment and required here, because here is where the reward is signed — send `payout_to` as a 0x Base address you control. Nothing was spent and your study still stands.",
      [{
        field: "payout_to",
        problem: "not given at enrolment and not sent here.",
        expected: "0x followed by 40 hex characters, an address you control",
        why: "the reward is a signed EIP-3009 authorization on Base USDC that you redeem yourself; the store holds no gas and broadcasts nothing",
      }],
    );
  })();
  if (isHouseWallet(env, payoutTo)) {
    throw new StudyRefused(
      "that payout address is a house wallet. The keeper's own runs are already written down as house tests; paying ourselves for one would put family money in the organic column and make the whole study worthless to read.",
    );
  }

  const answers = readAnswers(input.answers ?? {});
  /*
   * THE SCENARIO IS READ OFF THE RECORD, never off the debrief body.
   * Letting a walk name its scenario here would let it pick the one
   * its purchases happened to satisfy — choosing the question after
   * seeing the answer, and paying a bonus for the coincidence. It was
   * bound at enrolment or it does not apply.
   *
   * A scenario since taken down still applies to a study enrolled
   * under it: closing the shelf stops new enrolments, it does not
   * cancel a walk somebody is halfway through with their own money.
   */
  const scenario = record.scenario ? scenarioById(record.scenario) : null;
  const scenarioAnswers = scenario
    ? readScenarioAnswers(scenario, input.scenario_answers)
    : undefined;
  const defects = readDefects(input.defects);

  /*
   * ONE DEBRIEF PER STUDY AT A TIME. The board's lock object is reused
   * under a namespaced key rather than a second Durable Object being
   * stood up: the guarantee wanted is identical ("one caller inside
   * this critical section"), the key space is disjoint, and a new
   * namespace would mean a migration for nothing. Fail-open, exactly
   * as the board's does and for the reason written there: refusing
   * every debrief because a lock is unavailable turns a rare double
   * pay into a total outage.
   */
  const lock = bountyLock(env);
  const lockKey = `study:${record.study_id}`;
  const lockHolder = newStudyToken().slice(0, 32);
  let held = false;
  if (lock) {
    const taken = await lock.take(lockKey, lockHolder, BOUNTY_LOCK_SECONDS).catch(() => "taken" as const);
    if (taken === "held") {
      throw new StudyRefused(
        "another debrief for this study is being processed right now. Wait a moment and read the study back before presenting again — if that one paid, this one would have been refused anyway.",
      );
    }
    held = true;
  }
  const release = async (): Promise<void> => {
    if (lock && held) await lock.release(lockKey, lockHolder).catch(() => undefined);
  };

  /** Written guards, rolled back by hand if the signature never happens. */
  const takenLegs: string[] = [];
  let takenWeek: string | null = null;
  let reserved: { week: string; amount: number } | null = null;
  const rollBack = async (): Promise<void> => {
    for (const purchaseId of takenLegs) {
      await env.COUNTERS.delete(KV_KEYS.studyLeg(purchaseId)).catch(() => undefined);
    }
    if (takenWeek) await env.COUNTERS.delete(takenWeek).catch(() => undefined);
    if (reserved) {
      const spent = await studyWeekSpent(env, reserved.week).catch(() => null);
      if (spent !== null) {
        await kvPut(
          env.COUNTERS,
          KV_KEYS.studyBudget(reserved.week),
          String(Math.max(0, Math.round((spent - reserved.amount) * 100) / 100)),
        ).catch(() => undefined);
      }
    }
    await release();
  };

  try {
    // Our own books, leg by leg. No trust is extended here at all.
    const legs: StudyLeg[] = [];
    for (const leg of legInputs) legs.push(await verifyLeg(env, record, leg));

    if (!legs.some((leg) => leg.observed.settled)) {
      throw new StudyRefused(
        "not one cited purchase settled in our books, so there is nothing here this store verified. If a purchase was ABANDONED that is a finding and we want it — put it in `abandoned` and cite the legs that did settle; the study then pays in full.",
      );
    }

    /*
     * ONE PURCHASE, ONE STUDY, EVER. Claimed by writing the key and
     * reading it back — the same narrow-the-window guard the board's
     * transaction key uses, and it is NOT a mutex either: KV is
     * last-write-wins with edge-cached reads. What bounds the real
     * race is the Durable Object lock above; this bounds the case the
     * lock cannot see, which is the same purchase cited by two
     * DIFFERENT studies.
     */
    for (const leg of legs) {
      if (!leg.observed.settled) continue;
      const key = KV_KEYS.studyLeg(leg.purchase_id);
      const existing = await kvGet(env.COUNTERS, key);
      if (existing && existing !== record.study_id) {
        throw new StudyRefused(
          `purchase ${leg.purchase_id.slice(0, 16)}… was already counted by study ${existing}. One purchase, one study, ever — cite the legs this study bought.`,
        );
      }
      if (!existing) {
        await kvPut(env.COUNTERS, key, record.study_id);
        takenLegs.push(leg.purchase_id);
      }
    }

    // One study per wallet per ISO week: the coverage this sells is
    // the number of DIFFERENT agents, never the number of rows.
    const weekKey = currentWeekKey(now);
    const walletKey = KV_KEYS.studyWeekPayout(weekKey, payoutTo);
    const already = await kvGet(env.COUNTERS, walletKey);
    if (already && already !== record.study_id) {
      throw new StudyRefused(
        `this payout address already debriefed a study this ISO week (${already}). One study per wallet per week — ten studies from one wallet is one perspective bought ten times. The enrolment stands; debrief it when the week turns over.`,
      );
    }
    if (!already) {
      await kvPut(env.COUNTERS, walletKey, record.study_id);
      takenWeek = walletKey;
    }

    // Rule 3, outbound: the address OUR money goes to, screened, fail
    // closed. Read over the same endpoint ladder the board uses — a
    // 429 from the public endpoint alone refused every bounty claim
    // for ninety minutes on 2026-09-03 while the keyed ones sat idle.
    const screen = options.screen ?? oracleScreen(rpcEndpoints(env), options.fetch ?? fetch);
    const screened = await screen(payoutTo);
    if (screened.listed !== false) {
      if (screened.listed === null) {
        await raiseScreenUnavailable(env, `study debrief ${record.study_id}`, screened.source);
      }
      throw new StudyRefused(
        screened.listed === true
          ? `the payout address is identified on the sanctions screen (${screened.source}); the debrief stands unpaid and the refusal is recorded`
          : `the sanctions screen did not answer (${screened.source}) and the rule fails closed — present the debrief again when it does. The enrolment stands and nothing is lost.`,
      );
    }

    const reward = studyReward(legs, scenario);
    const spent = await studyWeekSpent(env, weekKey);
    if (spent + reward.total_usd > STUDY_WEEKLY_BUDGET_USD) {
      throw new StudyRefused(
        `this week's field-study budget ($${STUDY_WEEKLY_BUDGET_USD}, kept apart from the bounty board's own) has $${Math.round((STUDY_WEEKLY_BUDGET_USD - spent) * 100) / 100} left and this debrief earns $${reward.total_usd}. It reopens with the ISO week; your enrolment lapses before then, so enrol again on Monday and the same shopping counts.`,
      );
    }
    // RESERVE, THEN SIGN. Written after the signature this counter
    // lost every concurrent increment but one, so the weekly cap
    // bounded nothing and the room published a figure below what had
    // actually been paid. The board fixed it here; so does this.
    reserved = { week: weekKey, amount: reward.total_usd };
    await kvPut(
      env.COUNTERS,
      KV_KEYS.studyBudget(weekKey),
      String(Math.round((spent + reward.total_usd) * 100) / 100),
    );

    const signer = options.signer ?? (await fieldSignerFromKey(env.FIELD_WALLET_KEY as string));
    const authorization = {
      from: signer.address,
      to: payoutTo,
      value: String(Math.round(reward.total_usd * 1e6)),
      validAfter: "0",
      validBefore: String(Math.floor(now.getTime() / 1000) + STUDY_AUTH_VALID_SECONDS),
      nonce: (options.randomNonce ?? defaultNonce)(),
    };
    const signature = await signer.signTypedData({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: BASE_USDC as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });

    const debriefed: StudyRecord = {
      ...record,
      // The address that was actually paid, whichever door supplied it.
      payout_to: payoutTo,
      status: "debriefed",
      debrief: {
        at: now.toISOString(),
        answers,
        ...(scenarioAnswers ? { scenario_answers: scenarioAnswers } : {}),
        legs,
        ...(defects.length > 0 ? { defects } : {}),
        reward_usd: reward.total_usd,
        reward_breakdown: reward,
        authorization_nonce: authorization.nonce,
        authorization_valid_before: authorization.validBefore,
      },
    };
    await saveStudy(env, debriefed);
    await release();

    const mismatches = legs.filter((leg) => leg.mismatch).length;
    return {
      study_id: record.study_id,
      reward_usd: reward.total_usd,
      reward_breakdown: reward,
      legs,
      what_was_verified: `Our own part: ${legs.filter((leg) => leg.observed.settled).length} of ${legs.length} cited purchases are settled rows in this store's books, opened with the private status tokens we issued you at the till. The door, the payment protocol, the rail, the path and the timestamp on each are OURS — read off our record, not off your report — and the reward was computed from those alone.${mismatches > 0 ? ` ${mismatches} leg${mismatches === 1 ? "" : "s"} declared a surface our books recorded differently; both readings are kept, it cost you nothing, and it is itself a finding.` : ""}`,
      what_was_not:
        "Your answers. Every one of them is recorded verbatim as YOUR claim and none of it was graded — this store did not watch you shop and does not pretend to. Completeness was checked; quality never was, because a store that paid more for answers it liked would be buying the answers it wanted and calling the result research.",
      your_answers_are: `Recorded against study ${record.study_id} and destined for the field-study room in aggregate. What is published is the shape of the answers across studies, never a roster of who said what: the model, the harness and the autonomy are columns; your operator string and your free text are not republished beside your wallet.`,
      ...(scenario && reward.scenario
        ? {
            scenario: {
              id: scenario.id,
              title: scenario.title,
              target_met: reward.scenario.target_met,
              bonus_usd: reward.scenario.bonus_usd,
              how: reward.scenario.how,
            },
          }
        : {}),
      defects_recorded: defects.length,
      payout: {
        method: "eip3009_transfer_with_authorization",
        asset: BASE_USDC,
        chain: "eip155:8453",
        authorization,
        signature,
        how_to_redeem: `Submit transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature) on the USDC contract (${BASE_USDC}) on Base — from your own wallet or any relayer; the function is submittable by anyone. Valid until unix ${authorization.validBefore}; unredeemed, it expires on its own and the budget takes it back. The signature is the payment — treat it like cash.`,
      },
    };
  } catch (error) {
    await rollBack();
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * THE SCENARIO SHELF                                                   *
 * ------------------------------------------------------------------ */

/**
 * A scenario the keeper has put live. The DEFINITION is code and never
 * KV — only the opening is stored, so a scenario cannot be edited into
 * existence at runtime and closing one deletes a key rather than
 * mutating a definition somebody is mid-walk on.
 */
export interface OpenScenario {
  scenario_id: string;
  opened_at: string;
  expires_at: string;
}

/** A live scenario, with the definition read back off the shelf. */
export interface LiveScenario extends OpenScenario {
  scenario: StudyScenario;
}

/**
 * PUT ONE LIVE. The keeper's hand only (the admin route is the single
 * caller), and it is one button because there is nothing to decide: a
 * scenario is already written, already priced, and already says what
 * it can and cannot verify. Re-opening a live one extends it rather
 * than refusing — the button is meant to be safe to press twice.
 */
export async function openScenario(
  env: Env,
  scenarioId: string,
  now: Date = new Date(),
  days: number = STUDY_SCENARIO_DAYS,
): Promise<OpenScenario> {
  const scenario = scenarioById(scenarioId);
  if (!scenario) {
    throw new StudyRefused(
      `no scenario is called \`${scenarioId}\`. The shelf is code (store/study-scenarios.ts), so a scenario that is not written cannot be opened — which is the point.`,
    );
  }
  const record: OpenScenario = {
    scenario_id: scenario.id,
    opened_at: now.toISOString(),
    expires_at: new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString(),
  };
  await kvPut(
    env.COUNTERS,
    KV_KEYS.studyScenario(scenario.id),
    JSON.stringify(record),
  );
  return record;
}

/**
 * TAKE ONE DOWN. Studies already enrolled under it are untouched and
 * still debrief normally — closing a scenario stops new enrolments,
 * it does not cancel a walk somebody is halfway through with their own
 * money.
 */
export async function closeScenario(env: Env, scenarioId: string): Promise<void> {
  await env.COUNTERS.delete(KV_KEYS.studyScenario(scenarioId));
}

/** Every scenario live right now, in the shelf's own order. */
export async function liveScenarios(
  env: Env,
  now: Date = new Date(),
): Promise<LiveScenario[]> {
  const keys = STUDY_SCENARIOS.map((scenario) =>
    KV_KEYS.studyScenario(scenario.id),
  );
  const rows = await bulkGetJson<OpenScenario>(env.COUNTERS, keys);
  const live: LiveScenario[] = [];
  for (const scenario of STUDY_SCENARIOS) {
    const row = rows.get(KV_KEYS.studyScenario(scenario.id));
    if (!row) continue;
    // Derived from the clock on every read, never from a sweep: a
    // stored "open" that nothing flipped is a listing that refuses the
    // enrolment it advertised.
    if (new Date(row.expires_at).getTime() <= now.getTime()) continue;
    live.push({ ...row, scenario });
  }
  return live;
}

/** One live scenario by id, or null. Used at the enrolment door. */
export async function liveScenario(
  env: Env,
  scenarioId: string,
  now: Date = new Date(),
): Promise<StudyScenario | null> {
  const row = await kvGetJson<OpenScenario>(
    env.COUNTERS,
    KV_KEYS.studyScenario(scenarioId),
  );
  if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return null;
  return scenarioById(scenarioId);
}

/**
 * THE WHOLE SHELF WITH ITS STATE, for the keeper's desk: every
 * scenario that exists, live or not, so the buttons can be drawn
 * beside the ones already pressed.
 */
export async function scenarioShelf(
  env: Env,
  now: Date = new Date(),
): Promise<
  Array<{ scenario: StudyScenario; live: boolean; expires_at?: string }>
> {
  const keys = STUDY_SCENARIOS.map((scenario) =>
    KV_KEYS.studyScenario(scenario.id),
  );
  const rows = await bulkGetJson<OpenScenario>(env.COUNTERS, keys);
  return STUDY_SCENARIOS.map((scenario) => {
    const row = rows.get(KV_KEYS.studyScenario(scenario.id));
    const live = Boolean(row) && new Date(row!.expires_at).getTime() > now.getTime();
    return {
      scenario,
      live,
      ...(row ? { expires_at: row.expires_at } : {}),
    };
  });
}

/**
 * THE BOARD, AS THE PUBLIC SEES IT.
 *
 * WHAT IS NOT HERE, and the ruling behind it: no roster. The bounty
 * board publishes every listing because a listing is an offer nobody
 * has accepted yet. A study record is a stranger's stated intent, the
 * model they are running, who operates them, and a wallet — published
 * together that is a dossier, and this store has no business keeping
 * one in the window. So the room gets the SHAPE of the studies (how
 * many, on which harnesses, how much is left in the week) and the
 * findings in aggregate, and never a row you could read one
 * researcher out of.
 *
 * What a would-be researcher actually needs from this page is three
 * numbers — is the instrument open, how much is left this week, and
 * what does a study pay — and all three are here.
 */
export async function fieldStudyBoard(env: Env, now: Date = new Date()) {
  const records = await listStudyRecords(env);
  const weekKey = currentWeekKey(now);
  const spent = await studyWeekSpent(env, weekKey).catch(() => 0);
  const dated = records.map((record) => ({
    ...record,
    status: studyStatusAt(record, now),
  }));
  const debriefed = dated.filter((record) => record.status === "debriefed");
  const open = dated.filter((record) => record.status === "enrolled");
  const paidUsd =
    Math.round(debriefed.reduce((sum, r) => sum + (r.debrief?.reward_usd ?? 0), 0) * 100) / 100;
  return {
    as_of: now.toISOString(),
    payouts_enabled: Boolean(env.FIELD_WALLET_KEY),
    week: weekKey,
    weekly_budget_usd: STUDY_WEEKLY_BUDGET_USD,
    spent_this_week_usd: Math.round(spent * 100) / 100,
    remaining_this_week_usd: Math.round((STUDY_WEEKLY_BUDGET_USD - spent) * 100) / 100,
    reward_ceiling_usd: STUDY_MAX_REWARD_USD,
    window_hours: STUDY_WINDOW_HOURS,
    studies_enrolled_now: open.length,
    studies_debriefed_all_time: debriefed.length,
    paid_all_time_usd: paidUsd,
    /**
     * The roster is deliberately absent — see above. These are the
     * columns, counted, which is the whole of what a reader can learn
     * from other people's studies without learning who they were.
     */
    harnesses: countBy(debriefed.map((r) => r.roster.harness)),
    autonomy: countBy(debriefed.map((r) => r.roster.autonomy)),
    models: countBy(debriefed.map((r) => r.roster.model)),
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

/** Every study record, for the keeper's desk alone. Tokens never ride. */
export async function allStudies(env: Env, now: Date = new Date()): Promise<StudyRecord[]> {
  const records = await listStudyRecords(env);
  return records
    .map((record) => ({ ...record, status: studyStatusAt(record, now) }))
    .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
}

/** One study by id, for the researcher's own read-back. Token required. */
export async function readOwnStudy(
  env: Env,
  studyId: unknown,
  token: unknown,
  now: Date = new Date(),
): Promise<StudyRecord | null> {
  if (typeof studyId !== "string" || !/^sty_[a-f0-9]{16}$/.test(studyId)) return null;
  const record = await kvGetJson<StudyRecord>(env.COUNTERS, KV_KEYS.study(studyId));
  if (!record || !(await tokenOpens(record, token))) return null;
  return { ...record, status: studyStatusAt(record, now) };
}
