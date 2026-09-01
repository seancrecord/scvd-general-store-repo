import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import {
  AUDIT_BATTERY_CHANGE_NOTE,
  AUDIT_CRITERIA_VERSION,
} from "@/services/service-audit";
import { PREFLIGHT_VERSION_NEXT } from "@/services/preflight";
import { WHO_PAYS_AND_WHAT_IT_BUYS } from "@/store/copy/who-pays";
import { GRADUATED, WATCHED } from "@/store/becoming";

const BASE = "https://scvd.store";

/**
 * THE CRITERIA PAGE — rule 43's gate ("no badge ships before its
 * criteria page exists"), opened 2026-08-10 on the keeper's ruling.
 *
 * The page's one genuinely new claim is the retirement law — nothing
 * retires a badge, it ages — and everything else is DERIVED from
 * documents that already exist: the artifact classes from the
 * attestation spec, the battery from the versioned preflight, the
 * immunity clause from the watches. These tests hold the derivations
 * derived: a hand-typed copy that drifts from its source is the exact
 * defect the page exists to prevent in badges.
 */

async function json(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, `${path} did not answer 200`).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe("the criteria page", () => {
  it("serves every artifact class the attestation spec knows, derived not retyped", async () => {
    const body = await json("/criteria");
    const classes = body.artifact_classes as Array<{ id: string }>;
    expect(classes.map((entry) => entry.id)).toEqual(
      ARTIFACT_CLASSES.map((entry) => entry.id),
    );
  });

  it("names the versioned battery it would check against", async () => {
    const body = await json("/criteria");
    const battery = body.criteria_battery as { version: string; url: string };
    expect(battery.version).toBe(AUDIT_CRITERIA_VERSION);
    expect(battery.url).toBe(`${BASE}/api/preflight/${PREFLIGHT_VERSION_NEXT}`);
    expect(String((body.criteria_battery as { changed: string }).changed)).toBe(
      AUDIT_BATTERY_CHANGE_NOTE,
    );
    // And the named URL actually answers — a criteria page whose
    // criteria 404 is a contract pointing at a wall.
    const criteria = await SELF.fetch(battery.url);
    expect(criteria.status).toBe(200);
  });

  it("carries the keeper's retirement ruling: nothing retires a badge, it ages", async () => {
    const body = await json("/criteria");
    const law = String(body.what_retires_a_badge);
    expect(law).toContain("Nothing retires a badge");
    expect(law).toContain("It ages");
    // The dated observation is the whole shape; a live status to
    // revoke is the shape it must never grow into.
    expect(law.toLowerCase()).toContain("newer observation supersedes");
  });

  it("says a badge is a dated observation and never a score on an actor", async () => {
    const body = await json("/criteria");
    expect(String(body.what_a_badge_is).toLowerCase()).toContain(
      "dated observation",
    );
    expect(String(body.never_a_score_on_an_actor).toLowerCase()).toContain(
      "no accumulating score",
    );
  });

  /**
   * REPLACED 2026-08-24 (ledger A1). This test used to read:
   *
   *   it("admits that nothing carries a badge today", ...)
   *     expect(String(body.badges_today)).toContain("None");
   *
   * It passed for as long as it existed, and it was pinning a false
   * claim in place. Five badge surfaces were shipping — sticker,
   * patron, service audit, passport chip, stamp — while the criteria
   * page announced there were none, and the suite defended the
   * announcement.
   *
   * THAT IS THE WORST SHAPE THIS DEFECT TAKES. An unguarded false
   * claim is an oversight. A guarded one has a test arguing for it,
   * so the next person to notice the discrepancy checks the suite,
   * sees green, and concludes they misread the product. The guard
   * converts a fixable mistake into evidence against the person who
   * spotted it.
   *
   * The lesson is not "write more tests". It is that a test asserting
   * an ABSENCE must be derived from the thing that would end the
   * absence — here, the router. Otherwise it silently becomes a test
   * that the absence be maintained.
   */
  it("counts the badges it actually serves, and never claims none", async () => {
    const body = await json("/criteria");
    const badges = body.badges_today as {
      count: number;
      summary: string;
      serves: { route: string; asserts: string; does_not_assert: string }[];
    };
    expect(badges.count).toBeGreaterThan(0);
    expect(badges.serves).toHaveLength(badges.count);
    expect(badges.summary).not.toContain("None.");
    // Rule 43 rides every entry: a mark that cannot say what it
    // refuses to assert is a score wearing a sticker.
    for (const entry of badges.serves) {
      expect(entry.asserts.length).toBeGreaterThan(0);
      expect(entry.does_not_assert.length).toBeGreaterThan(0);
    }
  });

  it("serves the same immunity clause the watch histories carry, byte for byte", async () => {
    /*
     * The clause lived as two identical inline strings before this
     * page made a third; it was extracted instead. If either watch
     * ever stops serving the shared constant, that is a wording fork
     * on the sentence that says payment cannot buy an outcome.
     */
    const body = await json("/criteria");
    expect(body.who_pays_and_what_it_buys).toBe(WHO_PAYS_AND_WHAT_IT_BUYS);
  });

  it("keeps the verdict vocabulary observation-shaped", async () => {
    const body = await json("/criteria");
    const verdicts = (
      body.verdict_vocabulary as Array<{ verdict: string }>
    ).map((entry) => entry.verdict);
    expect(verdicts).toContain("not_probed"); // gaps counted against us
    for (const verdict of verdicts) {
      // "safe" is the most warranty-shaped word available; the page
      // promises it never appears as a verdict, so hold it there.
      expect(verdict).not.toMatch(/safe|good|trusted|approved/i);
    }
  });

  it("answers as a paper page too, under the name the rooms list gave it", async () => {
    const response = await SELF.fetch(`${BASE}/criteria`, {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain("<title>");
    expect(page).toContain("What retires a badge");
  });
});

describe("the gate is recorded as opened, not re-promised", () => {
  it("/becoming records the marketplace as graduated, honest gap included", async () => {
    /**
     * This test's earlier form held the row on the WATCHED list
     * "until a badge class actually ships" — its own words. The badge
     * class shipped 2026-08-20 (/badges/audit/{id}.svg), so the row
     * graduates whole, original trigger kept, and the honest residue
     * moves with it: nobody outside has displayed one yet.
     */
    expect(
      WATCHED.find((watched) =>
        watched.item.includes("verification marketplace"),
      ),
      "the marketplace row is still on the watched list after its badge shipped",
    ).toBeUndefined();
    const graduated = GRADUATED.find((entry) =>
      entry.item.includes("verification marketplace"),
    );
    expect(graduated, "the marketplace row vanished instead of graduating").toBeTruthy();
    expect(graduated?.trigger).toContain("criteria page");
    expect(graduated?.fired).toContain("2026-08-10");
    expect(graduated?.built).toContain("no outside subject has yet displayed one");
  });

  it("/attestation names the criteria page beside what it signs", async () => {
    const body = await json("/attestation");
    expect(body.criteria_page).toBe(`${BASE}/criteria`);
  });
});
