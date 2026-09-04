import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { fetchableSurfaces, namedIntegrations } from "@/routes/scorers";
import { MISUSE_CLAUSE, NEVER_A_RANKING_SENTENCE, TWO_SEATS_SENTENCE } from "@/store/copy/doctrine";
import { FREE_DOORS } from "@/store/atlas";
import { ROOMS } from "@/store/rooms";

/**
 * FOR SCORERS AND MARKETPLACES (2026-09-03). What this file holds:
 *
 *   - the two seats and the misuse clause are on the page, both faces;
 *   - every surface the page names answers, as written;
 *   - the named-integrations block renders the register and nothing
 *     else, and today the register is empty and the page says so;
 *   - no vendor is named, no score, no rank, no certify;
 *   - the room is registered and the atlas points a scorer at it.
 */

const BASE = "https://scvd.store";

describe("the page", () => {
  it("serves a person and a machine at one URL with the seats, the clause and the doctrine", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/scorers`, { headers: { Accept: "application/json" } })
    ).json()) as {
      seats: { sentence: string; dated: string };
      misuse: string;
      summary: string;
      named_integrations: { systems: unknown[]; none_today?: string; as_of: string };
      pull: { url: string }[];
    };
    expect(body.seats.sentence).toBe(TWO_SEATS_SENTENCE);
    expect(body.seats.dated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.misuse).toBe(MISUSE_CLAUSE);
    expect(body.summary).toContain(NEVER_A_RANKING_SENTENCE);
    expect(body.pull[0]?.url).toBe(`${BASE}/corpus.json`);
    const html = await (await SELF.fetch(`${BASE}/scorers`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain("For scorers and marketplaces");
    expect(html).toContain(TWO_SEATS_SENTENCE);
    expect(html).toContain(MISUSE_CLAUSE);
    expect(html).toContain("names seats, not occupants");
    for (const word of ["certified", "approved by", "top rated", "recommended partner"]) {
      expect(html.toLowerCase()).not.toContain(word);
    }
  });

  it("names every surface a reader would fetch, and each one answers as written", async () => {
    const surfaces = fetchableSurfaces(BASE);
    expect(surfaces.length).toBeGreaterThanOrEqual(8);
    for (const row of surfaces) {
      const path = row.url.slice(BASE.length);
      const method = path.startsWith("/api/preflight") || path.startsWith("/api/look") ? "POST" : "GET";
      const response = await SELF.fetch(row.url, {
        method,
        headers: method === "POST" ? { "content-type": "application/json" } : { Accept: "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      // A POST with an empty body is refused with a 400 that names the
      // field; the door answering is what this asserts, not a walk.
      expect([200, 400], `${row.url} answered ${response.status}`).toContain(response.status);
    }
  });
});

describe("named integrations", () => {
  it("renders the register and nothing else; today it is empty and says so", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/scorers`, { headers: { Accept: "application/json" } })
    ).json()) as { named_integrations: { systems: { name: string }[]; none_today?: string } };
    expect(body.named_integrations.systems.map((entry) => entry.name)).toEqual(
      namedIntegrations().map((entry) => entry.name),
    );
    if (namedIntegrations().length === 0) {
      expect(body.named_integrations.none_today).toBe("No system is listed today.");
      const html = await (await SELF.fetch(`${BASE}/scorers`, { headers: { Accept: "text/html" } })).text();
      expect(html).toContain("no system is listed");
    }
  });

  it("carries only complete entries: name, an https citing URL, a date", () => {
    for (const entry of namedIntegrations()) {
      expect(entry.cites_at).toMatch(/^https:\/\//);
      expect(entry.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});

describe("the room", () => {
  it("is registered, the atlas sends a scorer here, and /criteria carries the seats", async () => {
    expect(ROOMS.map((room) => room.path)).toContain("/scorers");
    expect(FREE_DOORS.map((door) => door.path)).toContain("/scorers");
    const criteria = (await (
      await SELF.fetch(`${BASE}/criteria`, { headers: { Accept: "application/json" } })
    ).json()) as { seats: { sentence: string; misuse: string; page: string } };
    expect(criteria.seats.sentence).toBe(TWO_SEATS_SENTENCE);
    expect(criteria.seats.misuse).toBe(MISUSE_CLAUSE);
    expect(criteria.seats.page).toBe(`${BASE}/scorers`);
  });
});
