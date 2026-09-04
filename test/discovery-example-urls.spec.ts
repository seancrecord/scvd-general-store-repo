import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyDiscoveryExtensions } from "@/lib/bazaar-discovery";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { isRecord } from "@/types";

/**
 * NO PUBLISHED EXAMPLE MAY CITE AN ARTIFACT THAT DOES NOT EXIST.
 *
 * 2026-09-04: x402-list.com listed this store with the citation
 * `https://scvd.store/api/verify/cert_k2m9v4xwqp`, and clicking it
 * returned "No certificate by that name on the wall. Check the
 * spelling on your receipt." The id was a placeholder in
 * buyOutputExample that looked exactly like a real one.
 *
 * It was not a typo in an outreach document. These examples ride the
 * x402 v2 bazaar discovery extension on EVERY 402, the facilitator
 * catalogs them, and directories ingest the catalog — so the dead
 * link was published on every challenge the store had ever issued,
 * and the directory quoted it faithfully.
 *
 * For a store selling verifiable evidence, a verify URL that 404s is
 * the worst possible link to broadcast. This pins the rule: a
 * fully-qualified scvd.store URL in a published example must answer.
 * Per-purchase ids are templated, never invented.
 */

/** Every string anywhere inside the declared discovery extensions. */
function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) stringsIn(entry, found);
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) stringsIn(entry, found);
  }
  return found;
}

const published = MENU_ITEMS.flatMap((item) =>
  stringsIn(buyDiscoveryExtensions(item)),
);

describe("what the discovery examples tell a directory to click", () => {
  it("publishes something for every item, so this guard is not vacuous", () => {
    expect(MENU_ITEMS.length).toBeGreaterThan(0);
    expect(published.length).toBeGreaterThan(MENU_ITEMS.length);
  });

  /**
   * The id shapes the store actually mints. An example carrying one
   * of these inside a scvd.store URL is claiming a specific artifact
   * exists — and unless it is the live sample, it does not.
   */
  it("never cites a minted id it did not mint", () => {
    const minted = /https:\/\/scvd\.store\/\S*?\b(cert|ord)_[a-z0-9]{6,}/g;
    const offenders: string[] = [];
    for (const text of published) {
      for (const hit of text.matchAll(minted)) {
        if (!hit[0].includes(SAMPLE_ARTIFACT_ID)) {
          offenders.push(hit[0]);
        }
      }
    }
    expect(
      offenders,
      `A published example points at an artifact id nobody minted. Template it (\`<your cert_id>\`) or use SAMPLE_ARTIFACT_ID, which health.ts keeps alive.`,
    ).toEqual([]);
  });

  it("keeps the per-purchase ids templated rather than invented", () => {
    // The two that got published as though they were real.
    const dead = ["cert_k2m9v4xwqp", "ord_h7n3k9wmxq"];
    for (const id of dead) {
      expect(published.join("\n"), id).not.toContain(id);
    }
  });

  /**
   * The shape has to survive too: an agent reads these to learn what
   * comes back, so templating must not quietly delete the field.
   */
  it("still shows a buyer where verification happens", () => {
    const verifyUrls = published.filter((text) =>
      text.startsWith("https://scvd.store/api/verify/"),
    );
    expect(verifyUrls.length).toBeGreaterThan(0);
    for (const url of verifyUrls) {
      expect(url).toContain("<");
    }
  });
});
