/**
 * Third-party site-verification meta tags.
 *
 * Directories that list this store sometimes prove domain control by
 * asking for a meta tag in the page head. These are PROOF-OF-CONTROL
 * nonces, not secrets: useless to anyone who does not already control
 * scvd.store, which is the whole point of the check. Same category as
 * the x402-list token that briefly served at /.well-known.
 *
 * Kept in one place so both head renderers agree and so a tag can be
 * retired by deleting one line. Each entry says who asked and when,
 * because an unattributed token in a page head is a thing nobody can
 * safely remove later.
 */
export interface VerificationTag {
  /** The directory that issued it. */
  issuer: string;
  /** ISO date added. */
  added: string;
  name: string;
  content: string;
}

export const VERIFICATION_TAGS: readonly VerificationTag[] = [
  {
    issuer: "talentapp",
    added: "2026-08-02",
    name: "talentapp:project_verification",
    content:
      "2603d9fdb5a400bf88406b3ceb0e0f06bc085da021931ac4d1faf27dece8e1acaf36966e4e0b48444b8ecd87ecae6c2423485134d3214bfb31866725ebd923fb",
  },
  {
    issuer: "base (Base app directory ownership check)",
    added: "2026-08-10",
    name: "base:app_id",
    content: "6a7a377832200665f69b0f4d",
  },
];

/**
 * x402-list.com DOMAIN-OWNERSHIP TOKENS, served at /.well-known/x402list.txt.
 *
 * Their owner-update flow issues a one-time token that expires 72h
 * after issue; the file may carry several lines, and lines starting
 * with # are ignored. Every previous round hard-coded the token in the
 * route with a "remove after verification" note, and the note was
 * broken every time — the 08-26 token was still being served on
 * 09-02, a week dead. So the token now carries its own last day and
 * the file renders only the live ones: nothing to remember to remove,
 * and a dead nonce cannot sit at a well-known path by omission.
 *
 * Proof-of-control nonces, not secrets: useless to anyone who does not
 * already control scvd.store. The request id is kept so the check can
 * be re-run from their API if the page is lost.
 */
export interface DirectoryToken {
  issuer: string;
  /** ISO date the token was issued. */
  issued: string;
  /** ISO date, exclusive: the token is not served on or after this day. */
  serve_until: string;
  token: string;
  request_id?: string;
  /** What the round was for, one line. */
  purpose: string;
}

export const X402LIST_TOKENS: readonly DirectoryToken[] = [
  {
    issuer: "x402-list.com",
    issued: "2026-09-02",
    serve_until: "2026-09-06",
    token: "x402list-verify-4CmBDdTm1wU4eq-Q6Artnjthyrn5-tz_6H5WoML3jco",
    request_id: "d766c4a7-1918-4f4f-b0f3-2215ec15bb72",
    purpose:
      "listing update: the five doors listed W35-W36 (aura_walk, good_buyer, opening_day, provenance_check, the_case_file) and the sixty-word description",
  },
];

/**
 * The file body for /.well-known/x402list.txt at a given moment. The
 * clock is injected (AGENTS.md: a test whose verdict moves with the
 * wall clock is not a test). Comments only when nothing is live, so
 * the path keeps answering 200 with an honest explanation instead of
 * a dead nonce.
 */
export function x402listTokenFile(now: Date): string {
  const lines = [
    "# x402-list.com domain-ownership tokens for scvd.store.",
    "# One-time nonces, each served only until its own last day; see src/store/site-verification.ts.",
  ];
  for (const entry of X402LIST_TOKENS) {
    if (now < new Date(`${entry.serve_until}T00:00:00Z`)) {
      lines.push(`# issued ${entry.issued}, ${entry.purpose}`);
      lines.push(entry.token);
    }
  }
  if (lines.length === 2) {
    lines.push("# No verification in progress.");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * OPENAI PLUGIN DIRECTORY DOMAIN CHALLENGE, served at
 * /.well-known/openai-apps-challenge (2026-09-02).
 *
 * The plugin submission portal (platform.openai.com/plugins) proves
 * control of the MCP host by fetching this fixed path at the ORIGIN
 * ROOT — the /mcp subpath is stripped server-side, per OpenAI's own
 * submission doc and a closed forum thread confirming it — and it
 * must find the bare token and nothing else: no JSON, no comment
 * lines, no second token. text/plain, because a verification served
 * as octet-stream fails with "unsupported content type".
 *
 * Unlike the x402-list nonces above this one does NOT expire: OpenAI
 * asks that a host's token stay in place while a plugin still uses
 * it, and one host gets one token. So it is a single string, not a
 * dated list. Empty means no submission in progress and the path
 * answers 404, which is the honest state — an empty 200 would be a
 * token that is the empty string.
 *
 * Proof-of-control nonce, not a secret: useless to anyone who does
 * not already control scvd.store. Paste the portal's token here.
 */
export const OPENAI_APPS_CHALLENGE = "5tiA_QR8XKA2_K2LD4p6pBPGP4cK0uZuUI9FG-mKZ7c";

/** The tags as head markup. Empty string when there are none. */
export function verificationMetaTags(): string {
  return VERIFICATION_TAGS.map(
    (tag) => `\n  <meta name="${tag.name}" content="${tag.content}">`,
  ).join("");
}
