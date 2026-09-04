import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";
const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36",
};

/**
 * THE TWO NEW ROOMS have to serve to both readers this store keeps
 * promising to serve — a person with a browser and an agent with an
 * Accept header — and they have to be honest when there is nothing to
 * show. A page that 500s on an empty chain is worse than a 404: the
 * store's whole argument is that absence is stated, and a stack trace
 * states nothing.
 *
 * These run against an EMPTY test store, which is the point. Every
 * room here is being asked the hardest version of its question: what
 * do you say when you have no data at all?
 */

describe("/sources serves both readers", () => {
  it("serves JSON with the register's own denominators", async () => {
    const response = await SELF.fetch(`${BASE}/sources.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body["artifact"]).toBe("source_register");
    expect(Array.isArray(body["sources"])).toBe(true);
    // Its own denominator: how many rounds it read to say any of this.
    expect(typeof body["rounds_read"]).toBe("number");
    expect(body["what_this_is_not"]).toContain("Not a rating");
  });

  it("names every roster source, read or not", async () => {
    const body = (await (await SELF.fetch(`${BASE}/sources.json`)).json()) as Record<string, any>;
    const named = (body["sources"] as { source: string }[]).map((row) => row.source);
    for (const expected of ["discovery", "fuchss", "x402_list", "agentic_market", "402index.io"]) {
      expect(named).toContain(expected);
    }
  });

  it("carries the heartbeat, so the page can say if the machine stopped", async () => {
    const body = (await (await SELF.fetch(`${BASE}/sources.json`)).json()) as Record<string, any>;
    expect(body["heartbeat"]?.["artifact"]).toBe("ward_heartbeat");
    // An empty test store has never run a round, and says so rather
    // than reporting a fault it cannot have.
    expect(body["heartbeat"]?.["verdict"]).toBe("never_run");
  });

  it("renders a page for a browser", async () => {
    const response = await SELF.fetch(`${BASE}/sources`, { headers: BROWSER });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("last successful pull");
    expect(html).toContain("Named, not read");
    // The unblock condition rides the page, so no gap reads as permanent.
    expect(html).toContain("What would dissolve it");
  });
});

describe("/ledger serves both readers and refuses honestly", () => {
  it("serves an index naming the weeks it holds", async () => {
    const response = await SELF.fetch(`${BASE}/ledger`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body["artifact"]).toBe("week_ledger_index");
    expect(Array.isArray(body["weeks_held"])).toBe(true);
  });

  it("renders the index for a browser even with an empty chain", async () => {
    const response = await SELF.fetch(`${BASE}/ledger`, { headers: BROWSER });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Every week the chain holds");
    // The empty case is stated as a fact about our age, not hidden.
    expect(html).toContain("nothing to read");
  });

  /**
   * RULE 52 ON A NEW ROOM: a week we do not hold is a 404 that names
   * the weeks we do. Never a guessed baseline, never an empty page
   * that reads as a quiet week.
   */
  it("404s a week the chain does not hold, and names what it has", async () => {
    const response = await SELF.fetch(`${BASE}/ledger/2001-W01.json`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, any>;
    expect(body["error"]).toContain("does not invent a baseline");
    expect(Array.isArray(body["known_weeks"])).toBe(true);
  });

  it("404s in HTML too, rather than serving a blank reading", async () => {
    const response = await SELF.fetch(`${BASE}/ledger/2001-W01`, { headers: BROWSER });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("no signed week named");
  });

  it("refuses a malformed week rather than guessing at it", async () => {
    expect((await SELF.fetch(`${BASE}/ledger/not-a-week`)).status).toBe(404);
  });
});
