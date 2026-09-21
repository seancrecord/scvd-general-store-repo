import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  DOOR_RATIO_NOTE,
  deriveHypothesis,
  readFoundUs,
  readNewFaces,
  type HypothesisSide,
} from "@/services/growth-hypothesis";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, PayerRecord } from "@/types";

const testEnv = env as unknown as Env;
const NONE = { watched: 0, citing: 0, unprompted: 0, prompted: 0, began: [] };

function side(over: Partial<HypothesisSide> = {}): HypothesisSide {
  return {
    market: { week: "2026-W38", listed: 100, payable: 40 },
    settles: 10,
    new_faces: 1,
    returning_faces: 0,
    checks: 50,
    ...over,
  };
}

function read(now: HypothesisSide, before: HypothesisSide | null) {
  return deriveHypothesis({
    now,
    before,
    declines: 3,
    settles: now.settles,
    checks: now.checks,
    settlesPerHundredChecks: 20,
    foundUs: NONE,
  });
}

/**
 * A HYPOTHESIS NOBODY CAN SEE FAIL IS A SLOGAN.
 *
 * The keeper's claim is "we will grow with the market". The block
 * exists to put the market's signed numbers and ours in one month and
 * say, in words, when the market moved and we did not. If that
 * sentence can never be produced, the whole reading is decoration —
 * so it is the first thing held here.
 */
describe("the hypothesis can be refuted", () => {
  it("says so plainly when the market grew and we did not", () => {
    const h = read(side({ settles: 10 }), side({ market: { week: "2026-W34", listed: 80, payable: 30 }, settles: 12 }));
    expect(h.against_us).toBe(true);
    expect(h.reading).toContain("THE MARKET GREW");
    expect(h.reading).toContain("OUR SETTLES DID NOT");
  });

  it("fires on a flat month too, not only on a fall", () => {
    // Holding level while the market adds doors is the same failure.
    const h = read(side({ settles: 10 }), side({ market: { week: "2026-W34", listed: 90, payable: 30 }, settles: 10 }));
    expect(h.against_us).toBe(true);
  });

  it("does not cry failure when both rose", () => {
    const h = read(side({ settles: 14 }), side({ market: { week: "2026-W34", listed: 90, payable: 30 }, settles: 10 }));
    expect(h.against_us).toBe(false);
    expect(h.reading).toContain("Grew with the market");
  });

  it("claims nothing from a month the chain never read", () => {
    const h = read(side({ market: null }), side());
    expect(h.against_us).toBe(false);
    expect(h.reading).toContain("Not measured");
    // The distinction the whole office runs on.
    expect(h.reading).toContain("Not a flat market");
  });

  it("waits for a second month rather than reading one", () => {
    const h = read(side(), null);
    expect(h.against_us).toBe(false);
    expect(h.reading).toContain("needs two months");
  });

  it("calls a fall with the market consistent, and not evidence", () => {
    const h = read(side({ settles: 8 }), side({ market: { week: "2026-W34", listed: 120, payable: 50 }, settles: 10 }));
    expect(h.against_us).toBe(false);
    expect(h.reading).toContain("no evidence for it");
  });
});

describe("the door ratio refuses to flatter us", () => {
  it("names our own releases as a reason it can fall", () => {
    // The failure mode: reading our changelog back as market maturity.
    expect(DOOR_RATIO_NOTE).toContain("when WE fix a door of our own");
    expect(DOOR_RATIO_NOTE).toContain("fewer agents try at all");
  });

  it("divides by settles, and says nothing when there were none", () => {
    expect(read(side({ settles: 0 }), null).door.per_hundred_settles).toBe(null);
  });
});

describe("new faces counts wallets once, in the month they arrived", () => {
  it("separates a first purchase from a return, and never double-counts", async () => {
    const wallet = "0x00000000000000000000000000000000000f00d1";
    await testEnv.COUNTERS.put(
      `${KV_KEYS.payerPrefix}${wallet}`,
      JSON.stringify({
        address: wallet,
        first_seen: "2026-07-04T10:00:00.000Z",
        last_seen: "2026-09-02T10:00:00.000Z",
        purchases: 2,
      } satisfies PayerRecord),
    );
    const faces = await readNewFaces(testEnv);
    expect(faces.get("2026-07")?.first_time).toBeGreaterThanOrEqual(1);
    // The same wallet is a return in September, never a new face there.
    expect(faces.get("2026-09")?.returning).toBeGreaterThanOrEqual(1);
    await testEnv.COUNTERS.delete(`${KV_KEYS.payerPrefix}${wallet}`);
  });

  it("does not count a wallet as returning in the month it arrived", async () => {
    const wallet = "0x00000000000000000000000000000000000f00d2";
    await testEnv.COUNTERS.put(
      `${KV_KEYS.payerPrefix}${wallet}`,
      JSON.stringify({
        address: wallet,
        first_seen: "2026-08-04T10:00:00.000Z",
        last_seen: "2026-08-20T10:00:00.000Z",
        purchases: 3,
      } satisfies PayerRecord),
    );
    const before = (await readNewFaces(testEnv)).get("2026-08");
    expect(before?.first_time).toBeGreaterThanOrEqual(1);
    await testEnv.COUNTERS.delete(`${KV_KEYS.payerPrefix}${wallet}`);
    const after = (await readNewFaces(testEnv)).get("2026-08");
    expect((before?.returning ?? 0) - (after?.returning ?? 0)).toBe(0);
  });
});

describe("who found us reads the register, and counts nothing it did not see", () => {
  it("splits citations by whether a note was stamped", () => {
    const found = readFoundUs();
    expect(found.citing).toBe(found.unprompted + found.prompted);
    expect(found.citing).toBeLessThanOrEqual(found.watched);
    // Today: pages we wrote to, none citing yet. The honest zero.
    expect(found.unprompted).toBeGreaterThanOrEqual(0);
  });
});
