/**
 * THE CORPUS DATASET'S SHARED IDENTITY — one copy, two surfaces.
 *
 * The Dataset is declared twice on purpose: at /corpus.json, where the
 * data lives, and as a top-level node in the storefront's JSON-LD,
 * where a crawler actually looks. The two declarations drifted the
 * first time they were written separately — the storefront's node
 * shipped with NO description at all, which Search Console reports as
 * an invalid Dataset ("Missing field description", 2026-08-16), and an
 * invalid item is one that cannot be cited. Name, description and
 * licence now live here and both surfaces import them, so the next
 * edit lands on both or on neither.
 */

export const CORPUS_DATASET_NAME =
  "The scvd corpus — weekly observations of the public x402 ecosystem";

export const CORPUS_DATASET_DESCRIPTION =
  "One snapshot per weekly ward round of the public x402 discovery list: which hosts were listed, which answered, and what a single conformance probe saw at that moment. Hash-chained, ed25519-signed, each digest submitted to OpenTimestamps for Bitcoin anchoring. Dated observations of moments, never scores on operators.";

/**
 * CC BY 4.0, AND WHY THAT IS NOT THE REFLEX THE NO-LAWYERS RULING
 * FORBIDS. The ruling was against INVENTING legal terms — drafting
 * clauses this store has no business drafting. For a while the corpus
 * therefore asserted no licence at all, which read as principled and
 * behaved as the opposite: with nothing stated, a careful reuser must
 * assume all rights reserved, so "free to read" was true and "free to
 * use" was legally absent — and Search Console flagged the missing
 * field on every Dataset (2026-08-16). CC BY 4.0 is the off-the-shelf
 * answer: a standard licence taken whole, zero words of our own,
 * requiring exactly the thing the corpus exists for — that reuse names
 * the original source. conditionsOfAccess still states the plain fact
 * beside it; this states what a reuser may do with the data.
 */
export const CORPUS_DATASET_LICENSE =
  "https://creativecommons.org/licenses/by/4.0/";

/**
 * THE DOI (2026-09-03, the keeper's Zenodo record). A DOI is the
 * citation form researchers and their tools use, and papers are part
 * of the answer engines' diet: arxiv.org was cited 53 times in the
 * prompt export that started the AEO plan, and nobody else in the x402
 * space has one for their data. The record on Zenodo holds the same
 * files this site serves (the index, one file per signed round, the
 * tiers), CC BY 4.0, a new version per weekly round.
 *
 * Zenodo mints two DOIs per record: one for each version (the first
 * is 10.5281/zenodo.22284888) and one for the concept that every
 * version shares. This is the CONCEPT DOI, read by the keeper from the
 * record's "Cite all versions" box on 2026-09-03, so the citation
 * never goes stale as weekly rounds are added: it always resolves to
 * the latest version.
 */
export const CORPUS_DATASET_DOI = "10.5281/zenodo.22284887";
export const CORPUS_DATASET_DOI_URL = `https://doi.org/${CORPUS_DATASET_DOI}`;

/**
 * The fields that make a Dataset node citable, for every surface that
 * declares the corpus (the storefront, /corpus, /corpus.json): the DOI
 * as a PropertyValue identifier, which is how Google Dataset Search
 * and schema.org consumers read it, and the doi.org URL as sameAs.
 */
export function corpusDatasetIdentityFields(): {
  identifier: { "@type": "PropertyValue"; propertyID: "DOI"; value: string };
  sameAs: string[];
} {
  return {
    identifier: { "@type": "PropertyValue", propertyID: "DOI", value: CORPUS_DATASET_DOI },
    sameAs: [CORPUS_DATASET_DOI_URL],
  };
}
