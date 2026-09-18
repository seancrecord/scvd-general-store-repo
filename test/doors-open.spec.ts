import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { draftDoorsOpen, renderDoorsOpenMarkdown } from "@/services/doors-open";
import { recordInputRefusal, recordSettleSignal } from "@/services/buyer-signals";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

/**
 * DOORS OPEN, the weekly draft: assembled from readers that already
 * serve the desk, every number with its denominator, every section
 * naming what it could not see, and the fix of the week left blank
 * for the keeper. A reader that fails marks its section unread
 * rather than printing a zero (rule 52).
 */

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  for (const key of listed.keys) {
    if (key.name.includes(":signals:")) await testEnv.COUNTERS.delete(key.name);
  }
});

describe("the draft", () => {
  it("lays four sections with denominators and gaps, and leaves the fix to the keeper", async () => {
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "bad_request", input_field: "host" }, "https://x.example/api");
    await recordSettleSignal(testEnv, { door: "http", network: "eip155:8453", item: "hello", purpose: "a test", house: false });
    const draft = await draftDoorsOpen(testEnv);
    expect(draft.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(draft.sections.map((s) => s.heading)).toEqual([
      "Where they got hung up",
      "What went well",
      "Entry points",
      "Latency and the silent turnaway",
    ]);
    for (const section of draft.sections) {
      expect(section.not_seen.length, section.heading).toBeGreaterThan(0);
    }
    const hungUp = draft.sections[0]!;
    expect(hungUp.unread).toBe(false);
    expect(hungUp.numbers.find((n) => n.label === "pre-payment 400s this month")?.value).toBe(1);
    expect(hungUp.rows.some(([k]) => k === "spot_check:host:malformed")).toBe(true);
    expect(draft.fix_of_the_week).toBe("");
  });

  it("renders Markdown a keeper can paste, with the number of the week first", async () => {
    const draft = await draftDoorsOpen(testEnv);
    const md = renderDoorsOpenMarkdown(draft);
    expect(md.startsWith(`# Doors Open — ${draft.week}`)).toBe(true);
    expect(md.indexOf("## The number of the week")).toBeLessThan(md.indexOf("## Where they got hung up"));
    expect(md).toContain("## The fix of the week");
    expect(md).toContain("What this section did not see:");
  });

  it("is on the desk for the keeper, as a page and as Markdown, behind the gate", async () => {
    const page = await SELF.fetch(`${BASE}/admin/doors-open`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Doors Open");
    expect(html).toContain("The issue as Markdown");
    expect(html).toContain("<textarea");
    const md = await SELF.fetch(`${BASE}/admin/doors-open.md`, { headers: AUTH });
    expect(md.status).toBe(200);
    expect(md.headers.get("Content-Type")).toContain("text/markdown");
    expect(await md.text()).toContain("# Doors Open");
    expect((await SELF.fetch(`${BASE}/admin/doors-open.md`)).status).toBe(401);
  });
});
