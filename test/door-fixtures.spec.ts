import { describe, expect, it } from "vitest";
import { BATTERY_CHECK_NAMES, runChecks, triStateVector } from "@/services/preflight";

/**
 * ROADMAP 2.3, SLICE 2 — RECORDED BYTES, REPLAYED OFFLINE (ledger E2).
 *
 * A battery whose behaviour is only observable by pointing it at a
 * live stranger's door cannot be released responsibly: nobody can
 * check what changed between versions, and every regression test
 * depends on somebody else's uptime. These fixtures are the bytes a
 * door actually returned (status, headers, body), replayed with no
 * network at all.
 *
 * THE ACCEPTANCE CRITERION IS CHECK INDEPENDENCE, and it is stricter
 * than "the bad fixture fails": every known-bad fixture must fail
 * EXACTLY the checks it is bad in, and no others. A check that goes
 * red on a fixture broken elsewhere is a check that will mislabel a
 * real operator's defect — the collateral-damage failure the whole
 * tri-state vector exists to prevent. Passing this suite is what
 * makes a battery version safe to publish.
 */

interface DoorFixture {
  name: string;
  recorded: string;
  why: string;
  expect_failed: string[];
  status: number;
  headers: Record<string, string>;
  body: string;
}

const fixtures = Object.entries(
  import.meta.glob("./fixtures/doors/*.json", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
).map(([path, raw]) => ({ path, fixture: JSON.parse(raw) as DoorFixture }));

describe("the door fixtures replay offline", () => {
  it("the corpus exists and every entry documents what it is", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
    for (const { path, fixture } of fixtures) {
      expect(fixture.name, `${path} needs a name`).toBeTruthy();
      expect(fixture.recorded, `${path} must say where the bytes came from`).toBeTruthy();
      expect(fixture.why, `${path} must say what it demonstrates`).toBeTruthy();
      expect(Array.isArray(fixture.expect_failed)).toBe(true);
      // Every expected failure names a real registry check — a typo
      // here would otherwise pass forever by expecting nothing.
      for (const name of fixture.expect_failed) {
        expect(
          (BATTERY_CHECK_NAMES as readonly string[]).includes(name),
          `${path} expects unknown check ${name}`,
        ).toBe(true);
      }
    }
  });

  for (const { path, fixture } of fixtures) {
    it(`${fixture.name}: fails exactly ${fixture.expect_failed.length === 0 ? "nothing" : fixture.expect_failed.join(", ")}`, () => {
      const response = new Response(fixture.body, {
        status: fixture.status,
        headers: fixture.headers,
      });
      // The body rides along the way every live caller hands it over
      // (2026-08-28): the battery reads both offer placements, and a
      // fixture replay that withheld the body would test a read no
      // instrument runs.
      const { checks } = runChecks(response, false, fixture.body);
      const failed = checks.filter((check) => !check.ok).map((check) => check.name);
      expect(failed.sort(), `${path}: collateral damage or a missed defect`).toEqual(
        [...fixture.expect_failed].sort(),
      );
      /*
       * And the vector stays honest about the rest: whatever the
       * battery did not reach says so, rather than going silently
       * missing or being booked as a second failure.
       */
      const vector = triStateVector(checks);
      expect(vector.map((row) => row.name).slice(0, BATTERY_CHECK_NAMES.length)).toEqual([
        ...BATTERY_CHECK_NAMES,
      ]);
      for (const row of vector) {
        if (row.state === "not_reached") {
          expect(row.blocked_by).toBeTruthy();
        }
      }
    });
  }
});
