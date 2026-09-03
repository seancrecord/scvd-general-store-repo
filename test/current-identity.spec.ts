import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { VALUE_PROPOSITION, VALUE_PROPOSITION_DATED } from "@/store/copy/position";
import { CORRECTIONS } from "@/store/corrections";
import { CORPUS_DATASET_DOI } from "@/store/corpus-dataset";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE RECORD STAYS; THE CURRENT DEFINITION SITS ABOVE IT (2026-09-03,
 * an outside reviewer's point the keeper carried in). /becoming quotes
 * the nouns the store retired, dated, and engines read text literally,
 * so the page opens with the current sentence and says the rest is a
 * dated record. Derived from the constant, so it moves with it.
 */
describe("/becoming carries the current definition above the dated record", () => {
  it("opens with the current terminology, dated, before any heading", async () => {
    const page = await (await SELF.fetch(`${BASE}/becoming`, { headers: HTML })).text();
    const note = page.indexOf("Current terminology");
    expect(note).toBeGreaterThan(-1);
    expect(page.indexOf(VALUE_PROPOSITION_DATED)).toBeGreaterThan(-1);
    expect(page).toContain(VALUE_PROPOSITION.split(". ")[0]!);
    expect(note).toBeLessThan(page.indexOf("<h2>"));
  });
});

describe("/corrections is a dated document", () => {
  it("carries datePublished and dateModified derived from the ledger", async () => {
    const page = await (await SELF.fetch(`${BASE}/corrections`, { headers: HTML })).text();
    const dates = CORRECTIONS.map((e) => e.date).sort();
    expect(page).toContain(`"datePublished":"${dates[0]}"`);
    expect(page).toContain(`"dateModified":"${dates.at(-1)}"`);
  });
});

describe("every round and host page resolves to the concept dataset", () => {
  it("names the corpus by @id and DOI in isPartOf", async () => {
    const brief = (await (await SELF.fetch(`${BASE}/corpus/brief.json`)).json().catch(() => null)) as { week?: string } | null;
    const doc = (await (await SELF.fetch(`${BASE}/corpus.json`)).json()) as { distribution?: { contentUrl: string }[] };
    // The round page, when the chain holds a week; the corpus index always.
    expect(JSON.stringify(doc)).toContain(CORPUS_DATASET_DOI);
    if (brief?.week) {
      const page = await (await SELF.fetch(`${BASE}/corpus/round/${brief.week}`, { headers: HTML })).text();
      expect(page).toContain(`"isPartOf":{"@type":"Dataset","@id":"${BASE}/corpus.json"`);
      expect(page).toContain(CORPUS_DATASET_DOI);
    }
  });
});
