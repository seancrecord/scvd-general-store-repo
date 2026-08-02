/**
 * THE VENUE REGISTER: every ?src= marker this store hands out, in one
 * place, with the exact URL that carries it.
 *
 * WHY THIS FILE EXISTS, and it is two reasons that turned out to be
 * the same reason.
 *
 * THE MEASUREMENT REASON. The office's channel table infers `bazaar`
 * from a REFERRER, and machine clients overwhelmingly send none — so a
 * directory-referred agent is indistinguishable from a bookmark and a
 * zero in that row is zero ATTRIBUTABLE arrivals, not zero arrivals.
 * ?src= has the opposite property: it needs no referrer and works on a
 * bare client, which makes it the only instrument that can answer
 * "did that listing send anyone." It has never been pointed at a
 * listing. The markers below are that fix, and they are inert until a
 * hand submits the URL beside them.
 *
 * THE HARDENING REASON, found 2026-08-02 while checking the first one.
 * `?src=` went from the query string into a KV KEY, verbatim, sliced
 * only to 40 characters:
 *
 *     metric:<month>:venue:<whatever the caller sent>
 *
 * One distinct key per distinct string, no allowlist, no cap. Any
 * caller could mint unbounded KV keys for free, and every one of them
 * was then listed and read on each office page load — the page a
 * keeper reads to decide whether a channel is working got slower and
 * costlier the more junk a stranger sent it, and the strategy number
 * on it was writable by anyone. The proof it was open was already in
 * the books: `workcheck-persona-test` fired as a venue marker and
 * appears nowhere in this codebase, because nothing required it to.
 *
 * So the register is the allowlist and the allowlist is the register.
 * A marker not named here still COUNTS — folded into one bucket, so
 * the fact of an unrecognised arrival survives at cardinality one —
 * and the exact string it carried stays readable per-event in the
 * office, which is where a one-off hand test belongs anyway.
 *
 * NOTHING HERE PUBLISHES ANYTHING (rule 30). Adding a row does not
 * submit a listing; it makes the arrival countable when a hand does.
 */

export interface Venue {
  /** The ?src= value. Lowercase, hyphenated, short by construction. */
  readonly marker: string;
  /** Where the paper gets handed out, in the keeper's words. */
  readonly where: string;
  /** The exact URL to submit, marker already attached. */
  readonly url: string;
  /** Why this venue, or what the marker is standing in for. */
  readonly note: string;
}

/**
 * The base every URL below hangs off. Not read from env on purpose:
 * this is a document a human copies from, and a value that renders as
 * `undefined` in a listing submission is worse than a hard-coded one
 * that is checked by a test.
 */
const BASE = "https://scvd.store";

export const VENUES: readonly Venue[] = [
  // ── Already in use. These fire today. ──
  {
    marker: "try",
    where: "The practice counter's own worked examples",
    url: `${BASE}/api/buy/hello?src=try`,
    note: "Set by /try's flow steps. Tells us the practice counter sent them and nothing about them.",
  },
  {
    marker: "skill",
    where: "The live skill document at /skill.md",
    url: `${BASE}/api/buy/hello?src=skill`,
    note: "The one declared marker that also overrides channel inference, because we wrote the document it appears in.",
  },
  {
    marker: "clawhub-skill",
    where: "The published ClawHub bundle",
    url: `${BASE}/api/buy/hello?src=clawhub-skill`,
    note: "Same override as `skill`. This is the marker that actually ships in registry/clawhub/SKILL.md.",
  },

  // ── Minted and waiting. Inert until a listing carries them. ──
  {
    marker: "bazaar",
    where: "x402scan / the Bazaar catalog listing",
    url: `${BASE}/menu.json?src=bazaar`,
    note: "The channel table can only see this venue through a referrer nobody sends. This marker is the only way the question gets answered.",
  },
  {
    marker: "radar",
    where: "x402-radar seller listing",
    url: `${BASE}/menu.json?src=radar`,
    note: "Public leaderboard of on-chain seller activity.",
  },
  {
    marker: "awesome-x402",
    where: "The awesome-x402 list",
    url: `${BASE}/?src=awesome-x402`,
    note: "Points at the storefront rather than the menu: a human reads this list.",
  },
  {
    marker: "glama",
    where: "Glama MCP directory",
    url: `${BASE}/mcp?src=glama`,
    note: "MCP arrivals are already tagged `mcp` by channel; this separates WHICH directory sent them.",
  },
  {
    marker: "x402-slack",
    where: "slack.x402.org",
    url: `${BASE}/try?src=x402-slack`,
    note: "Named by the protocol's own repo as a maintainer congregation point. Points at /try because the audience is client builders.",
  },
  {
    marker: "cdp-discord",
    where: "Coinbase CDP Discord",
    url: `${BASE}/try?src=cdp-discord`,
    note: "Same audience as the Slack, different room.",
  },
  {
    marker: "spec-repo",
    where: "x402-foundation/x402 issues, PRs and discussions",
    url: `${BASE}/try?src=spec-repo`,
    note: "Where a near-miss already happened once. A link in a thread is the whole mechanism.",
  },
] as const;

/**
 * CV's per-venue tags, kept as a documented convention (DEMAND.md,
 * READINESS.md, TASKS.md) and now bounded.
 *
 * THE TRADEOFF, STATED RATHER THAN HIDDEN. The convention was
 * `?src=cv-<venue>` with the venue part free-form, which is precisely
 * the unbounded-key shape this file exists to close. Requiring each
 * tag to be registered is a one-line change here whenever he opens a
 * venue — and registering a marker is the same act as handing it out,
 * so it costs a step that was already being taken. An unregistered
 * `cv-` tag is not dropped: it counts in the unregistered bucket and
 * its exact string stays readable per-event, so his channel never goes
 * silent, it only goes unnamed until the row lands.
 */
export const CV_VENUES: readonly Venue[] = [] as const;

/**
 * RULED ON 2026-08-02, and it matters that it was ruled rather than
 * defaulted: CV was asked whether he wanted a bounded `cv-` prefix
 * back instead, and said empty was the right call. So the list above
 * is a decision with his name on it, not a placeholder somebody left
 * behind — which is the difference between a register and an
 * oversight, and the reason it is written here rather than in a chat
 * log nobody can grep.
 */

/**
 * Every marker that gets its own counter. Anything else shares one.
 */
const REGISTERED: ReadonlySet<string> = new Set(
  [...VENUES, ...CV_VENUES].map((venue) => venue.marker),
);

/**
 * The single key every unrecognised marker folds into. One counter,
 * forever, no matter what arrives — which is the entire point.
 */
export const UNREGISTERED_VENUE = "unregistered";

/**
 * Bound the shape too, not just the set. A registered marker can only
 * be one of ours, so this is belt-and-braces — but it is the check
 * that would have made the original bug unexploitable on its own, and
 * a KV key segment should never be able to carry a colon, a newline,
 * or four hundred characters of somebody's choosing.
 */
const MARKER_SHAPE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * The counter bucket for a declared ?src=. Never returns the caller's
 * string unless we minted it.
 */
export function venueCounterKey(declared: string): string {
  const marker = declared.trim().toLowerCase();
  if (!MARKER_SHAPE.test(marker)) {
    return UNREGISTERED_VENUE;
  }
  return REGISTERED.has(marker) ? marker : UNREGISTERED_VENUE;
}

/** For the office caveat, so the copy cannot drift from the register. */
export function registeredMarkers(): string[] {
  return [...REGISTERED].sort();
}
