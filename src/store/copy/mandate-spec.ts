import { MANDATE_TEXT_CAP } from "@/lib/mandate-terms";

/**
 * THE MANDATE, AS A PATTERN ANOTHER ISSUER CAN IMPLEMENT (2026-09-21,
 * docs/COUNTERS_LINKS_PAGES_2026-09-21.md D2).
 *
 * The record (services/mandates.ts) has existed since 2026-08-19:
 * signed, dated, at a free permanent URL, its evidence hash bound
 * into every certificate that cites it, the citation refused before
 * charge when it cannot resolve, counter-signable by a second party
 * for nothing. What it never had was a page that said so in the
 * shape a second issuer could copy — and a primitive only one store
 * issues is a catalogue item, not infrastructure. This is that page,
 * typed once and served as markdown and as HTML at /mandate-spec;
 * docs/MANDATE_SPEC.md points here rather than restating it.
 */

export interface SpecSection {
  heading: string;
  paragraphs: string[];
  code?: string;
}

export const MANDATE_SPEC_TITLE = "The mandate record, v1";

export const MANDATE_SPEC_DESCRIPTION =
  "A signed, dated record that an agent's claimed authorization was submitted to a third party before the agent acted, citable on every later purchase: the fields, the signing, the citation rule, the free counter-signature, and what it does not prove. Written so another issuer can implement the same record.";

export const MANDATE_SPEC_SECTIONS: readonly SpecSection[] = [
  {
    heading: "What it is",
    paragraphs: [
      "An agent acting on someone's behalf claims an authorization: 'buy verification artifacts as needed, at most $5 an item'. Today that claim lives in the agent's own context and its principal's own memory, both of which can be rewritten afterwards by the party that holds them. A mandate record is that claim, verbatim, submitted to a party that is neither the agent nor its principal, signed by that party with the moment it arrived, and held at a permanent free URL. It is chain-of-custody for the claim, and only that.",
      "It does not prove the principal said it, does not prove the cap or expiry were honored, and enforces nothing. What it proves is that the text existed, in this form, at this time, before any purchase that cites it — because the issuer refuses a citation it cannot resolve.",
    ],
  },
  {
    heading: "The record",
    paragraphs: [
      "A JSON object with these fields, in this order, every one present unless marked optional:",
    ],
    code: `{
  "mandate_id":        "m_<issuer-unique id>",
  "recorded_at":       "<ISO 8601, the issuer's clock at receipt>",
  "submitted_as":      "agent" | "principal",      // the submitter's claim about itself
  "mandate_text":      "<the claimed instructions, verbatim, at most ${MANDATE_TEXT_CAP} characters>",
  "declared_cap_usdc": <number>,                   // optional; declared, never enforced
  "expires_at":        "<ISO 8601>",               // optional; declared, never enforced
  "evidence_hash":     "<sha256 hex over the fields above, canonicalised>",
  "scope":             "<the issuer's one-paragraph statement of what this proves and does not>",
  "signature":         "<ed25519 over the canonical fields above signature, hex>",
  "public_key":        "<the issuer's ed25519 public key, hex>",
  "signature_covers":  "<the issuer's sentence naming exactly which fields the signature covers>"
}`,
  },
  {
    heading: "Signing",
    paragraphs: [
      "The issuer serialises every field above `signature`, in the order listed, as JSON with no whitespace, and signs the UTF-8 bytes with ed25519. `signature_covers` states that rule in words on the record itself, so a verifier never has to know this page. The issuer's key is published at a stable URL with its history — every key ever used, its dates, and each handover signed by the outgoing key — because a record must stay verifiable after the key that signed it retires.",
      "`evidence_hash` is sha256 over the same canonical fields, so a purchase certificate can bind the record by hash without carrying it.",
    ],
  },
  {
    heading: "The citation rule",
    paragraphs: [
      "Any later purchase at the issuer may carry `mandate_id`. The issuer resolves it before charging; an id it cannot resolve is refused, and nothing is charged. A resolved id is written into the certificate's signed fields, so every certificate that names a mandate was minted while the mandate already existed, and the certificate's own signature covers the link.",
      "That is the whole mechanism. The record does not gate the purchase against the declared cap or expiry; it makes the sequence provable: authorization claimed, then acted on, each signed and dated by a party with no stake in either.",
    ],
  },
  {
    heading: "The free counter-signature",
    paragraphs: [
      "The obvious objection is that an agent wrote its own authorization. A second party — the principal, an auditor, anyone — answers it by signing the string below with its own ed25519 key and POSTing the public key and signature to the record's own URL. The issuer verifies the signature before filing it and files nothing that does not verify; every attestation the record serves is one a stranger can re-check. The mandate id is in the string on purpose: the evidence hash alone would let a signature made for one mandate be replayed onto another carrying identical text.",
    ],
    code: "scvd-mandate-attestation:<mandate_id>:<evidence_hash>",
  },
  {
    heading: "What an attestation means, and does not",
    paragraphs: [
      "That the named key signed the record's id and hash. Not that the parties agreed, not that anyone is bound, not that anything was performed or is owed. The issuer records; it does not conclude. Attesting is free, always: if the second party had to pay, the record would tilt toward whoever bought it.",
    ],
  },
  {
    heading: "What this store serves",
    paragraphs: [
      "Record one: `GET /api/buy/the_mandate?mandate=<text>&submitted_as=agent&declared_cap_usdc=10` over x402, or the `buy_mandate` MCP tool. Read one, free, forever: `GET /api/mandate/{mandate_id}`. Counter-sign one, free: `POST /api/mandate/{mandate_id}` with `{public_key, signature, label?}`. The JSON schema of the record: `/schemas/scvd-mandate-v1.json`. The signing key and its history: `/.well-known/scvd-signing-key`; the issuer identity on every certificate: `did:web:scvd.store`, resolved at `/.well-known/did.json`.",
    ],
  },
  {
    heading: "Implementing it elsewhere",
    paragraphs: [
      "Another issuer needs four things: a stable URL per record that serves the signed JSON free; a published key with history; the citation refusal at its own point of sale; and the free counter-signature door on the record's own URL. Nothing here names this store's fields as the only spelling — the invariants are the fixed order, the stated coverage sentence, the hash-bound citation, and the refusal before charge. An issuer that keeps those four has implemented the pattern, whatever it calls the fields.",
    ],
  },
];

export function mandateSpecMarkdown(base: string): string {
  const body = MANDATE_SPEC_SECTIONS.map((section) => {
    const paragraphs = section.paragraphs.join("\n\n");
    const code = section.code ? `\n\n\`\`\`\n${section.code}\n\`\`\`` : "";
    return `## ${section.heading}\n\n${paragraphs}${code}`;
  }).join("\n\n");
  return `# ${MANDATE_SPEC_TITLE}\n\n${MANDATE_SPEC_DESCRIPTION}\n\nServed at ${base}/mandate-spec; the record's schema at ${base}/schemas/scvd-mandate-v1.json.\n\n${body}\n`;
}

/** The JSON schema of the record, derived from the same fields the spec lists. */
export function mandateSchema(base: string): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${base}/schemas/scvd-mandate-v1.json`,
    title: MANDATE_SPEC_TITLE,
    description: MANDATE_SPEC_DESCRIPTION,
    "x-spec": `${base}/mandate-spec`,
    "x-key-order": ["mandate_id", "recorded_at", "submitted_as", "mandate_text", "declared_cap_usdc", "expires_at", "evidence_hash", "scope", "signature", "public_key", "signature_covers"],
    "x-signature-covers": "every field before `signature`, in x-key-order, serialised as JSON with no whitespace, absent optional fields omitted; ed25519 over the UTF-8 bytes",
    type: "object",
    required: ["mandate_id", "recorded_at", "submitted_as", "mandate_text", "evidence_hash", "scope", "signature", "public_key", "signature_covers"],
    properties: {
      mandate_id: { type: "string", description: "The issuer's unique id for the record; this store's begin with m_." },
      recorded_at: { type: "string", format: "date-time", description: "The issuer's clock at receipt, vouched for by the signature." },
      submitted_as: { type: "string", enum: ["agent", "principal"], description: "The submitter's claim about itself; recorded, never verified." },
      mandate_text: { type: "string", maxLength: MANDATE_TEXT_CAP, description: "The claimed instructions, exactly as they arrived." },
      declared_cap_usdc: { type: "number", minimum: 0, description: "Declared spending ceiling in USDC; declared, never enforced." },
      expires_at: { type: "string", format: "date-time", description: "Declared expiry; declared, never enforced." },
      evidence_hash: { type: "string", pattern: "^[0-9a-f]{64}$", description: "sha256 over the canonical fields above signature; what a citing certificate binds." },
      scope: { type: "string", description: "The issuer's statement of what the record proves and does not." },
      signature: { type: "string", pattern: "^[0-9a-f]{128}$" },
      public_key: { type: "string", pattern: "^[0-9a-f]{64}$" },
      signature_covers: { type: "string" },
    },
    additionalProperties: false,
  };
}
