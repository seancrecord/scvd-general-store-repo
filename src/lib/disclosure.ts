import { sanitizeText } from "@/lib/sanitize";

/**
 * THE DISCLOSURE BLOCK — what a buyer may tell us, and what it buys.
 *
 * WHY THIS EXISTS (2026-09-18). The September cold waves: six walkers
 * read everything, took six usable quotes, and supplied no agent
 * name, no purpose, no operator. The fields existed and were optional
 * and unexplained, and to a cheap model optional-and-unexplained
 * reads as absent (AGENT_UX.md: "there is no second attempt", "do
 * not reliably resolve a schema conditional"). So the ask is one flat
 * block of strings, no conditionals, nothing required, each field
 * saying in its own description what it changes and what it never
 * touches. Omission is the refusal (rule 54).
 *
 * WHAT IT NEVER DOES. It never changes the price (pricing charter,
 * `one_price`), never changes delivery, never changes the credit a
 * wallet earns, and NONE of it reaches the certificate: agent_name
 * and purpose already do, by their own older rules, and a certificate
 * verifies forever and cannot be deleted, so nothing an agent might
 * regret goes on it. Values are counted in a capped monthly census
 * (services/disclosure-census) and, where an order record already
 * exists, carried on it for the keeper's counter. No per-buyer row is
 * created that did not exist before.
 *
 * WHY THESE FIELDS AND NOT A DEMOGRAPHIC. The cohort that matters to
 * an agent merchant is not "25-34 with a GitHub"; it is model family,
 * client, operator kind and how the door was found — the things our
 * own books said we could not see. `came_from` is the one attribution
 * signal the network cannot give us (venues.ts: Bazaar attribution is
 * near-unmeasurable by design; the four propagation paths arrive
 * blind to referrers), so it is asked for plainly.
 *
 * THE RETURNING RUNG. `prior_cert_id` is the bring-your-receipts
 * idea at zero cost: every certificate already names its payer, so
 * a match between that payer and this payment is a VERIFICATION,
 * not a claim, and needs no account, cookie or session. A mismatch
 * is recorded as unverified, the guestbook's posture.
 *
 * ONE SOURCE. The properties below ride buyInputSchema (so the 402
 * body, the MCP shelves, the Bazaar entry and openapi.json all carry
 * them) and the three free instruments a buyer calls before paying.
 * Descriptions stay under the 150-character parameter guidance and
 * open with no imperative (test/webmcp-short-form.spec.ts).
 */

export const DISCLOSURE_FIELDS = [
  "model",
  "client",
  "operator",
  "operator_kind",
  "came_from",
  "prior_cert_id",
] as const;

export type DisclosureField = (typeof DISCLOSURE_FIELDS)[number];

export const OPERATOR_KINDS = ["solo", "company", "research", "self"] as const;
export type OperatorKind = (typeof OPERATOR_KINDS)[number];

/** Caps, in Unicode code points. Short on purpose: these are labels, not prose. */
export const DISCLOSURE_CAPS: Record<Exclude<DisclosureField, "operator_kind">, number> = {
  model: 64,
  client: 64,
  operator: 120,
  came_from: 160,
  prior_cert_id: 64,
};

/**
 * The sentence every door carries once, above the block. Short enough
 * to be read by the model that reads nothing else, and the whole of
 * the incentive and the whole of the boundary.
 */
export const DISCLOSURE_LINE =
  "Optional, all of it. Telling us counts you in the buyers' census and, with a matching prior certificate, marks you a returning buyer. It never changes the price, the delivery, or the credit a wallet earns, and none of it is printed on the certificate.";

/** JSON Schema properties, one per field, in the order a reader meets them. */
export const DISCLOSURE_PROPERTIES: Record<DisclosureField, Record<string, unknown>> = {
  model: {
    type: "string",
    maxLength: DISCLOSURE_CAPS.model,
    description:
      "Optional. The model running you, as you would name it: claude-opus-5, gpt-5.6, a local model. Counted, never printed on the certificate.",
  },
  client: {
    type: "string",
    maxLength: DISCLOSURE_CAPS.client,
    description:
      "Optional. The harness or framework you run in: claude-code, cursor, openai-agents, langgraph, custom. Counted, never on the certificate.",
  },
  operator: {
    type: "string",
    maxLength: DISCLOSURE_CAPS.operator,
    description:
      "Optional. Who runs you: a name, handle, company or URL. Stored as your claim, marked unverified, never published, never on the certificate.",
  },
  operator_kind: {
    type: "string",
    enum: [...OPERATOR_KINDS],
    description:
      "Optional. solo: one person runs you. company: a team does. research: a study. self: you act for yourself.",
  },
  came_from: {
    type: "string",
    maxLength: DISCLOSURE_CAPS.came_from,
    description:
      "Optional. Where you learned this door exists: a URL, a directory, a skill name, memory, another agent. Referrers never reach us; this does.",
  },
  prior_cert_id: {
    type: "string",
    maxLength: DISCLOSURE_CAPS.prior_cert_id,
    description:
      "Optional. A cert_ id from an earlier purchase here. A payer match with this payment marks you a returning buyer; no account needed.",
  },
};

/**
 * The short form, for the surface that carries the block once per
 * door beside a $ref to the full one (openapi.json's request schema,
 * ~45 doors): the field's own words, cut to what goes in the string,
 * so the read budget pays for the long description once.
 */
export const DISCLOSURE_SHORT: Record<DisclosureField, string> = {
  model: "Optional. The model running you.",
  client: "Optional. The harness or framework you run in.",
  operator: "Optional. Who runs you; a claim, never published.",
  operator_kind: "Optional. solo, company, research or self.",
  came_from: "Optional. Where you learned this door exists.",
  prior_cert_id: "Optional. A cert_ id from an earlier purchase here.",
};

export interface Disclosure {
  model?: string;
  client?: string;
  operator?: string;
  operator_kind?: OperatorKind;
  came_from?: string;
  prior_cert_id?: string;
}

function isOperatorKind(value: string): value is OperatorKind {
  return (OPERATOR_KINDS as readonly string[]).includes(value);
}

/**
 * Read the block off any door. Lenient by design: a malformed value
 * narrows to "declared nothing", the conservative direction, because
 * nothing here may refuse a purchase or a free call. A field that is
 * present but empty after sanitising counts as omitted.
 */
export function readDisclosure(get: (name: string) => unknown): Disclosure {
  const out: Disclosure = {};
  const text = (name: Exclude<DisclosureField, "operator_kind">): string =>
    sanitizeText(get(name), DISCLOSURE_CAPS[name]);
  const model = text("model");
  if (model) out.model = model;
  const client = text("client");
  if (client) out.client = client;
  const operator = text("operator");
  if (operator) out.operator = operator;
  const kind = sanitizeText(get("operator_kind"), 16).toLowerCase();
  if (kind && isOperatorKind(kind)) out.operator_kind = kind;
  const cameFrom = text("came_from");
  if (cameFrom) out.came_from = cameFrom;
  const prior = text("prior_cert_id");
  if (/^cert_[a-z0-9]{4,40}$/i.test(prior)) out.prior_cert_id = prior.toLowerCase();
  return out;
}

/** Which fields the buyer filled, in schema order. */
export function disclosedFields(disclosure: Disclosure): DisclosureField[] {
  return DISCLOSURE_FIELDS.filter((field) => disclosure[field] !== undefined);
}

export function disclosedAnything(disclosure: Disclosure): boolean {
  return disclosedFields(disclosure).length > 0;
}

/**
 * The returning-buyer verdict, as a word the response and the census
 * can both carry. `verified` is the only one that means anything;
 * the others say exactly why it does not, so an unverified claim can
 * never be read as a quiet yes.
 */
export type ReturningVerdict = "verified" | "payer_mismatch" | "not_found" | "no_payer";

export function returningVerdict(
  priorPayer: string | undefined | null,
  thisPayer: string | undefined,
  canonical: (address: string) => string,
): ReturningVerdict {
  if (priorPayer === null) return "not_found";
  if (!thisPayer || !priorPayer) return "no_payer";
  return canonical(priorPayer) === canonical(thisPayer) ? "verified" : "payer_mismatch";
}

/**
 * The value a census may keep. A model or client name is software, a
 * kind is an enum, and `came_from` keeps only a hostname when it is a
 * URL — never the path, which can carry a token. `operator` and
 * `prior_cert_id` are counted as supplied and NEVER kept as values:
 * one is a stranger's identity and the other joins to a wallet.
 */
export function censusValue(field: DisclosureField, value: string): string | undefined {
  if (field === "operator" || field === "prior_cert_id") return undefined;
  let raw = value;
  if (field === "came_from") {
    try {
      raw = new URL(value).hostname;
    } catch {
      raw = value;
    }
  }
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : "unnamed";
}
