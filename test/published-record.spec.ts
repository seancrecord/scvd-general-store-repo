import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import PUBLISHED from "../registry/clawhub/published.json";
import BUNDLE from "../registry/clawhub/SKILL.md?raw";
import { SKILL_VERSION } from "@/store/spec";

/**
 * THE RECORD THAT GUARDS THE GUARD.
 *
 * scripts/publish-skill.mjs refuses to publish a new version number
 * over byte-identical bundle contents, and it answers "did the bundle
 * change?" by comparing against bundle_sha256 in published.json.
 *
 * That makes the record load-bearing in a quiet way: a WRONG hash
 * there does not fail loudly, it just stops the refusal from firing.
 * On 2026-08-02 the file said 2.6.0 / 2fcb0675... while 2.7.0 was
 * already live from a bundle hashing to be4aebaa..., because the
 * script writes the record on the publishing machine and cannot
 * commit it. The publish happened; the commit did not.
 *
 * Nothing checked it, so nothing said so.
 */
const bundleHash = createHash("sha256").update(BUNDLE).digest("hex");

describe("the published record can be trusted by the guard that reads it", () => {
  it("records a hash in the shape a hash comes in", () => {
    expect(PUBLISHED.bundle_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(PUBLISHED.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /**
   * THE INVARIANT WORTH HAVING, and it is deliberately narrow.
   *
   * When the store DECLARES the same version the record says was
   * published, the bundle in the tree must be the bundle that went
   * out. If it is not, there are unpublished edits sitting under a
   * version number that already shipped — which is the state where
   * the fifth refusal is looking at the wrong bytes.
   *
   * The window this can be red in is exactly one: bundle edited,
   * version not yet bumped. That is the correct thing to be red
   * about, and the fix is named in the failure rather than left to
   * be worked out.
   */
  it("has the bundle that shipped, whenever the store claims that version", () => {
    if (SKILL_VERSION !== PUBLISHED.version) {
      // Legitimately mid-flight: the constant has been bumped and the
      // publish has not happened yet. Nothing to check — the record
      // describes an older release on purpose.
      return;
    }
    expect(
      bundleHash,
      `registry/clawhub/SKILL.md has changed since ${PUBLISHED.version} was published, ` +
        `but src/store/spec.ts still declares ${SKILL_VERSION}. Either bump ` +
        `SKILL_VERSION (the edits are a new release) or revert the bundle (they ` +
        `were not meant to ship). Left as-is, the publish script's fifth refusal ` +
        `compares against a stale hash and stops catching version bumps over ` +
        `unchanged bytes.`,
    ).toBe(PUBLISHED.bundle_sha256);
  });

  /**
   * A reconstruction is allowed; a reconstruction PRETENDING to be an
   * observation is not. If the two fields the publishing machine
   * alone can know are absent, the file has to say why in its own
   * body rather than leaving a reader to assume it was recorded live.
   */
  it("says so when it was rebuilt rather than observed", () => {
    const observed =
      PUBLISHED.published_at !== null && PUBLISHED.changelog !== null;
    if (observed) {
      return;
    }
    // Read defensively rather than as a typed property: the SCRIPT
    // writes {version, bundle_sha256, published_at, commit, changelog}
    // and a reconstruction adds recorded_by. Typing against whichever
    // shape happens to be committed breaks the build the next time the
    // other one lands — which is exactly what it did when the real
    // publish record replaced the reconstruction.
    const record = PUBLISHED as Record<string, unknown>;
    expect(
      String(record["recorded_by"] ?? "").toLowerCase(),
      "the record is missing the fields only a live publish can supply, and does not admit it was reconstructed",
    ).toContain("reconstructed");
  });
});
