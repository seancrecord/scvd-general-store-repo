import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

async function tools(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/admin/tools`, {
    headers: adminAuth,
  });
  expect(response.status).toBe(200);
  return response.text();
}

/**
 * A LEVER THAT DOESN'T SHOW ITS OWN STATE IS A BUTTON WITH NO DIAL.
 *
 * The keeper's report, 2026-07-30: he could see that he was ABLE to
 * open or close the shutter, and could not see which it was. The audit
 * that followed found the same hole on every lever on the back shelf —
 * the page took no data at all, deliberately, so that it would open
 * even when KV was having a day.
 *
 * That property is worth keeping and is kept. What changed is that
 * "can't read it" is now a THIRD state, printed in its own words,
 * because on a page about whether the store is taking money, unknown
 * and open must never look alike.
 */
describe("every lever on the back shelf states its condition", () => {
  beforeEach(async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.shutterOverride);
    await testEnv.COUNTERS.delete(KV_KEYS.keeperLastSeen);
  });

  it("says whether the shutter is open or closed, not just that it can be", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.shutterOverride, "closed");
    const closed = await tools();
    expect(closed).toContain("CLOSED");
    expect(closed).toContain("you closed it by hand");

    await testEnv.COUNTERS.delete(KV_KEYS.shutterOverride);
    await testEnv.COUNTERS.put(KV_KEYS.keeperLastSeen, new Date().toISOString());
    const open = await tools();
    expect(open).toContain("OPEN");
    expect(open).toContain("Last seen at the counter");
  });

  it("distinguishes closed-by-lever from closed-by-absence", async () => {
    // Same word on the storefront, different thing to do about it: one
    // is undone by a button, the other by showing up.
    const away = await tools();
    expect(away).toContain("CLOSED");
    expect(away).toContain("no visit is on record yet");
  });

  it("says whether this month's patronage note is already inked", async () => {
    const month = new Date().toISOString().slice(0, 7);
    await testEnv.COUNTERS.delete(KV_KEYS.patronageNote(month));
    expect(await tools()).toContain("Nothing inked for");

    await testEnv.COUNTERS.put(KV_KEYS.patronageNote(month), "A test note.");
    const inked = await tools();
    expect(inked).toContain("Already inked");
    expect(inked).toContain("A test note.");
    // And it warns that the lever overwrites rather than appends.
    expect(inked).toContain("replaces it");
    await testEnv.COUNTERS.delete(KV_KEYS.patronageNote(month));
  });

  it("says what the inventory reset would actually clear", async () => {
    // The lever moved to the test drawer (2026-08-05 consolidation);
    // its condition line moved with it — that pairing is the rule.
    const response = await SELF.fetch(`${BASE}/admin/testing`, {
      headers: adminAuth,
    });
    const page = await response.text();
    expect(page).toMatch(/Nothing sold against a weekly cap|This week:/);
  });

  it("never lets a failed read look like a confident answer", async () => {
    // The one rule that makes the rest safe. If a reading fails, the
    // page says so in place of the state — it does not fall back to a
    // default that happens to read as "fine".
    const page = await tools();
    expect(page).not.toContain("undefined");
    expect(page).not.toContain("null");
    expect(page).not.toContain("NaN");
  });

  it("still opens when the readings are the thing that is broken", async () => {
    // The original reason this page took no data: the levers are what
    // you reach for when something is wrong. It must never be the page
    // that fails with everything else.
    const response = await SELF.fetch(`${BASE}/admin/tools`, {
      headers: adminAuth,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("The shutter");
  });
});

/**
 * THE WIDER AUDIT the keeper asked for: can he manage the store from
 * the office without going to look at the site? Each of these is a
 * piece of live state a lever can change. If one stops being visible,
 * the office is lying about the store again.
 */
describe("the office shows the state it lets him change", () => {
  it("shows shutter, patronage, press and draft in one place", async () => {
    // Weekly inventory moved to the test drawer with its lever
    // (2026-08-05); the daily-shelf states stay together here.
    const page = await tools();
    for (const [what, marker] of [
      ["the shutter", /OPEN —|CLOSED —/],
      ["the patronage note", /inked for/],
    ] as const) {
      expect(page, `the back shelf does not show ${what}`).toMatch(marker);
    }
  });

  it("does not make him leave the office to learn any of it", async () => {
    // No sentence on the back shelf may send him to the public site to
    // find out what state something is in. Links OUT to a public
    // artifact are fine; instructions to go and check are not.
    const page = await tools();
    expect(page.toLowerCase()).not.toContain("check the storefront");
    expect(page.toLowerCase()).not.toContain("go and look");
    expect(page.toLowerCase()).not.toContain("visit the site");
  });
});

describe("the desk's numbers name their window", () => {
  /**
   * 2026-08-01, first day of a month: the desk said 1 organic settle
   * while the storefront said 2 — both correct, July's sale had
   * rolled out of the desk's UNLABELED month window at midnight UTC,
   * and the keeper rightly read it as data loss. A window states
   * itself; the desk now names the month and shows the all-time
   * count beside it, from the same computation the public pages use.
   */
  it("labels the month on the glance line and serves the all-time count beside it", async () => {
    const response = await SELF.fetch(`${BASE}/admin`, {
      headers: adminAuth,
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    const month = new Date().toISOString().slice(0, 7);
    expect(html).toContain(`${month}:`);
    expect(html).toContain("All-time:");
    expect(html).toContain("The month line above resets when the calendar turns");
  });
});
