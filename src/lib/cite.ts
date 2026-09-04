/**
 * THE CITE LINE (roadmap C7, 2026-09-04). Every signed page and every
 * signed document this store serves carries one line another
 * instrument, a paper or an agent can quote verbatim: what the thing
 * is, which one, when it was observed, where the signed bytes are and
 * where the key is. Derived from the artifact's own fields, never
 * typed; the same text on the JSON (`cite`) and on the page.
 *
 * A citation names the observation, not a judgment: "observed" is the
 * word, and the verify URL is the part that lets the citing party check
 * the bytes without asking us.
 */

export interface CiteInput {
  base: string;
  /** What kind of thing: "endpoint passport", "corpus snapshot", "receipt", "recorded 402 door". */
  what: string;
  /** Which one: a host, a sequence, an id, a name. */
  which: string;
  /** When it was observed, taken or recorded, as served. */
  observed_at: string | null | undefined;
  /** The URL whose bytes are the thing cited. */
  url: string;
  /** Where the signature can be checked, when it differs from the URL. */
  verify_url?: string;
  /** Unsigned material (a recorded fixture) says so instead of naming a key. */
  signed?: boolean;
}

export interface CiteBlock {
  cite: string;
  cite_format: string;
}

export function citeLine(input: CiteInput): string {
  const when = input.observed_at ? `observed ${input.observed_at}` : "observation date not stated";
  const proof = input.signed === false ? "unsigned recorded material" : `ed25519-signed, key at ${input.base}/.well-known/scvd-signing-key`;
  const verify = input.verify_url && input.verify_url !== input.url ? `; verify at ${input.verify_url}` : "";
  return `scvd.store, ${input.what} ${input.which}, ${when}; ${proof}; bytes at ${input.url}${verify}.`;
}

export function citeBlock(input: CiteInput): CiteBlock {
  return {
    cite: citeLine(input),
    cite_format: "One line to quote verbatim: the issuer, what and which, when it was observed, how it is signed and where the key is, and the URL whose bytes are the thing cited. A citation names an observation, never a judgment.",
  };
}

export function citeHtml(input: CiteInput, escape: (text: string) => string): string {
  return `<p class="menu-meta" data-cite><strong>Cite:</strong> <code>${escape(citeLine(input))}</code></p>`;
}
