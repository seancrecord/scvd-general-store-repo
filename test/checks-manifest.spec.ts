import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  ADVISORY_NAMES,
  BATTERY_ADDS,
  BATTERY_CHECK_NAMES,
  CONDITIONAL_CHECK_NAMES,
  PREFLIGHT_VERSIONS,
} from "@/services/preflight";

/**
 * ROADMAP 2.3, SLICE 1 — THE BATTERY'S MANIFEST IS DERIVED, DATED
 * AND DIGESTED (ledger B16/E2; the extraction seam for a future
 * @scvd/conformance package, and the rulesetDigest path issue #2833
 * will want).
 *
 * The criteria page describes the battery in prose; nothing served
 * the battery AS DATA — stable check IDs, which battery folds what,
 * when each rule changed. checks.json derives from the same constants
 * runChecks reads, so it cannot be hand-typed and cannot drift: the
 * manifest generator refusing drift IS this spec, which fails the
 * build if the served document and the code's registries disagree.
 */

async function manifest(): Promise<Record<string, unknown>> {
  const response = await SELF.fetch("https://scvd.store/api/preflight/checks");
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe("the battery manifest", () => {
  it("serves every registry, verbatim from code", async () => {
    const doc = await manifest();
    expect(doc["core_checks"]).toEqual([...BATTERY_CHECK_NAMES]);
    expect(doc["conditional_checks"]).toEqual([...CONDITIONAL_CHECK_NAMES]);
    expect(doc["advisories"]).toEqual([...ADVISORY_NAMES]);
    const batteries = doc["batteries"] as Record<string, { adds: string[] }>;
    for (const version of PREFLIGHT_VERSIONS) {
      expect(batteries[version]?.adds).toEqual([...BATTERY_ADDS[version]]);
    }
  });

  it("every name a battery folds exists in a registry — no orphan IDs", async () => {
    const doc = await manifest();
    const known = new Set([
      ...(doc["core_checks"] as string[]),
      ...(doc["conditional_checks"] as string[]),
      ...(doc["verdict_fold_checks"] as string[]),
    ]);
    for (const version of PREFLIGHT_VERSIONS) {
      for (const name of BATTERY_ADDS[version]) {
        expect(known.has(name), `${version} folds unregistered check ${name}`).toBe(true);
      }
    }
  });

  it("carries a dated changelog whose entries name a battery and a change", async () => {
    const doc = await manifest();
    const changelog = doc["changelog"] as {
      date: string;
      battery: string;
      change: string;
    }[];
    expect(changelog.length).toBeGreaterThanOrEqual(3);
    for (const entry of changelog) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(PREFLIGHT_VERSIONS).toContain(entry.battery);
      expect(entry.change.length).toBeGreaterThan(10);
    }
    // Newest last, append-only reading order.
    const dates = changelog.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("publishes a digest a stranger can recompute from the document itself", async () => {
    const doc = await manifest();
    const digest = String(doc["ruleset_digest"]);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(String(doc["ruleset_digest_covers"])).toContain("changelog");
    // The digest is over the stated fields, canonically serialized —
    // recompute it the way the document says to.
    const covered = (doc["ruleset_digest_covers"] as string)
      .split(",")
      .map((f) => f.trim());
    const payload = JSON.stringify(
      Object.fromEntries(covered.map((f) => [f, doc[f]])),
    );
    const bytes = new TextEncoder().encode(payload);
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hash).toBe(digest);
  });
});
