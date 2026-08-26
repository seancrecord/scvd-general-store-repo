import {
  PREFLIGHT_V2_SINCE,
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSION_NEXT,
} from "@/services/preflight";
import { CONFORMANCE_VERSION } from "@/services/conformance";

/**
 * THE VERSIONING PROMISE, WITH A PAGE BEHIND IT.
 *
 * The store has versioned in the URL path since the free instruments
 * shipped — /api/preflight/v1, /api/conformance/v1 — and the OpenAPI
 * document has carried an `x-versioning` block since 2026-08-21 that
 * said, correctly, what happens when a version is retired. A
 * readiness audit read the spec, found the versioning, and reported
 * "no deprecation or sunset policy detected" anyway. That is a fair
 * hit and worth understanding rather than arguing with: a vendor
 * extension inside a 900KB JSON document is not a POLICY as far as
 * anyone deciding whether to integrate is concerned. A policy is
 * something you can be shown.
 *
 * So the promise lives here, once, as data — and three surfaces read
 * it: the room at /deprecation, the `x-versioning` block, and the
 * RFC 8594 headers the versioned routes emit the day a row below
 * carries a sunset date. Nothing is typed twice, so the page cannot
 * promise a window the headers do not honour.
 *
 * THE PROMISE IS NOTICE, NOT PERMANENCE, and the modesty is
 * deliberate: one operator, one key. Over-promising here is exactly
 * the class of claim /corrections exists to catch.
 */

/** The notice window, in days, before a retired version stops answering. */
export const SUNSET_NOTICE_DAYS = 90;

export interface ApiVersionRow {
  /** The instrument, in the words its own page uses. */
  api: string;
  /** The versioned path, exactly as a client would call it. */
  path: string;
  version: string;
  /**
   * `current` is what a new integration should call. `supported` is
   * a version still answering with no end date announced.
   * `deprecated` means the RFC 8594 headers are live and the date
   * below is real.
   */
  status: "current" | "supported" | "deprecated";
  /** The day this version began rendering results. */
  since: string;
  /**
   * RFC 8594 §3: the day this version stops answering. Null until a
   * retirement is actually announced — an invented date here would
   * become an invented `Sunset` header, which is worse than none.
   */
  sunset: string | null;
  /**
   * The draft `Deprecation` header's value: the day the deprecation
   * took (or takes) effect. Null while the version is not deprecated.
   */
  deprecated: string | null;
  /** Where a caller should go instead, once there is a "instead". */
  successor: string | null;
  /** Why this version still exists, in one sentence a reader can use. */
  note: string;
}

/**
 * EVERY VERSIONED SURFACE, DERIVED FROM THE CONSTANTS THE ROUTES USE.
 *
 * The version strings are imported rather than retyped, per the
 * derive-or-refuse rule: a battery renamed in preflight.ts cannot
 * leave a stale row on the policy page, because there is no second
 * copy of the string to go stale.
 */
export const API_VERSIONS: readonly ApiVersionRow[] = [
  {
    api: "Preflight — the free x402 door check",
    path: `/api/preflight/${PREFLIGHT_VERSION}`,
    version: PREFLIGHT_VERSION,
    status: "supported",
    since: "2026-08-03",
    sunset: null,
    deprecated: null,
    successor: `/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
    note: "Still rendering verdicts, and it will keep rendering them through the overlap: an observatory that moves a battery under its old name destroys the comparability of every earlier record. A v1 verdict means in week 40 exactly what it meant in week 34.",
  },
  {
    api: "Preflight — the free x402 door check",
    path: `/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
    version: PREFLIGHT_VERSION_NEXT,
    status: "current",
    since: PREFLIGHT_V2_SINCE,
    sunset: null,
    deprecated: null,
    successor: null,
    note: "Folds the Solana rail-receivability read into the verdict rather than reporting it as an advisory. Call this one from a new integration.",
  },
  {
    api: "The conformance desk — signed offers and receipts, any issuer",
    path: `/api/conformance/${CONFORMANCE_VERSION}`,
    version: CONFORMANCE_VERSION,
    status: "current",
    since: "2026-08-03",
    sunset: null,
    deprecated: null,
    successor: null,
    note: "The contract at this path is frozen. Fields are added; nothing is removed or retyped under a caller.",
  },
] as const;

/**
 * The policy itself, as sentences rather than as a shape, because the
 * page, the markdown and the JSON all print the same words and a
 * paraphrase in any one of them is a second promise.
 */
export const LIFECYCLE_POLICY = {
  scheme: "url-path",
  summary:
    "Breaking changes arrive as a new version in the URL path. A published version's shape never changes under a client: fields are added, never removed or retyped.",
  notice: `A version being retired carries RFC 8594 Sunset and the Deprecation header on every response for at least ${SUNSET_NOTICE_DAYS} days before it stops answering, and the date is published on this page before the headers appear.`,
  overlap:
    "Where a new battery changes what a verdict MEANS rather than only what it checks, the old one keeps running through an overlap instead of being retired — a signed observation cites the criteria it was rendered under, and renaming those criteria retroactively would make a signature cover a claim nobody made.",
  headers: [
    'Sunset: <http-date> — RFC 8594 §3, the day the version stops answering.',
    'Deprecation: <http-date> — the day the deprecation took effect.',
    'Link: <...>; rel="sunset" — RFC 8594 §4, pointing at this page.',
    'Link: <...>; rel="successor-version" — RFC 5829, the path to call instead.',
  ],
  what_is_not_promised:
    "Permanence. One operator and one key cannot honestly promise that any endpoint runs forever, and /wind-down says what happens to everything this store holds if the lights go off. What is promised is notice, in machine-readable form, at a stated minimum.",
} as const;

/** True when a row's headers should actually go out. */
export function isRetiring(row: ApiVersionRow): boolean {
  return row.status === "deprecated" || row.sunset !== null;
}

/**
 * The RFC 8594 headers for one versioned path, or an empty object.
 *
 * EMPTY IS THE POINT. Nothing is deprecated today, so this returns
 * nothing today — and the mechanism is still wired to the live
 * routes, so the day a row above gains a date the headers appear
 * without anybody remembering a second place to edit. A policy whose
 * enforcement is a future task is a policy.
 */
export function lifecycleHeaders(
  path: string,
  base: string,
): Record<string, string> {
  const row = API_VERSIONS.find((entry) => entry.path === path);
  return row ? headersForRow(row, base) : {};
}

/**
 * SPLIT OUT SO THE MECHANISM IS TESTABLE WHILE THE TABLE IS EMPTY.
 *
 * Nothing is deprecated today, which means `lifecycleHeaders` returns
 * `{}` for every live path and a test over it proves only that
 * nothing is deprecated — not that the headers would be right if
 * something were. That is the failure mode of every "we'll announce
 * it properly when the time comes" promise: the announcing code has
 * never run. This takes the row directly, so the retiring branch can
 * be exercised against a fabricated row and the RFC 8594 shape held
 * to by test on a day when no real row has a date in it.
 */
export function headersForRow(
  row: ApiVersionRow,
  base: string,
): Record<string, string> {
  if (!isRetiring(row)) return {};
  const links = [`<${base}/deprecation>; rel="sunset"`];
  if (row.successor) {
    links.push(`<${base}${row.successor}>; rel="successor-version"`);
  }
  return {
    // RFC 8594 §3 and the Deprecation draft both want an HTTP-date,
    // not the ISO string the table keeps. Converted here, once.
    ...(row.sunset ? { Sunset: new Date(row.sunset).toUTCString() } : {}),
    ...(row.deprecated
      ? { Deprecation: new Date(row.deprecated).toUTCString() }
      : {}),
    Link: links.join(", "),
  };
}
