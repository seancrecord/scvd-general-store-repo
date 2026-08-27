import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { CAPABILITY_QUERY } from "@/store/spec";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * A1: agents search for capabilities, not products. why_use states
 * the value once an agent is looking at an item; the capability query
 * is what makes it look — and it lands in the OpenAPI summary, the
 * field a spec reader shows first, which until now read "Buy A Small
 * Blessing."
 */
describe("the capability query", () => {
  it("covers every item, including the novelties", () => {
    for (const item of MENU_ITEMS) {
      const query = CAPABILITY_QUERY[item.id];
      expect(query, `${item.id} has no capability query`).toBeTruthy();
      if (!query) continue;
      // The query is a job, not a label. If it just says our name for
      // the thing, it hasn't done the work.
      expect(
        query.toLowerCase().startsWith("buy "),
        `${item.id} query is a shelf label`,
      ).toBe(false);
    }
  });

  it("becomes the OpenAPI summary, where a spec reader looks first", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    if (!isRecord(body) || !isRecord(body.paths)) throw new Error("no paths");

    for (const item of MENU_ITEMS) {
      const path = body.paths[`/api/buy/${item.id}`];
      if (!isRecord(path) || !isRecord(path.get)) continue;
      expect(path.get.summary, item.id).toBe(CAPABILITY_QUERY[item.id]);
    }
  });
});

describe("the things DEMAND_SYNTHESIS called buried", () => {
  it("puts free forever verification on the first screen of llms.txt", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    const firstScreen = text.slice(0, 1400);
    expect(firstScreen).toContain("/api/verify/");
    expect(firstScreen.toLowerCase()).toContain("free, forever");
    // And the reason it matters, said once.
    expect(text.toLowerCase()).toContain("self-attested");
  });

  it("says what visiting properly looks like, and states the clock", async () => {
    /*
     * The guide split on 2026-08-27: /llms.txt is an index and
     * /llms-full.txt is the complete prose the convention reserves
     * that path for. This asserts what the GUIDE says — "Visiting
     * properly" now files under /developers/llms.txt — so it reads
     * the guide rather than its table of contents.
     */
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(text).toContain("Visiting properly");
    for (const call of ["/api/bell", "/api/guestbook", "/api/stamp"]) {
      expect(text).toContain(call);
    }
    // The cadence, so a scheduled agent can plan around it...
    expect(text).toContain("once a day per visitor");
    expect(text).toContain("every week");
    // ...and no engagement mechanics, per rule 22.
    expect(text).toContain("No streaks");
    expect(text.toLowerCase()).toContain("nothing is lost by skipping");
  });
});
