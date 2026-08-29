/**
 * THE SELF-DESCRIPTION EVERY PUBLISHED DATA SURFACE OWES ITS READER.
 *
 * Found 2026-08-29, when the keeper asked whether any of this is
 * actually readable by an agent — and specifically by a weak one.
 *
 * THE DEFECT WAS INVERTED FROM WHAT ANYONE WOULD GUESS. /registry
 * already carried careful schema.org JSON-LD: counts beside every
 * percentage, "shape only, one vantage", the vocabulary two
 * corrections had been filed to fix. But it carried it in the HTML
 * PAGE. Ask the same URL for JSON — which is what an agent does —
 * and the answer was `{version, weeks}`: the numbers with every
 * caveat stripped off.
 *
 * So the reader most likely to quote a figure verbatim, and least
 * able to see a paragraph beside it, was the one served the bare
 * ratio. The store's own H1 note says the machine-readable half
 * matters MORE for exactly this reason, and the JSON half had none.
 *
 * WHAT AN ENVELOPE HAS TO CARRY, and why each is not optional:
 *
 *   name / description  — what this is, in one line, before a parser
 *                         has to infer it from field names
 *   measurementTechnique — how the numbers were made. A count means
 *                         nothing without its method
 *   variableMeasured    — what each field IS, in words, with units.
 *                         `sole.received` is unreadable on its own
 *   whatThisIsNot       — THE ONE THIS STORE CANNOT OMIT. Every
 *                         reading here is hedged in prose a parser
 *                         has no reason to read. A machine consumer
 *                         gets the hedge as a field or it does not
 *                         get it at all
 *   conditionsOfAccess  — free, no key, no rate limit; say so rather
 *                         than let a reader assume otherwise
 *
 * The raw payload is spread at the top level, unchanged, so anything
 * already parsing `weeks` keeps working. The envelope is additive.
 */

export interface DatasetVariable {
  /** What the field is, in words a stranger can read. */
  name: string;
  /** The JSON path it lives at, so a parser can bind name to value. */
  path: string;
  /** PERCENT, USDC, COUNT, BLOCKS — absent when it is a plain count. */
  unitText?: string;
  /** What it must NOT be read as, when that is a live risk. */
  notes?: string;
}

export interface DatasetEnvelopeInput {
  name: string;
  description: string;
  url: string;
  measurementTechnique: string;
  variableMeasured: readonly DatasetVariable[];
  /** The hedge, as a field. Never optional on this store's surfaces. */
  whatThisIsNot: string;
  /** How a reader should consume it — the instruction a weak model
   * needs and a strong one skips. */
  howToRead?: string;
  temporalCoverage?: string;
}

export function datasetEnvelope(
  input: DatasetEnvelopeInput,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: input.name,
    description: input.description,
    url: input.url,
    license: "https://creativecommons.org/licenses/by/4.0/",
    creator: {
      "@type": "Organization",
      name: "scvd.store",
      url: "https://scvd.store",
    },
    isAccessibleForFree: true,
    conditionsOfAccess: "Free to read. No account, no key, no rate limit.",
    measurementTechnique: input.measurementTechnique,
    variableMeasured: input.variableMeasured.map((variable) => ({
      "@type": "PropertyValue",
      name: variable.name,
      /* Not a schema.org term. Kept anyway, because a parser that
       * cannot bind a described variable to the field it describes
       * has been handed a glossary and no dictionary. */
      propertyID: variable.path,
      ...(variable.unitText ? { unitText: variable.unitText } : {}),
      ...(variable.notes ? { description: variable.notes } : {}),
    })),
    ...(input.temporalCoverage
      ? { temporalCoverage: input.temporalCoverage }
      : {}),
    /*
     * NON-STANDARD KEYS, DELIBERATELY. schema.org has no term for
     * "here is what this data does not say", and that sentence is the
     * single most important thing this store publishes. A reader who
     * ignores an unknown key is no worse off than before; a reader
     * who reads it is saved from the mistake the prose was written to
     * prevent.
     */
    what_this_is_not: input.whatThisIsNot,
    ...(input.howToRead ? { how_to_read: input.howToRead } : {}),
  };
}
