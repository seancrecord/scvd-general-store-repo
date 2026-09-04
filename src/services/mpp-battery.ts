import { KNOWN_TESTNETS } from "@/lib/value-checks";
import {
  MPP_BATTERY,
  MPP_INTENTS,
  MPP_INTENTS_UNREGISTERED_BUT_SEEN,
  MPP_METHODS,
  MPP_METHODS_NEEDING_RECIPIENT,
  MPP_PROBLEM_TYPES,
  MPP_PROBLEM_TYPE_PREFIX,
  MPP_SPEC_DRAFT,
  TEMPO_TESTNET_CHAIN_ID,
  type PaymentChallenge,
  paymentChallenges,
  protocolsSpoken,
  requestIsCanonical,
} from "@/lib/mpp-challenge";

/**
 * THE MPP BATTERY, TIER 0 (roadmap V3 PR 1, 2026-09-04): the same one
 * GET the probe already made, parsed a second time for the other
 * wire. Twelve checks named the way the x402 checks are named, four
 * advisories outside any verdict, and `protocols_spoken` derived from
 * the headers. Nothing here moves the x402 verdict: the keeper ruled
 * (2026-09-04) that `verdict` keeps meaning "x402 ready" permanently,
 * so a `ready` recorded in week 34 means in week 40 what it meant
 * then; a reader who wants the union reads `protocols_spoken`.
 *
 * A door with no `Payment` challenge gets no MPP checks: checks judged
 * against no challenge would be a fabricated observation. `spoken`
 * says so, and the block is present either way so a reader never has
 * to guess whether the battery looked.
 */

export const MPP_CHECK_NAMES = [
  "mpp-challenge-present",
  "mpp-challenge-id",
  "mpp-challenge-realm",
  "mpp-method-registered",
  "mpp-intent-registered",
  "mpp-request-decodes",
  "mpp-request-canonical",
  "mpp-amount-shape",
  "mpp-currency-named",
  "mpp-recipient-present",
  "mpp-expires-rfc3339",
  "mpp-tls-only",
] as const;
export type MppCheckName = (typeof MPP_CHECK_NAMES)[number];

export const MPP_ADVISORY_NAMES = ["mpp-testnet-default", "mpp-intent-unregistered", "mpp-body-not-problem-json", "x402-and-mpp"] as const;

export interface MppCheck {
  name: MppCheckName;
  ok: boolean;
  detail: string;
}
export interface MppAdvisory {
  name: (typeof MPP_ADVISORY_NAMES)[number];
  detail: string;
}
export interface MppChallengeSummary {
  index: number;
  id: string | null;
  realm: string | null;
  method: string | null;
  intent: string | null;
  amount: string | null;
  currency: string | null;
  recipient: string | null;
  chain_id: number | string | null;
  expires: string | null;
}
export interface MppBlock {
  battery: typeof MPP_BATTERY;
  spec: typeof MPP_SPEC_DRAFT;
  /** At least one `WWW-Authenticate: Payment` challenge parsed. */
  spoken: boolean;
  challenges: MppChallengeSummary[];
  /** Present only when spoken: a check judged against no challenge is not an observation. */
  checks: MppCheck[];
  advisories: MppAdvisory[];
  the_x402_verdict_above: string;
  what_this_cannot_tell_you: string[];
}

export const MPP_VERDICT_NOTE =
  "The top-level verdict keeps meaning x402-ready, permanently (the keeper's ruling, 2026-09-04): an existing ready must not change meaning under anyone's feet. A door that speaks only MPP reads not_ready on the x402 battery and that is a fact about which wire it speaks, not a defect; read protocols_spoken for the union and this block for the MPP battery's own checks.";

const CANNOT_TELL = [
  "Whether the door verifies a credential, delivers, or issues a Payment-Receipt: those exist only after money moves, and this store's till does not speak MPP.",
  "Whether the price advertised in the door's /openapi.json (x-payment-info) agrees with this challenge: the free preflight makes one request, and that read is the paid audit's.",
  "Whether the door stays up, or whether the same challenge is served to a paying client. One request, one moment.",
];

function methodDetails(challenge: PaymentChallenge): Record<string, unknown> {
  const details = challenge.request?.["methodDetails"];
  return details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
}

function summarize(challenge: PaymentChallenge): MppChallengeSummary {
  const request = challenge.request ?? {};
  const details = methodDetails(challenge);
  const chain = details["chainId"];
  return {
    index: challenge.index,
    id: challenge.id,
    realm: challenge.realm,
    method: challenge.method,
    intent: challenge.intent,
    amount: typeof request["amount"] === "string" ? request["amount"] : null,
    currency: typeof request["currency"] === "string" ? request["currency"] : null,
    recipient: typeof request["recipient"] === "string" ? request["recipient"] : null,
    chain_id: typeof chain === "number" || typeof chain === "string" ? chain : null,
    expires: challenge.expires,
  };
}

function isTestnet(challenge: PaymentChallenge): string | null {
  const details = methodDetails(challenge);
  const chain = details["chainId"];
  if (challenge.method === "tempo") {
    if (chain === undefined || chain === null) return `method tempo with chainId absent: the spec's default is ${TEMPO_TESTNET_CHAIN_ID} (Tempo Moderato, the testnet)`;
    if (Number(chain) === TEMPO_TESTNET_CHAIN_ID) return `method tempo on chainId ${TEMPO_TESTNET_CHAIN_ID} (Tempo Moderato, the testnet)`;
  }
  if (challenge.method === "evm" && chain !== undefined && chain !== null) {
    const key = `eip155:${String(chain)}`;
    if (KNOWN_TESTNETS[key]) return `method evm on chainId ${String(chain)} (${KNOWN_TESTNETS[key]})`;
  }
  return null;
}

/**
 * Run the Tier 0 battery over one response's headers, body and URL.
 * Pure over its inputs; `now` is injected so a fixture replays the same
 * way every day.
 */
export function runMppChecks(
  input: { headers: { get(name: string): string | null }; url: string; bodyText?: string; now?: Date },
): MppBlock & { protocols_spoken: ("x402" | "mpp")[] } {
  const now = input.now ?? new Date();
  const spoken = protocolsSpoken(input.headers);
  const challenges = paymentChallenges(input.headers.get("www-authenticate"));
  const base: MppBlock & { protocols_spoken: ("x402" | "mpp")[] } = {
    battery: MPP_BATTERY,
    spec: MPP_SPEC_DRAFT,
    spoken: challenges.length > 0,
    challenges: challenges.map(summarize),
    checks: [],
    advisories: [],
    the_x402_verdict_above: MPP_VERDICT_NOTE,
    what_this_cannot_tell_you: CANNOT_TELL,
    protocols_spoken: spoken,
  };
  if (challenges.length === 0) return base;

  const checks: MppCheck[] = [];
  const advisories: MppAdvisory[] = [];
  const failures = (name: MppCheckName, ok: (c: PaymentChallenge) => string | null, passDetail: string) => {
    const problems = challenges.map((c) => ok(c)).flatMap((problem, index) => (problem ? [`challenge ${index}: ${problem}`] : []));
    checks.push({ name, ok: problems.length === 0, detail: problems.length === 0 ? passDetail : problems.join("; ") });
  };

  checks.push({ name: "mpp-challenge-present", ok: true, detail: `${challenges.length} Payment challenge${challenges.length === 1 ? "" : "s"} on WWW-Authenticate` });
  failures("mpp-challenge-id", (c) => (c.id && c.id.length > 0 ? null : "id missing or empty; clients and parsers MUST reject it"), "every challenge carries a non-empty id");
  failures("mpp-challenge-realm", (c) => (c.realm ? null : "realm absent"), "every challenge names its realm");
  failures(
    "mpp-method-registered",
    (c) => (c.method && (MPP_METHODS as readonly string[]).includes(c.method) ? null : `method ${c.method ?? "(absent)"} has no draft in the spec repository; no client can build a credential for it`),
    "every method is one the spec repository holds a draft for",
  );
  failures(
    "mpp-intent-registered",
    (c) => {
      if (!c.intent) return "intent absent";
      if ((MPP_INTENTS as readonly string[]).includes(c.intent)) return null;
      if ((MPP_INTENTS_UNREGISTERED_BUT_SEEN as readonly string[]).includes(c.intent)) return null;
      return `intent ${c.intent} is neither drafted nor seen in the wild`;
    },
    "every intent is drafted, or is one implementers advertise (see the advisory)",
  );
  failures("mpp-request-decodes", (c) => (c.request ? null : c.request_error ?? "request did not decode"), "every request is base64url of a JSON object");
  failures(
    "mpp-request-canonical",
    (c) => {
      const canonical = requestIsCanonical(c);
      if (canonical === null) return "request did not decode, so canonical form could not be compared";
      return canonical ? null : "re-canonicalizing the decoded JSON by RFC 8785 does not reproduce the served bytes; a client that hashes the request for challenge binding gets a different hash";
    },
    "every request is byte-exact RFC 8785 canonical JSON",
  );
  failures(
    "mpp-amount-shape",
    (c) => {
      const amount = c.request?.["amount"];
      if (typeof amount !== "string") return "amount absent or not a string";
      return /^[0-9]+$/.test(amount) ? null : `amount ${JSON.stringify(amount)} is not a base-10 integer string in the smallest unit`;
    },
    "every amount is a digit string, no sign, point or exponent",
  );
  failures("mpp-currency-named", (c) => (typeof c.request?.["currency"] === "string" && (c.request["currency"] as string).length > 0 ? null : "currency absent"), "every request names its currency");
  failures(
    "mpp-recipient-present",
    (c) => {
      if (!c.method || !(MPP_METHODS_NEEDING_RECIPIENT as readonly string[]).includes(c.method)) return null;
      return typeof c.request?.["recipient"] === "string" && (c.request["recipient"] as string).length > 0 ? null : `method ${c.method} requires a recipient the credential's to MUST match; none named`;
    },
    "every evm, tempo or solana request names its recipient",
  );
  failures(
    "mpp-expires-rfc3339",
    (c) => {
      if (c.expires === null) return null;
      const at = Date.parse(c.expires);
      if (Number.isNaN(at)) return `expires ${JSON.stringify(c.expires)} is not RFC 3339`;
      return at > now.getTime() ? null : `expires ${c.expires} is already past at the probe's moment (${now.toISOString()})`;
    },
    "expires, where present, parses and is in the future",
  );
  let https = false;
  try {
    https = new URL(input.url).protocol === "https:";
  } catch {
    https = false;
  }
  checks.push({ name: "mpp-tls-only", ok: https, detail: https ? "the door is https" : "the door is not https; servers MUST NOT issue Payment challenges over unencrypted HTTP" });

  const testnets = challenges.map(isTestnet).flatMap((note, index) => (note ? [`challenge ${index}: ${note}`] : []));
  if (testnets.length > 0) advisories.push({ name: "mpp-testnet-default", detail: `${testnets.join("; ")}. A mainnet wallet signing this settles nowhere real — the eip155:84532 lesson, on the second wire.` });
  const unregistered = challenges.flatMap((c) => (c.intent && !(MPP_INTENTS as readonly string[]).includes(c.intent) ? [`challenge ${c.index}: intent ${c.intent}`] : []));
  if (unregistered.length > 0) advisories.push({ name: "mpp-intent-unregistered", detail: `${unregistered.join("; ")} — no draft under specs/intents at the read date; not a failure, but a buyer holding only the registry cannot pay it.` });
  const contentType = (input.headers.get("content-type") ?? "").toLowerCase();
  let problemNote: string | null = null;
  if (!contentType.startsWith("application/problem+json")) problemNote = `the 402 body is ${contentType || "untyped"}, not application/problem+json`;
  else if (input.bodyText !== undefined) {
    try {
      const body: unknown = JSON.parse(input.bodyText);
      const type = body && typeof body === "object" ? (body as Record<string, unknown>)["type"] : undefined;
      if (typeof type !== "string" || !type.startsWith(MPP_PROBLEM_TYPE_PREFIX) || !(MPP_PROBLEM_TYPES as readonly string[]).includes(type.slice(MPP_PROBLEM_TYPE_PREFIX.length))) {
        problemNote = `the problem type ${typeof type === "string" ? JSON.stringify(type) : "(absent)"} is not one of the seven the draft registers`;
      }
    } catch {
      problemNote = "the body is typed problem+json but is not JSON";
    }
  }
  if (problemNote) advisories.push({ name: "mpp-body-not-problem-json", detail: `${problemNote}. A client that reads the body for the error class finds none.` });
  if (spoken.includes("x402")) advisories.push({ name: "x402-and-mpp", detail: "the 402 carries both PAYMENT-REQUIRED and a Payment challenge: the door speaks both wires. The most useful single fact for a buyer choosing a client." });

  return { ...base, checks, advisories };
}

/**
 * THE MEASUREMENT PR 1 OPENS WITH: how many already-probed rows carry
 * a Payment challenge in their captured headers. The capture list did
 * not keep www-authenticate before this PR, so the honest count today
 * is over rows that could not have shown it — said on the result, with
 * the denominator, rather than reported as "zero misreads".
 */
export function countMppMisreads(rows: readonly { evidence?: { headers?: Record<string, string> } | undefined }[]): {
  rows_with_captured_headers: number;
  rows_that_could_show_it: number;
  rows_speaking_mpp: number;
  rows_misread_as_broken_x402: number;
  note: string;
} {
  let captured = 0;
  let could = 0;
  let mpp = 0;
  let misread = 0;
  for (const row of rows) {
    const headers = row.evidence?.headers;
    if (!headers) continue;
    captured += 1;
    if (!("www-authenticate" in headers)) continue;
    could += 1;
    const spoken = protocolsSpoken({ get: (name) => headers[name.toLowerCase()] ?? null });
    if (spoken.includes("mpp")) {
      mpp += 1;
      if (!spoken.includes("x402")) misread += 1;
    }
  }
  return {
    rows_with_captured_headers: captured,
    rows_that_could_show_it: could,
    rows_speaking_mpp: mpp,
    rows_misread_as_broken_x402: misread,
    note: "Rows captured before www-authenticate joined the curated header list (2026-09-04) cannot show a Payment challenge; they are counted in rows_with_captured_headers and not in rows_that_could_show_it. A misread is a row speaking MPP alone whose x402 verdict read not_ready; the first round that finds one files the correction for every earlier week under rule 56.",
  };
}
