import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { MetricEvent } from "@/lib/metrics";
import { DEEPEST_SCAN_CAP, DEFAULT_SCAN_CAP, scanCapFrom } from "@/lib/scan-cap";
import type { Env } from "@/types";

/**
 * THE DEEPER SCAN (2026-09-28). On the day 11,000 organic 402s landed
 * in an hour, the census and the recount each read their 3,000 newest
 * rows and reached back 46 minutes — to a window the burst had already
 * left. Every knock had a row; no page could reach it. `?rows=N` on
 * either page asks for more, up to a ceiling the subrequest budget
 * sets, and the capped page says so instead of leaving the keeper to
 * find the knob in the source.
 */

const testEnv = env as unknown as Env;

let seq = 0;
async function seedRow(event: MetricEvent): Promise<void> {
  const inverted = String(10_000_000_000_000 - (Date.now() + seq)).padStart(14, "0");
  seq += 1;
  await testEnv.COUNTERS.put(
    `evt:${inverted}:${seq.toString(36).padStart(6, "0")}`,
    JSON.stringify(event),
  );
}

function row(item: string): MetricEvent {
  return {
    kind: "challenge",
    item,
    channel: "direct",
    house: false,
    at: new Date(Date.parse("2026-09-28T17:00:00.000Z") + seq * 1000).toISOString(),
    user_agent: "node",
  };
}

const keeper = {
  headers: { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` },
};

describe("the ?rows= knob", () => {
  it("reads the query as a cap, and never as less than the usual slice by accident", () => {
    expect(scanCapFrom(undefined)).toBe(DEFAULT_SCAN_CAP);
    expect(scanCapFrom("")).toBe(DEFAULT_SCAN_CAP);
    expect(scanCapFrom("lots")).toBe(DEFAULT_SCAN_CAP);
    expect(scanCapFrom("0")).toBe(DEFAULT_SCAN_CAP);
    expect(scanCapFrom("-5")).toBe(DEFAULT_SCAN_CAP);
    expect(scanCapFrom("2.5")).toBe(DEFAULT_SCAN_CAP);
    expect(scanCapFrom("2")).toBe(2);
    expect(scanCapFrom(" 20000 ")).toBe(20_000);
    expect(scanCapFrom(String(DEEPEST_SCAN_CAP * 10))).toBe(DEEPEST_SCAN_CAP);
    expect(DEEPEST_SCAN_CAP).toBeGreaterThan(DEFAULT_SCAN_CAP);
  });
});

describe("the two row pages take the knob", () => {
  beforeEach(async () => {
    // Append-only surface: clear our prefix so the suite's other rows
    // cannot make the cap look uncapped.
    let cursor: string | undefined;
    do {
      const listed = await testEnv.COUNTERS.list({ prefix: "evt:", cursor });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor);
    for (const item of ["hello", "spot_check", "the_statement", "attestation_bundle", "settlement_attestation"]) {
      await seedRow(row(item));
    }
  });

  it("the census reads as deep as it is asked, and a capped page names the knob", async () => {
    const capped = await SELF.fetch("https://scvd.store/admin/census?rows=2", keeper);
    expect(capped.status).toBe(200);
    const cappedHtml = await capped.text();
    expect(cappedHtml).toContain("<strong>2</strong> rows read");
    expect(cappedHtml).toContain("scan hit its cap");
    expect(cappedHtml).toContain("?rows=N");
    expect(cappedHtml).toContain(DEEPEST_SCAN_CAP.toLocaleString("en-US"));

    const whole = await SELF.fetch("https://scvd.store/admin/census?rows=50", keeper);
    const wholeHtml = await whole.text();
    expect(wholeHtml).toContain("<strong>5</strong> rows read");
    expect(wholeHtml).toContain("all rows in the log");
    expect(wholeHtml).not.toContain("?rows=N");
  });

  it("the recount reads as deep as it is asked, and a capped page names the knob", async () => {
    const capped = await SELF.fetch("https://scvd.store/admin/recount?rows=3", keeper);
    expect(capped.status).toBe(200);
    const cappedHtml = await capped.text();
    expect(cappedHtml).toContain("<strong>3</strong> rows read");
    expect(cappedHtml).toContain("?rows=N");

    const whole = await SELF.fetch("https://scvd.store/admin/recount?rows=50", keeper);
    const wholeHtml = await whole.text();
    expect(wholeHtml).toContain("<strong>5</strong> rows read");
    expect(wholeHtml).not.toContain("?rows=N");
  });

  it("a knob that cannot be read falls back to the usual slice, never to nothing", async () => {
    const page = await SELF.fetch("https://scvd.store/admin/census?rows=lots", keeper);
    const html = await page.text();
    expect(html).toContain("<strong>5</strong> rows read");
  });
});
