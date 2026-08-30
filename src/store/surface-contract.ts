import type { MenuItem } from "@/types";

/**
 * THE SURFACE CONTRACT, AS SHARED PARTS (house rule 57, sweep begun
 * 2026-08-29).
 *
 * Rule 57 binds every surface here to answer five questions. /doors
 * was built to it and nothing else was, so the sweep started at the
 * three free doors an agent meets before it ever pays us — and found
 * the same three holes in all of them, in the three best-documented
 * files in the repository:
 *
 *   57.3  Each door's "ladder" names paid rungs by URL with NO price
 *         and NO cadence. A buying agent reading the free tool's own
 *         documentation could not learn what the next rung costs or
 *         whether it recurs without leaving and going to the shelf.
 *   57.4  Every one of them documents the failures it finds in OTHER
 *         people's endpoints, in detail, by name. None documented the
 *         errors IT returns. A caller's own failure path was the one
 *         thing these files did not cover.
 *   57.5  No security paragraph anywhere: what the door reads, what it
 *         stores, what it never stores, what it does in your name.
 *         Pieces of it were true and buried inside rate_limit prose.
 *
 * These are the shared parts, so the answers are the same everywhere
 * and a fourth door inherits them rather than reinventing them
 * slightly differently. What is NOT shared is each door's own
 * substance — its checks, its limits, its conflict of interest. A
 * template that wrote those would be a template writing copy.
 */

/** One named failure a caller can branch on without reading English. */
export interface DoorError {
  /** Stable across versions. The thing a small model matches on. */
  code: string;
  http: number;
  means: string;
  /** Not what it is — what the caller should DO. */
  what_to_do: string;
}

/**
 * THE FAILURES OF ANY DOOR THAT DIALS A URL YOU NAMED, and the reason
 * they are worth naming rather than describing: every one of these
 * currently reaches a caller as an English sentence in `error`, which
 * a small model has to pattern-match on prose that we are free to
 * improve at any time. The codes are additive — the sentences are
 * unchanged and still served — so nothing that reads the old shape
 * breaks, and anything that wants to branch can stop guessing.
 */
export const PROBE_DOOR_ERRORS: readonly DoorError[] = [
  {
    code: "url_missing",
    http: 400,
    means: "no url was supplied, or the body was not JSON at all",
    what_to_do:
      'POST {"url": "https://your-endpoint/..."} with Content-Type: application/json. Retrying the same body will fail identically.',
  },
  {
    code: "url_unparseable",
    http: 400,
    means: "the string supplied is not a URL",
    what_to_do: "Fix the string. This is never a fact about the endpoint.",
  },
  {
    code: "target_refused",
    http: 400,
    means:
      "the URL is real but this store's published probe-target law refuses it: https only, default port, no credentials, and nothing private, loopback, link-local or reserved-internal",
    what_to_do:
      "Name a public https URL on its default port. The refusal is a statement about US and never an observation about that host — we did not look.",
  },
  {
    code: "own_host_refused",
    http: 400,
    means:
      "the URL is this store's own hostname, which a Cloudflare Worker cannot fetch",
    what_to_do:
      "Probe us from your side instead; our own 402s pass these checks in CI on every build and you should not take that on faith.",
  },
  {
    code: "budget_spent",
    http: 429,
    means:
      "the probe budget for this minute is spent — a cost bound on our side, never a fact about your endpoint",
    what_to_do:
      "Read Retry-After (a whole minute) or the RateLimit fields beside it, and come back. Do not treat this as a verdict.",
  },
] as const;

/*
 * `ladderRung` USED TO LIVE HERE AND HAD TO MOVE (2026-08-29).
 *
 * It needs the menu and priceLine, so this file imported
 * services/menu-markdown — which imports store/metadata, which
 * imports store/identity-lead, which calls cheapestUsdc() over
 * MENU_ITEMS at module-init time. Adding that edge from
 * services/conformance.ts closed a cycle: seventeen test FILES
 * stopped loading with "Cannot read properties of undefined (reading
 * 'reduce')" — MENU_ITEMS was still undefined when metadata ran.
 *
 * TypeScript could not see it and neither could a single spec run;
 * only the full gates did. So the price-derived helper lives in
 * menu-markdown.ts, where those imports already exist and are already
 * safe, and this file keeps only what needs nothing: the error
 * catalogue, the house's security sentences, and the clauses.
 * Import ladderRung from "@/services/menu-markdown".
 */

export interface SecurityBlock {
  what_this_does_in_your_name: string;
  what_it_stores_about_you: string;
  what_we_never_do: string;
  standards: string;
  reporting: string;
}

/**
 * WHAT THIS STORE HOLDS ITSELF TO, said once (57.5).
 *
 * The last three clauses are the same on every door because they are
 * facts about the house, not about the tool. The first two differ per
 * door and are passed in, because a door that dials a URL in your
 * name owes a different sentence than one that verifies bytes you
 * already had.
 */
export function securityBlock(
  base: string,
  parts: { does_in_your_name: string; stores: string },
): SecurityBlock {
  return {
    what_this_does_in_your_name: parts.does_in_your_name,
    what_it_stores_about_you: parts.stores,
    what_we_never_do:
      "No account, no cookie, no caller identifier, and no allocation of our budgets by IP — the buckets bound our cost rather than ranking callers, which is a trade we would rather state than hide. We do not sell, share or publish what any caller asked us about; the weekly census is a separate instrument that walks public discovery feeds, never this door's traffic.",
    standards:
      "Disclosure is private-first and symmetric: an operator hears from us before the public does, and the same rule binds us when the defect is ours. Corrections are dated and public, never silent edits. Every signed artifact verifies offline against a published key, so you never have to ask us whether a document of ours is real.",
    reporting: `${base}/.well-known/security.txt for a vulnerability, ${base}/corrections for something we got wrong.`,
  };
}

/**
 * The clauses themselves, as data, so the guard and any surface that
 * wants to publish the standard read one list rather than two.
 */
export const CONTRACT_CLAUSES = [
  { clause: "57.1", asks: "findable from any door an agent reads" },
  { clause: "57.2", asks: "says what it is and what it is for, without narrowing the use case" },
  { clause: "57.3", asks: "free or paid, with the amount and the cadence" },
  { clause: "57.4", asks: "the call, the expected outcome, and the errors by name with what to do" },
  { clause: "57.5", asks: "what it does in your name, what it stores, and what we hold ourselves to" },
] as const;

/* ------------------------------------------------------------------ */
/* THE PAID SHELF'S HALF OF THE SAME CONTRACT (2026-08-30).            */
/* ------------------------------------------------------------------ */

/**
 * WHY THIS DERIVES, AND WHY IT SPEAKS THE VOCABULARY ABOVE.
 *
 * Measured 2026-08-30: every one of the 26 shelf items answered ZERO
 * of 57.2, 57.4 and 57.5. Price and cadence were covered everywhere —
 * the type system has required them since the rule was adopted — and
 * what an agent gets back, what can go wrong, and what we hold
 * ourselves to were published nowhere per item.
 *
 * The obvious fix is four paragraphs per item. That is 104 sentences
 * about code paths, each able to go stale alone, on a shelf where the
 * buy path is ONE code path with per-item inputs — the shape AT_SCALE
 * rule 1 exists for. So every sentence here is computed from facts
 * the item already carries: its input schema, its fulfillment class,
 * its inventory, its term, and what it reads.
 *
 * It reuses DoorError and securityBlock rather than growing a second
 * set of names for the same promises. A store whose paid shelf and
 * free instruments describe safety in two different schemas has
 * two copies of one promise, which is how one of them goes stale
 * arguing with the other.
 *
 * WHAT THAT COSTS, stated: a derived sentence is general. It cannot
 * say the one interesting thing about a particular door the way a
 * hand-written one can. The per-item colour already exists elsewhere
 * — description, note_402, constraints, spec.why_use — and this does
 * not replace it. It answers the questions none of those did.
 */

interface PaidDoorFacts {
  required: string[];
  reads: MenuItem["reads"];
  fetchesSubject: boolean;
  humanQueue: boolean;
  limited: boolean;
}

function doorFacts(
  schema: { properties?: Record<string, unknown>; required?: string[] },
  item: MenuItem,
): PaidDoorFacts {
  return {
    required: [...(schema.required ?? [])],
    reads: item.reads,
    fetchesSubject:
      item.reads === "subject_fetch" || item.reads === "subject_purchase",
    humanQueue: item.fulfillment === "human_queue",
    limited: item.weekly_inventory !== undefined || item.stocked === true,
  };
}

/**
 * What each class actually reaches, in one sentence a buyer can act
 * on — the paid shelf's answer to `what_this_does_in_your_name`.
 *
 * THE FIRST VERSION DERIVED THIS FROM THE INPUT SCHEMA and was wrong
 * on its first run: a url or host property was taken to mean a knock,
 * and spot_check takes a host and deliberately does NOT knock, which
 * its own description says out loud. A guessed safety claim is worse
 * than an absent one, so MenuItem.reads is a stated fact, required by
 * the type, established from each fulfillment service's import graph.
 */
const READS_SENTENCE: Record<MenuItem["reads"], string> = {
  subject_fetch:
    "One unauthenticated outbound GET from our infrastructure to the endpoint you name — no credentials of yours, nothing of yours forwarded to it, and never a private, loopback or link-local address, nor our own hostname.",
  subject_purchase:
    "One unauthenticated outbound GET to the endpoint you name, and a real payment against it from this store's own field wallet — the strongest thing anything here does. Your money is not spent: the field wallet is ours, the cap is ours, and what you buy is the signed record of what happened when we walked your door for real.",
  chain_read:
    "Public chain state for the identifier you give — a transaction, an address window — read from a public RPC. No request is made to any endpoint of yours and nothing of yours is sent anywhere.",
  our_books:
    "Nothing, outside this store. It reads our own signed records at the counter, so the answer is as fresh as our last round and no fresher, and it says exactly when that was.",
  made_here:
    "Nothing at all. The good is produced here from what you sent, and no request leaves this store to make it.",
};

function expectedOutcome(item: MenuItem, facts: PaidDoorFacts): string {
  const delivery = facts.humanQueue
    ? `HTTP 200 and a queue ticket with an order id and the URL that reports its status. A human does the work inside ${String(item.sla_hours ?? 168)} hours; miss that window and the keeper refunds you himself.`
    : "HTTP 200, the goods themselves, and an ed25519 certificate in the same response — no second call, no polling.";
  const term =
    item.term_days === undefined
      ? ""
      : ` The purchase covers a ${String(item.term_days)}-day term as one payment; nothing renews it by itself, because there is no mechanism here that could.`;
  return `${delivery}${term} Every delivery carries a signed certificate, a sequential patron number, a badge URL and a verify URL that is free to call forever, by anyone, without asking us. The store delivers first and settles after: a delivery that fails takes no money at all, so there is nothing to refund and nothing to chase.`;
}

function whatYouCanUseItFor(task: string | undefined): string {
  const built = task
    ? `The case it was built for: ${task.charAt(0).toLowerCase()}${task.slice(1)}.`
    : "";
  return `${built} Nothing about the artifact restricts you to that. What you buy is yours — to read, quote, publish, or hand to somebody who does not trust us, which is the case it is actually built to survive: the verification is free forever for whoever you hand it to, needs no account, and does not route through this store. There is no use case we are reserving.`.trim();
}

function doorErrors(facts: PaidDoorFacts): DoorError[] {
  const errors: DoorError[] = [
    {
      code: "payment_required",
      http: 402,
      means:
        "you have not paid yet. This is the door working: the response carries the x402 challenge with every accept you may sign against",
      what_to_do:
        "Read the PAYMENT-REQUIRED header (base64 JSON) or the body's accepts array, sign one, and call again with the payment attached. A 402 is never an error to retry unchanged.",
    },
  ];
  if (facts.required.length > 0) {
    errors.push({
      code: "missing_input",
      http: 400,
      means: `a required parameter was absent or empty — this door needs ${facts.required.join(", ")}`,
      what_to_do: `Send ${facts.required.join(" and ")} as query parameters. Nothing is charged for a refused call: the check runs before any payment is taken, which is why the message says so.`,
    });
    errors.push({
      code: "input_refused",
      http: 400,
      means:
        "a parameter was present but failed this door's own constraints — the listing's constraints array is the full list, and the message names the one that failed",
      what_to_do:
        "Read the sentence; it names the constraint rather than the field. Nothing was charged.",
    });
  }
  if (facts.fetchesSubject) {
    errors.push({
      code: "subject_refused",
      http: 403,
      means:
        "the endpoint you named is one this store will not fetch — a private, loopback or link-local address, or our own hostname",
      what_to_do:
        "Give a public address on the open internet. We refuse private ranges so a paid door cannot be used to probe somebody's internal network, and we refuse ourselves because a store grading itself is not evidence.",
    });
  }
  if (facts.limited) {
    errors.push({
      code: "sold_out",
      http: 409,
      means:
        "the shelf is empty. This is an honest zero, not a queue: nothing was charged and no order was created",
      what_to_do:
        "The body carries the waitlist URL. A sold-out shelf refuses the sale outright rather than taking money against stock that does not exist.",
    });
  }
  errors.push({
    code: "unknown_item",
    http: 404,
    means: "no item by that id is on the shelf, or it was retired",
    what_to_do:
      "The body carries the menu URL and the request URL. A retired item answers with the date it retired and why, rather than pretending it never existed.",
  });
  return errors;
}

/**
 * Rule 57's remaining answers for one shelf item, computed.
 *
 * Served on the item's own page rather than in menu.json: the
 * catalogue is already 130KB and this would grow it by a third to say
 * the same thing 26 times. menu.json carries listing_url on every
 * entry so the deeper contract is one hop from the shelf, which is
 * what 57.1 asks for.
 */
export function paidDoorContract(
  item: MenuItem,
  schema: { properties?: Record<string, unknown>; required?: string[] },
  task: string | undefined,
  base: string,
): Record<string, unknown> {
  const facts = doorFacts(schema, item);
  return {
    what_you_can_use_it_for: whatYouCanUseItFor(task),
    expected_outcome: expectedOutcome(item, facts),
    errors: doorErrors(facts),
    security: securityBlock(base, {
      does_in_your_name: `${READS_SENTENCE[facts.reads]} This store never asks for a credential, a key, or a wallet secret, and has no field that could hold one: payment is an x402 signature you produce, and we never see anything that could spend on your behalf.`,
      stores: `The order — what was bought, when, the certificate minted for it, and a sequential patron number — because that record IS the artifact you paid for and the thing your verify URL resolves. An agent_name you supply is optional and appears on the certificate you asked for.${facts.humanQueue ? " A callback_url, if you give one, is used to tell you the work is done and for nothing else. Anything you write in `detail` is recorded exactly as written and read by a human, never treated as instructions to a machine." : ""}`,
    }),
  };
}
