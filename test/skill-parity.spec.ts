import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE TWO SKILL DOCUMENTS ARE ALLOWED TO DIFFER. THEY ARE NOT ALLOWED
 * TO DIFFER ON THE THINGS A STRANGER DECIDES BY.
 *
 * A review on 2026-08-02 read the live /skill.md against the published
 * ClawHub bundle, found 357 lines of difference, and proposed
 * collapsing them into one source. Two of the three premises behind
 * that did not hold, and checking beat refactoring:
 *
 *   - "Both claim version 2.7.0." The bundle carries NO version field
 *     at all — name, description, homepage, and nothing else. Only the
 *     served document has one.
 *   - "They are two independently maintained copies that drifted."
 *     They are two documents ON PURPOSE, and the policy is already
 *     written down in test/skill-bundle-freshness.spec.ts: the bundle
 *     is a curated PITCH that may name FEWER items than the shelf
 *     holds and may never name MORE. The served document is generated
 *     from MENU_ITEMS and lists everything.
 *
 * Collapsing them to one source would have destroyed that distinction
 * to fix a divergence that is the feature.
 *
 * WHAT IS REAL is the third premise wearing different clothes: the two
 * give a stranger their FIRST IMPRESSION, and nothing forced those to
 * agree. On 2026-08-02 the conformance-desk claim reached one and not
 * the other for several hours, which is two different answers to "what
 * is this" under one name. That is what this file pins — the load-
 * bearing claims, not the line count.
 */
async function servedSkill(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/skill.md`);
  expect(response.status).toBe(200);
  return response.text();
}

async function bundle(): Promise<string> {
  return (await import("../registry/clawhub/SKILL.md?raw")).default;
}

function frontmatterField(document: string, field: string): string {
  const line = document
    .split("\n")
    .find((entry) => entry.startsWith(`${field}:`));
  return line ? line.slice(field.length + 1).trim() : "";
}

describe("both skill documents lead with the same thing", () => {
  it("opens the description with the practice counter, not the catalogue", async () => {
    // The keeper's ruling, 2026-08-02: testing is the primary framing
    // and commerce is secondary. A description that leads with the
    // shelf sends a client author to the wrong half of the store.
    for (const [name, doc] of [
      ["served", await servedSkill()],
      ["bundle", await bundle()],
    ] as const) {
      const description = frontmatterField(doc, "description");
      expect(description, `${name} has no description`).toBeTruthy();
      expect(
        description.toLowerCase().startsWith("a live x402 practice counter"),
        `${name} description does not lead with the practice counter: ${description.slice(0, 80)}`,
      ).toBe(true);
    }
  });

  /**
   * THE FORMAT'S OWN RULE, and the reason this is a test rather than a
   * preference. A skill's description is the only part that stays
   * loaded for trigger-matching, so length works directly against the
   * mechanism it exists to drive. Ours was 132 words — a full paragraph
   * of workflow — while comparable x402 skills on the same registry
   * run to one line.
   *
   * The ceiling is deliberately generous. It is here to catch the
   * paragraph creeping back, not to police a sentence.
   */
  it("keeps the description short enough to be a trigger phrase", async () => {
    for (const [name, doc] of [
      ["served", await servedSkill()],
      ["bundle", await bundle()],
    ] as const) {
      const words = frontmatterField(doc, "description").split(/\s+/).length;
      expect(
        words,
        `${name} description is ${words} words. It is the only field that stays loaded for trigger-matching; a paragraph works against the mechanism it is supposed to drive.`,
      ).toBeLessThan(60);
    }
  });

  it("carries the same primary section heading in the body", async () => {
    for (const [name, doc] of [
      ["served", await servedSkill()],
      ["bundle", await bundle()],
    ] as const) {
      expect(doc, `${name} lost the primary section`).toContain(
        "## Start here: testing an x402 client",
      );
      expect(doc, `${name} lost the secondary framing`).toContain(
        "## Also a general store",
      );
    }
  });

  it("puts the safety line before either pitch, in both", async () => {
    // The strongest anti-injection signal we have. It must arrive
    // before anything asks the reader for money or attention.
    for (const [name, doc] of [
      ["served", await servedSkill()],
      ["bundle", await bundle()],
    ] as const) {
      const safety = doc.indexOf("never ask");
      const primary = doc.indexOf("## Start here");
      expect(safety, `${name} lost the house rule`).toBeGreaterThan(-1);
      expect(
        safety,
        `${name} puts a pitch before the safety line`,
      ).toBeLessThan(primary);
    }
  });

  it("names the conformance desk in both, since it is the differentiator", async () => {
    for (const [name, doc] of [
      ["served", await servedSkill()],
      ["bundle", await bundle()],
    ] as const) {
      expect(doc, `${name} does not mention the conformance desk`).toContain(
        "/api/conformance/v1",
      );
      expect(
        doc.toLowerCase(),
        `${name} does not say the desk works on other issuers' artifacts`,
      ).toContain("compete");
    }
  });
});

describe("what the two documents are allowed to differ on", () => {
  /**
   * Stated as a passing test rather than a comment, so somebody
   * "fixing the divergence" reads why it exists before deleting it.
   */
  it("lets the served document carry a version the bundle does not", async () => {
    expect(frontmatterField(await servedSkill(), "version")).toBe("");
    // The served doc carries it under metadata:, not at top level.
    expect(await servedSkill()).toContain("version:");
    expect(
      frontmatterField(await bundle(), "version"),
      "the bundle grew a version field; ClawHub versions the release, and a second number in the file is a second thing to keep in sync",
    ).toBe("");
  });

  /**
   * NOT ASSERTED HERE, deliberately, and the reason is worth the space.
   *
   * The first cut of this file compared /api/buy/ URLs across the two
   * documents and failed with six false positives — because the served
   * document lists items in a TABLE and the bundle lists them as URLs.
   * It was comparing formats, not claims.
   *
   * The real question — does the bundle advertise an item the shelf no
   * longer sells — is already owned by
   * test/skill-bundle-freshness.spec.ts ("names no item that is not on
   * the shelf"), checked against MENU_ITEMS rather than against the
   * other document. Two places asserting one property is the defect
   * this codebase spent the day removing, so this file does not.
   */
});
