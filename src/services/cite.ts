/**
 * THE CITE BOX (2026-09-04). A scorer that restates a row makes a
 * claim of its own that nobody can check; a scorer that links the row
 * by its entry URL and digest makes a claim anyone can. Datasets that
 * get cited correctly are the ones that print the citation for you,
 * so every row surface prints this shape, and the citation watch in
 * scripts/lib/citations.mjs recognises it. Typed once, rendered
 * everywhere, never restated by hand.
 */
import { citeLine } from "@/lib/cite";

export interface CitationSource {
  host?: string;
  week: string;
  sequence: number;
  taken_at: string;
  digest: string;
  entry_url: string;
}

export interface Citation {
  /** The one line for prose. */
  text: string;
  /** For a README or a methodology page. */
  markdown: string;
  /** The shape a machine writes and the watch reads. */
  json: {
    cites: string;
    host?: string;
    week: string;
    sequence: number;
    observed_at: string;
    digest: string;
    rows?: string;
    index: string;
    license: "CC-BY-4.0";
    how: string;
  };
}

export function citeRow(base: string, source: CitationSource): Citation {
  const subject = source.host ? `${source.host}, ` : "";
  /*
   * ONE LINE FORMAT (2026-09-04, merged): the sentence is lib/cite's
   * citeLine, the same line every signed document on the store
   * carries; the digest rides the JSON shape beside it.
   */
  const text = citeLine({
    base,
    what: source.host ? "host row" : "corpus snapshot",
    which: `${subject}week ${source.week}, snapshot ${source.sequence}, sha256 ${source.digest}`,
    observed_at: source.taken_at,
    url: source.entry_url,
  });
  const markdown = `[scvd.store corpus, ${subject}week ${source.week}, snapshot ${source.sequence}](${source.entry_url}) — sha256 \`${source.digest}\``;
  return {
    text,
    markdown,
    json: {
      cites: source.entry_url,
      ...(source.host ? { host: source.host } : {}),
      week: source.week,
      sequence: source.sequence,
      observed_at: source.taken_at,
      digest: source.digest,
      ...(source.host ? { rows: `${base}/corpus/host/${source.host}.json` } : {}),
      index: `${base}/corpus.json`,
      license: "CC-BY-4.0",
      how: `${base}/scorers`,
    },
  };
}

export const CITE_HOW =
  "Cite a row by its entry URL and digest, never by restating it. The digest is the one the corpus index commits to; if the row's bytes ever changed, the chain check at /corpus.json would fail, which is what makes the citation checkable.";
