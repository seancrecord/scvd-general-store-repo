import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  CORPUS_DATASET_DOI,
  CORPUS_DATASET_DOI_URL,
  CORPUS_DATASET_NAME,
} from "@/store/corpus-dataset";

const BASE = "https://scvd.store";

/**
 * THE CORPUS HAS A DOI (2026-09-03, the keeper's Zenodo record), and
 * every surface that declares the corpus as a Dataset says so the way
 * a dataset index reads it: a PropertyValue identifier with
 * propertyID "DOI", and the doi.org URL in sameAs. Three surfaces
 * declare it; this walks all three so a fourth copy typed by hand
 * without the DOI would fail here.
 */
function datasetNodes(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!.replace(/\\u003c/g, "<")) as Record<string, unknown>,
  );
  const nodes: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const graph = Array.isArray(block["@graph"]) ? (block["@graph"] as Record<string, unknown>[]) : [block];
    for (const node of graph) if (node["@type"] === "Dataset" && node["name"] === CORPUS_DATASET_NAME) nodes.push(node);
  }
  return nodes;
}

function expectCitable(node: Record<string, unknown>, where: string): void {
  expect(node["identifier"], `${where}: no identifier`).toEqual({
    "@type": "PropertyValue",
    propertyID: "DOI",
    value: CORPUS_DATASET_DOI,
  });
  const sameAs = node["sameAs"];
  const list = Array.isArray(sameAs) ? sameAs : [sameAs];
  expect(list, `${where}: doi.org missing from sameAs`).toContain(CORPUS_DATASET_DOI_URL);
}

describe("the corpus DOI", () => {
  it("is a Zenodo DOI, and the URL is the doi.org resolver", () => {
    expect(CORPUS_DATASET_DOI).toMatch(/^10\.5281\/zenodo\.\d+$/);
    expect(CORPUS_DATASET_DOI_URL).toBe(`https://doi.org/${CORPUS_DATASET_DOI}`);
  });

  it("is on the storefront's Dataset node", async () => {
    const html = await (await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })).text();
    const nodes = datasetNodes(html);
    expect(nodes.length, "the storefront declares the corpus").toBeGreaterThan(0);
    for (const node of nodes) expectCitable(node, "storefront");
  });

  it("is on /corpus, in the node and in the prose", async () => {
    const html = await (await SELF.fetch(`${BASE}/corpus`, { headers: { Accept: "text/html" } })).text();
    const nodes = datasetNodes(html);
    expect(nodes.length, "/corpus declares the corpus").toBeGreaterThan(0);
    for (const node of nodes) expectCitable(node, "/corpus");
    expect(html).toContain(`href="${CORPUS_DATASET_DOI_URL}"`);
  });

  it("is on /corpus.json, which is the Dataset itself", async () => {
    const doc = (await (await SELF.fetch(`${BASE}/corpus.json`)).json()) as Record<string, unknown>;
    expect(doc["@type"]).toBe("Dataset");
    expectCitable(doc, "/corpus.json");
  });
});
