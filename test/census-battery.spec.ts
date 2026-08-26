import { describe, expect, it } from "vitest";
import { CORRECTIONS } from "@/store/corrections";
import {
  BATTERY_ADDS,
  PREFLIGHT_BATTERY,
  PREFLIGHT_BATTERY_NEXT,
  PREFLIGHT_VERSION_NEXT,
} from "@/services/preflight";
import { CENSUS_BATTERY, censusFoldedCheckNames } from "@/services/ward-round";

/**
 * ROADMAP 2.5 — THE CENSUS CITES THE BATTERY IT ACTUALLY RUNS.
 *
 * Found 2026-08-26 while scoping H4. Every ward-round row wrote
 * `battery: "preflight-v1"` into its signed bytes — that field exists
 * (1.3) precisely to say which criteria produced the verdict. But
 * since 0.14 on 2026-08-24 the census FOLDS the Solana rail read into
 * its verdict, which is a v2 rule that v1 explicitly does not apply;
 * that fold was deliberate, ruled so the corpus would stop
 * contradicting /api/preflight/v2 in public. Then 2.1c gave v2 the
 * L3b trio, which the census did not fold.
 *
 * So the census matched NEITHER published battery: v1-cited,
 * rail-folded like v2, trio-unfolded like v1 — and those rows ride
 * verbatim into the hash-chained, Bitcoin-anchored corpus. 0.14's own
 * comment names the stakes: an observatory that anchors a false
 * verdict has published a durable lie with a proof of authorship
 * attached. The label was the lie here, not the verdict.
 *
 * The fix finishes the decision 0.14 already made — the census must
 * not contradict the published v2 verdict — by applying v2 in full
 * and citing v2. Old rows keep their bytes; the correction is dated
 * and public.
 */

describe("the census battery citation", () => {
  it("names v2, because v2 is what the round applies", () => {
    expect(CENSUS_BATTERY).toBe(PREFLIGHT_BATTERY_NEXT);
    expect(PREFLIGHT_BATTERY_NEXT).toBe(`preflight-${PREFLIGHT_VERSION_NEXT}`);
    // And it is NOT the v1 name it used to write.
    expect(CENSUS_BATTERY).not.toBe(PREFLIGHT_BATTERY);
  });

  it("the rules the citation promises are the rules the round folds", () => {
    /*
     * The citation is only worth anything if it is checkable. Every
     * check v2 adds must be a check the census can fail a door on —
     * otherwise the row cites criteria it does not apply, which is
     * the defect this row exists to close.
     */
    const folded = new Set(censusFoldedCheckNames());
    for (const name of BATTERY_ADDS[PREFLIGHT_VERSION_NEXT]) {
      expect(folded.has(name), `census cites v2 but never folds ${name}`).toBe(true);
    }
  });

  it("the mislabel is on the corrections record, with a mechanism", () => {
    const entry = CORRECTIONS.find((c) =>
      c.what_was_wrong.toLowerCase().includes("battery"),
    );
    expect(entry, "a wrong citation on a signed artifact is a correction").toBeDefined();
    expect(entry!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Rule: the required half is a mechanism, not an intention.
    expect(entry!.what_changed.length).toBeGreaterThan(80);
    expect(entry!.what_changed.toLowerCase()).toContain("test");
  });
});

describe("fresh-set rows carry their conditions (H4)", () => {
  /*
   * /fresh-set is the routing surface — "cheapest working doors this
   * week" — and its rows carried host, url, rails, schemes and a
   * price with nothing attached: no battery, no per-row observation
   * time, no advisories, no statement of what the verdict does not
   * cover. A shopping row rendered from a CONFORMANT observation
   * reads as PURCHASABLE, which is a state conversion by
   * presentation on the one surface built for spending decisions.
   */
  it("every row names the battery, when it was observed, and what was not checked", async () => {
    /*
     * Built from a synthetic round rather than the live endpoint: the
     * served set is empty until a round exists, and a loop over no
     * rows is a green that proves nothing — the trap this codebase
     * has now caught four times.
     */
    const { freshRows } = await import("@/services/fresh-set");
    const round = {
      week: "2026-W35",
      at: "2026-08-30T09:00:00.000Z",
      listed_resources: 2,
      coverage_suspect: false,
      hosts: [
        {
          host: "clean.example",
          url: "https://clean.example/api/buy/thing",
          verdict: "ready",
          failed: [],
          advisories: [],
          battery: "preflight-v2",
          offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.01 },
        },
        {
          host: "flagged.example",
          url: "https://flagged.example/api/buy/thing",
          verdict: "ready",
          failed: [],
          advisories: ["nonstandard-scheme", "no-input-contract"],
          battery: "preflight-v2",
          offer: { networks: ["eip155:137"], schemes: ["gokite-aa"], min_usdc: 0.5 },
        },
      ],
    } as unknown as Parameters<typeof freshRows>[0];
    const rows = freshRows(round, "https://scvd.store");
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.battery, `${row.host}: no battery cited`).toBe("preflight-v2");
      expect(row.observed_at, `${row.host}: no per-row observation time`).toMatch(
        /^\d{4}-\d{2}-\d{2}/,
      );
      expect(Array.isArray(row.conditions), `${row.host}: conditions must be a list`).toBe(
        true,
      );
      expect(
        (row.not_checked ?? []).length,
        `${row.host}: must state what this verdict does not cover`,
      ).toBeGreaterThan(0);
      expect((row.not_checked ?? []).join(" ").toLowerCase()).toContain("deliver");
    }
    // The row that carried advisories carries them here, named — a
    // shopping row whose conditions vanish is the H4 defect itself.
    const flagged = rows.find((r) => r.host === "flagged.example");
    expect(flagged!.conditions).toContain("nonstandard-scheme");
    expect(rows.find((r) => r.host === "clean.example")!.conditions).toEqual([]);
  }, 30_000);
});
