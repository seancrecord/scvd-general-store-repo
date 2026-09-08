import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readDeclines, traceClient } from "@/lib/declines";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

let seq = 0;
async function seedRow(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(
    14,
    "0",
  );
  seq += 1;
  await testEnv.COUNTERS.put(
    `evt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

function decline(partial: Partial<MetricEvent>): MetricEvent {
  return {
    kind: "decline",
    item: "hello",
    channel: "direct",
    house: false,
    at: new Date().toISOString(),
    ...partial,
  };
}

/**
 * THE DECLINE DESK.
 *
 * A decline is the only row in the books that measures INTENT rather
 * than attention. The reasons were recorded from the day the
 * instrument went in and rendered nowhere until 2026-07-28, which is
 * how a real buyer bounced three times with nobody able to see why.
 */
/**
 * THE DECLINE INDEX (2026-09-06). The desk used to scan the raw evt:
 * stream newest-first, where a decline is one row in thousands of
 * corpus reads — so on a busy month the cap ran out before any decline
 * was reached and the desk reported "nobody has ever been turned away"
 * while the funnel counted refusals for the same month. Declines now
 * get a second key under a prefix where every row is a decline.
 */
describe("the decline index", () => {
  async function seedIndexRow(event: MetricEvent): Promise<void> {
    seq += 1;
    const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(14, "0");
    await testEnv.COUNTERS.put(
      `declevt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
      JSON.stringify(event),
    );
  }

  it("finds a decline the raw scan never reaches, because the cap was spent on other rows", async () => {
    const buried = decline({ note: "insufficient_funds", item: "buried-by-the-cap", user_agent: "late-buyer/1" });
    await seedIndexRow(buried);
    // A cap of one row: the raw stream cannot reach anything, as on the live desk.
    const report = await readDeclines(testEnv, 1);
    expect(report.declines.some((d) => d.item === "buried-by-the-cap")).toBe(true);
    expect(report.index_rows).toBeGreaterThan(0);
    expect(report.by_reason["insufficient_funds"]).toBeGreaterThanOrEqual(1);
  });

  it("counts a decline once when it is in both the index and the raw stream", async () => {
    const both = decline({
      note: "double_booked_reason",
      item: "in-both-places",
      at: new Date(Date.now() - 1000).toISOString(),
      user_agent: "twice/1",
    });
    await seedIndexRow(both);
    await seedRow(both);
    const report = await readDeclines(testEnv);
    const rows = report.declines.filter((d) => d.item === "in-both-places");
    expect(rows).toHaveLength(1);
    expect(report.by_reason["double_booked_reason"]).toBe(1);
  });

  it("says whether the index was read to its end, so an empty desk is never mistaken for an empty till", async () => {
    const report = await readDeclines(testEnv);
    expect(typeof report.index_complete).toBe("boolean");
    expect(report.index_rows).toBeGreaterThanOrEqual(0);
  });
});

describe("reading a decline", () => {
  it("keeps the facilitator's reason verbatim, never paraphrased", async () => {
    await seedRow(
      decline({
        user_agent: "declines-spec-buyer/1",
        note: "insufficient_funds",
      }),
    );
    const report = await readDeclines(testEnv);
    const row = report.declines.find(
      (entry) => entry.user_agent === "declines-spec-buyer/1",
    );
    expect(row?.reason).toBe("insufficient_funds");
    // Our reading rides alongside; it never replaces the raw string.
    expect(row?.fault).toBe("buyer");
    expect(row?.reading.toLowerCase()).toContain("wallet was short");
  });

  it("separates whose problem it is, because they are different emergencies", async () => {
    await seedRow(
      decline({ user_agent: "declines-spec-ours/1", note: "invalid_network" }),
    );
    const report = await readDeclines(testEnv);
    const row = report.declines.find(
      (entry) => entry.user_agent === "declines-spec-ours/1",
    );
    // A network mismatch means what we PUBLISHED disagrees with what we
    // accept — money turned away for a reason of our own making.
    expect(row?.fault).toBe("ours");
    expect(row?.reading.toLowerCase()).toContain("discovery failure");
  });

  it("tells a verify failure from a settle failure", async () => {
    await seedRow(
      decline({
        user_agent: "declines-spec-settle/1",
        note: "settle:insufficient_funds",
      }),
    );
    const report = await readDeclines(testEnv);
    const row = report.declines.find(
      (entry) => entry.user_agent === "declines-spec-settle/1",
    );
    expect(row?.stage).toBe("settle");
    // The prefix is stripped for the reading but kept in the raw column.
    expect(row?.reason).toBe("settle:insufficient_funds");
    expect(row?.fault).toBe("buyer");
  });

  it("reads a facilitator 5xx as the rail's fault, not the buyer's and not unknown", async () => {
    // Byte-for-byte the three declines of 2026-08-07: verify cleared,
    // the settle endpoint 502'd, and the desk could only say "unknown".
    await seedRow(
      decline({
        user_agent: "declines-spec-rail/1",
        note: "settle:Facilitator settle failed (502): error code: 502",
      }),
    );
    const report = await readDeclines(testEnv);
    const row = report.declines.find(
      (entry) => entry.user_agent === "declines-spec-rail/1",
    );
    expect(row?.stage).toBe("settle");
    expect(row?.reason).toBe(
      "settle:Facilitator settle failed (502): error code: 502",
    );
    expect(row?.fault).toBe("facilitator");
    // The reading tells the keeper the buyer was fine and where to
    // look for the rare 5xx that settled anyway.
    expect(row?.reading.toLowerCase()).toContain("rail was down");
    expect(row?.reading.toLowerCase()).toContain("reconciliation");
  });

  it("never lets a 5xx response body trip a verdict rule", async () => {
    // Everything after the status is the facilitator's raw response
    // body — arbitrary text. A body that happens to say "insufficient"
    // must still read as a rail failure, not a short wallet.
    await seedRow(
      decline({
        user_agent: "declines-spec-rail/2",
        note: "settle:Facilitator settle failed (503): insufficient capacity",
      }),
    );
    const report = await readDeclines(testEnv);
    const row = report.declines.find(
      (entry) => entry.user_agent === "declines-spec-rail/2",
    );
    expect(row?.fault).toBe("facilitator");
  });

  it("counts a reasonless decline as an instrument gap, not a buyer signal", async () => {
    const before = (await readDeclines(testEnv)).unspecified;
    await seedRow(
      decline({ user_agent: "declines-spec-blank/1", note: "unspecified" }),
    );
    const report = await readDeclines(testEnv);
    expect(report.unspecified).toBe(before + 1);
    const row = report.declines.find(
      (entry) => entry.user_agent === "declines-spec-blank/1",
    );
    // The distinction that keeps a broken instrument from reading as
    // customer behaviour.
    expect(row?.reading.toLowerCase()).toContain("instrument");
  });

  /**
   * THE NOISE FLOOR, READ AS DEMAND (2026-09-08). The desk excluded
   * the house and called everything else intent, so six declines from
   * two clients the store's own user-agent table already names as
   * machinery were reported as "somebody wanted to buy and could not".
   * One of them writes "no-wallet; no-payment" into its user-agent.
   */
  it("keeps a self-identifying prober out of the outside count", async () => {
    const before = await readDeclines(testEnv);
    await seedRow(
      decline({
        user_agent: "declines-spec-observatory/1.0 (+https://example.test/methodology)",
        note: "local:input_missing:tx_hash",
        channel: "infrastructure",
      }),
    );
    const report = await readDeclines(testEnv);
    // Counted, named, and never mixed into the number that means intent.
    expect(report.outside_count).toBe(before.outside_count);
    expect(report.infrastructure_count).toBe(before.infrastructure_count + 1);
    expect(report.infrastructure_clients).toContain(
      "declines-spec-observatory/1.0 (+https://example.test/methodology)",
    );
    // The reason table is the intent table: a prober's error code must
    // not be able to trip the "same reason from different clients" rule.
    expect(report.by_reason["local:input_missing:tx_hash"] ?? 0).toBe(
      before.by_reason["local:input_missing:tx_hash"] ?? 0,
    );
    // The row itself is still on the page. Excluded from the count is
    // not hidden from the desk.
    expect(
      report.declines.some((row) => row.user_agent?.includes("declines-spec-observatory")),
    ).toBe(true);
  });

  /**
   * A row booked before its user-agent was promoted to the table
   * carries the old verdict forever. The table is the law, not the row.
   */
  it("re-reads the user-agent, so a row booked as organic before the promotion still lands on the noise floor", async () => {
    const before = (await readDeclines(testEnv)).outside_count;
    await seedRow(
      decline({
        user_agent: "declines-spec-uptime-monitor/1",
        note: "local:payload_missing_accepted",
        channel: "mcp",
      }),
    );
    const report = await readDeclines(testEnv);
    expect(report.outside_count).toBe(before);
  });

  it("keeps the house out of the outside count", async () => {
    const before = (await readDeclines(testEnv)).outside_count;
    await seedRow(
      decline({
        user_agent: "declines-spec-keeper/1",
        note: "insufficient_funds",
        house: true,
      }),
    );
    const report = await readDeclines(testEnv);
    // The keeper's own failed test is not a lost sale.
    expect(report.outside_count).toBe(before);
  });
});

describe("the trail", () => {
  it("reads one client's whole sequence forward, oldest first", async () => {
    const ua = "declines-spec-trail/1";
    await seedRow({
      kind: "challenge",
      item: "hello",
      channel: "direct",
      house: false,
      at: "2026-07-28T10:00:00.000Z",
      user_agent: ua,
    });
    await seedRow(
      decline({ user_agent: ua, at: "2026-07-28T10:01:00.000Z", note: "a" }),
    );
    await seedRow(
      decline({ user_agent: ua, at: "2026-07-28T10:02:00.000Z", note: "b" }),
    );

    const trail = await traceClient(testEnv, ua);
    expect(trail.length).toBeGreaterThanOrEqual(3);
    // The sequence is the evidence, so it has to read in the order it
    // happened, not the order KV hands it back.
    const times = trail.map((event) => event.at);
    expect([...times].sort()).toEqual(times);
    expect(trail[0]?.kind).toBe("challenge");
  });
});

describe("the page", () => {
  it("renders behind the keeper's door, with the raw reason on it", async () => {
    const shut = await SELF.fetch(`${BASE}/admin/declines`);
    expect(shut.status).toBe(401);

    const page = await SELF.fetch(`${BASE}/admin/declines`, {
      headers: {
        Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
      },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("The decline desk");
    // The verbatim reason must reach the page, not just our reading.
    expect(html).toContain("insufficient_funds");
    expect(html).toContain("invalid_network");
    // And the page says the fault column is a guess.
    expect(html.toLowerCase()).toContain("our reading");
  });

  it("is linked from the pages that promise it", async () => {
    const headers = {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    };
    for (const path of ["/admin/census", "/admin"]) {
      const html = await (
        await SELF.fetch(`${BASE}${path}`, { headers })
      ).text();
      expect(html, path).toContain("/admin/declines");
    }
  });
});
