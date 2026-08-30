/*
 * FROM THE INDEX, NOT FROM @/store/menu, AND THE ORDER IS LOAD-BEARING.
 *
 * @/store/menu reaches @/services/launch-check through the utility
 * shelf, which reaches back into @/store — so a module that enters
 * the shelf BEFORE the index inverts the store's own initialization
 * order and MENU_ITEMS is undefined when metadata reads it. Four test
 * files went red the moment this file imported the shelf directly.
 * The index is the safe entrance; the cycle is older than this file.
 */
import { getMenuItem } from "@/store";
import type { MenuItem } from "@/types";
import { cadenceLine, priceLine } from "@/services/menu-markdown";

/**
 * THE FIVE ANSWERS RULE 57 REQUIRES, AS A SHAPE THREE DOORS SHARE.
 *
 * Rule 57 says every surface owes an agent five things: findable from
 * any door; what it is and what it is FOR without narrowing the use
 * case; free or paid with the amount and the cadence; instructions a
 * Haiku-class model completes on the first try, with errors named and
 * actionable; and what we hold ourselves to on safety.
 *
 * docs/SURFACE_CONTRACT_2026-08.md recorded, the evening the rule was
 * adopted, that 57.2, 57.4 and 57.5 were held against /doors and
 * nowhere else, and named the sweep owed: the free doors an agent
 * meets BEFORE it pays, first. This is that sweep's shared half.
 *
 * WHAT IS SHARED AND WHAT IS NOT. The house-wide safety clauses are
 * shared, because they are promises about the house rather than about
 * a door — two copies of one promise is how one of them goes stale
 * arguing with the other. Everything a door-specific answer needs
 * stays door-specific and is REQUIRED by the type, so a new
 * instrument cannot get the shape by importing it and leave the
 * substance blank.
 *
 * The paid rungs derive from the menu. A free instrument that names
 * its paid neighbour is quoting a price, and a quoted price at this
 * store is read off the shelf or it is not quoted.
 */

/** One named failure a caller can actually do something about. */
export interface SurfaceError {
  /** The stable name. A code is what a client branches on. */
  code: string;
  /** The status it arrives with. */
  http: number;
  /** What happened, in a sentence. */
  means: string;
  /**
   * THE HALF THAT MAKES IT A CATEGORY RATHER THAN A LABEL. Rule 57.4
   * asks for errors a small model can act on; "invalid_url" with no
   * next step is a name, not an instruction.
   */
  what_to_do: string;
}

export interface SurfaceSecurity {
  /** What this door reads, including anything it fetches for you. */
  what_this_surface_reads: string;
  /** What it keeps. "Nothing" where that is true, and only there. */
  what_it_stores_about_you: string;
  /** What the data IS — how it was come by, and from whom. */
  what_the_data_is: string;
  /**
   * Whether the answer is signed, and what to do if you need it to
   * be. A free live read is not a signed artifact and must not be
   * described as one.
   */
  integrity: string;
  /** House-wide. Filled by surfaceSecurity. */
  standards: string;
  /** House-wide. Filled by surfaceSecurity. */
  reporting: string;
}

/**
 * The two clauses that are about the house, not the door. Written
 * once here and served everywhere, for the reason the CONTENT_SIGNAL
 * constant gives one file over: two hand-typed copies of a policy
 * line is how one of them goes stale arguing with the other.
 */
const STANDARDS =
  "Disclosure is private-first and symmetric — an operator hears from us before the public does, and we hold ourselves to the same rule when the defect is ours. Corrections are dated and public, never silent. An operator who proves control of a door can attach a standing note that rides beside our observation everywhere it appears.";

const REPORTING =
  "/.well-known/security.txt, and the corrections desk at /corrections takes anything we got wrong — including anything this door told you.";

export function surfaceSecurity(
  specific: Omit<SurfaceSecurity, "standards" | "reporting">,
): SurfaceSecurity {
  return { ...specific, standards: STANDARDS, reporting: REPORTING };
}

/**
 * Clause 57.3 for a door that charges nothing: the amount, the
 * cadence, and — because "free" invites the question — what money
 * buys instead, priced off the shelf rather than typed here.
 *
 * `rungs` names the paid items that answer the SAME question with a
 * signed artifact behind it. An id the menu does not carry is
 * dropped rather than rendered as a broken promise.
 */
export function freeInstrumentPrice(
  base: string,
  rungs: readonly { id: string; instead: string }[],
  /**
   * What the shelf does NOT sell above this door, when a reader would
   * reasonably expect it to. Pointing at an item that answers a
   * different question is worse than admitting the rung is absent.
   */
  notSold?: string,
): Record<string, unknown> {
  return {
    ...(notSold === undefined ? {} : { what_is_not_sold: notSold }),
    this_surface: "free",
    amount: "$0.00",
    cadence:
      "not applicable — nothing is charged for calling this, at any frequency, now or later. There is no metered tier above it and no key that unlocks more of it.",
    what_money_buys:
      "Our labour on the answer, never the answer itself. Every rung below is a separate one-off or term purchase; nothing at this store charges twice by itself.",
    if_you_want_it_signed: rungs.flatMap(({ id, instead }) => {
      const item = getMenuItem(id);
      if (!item) return [];
      return [
        {
          id: item.id,
          name: item.name,
          instead,
          price: `${priceLine(item)}, ${cadenceLine(item)}`,
          price_usdc: item.price_usdc,
          cadence: item.cadence,
          ...(item.term_days === undefined ? {} : { term_days: item.term_days }),
          buy_url: `${base}/api/buy/${item.id}`,
        },
      ];
    }),
  };
}

/* ------------------------------------------------------------------ */
/* THE PAID SHELF'S HALF OF RULE 57 — derived, because 26 hand-written */
/* safety paragraphs is 26 chances to describe a code path wrongly.    */
/* ------------------------------------------------------------------ */

/**
 * WHY THIS DERIVES AND DOES NOT READ FROM A TABLE.
 *
 * Measured 2026-08-30: every one of the 26 shelf items answered 0 of
 * rule 57's remaining four questions. The obvious fix — write four
 * paragraphs per item — is 104 sentences about code paths, each one
 * able to go stale on its own, on a shelf where the buy path is ONE
 * code path with per-item inputs. That is the shape AT_SCALE rule 1
 * exists for.
 *
 * So every sentence below is computed from facts the item already
 * carries and the store already serves: its input schema, its
 * fulfillment class, its inventory, its term. An item added tomorrow
 * answers all four the day it is listed, and an item whose
 * fulfillment changes gets a new answer without anybody re-reading a
 * paragraph.
 *
 * WHAT THAT COSTS, stated: a derived sentence is general. It cannot
 * say the one interesting thing about a particular door the way a
 * hand-written one can. The per-item colour already exists elsewhere
 * — description, note_402, constraints, spec.why_use — and this does
 * not replace it. It answers the four questions none of those did.
 */

/**
 * WHAT THE FIRST ATTEMPT GOT WRONG, kept because it is the argument
 * for the field that replaced it.
 *
 * This derived "does it fetch your subject" from the input schema —
 * a url or host property meant a knock. It failed on its first run:
 * spot_check takes a host and deliberately does NOT knock, reading
 * the books at the counter, which its own description says out loud.
 * The guard caught a safety claim that was about to be published
 * backwards on several listings.
 *
 * A guessed safety claim is worse than an absent one, so what the
 * door reads is a STATED fact on the item now (MenuItem.reads),
 * required by the type, established from each fulfillment service's
 * import graph and re-checkable the same way.
 */
interface PaidDoorFacts {
  required: string[];
  optional: string[];
  reads: MenuItem["reads"];
  fetchesSubject: boolean;
  humanQueue: boolean;
  limited: boolean;
}

function doorFacts(schema: {
  properties?: Record<string, unknown>;
  required?: string[];
}, item: MenuItem): PaidDoorFacts {
  const properties = Object.keys(schema.properties ?? {});
  const required = [...(schema.required ?? [])];
  return {
    required,
    optional: properties.filter((name) => !required.includes(name)),
    reads: item.reads,
    fetchesSubject:
      item.reads === "subject_fetch" || item.reads === "subject_purchase",
    humanQueue: item.fulfillment === "human_queue",
    limited: item.weekly_inventory !== undefined || item.stocked === true,
  };
}

/** What each class actually reaches, in one sentence a buyer can act on. */
const READS_SENTENCE: Record<MenuItem["reads"], string> = {
  subject_fetch:
    "The parameters you send, and one unauthenticated request from our infrastructure to the endpoint you name — no credentials of yours, nothing of yours forwarded to it, and never a private, loopback or link-local address, nor our own hostname.",
  subject_purchase:
    "The parameters you send, one unauthenticated request to the endpoint you name, and a real payment against it from this store's own field wallet — the strongest thing anything here does. Your money is not spent: the field wallet is ours, the cap is ours, and what you buy is the signed record of what happened when we walked your door for real.",
  chain_read:
    "The parameters you send, and public chain state for the identifier you give — a transaction, an address window — read from a public RPC. No request is made to any endpoint of yours and nothing of yours is sent anywhere.",
  our_books:
    "The parameters you send, and this store's own signed records, read at the counter. It makes no outbound request at all: the answer is as fresh as our last round and no fresher, and it says exactly when that was.",
  made_here:
    "What you send, and nothing else. It makes no outbound request at all — the good is produced here from your own input.",
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

function whatYouCanUseItFor(item: MenuItem, task: string | undefined): string {
  const built = task
    ? `The case it was built for: ${task.charAt(0).toLowerCase()}${task.slice(1)}.`
    : "";
  return `${built} Nothing about the artifact restricts you to that. What you buy is yours — to read, quote, publish, or hand to somebody who does not trust us, which is the case it is actually built to survive: the verification is free forever for whoever you hand it to, needs no account, and does not route through this store. There is no use case we are reserving.`.trim();
}

function doorErrors(item: MenuItem, facts: PaidDoorFacts): SurfaceError[] {
  const errors: SurfaceError[] = [
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

function doorSecurity(item: MenuItem, facts: PaidDoorFacts): SurfaceSecurity {
  const reads = READS_SENTENCE[facts.reads];
  const detail = facts.humanQueue
    ? " Anything you write in `detail` is recorded exactly as written and read by a human — never treated as instructions to a machine."
    : "";
  return surfaceSecurity({
    what_this_surface_reads: `${reads}${detail} This store never asks for a credential, a key, or a wallet secret, and has no field that could hold one: payment is an x402 signature you produce, and we never see anything that could spend on your behalf.`,
    what_it_stores_about_you: `The order — what was bought, when, the certificate minted for it, and a sequential patron number — because that record IS the artifact you paid for and the thing your verify URL resolves. No account, no cookie, no password. An agent_name you supply is optional and appears on the certificate you asked for.${facts.humanQueue ? " A callback_url, if you give one, is used to tell you the work is done and for nothing else." : ""}`,
    what_the_data_is:
      facts.reads === "our_books" || facts.reads === "made_here"
        ? "Nothing about any third party is read or produced. What this door hands back was made here, from this store's own records or from what you sent."
        : "One observation of a PUBLIC subject, taken the way any buyer could take it. No authentication is bypassed, no rate limit is evaded, and nothing private is read to produce it.",
    integrity: `THIS ONE IS SIGNED, which is the difference between the paid shelf and the free instruments. Delivery carries an ed25519 certificate over the exact bytes; ${item.name} is verifiable at /api/verify/{id} by anyone, free, forever, offline against the published key — you are not asked to trust this store's word for it, and you should not.`,
  });
}

/**
 * Rule 57's four remaining answers for one shelf item, computed.
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
): Record<string, unknown> {
  const facts = doorFacts(schema, item);
  return {
    what_you_can_use_it_for: whatYouCanUseItFor(item, task),
    expected_outcome: expectedOutcome(item, facts),
    errors: doorErrors(item, facts),
    security: doorSecurity(item, facts),
  };
}
