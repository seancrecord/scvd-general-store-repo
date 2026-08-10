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

/** The tags as head markup. Empty string when there are none. */
export function verificationMetaTags(): string {
  return VERIFICATION_TAGS.map(
    (tag) => `\n  <meta name="${tag.name}" content="${tag.content}">`,
  ).join("");
}
