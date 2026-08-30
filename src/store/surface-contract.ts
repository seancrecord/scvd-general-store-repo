
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
