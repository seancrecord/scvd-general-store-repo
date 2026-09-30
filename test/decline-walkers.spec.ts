import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { isNoiseFloor, readDeclines, sharedReasons } from "@/lib/declines";
import { declineWalkersAmong, WALK_MIN_ITEMS, WALK_RULE, WALK_WINDOW_MS, walkersAmong } from "@/lib/walkers";
import { renderDeclinesPage } from "@/pages/admin/declines-page";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * A WALKER WITH A SIGNATURE IS STILL A WALKER (2026-09-30, the keeper's
 * ruling off the decline desk).
 *
 * `Mozilla/5.0 (research)` swept every input-taking door on the shelf
 * six times in two days, refused at each for its one required input,
 * a payment header attached every time. It named no job, so the
 * machinery table could not catch it; it carried a signature, so the
 * walk rule's own line — "a decline is a wallet opened at the door" —
 * said it was a buyer. It was therefore the one intent-bearing client
 * the shared-reason escalation needs, and the desk printed OURS beside
 * eight codes on its word for six days.
 *
 * The rule is amended, not the table: a client REFUSED at WALK_MIN_ITEMS
 * distinct doors inside WALK_WINDOW_MS is machinery by behaviour on the
 * decline desk. Its rows stay on the page and still count toward
 * discoverability; they leave the column that means money turned away.
 */
const T0 = Date.parse("2026-09-28T08:14:40.000Z");
let seq = 0;

function decline(partial: Partial<MetricEvent> & { offsetMs: number }): MetricEvent {
  const { offsetMs, ...rest } = partial;
  seq += 1;
  return {
    kind: "decline",
    item: "settlement_attestation",
    channel: "direct",
    house: false,
    note: "local:input_missing:tx_hash",
    at: new Date(T0 + offsetMs).toISOString(),
    ...rest,
  };
}

async function seed(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - Date.parse(event.at)).padStart(14, "0");
  await testEnv.COUNTERS.put(`declevt:${inverted}:${seq.toString(36).padStart(6, "0")}`, JSON.stringify(event));
}

async function clear(): Promise<void> {
  for (const prefix of ["declevt:", "evt:"]) {
    const listed = await testEnv.COUNTERS.list({ prefix });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
  }
}

beforeEach(async () => {
  seq = 0;
  await clear();
});

const SWEEPER = "Mozilla/5.0 (research)";
/** The 2026-09-28 08:14 sweep, as the desk printed it: one door every second or two, each refused for its input. */
const SWEEP: ReadonlyArray<readonly [string, string]> = [
  ["spot_check", "local:input_missing:host"],
  ["settlement_attestation", "local:input_missing:tx_hash"],
  ["settlement_reconciliation", "local:input_missing:tx_hash"],
  ["the_confession", "local:input_missing:confession"],
  ["graffiti_on_a_train", "local:input_missing:tag"],
  ["bitcoin_anchor", "local:input_missing:digest"],
  ["conformance_watch", "local:input_missing:url"],
  ["the_mandate", "local:input_missing:mandate"],
];

async function seedSweep(ua = SWEEPER, stepMs = 1_500): Promise<void> {
  for (const [index, [item, note]] of SWEEP.entries()) {
    await seed(decline({ item, note, user_agent: ua, offsetMs: index * stepMs }));
  }
}

describe("the walk rule, read off decline rows", () => {
  it("says so in its own words", () => {
    expect(WALK_RULE.says).toContain("REFUSED at that many distinct doors");
    expect(WALK_RULE.says).not.toContain("any payment it presents is a customer's");
  });

  it("calls four refusals at distinct doors inside a minute a walk, and three not", () => {
    const four = ["a", "b", "c", "d"].map((item, n) => decline({ item, user_agent: "node", offsetMs: n * 10_000 }));
    const three = four.slice(0, 3);
    expect(declineWalkersAmong(four).get("node")).toBe(4);
    expect(declineWalkersAmong(three).has("node")).toBe(false);
    expect(WALK_MIN_ITEMS).toBe(4);
  });

  it("does not stitch a walk across more than a minute, and never counts the house", () => {
    const slow = ["a", "b", "c", "d"].map((item, n) => decline({ item, user_agent: "node", offsetMs: n * 25_000 }));
    expect(declineWalkersAmong(slow).has("node")).toBe(false);
    const family = ["a", "b", "c", "d"].map((item, n) => decline({ item, user_agent: "scvd-walkabout", house: true, offsetMs: n * 1_000 }));
    expect(declineWalkersAmong(family).size).toBe(0);
    expect(WALK_WINDOW_MS).toBe(60_000);
  });

  it("is a separate reading from the challenge walk, which stays as it was", () => {
    const refusals = ["a", "b", "c", "d"].map((item, n) => decline({ item, user_agent: "node", offsetMs: n * 1_000 }));
    // The public surfaces' rule reads CHALLENGE rows only: a decline walk never widens it.
    expect(walkersAmong(refusals).size).toBe(0);
  });
});

describe("the decline desk reads behaviour", () => {
  it("moves a sweeper's rows to the noise floor, names it, and says how wide the walk was", async () => {
    await seedSweep();
    const report = await readDeclines(testEnv);

    expect(report.walkers).toEqual({ [SWEEPER]: SWEEP.length });
    expect(report.outside_count).toBe(0);
    expect(report.outside_clients).toEqual([]);
    expect(report.infrastructure_count).toBe(SWEEP.length);
    expect(report.infrastructure_clients).toEqual([SWEEPER]);
    for (const row of report.declines) {
      expect(row.walk).toBe(SWEEP.length);
      expect(isNoiseFloor(row)).toBe(true);
      expect(row.reading).toContain(`WALKED: this client was refused at ${SWEEP.length} distinct doors`);
      // The verdict does not move: theirs, and not a lost sale.
      expect(row.fault).toBe("buyer");
    }
  });

  it("cannot be the buyer a shared reason needs — beside a crawler it reads discoverability only", async () => {
    await seedSweep();
    await seed(
      decline({
        note: "local:input_missing:tx_hash",
        channel: "infrastructure",
        user_agent: "x402lint/0.1 (+https://x402lint.dev)",
        offsetMs: 30_000,
      }),
    );
    const report = await readDeclines(testEnv);
    const shared = sharedReasons(report).find((row) => row.reason === "local:input_missing:tx_hash");
    expect(shared).toBeDefined();
    // Both clients are still COUNTED for discoverability: two implementations missed the input.
    expect(shared!.clients).toHaveLength(2);
    expect(shared!.clients).toContain(SWEEPER);
    expect(shared!.machinery_only).toBe(true);
    expect(shared!.escalated).toBe(false);
    expect(shared!.outside_clients).toEqual([]);
    for (const row of report.declines.filter((r) => r.reason === "local:input_missing:tx_hash")) {
      expect(row.fault).toBe("buyer");
      expect(row.reading).toContain("EVERY ONE OF THEM IS MACHINERY");
    }
  });

  it("still turns OURS the moment a client refused at one door joins them", async () => {
    await seedSweep();
    // node, refused once, two days later: the buyer-shaped client the desk exists for.
    await seed(decline({ note: "local:input_missing:tx_hash", user_agent: "node", offsetMs: 2 * 86_400_000 }));
    const report = await readDeclines(testEnv);
    expect(report.walkers).toEqual({ [SWEEPER]: SWEEP.length });
    expect(report.outside_clients).toEqual(["node"]);
    const shared = sharedReasons(report).find((row) => row.reason === "local:input_missing:tx_hash");
    expect(shared!.escalated).toBe(true);
    expect(shared!.outside_clients).toEqual(["node"]);
    for (const row of report.declines.filter((r) => r.reason === "local:input_missing:tx_hash")) {
      expect(row.fault).toBe("ours");
    }
    const nodeRow = report.declines.find((r) => r.user_agent === "node");
    expect(nodeRow!.walk).toBeUndefined();
    expect(isNoiseFloor(nodeRow!)).toBe(false);
  });

  it("reads a client refused at three doors in a minute as a buyer — the default is deliberate", async () => {
    for (const [index, [item, note]] of SWEEP.slice(0, 3).entries()) {
      await seed(decline({ item, note, user_agent: "python-httpx/0.28.1", offsetMs: index * 2_000 }));
    }
    const report = await readDeclines(testEnv);
    expect(report.walkers).toEqual({});
    expect(report.outside_count).toBe(3);
    for (const row of report.declines) expect(row.walk).toBeUndefined();
  });

  it("does not stitch a walk out of a client that came back an hour apart", async () => {
    for (const [index, [item, note]] of SWEEP.slice(0, 4).entries()) {
      await seed(decline({ item, note, user_agent: "python-httpx/0.28.1", offsetMs: index * 3_600_000 }));
    }
    const report = await readDeclines(testEnv);
    expect(report.walkers).toEqual({});
    expect(report.outside_count).toBe(4);
  });

  it("keeps the walk in view on a desk filtered to one door", async () => {
    await seedSweep();
    const report = await readDeclines(testEnv, undefined, { item: "spot_check" });
    expect(report.declines).toHaveLength(1);
    // The other seven doors were filtered out of the page, not out of the walk.
    expect(report.walkers).toEqual({ [SWEEPER]: SWEEP.length });
    expect(report.declines[0]!.walk).toBe(SWEEP.length);
    expect(report.outside_count).toBe(0);
  });

  it("never reads the house as a walker", async () => {
    await seedSweep("scvd-walkabout");
    for (const key of (await testEnv.COUNTERS.list({ prefix: "declevt:" })).keys) {
      const event = JSON.parse((await testEnv.COUNTERS.get(key.name)) ?? "{}") as MetricEvent;
      await testEnv.COUNTERS.put(key.name, JSON.stringify({ ...event, house: true }));
    }
    const report = await readDeclines(testEnv);
    expect(report.walkers).toEqual({});
    for (const row of report.declines) expect(row.walk).toBeUndefined();
  });

  it("prints the walker on the page, in the noise floor and by width", async () => {
    await seedSweep();
    const html = renderDeclinesPage({ report: await readDeclines(testEnv) });
    expect(html).toContain("No intent-bearing declines in this window");
    expect(html).toContain("machinery by BEHAVIOUR, not by name");
    expect(html).toContain(`(walker: ${SWEEP.length} doors inside a minute)`);
  });
});
