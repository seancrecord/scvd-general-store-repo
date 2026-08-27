import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DEFECT_CLASSES,
  DEFECT_VOCABULARY_VERSION,
  VOCABULARY_CHANGELOG,
} from "@/store/defect-vocabulary";

/**
 * REPAIR HINTS (outside review, 2026-08-27, accepted): "expose
 * operator repair actions next to conflicts." A named defect that
 * only names the break sends the operator to a search engine at
 * exactly the moment they were ready to act. Each class now carries
 * repair_hint — what the operator DOES, in their own systems, to
 * clear it.
 *
 * A hint is advice about a door, not a verdict about an operator —
 * it changes nothing about what a finding asserts, and falsified_by
 * remains the only authority on whether the defect is present. But
 * the vocabulary is governed, so even an additive field arrives as a
 * version with a changelog entry, like every change before it.
 */

describe("every defect class says what fixes it", () => {
  it("repair_hint is present, substantive, and operator-actionable in voice", () => {
    for (const entry of DEFECT_CLASSES) {
      expect(entry.repair_hint, entry.id).toBeDefined();
      // Substantive: a real sentence, not a stub.
      expect(entry.repair_hint.length, entry.id).toBeGreaterThan(40);
      // Advice about the door, never a judgment about its operator.
      expect(entry.repair_hint).not.toMatch(/operator is|operator's fault/i);
    }
  });

  it("the governed version moved and the changelog says why", () => {
    expect(DEFECT_VOCABULARY_VERSION).toBe("4");
    const current = VOCABULARY_CHANGELOG.find(
      (change) => change.version === DEFECT_VOCABULARY_VERSION,
    );
    expect(current).toBeDefined();
    expect(current!.what_changed).toMatch(/repair_hint/);
  });

  it("the public vocabulary serves the hints", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/defects.json")
    ).json()) as {
      version: string;
      classes: Array<{ id: string; repair_hint?: string }>;
    };
    expect(body.version).toBe("4");
    for (const entry of body.classes) {
      expect(entry.repair_hint, entry.id).toBeDefined();
    }
  });
});
