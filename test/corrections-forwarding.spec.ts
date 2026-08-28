import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * CORRECTION-CHAIN VISIBILITY, FIRST-CLASS (outside review,
 * 2026-08-27, accepted): "if any old artifact or public page is
 * superseded, the newer correction should be more discoverable than
 * the stale claim."
 *
 * The house cannot retro-edit signed history — that refusal is the
 * spine — so the discoverability has to run the other way: every
 * EVIDENCE surface carries a pointer to the corrections desk, so a
 * reader standing on any claim this store ever signed is one hop
 * from the record of what later proved wrong. A surface that serves
 * evidence without that pointer is a stale claim waiting to outrank
 * its own correction.
 *
 * This spec is the standing check, not a one-time audit: a NEW
 * evidence surface added without the pointer fails here, by name.
 */

const EVIDENCE_SURFACES = [
  "/corpus.json",
  "/corpus/trajectory.json",
  "/corpus/wallet-facts.json",
  "/defects.json",
  "/fresh-set",
  "/passport",
];

describe("every evidence surface is one hop from the corrections desk", () => {
  for (const path of EVIDENCE_SURFACES) {
    it(`${path} points at /corrections`, async () => {
      const response = await SELF.fetch(`https://scvd.store${path}`, {
        headers: { Accept: "application/json" },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("/corrections");
    });
  }

  it("the per-host history carries the pointer too", async () => {
    // Any host answers — the shape is what is under test, and the
    // pointer must ride even a history of gaps.
    const response = await SELF.fetch(
      "https://scvd.store/corpus/host/never-met.example.json",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/corrections");
  });
});
