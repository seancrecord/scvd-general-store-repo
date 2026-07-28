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
