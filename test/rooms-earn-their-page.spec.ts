import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ROOMS } from "@/store/rooms";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/** A person with a browser, not an agent. */
const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/**
 * RULE 58 ACROSS EVERY ROOM, NOT JUST THE ONE BUILT ALONGSIDE IT.
 *
 * docs/SURFACE_CONTRACT_2026-08.md named 58.4 "the weakest clause
 * store-wide: most rooms name a paid product; almost none give a
 * person a line to paste at their own agent. /doors does. Nothing
 * else audited yet."
 *
 * Audited 2026-08-30. It was worse than the note guessed and better
 * than it feared. The structural half of 58.1 was already solid —
 * title, description and canonical on 35 of 35, one h1 on 34 (the
 * exception is fixed in the same commit as this file). 58.4's paste
 * line was on ONE room out of thirty-five.
 *
 * The free half of the fix derives completely: all 35 rooms already
 * answer `Accept: application/json` at their own URL, measured rather
 * than assumed, so "the machine copy of this page is this page" is
 * true of a room added tomorrow with no bookkeeping. The paid half is
 * deliberately sparse and the empty case is a sentence, not a gap.
 */

async function html(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: BROWSER });
  expect(response.status, `${path} does not answer a browser`).toBe(200);
  return response.text();
}

describe("the roster is ROOMS, and it is not empty", () => {
  it("has rooms to walk", () => {
    expect(ROOMS.length).toBeGreaterThan(30);
  });

  it("names no deeper rung the menu does not carry", () => {
    // A stale id would render as a broken promise, or silently vanish
    // and leave a page claiming a paid path it does not show.
    const broken: string[] = [];
    for (const room of ROOMS) {
      for (const id of room.deeper ?? []) {
        if (!MENU_ITEMS.some((item) => item.id === id)) {
          broken.push(`${room.path} -> ${id}`);
        }
      }
    }
    expect(broken, `a room points at an item the shelf does not sell:\n${broken.join("\n")}`).toEqual(
      [],
    );
  });
});

/*
 * The rooms held to the DERIVED section. /doors writes its own in its
 * own voice and is checked directly at the bottom of this file, which
 * is stricter than exempting it: an opt-out that stopped satisfying
 * the clause would be the quietest possible regression.
 */
const DERIVED_ROOMS = ROOMS.filter((room) => !room.writes_its_own_deeper).map(
  (room) => room.path,
);

describe.each(DERIVED_ROOMS)("%s earns its page", (path) => {
  const room = ROOMS.find((candidate) => candidate.path === path)!;

  it("58.1 — is findable by search, which is not findable by an agent", async () => {
    const page = await html(path);
    expect(page).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(page).toMatch(/<meta name="description" content="[^"]{50,}"/);
    expect(
      (page.match(/<h1[ >]/g) ?? []).length,
      `${path} does not have exactly one h1 — two splits the outline a search engine builds`,
    ).toBe(1);
    expect(page).toContain(`<link rel="canonical" href="${BASE}${path}">`);
  });

  it("58.3 — says what a reader can do, with the free thing first", async () => {
    const page = await html(path);
    expect(page).toContain("What you can do with this");
    const freeAt = page.indexOf("Free, and first");
    expect(freeAt, `${path} never names the free path`).toBeGreaterThan(-1);
    // 58's closing line: selling deeper must never make the free
    // record harder to reach, and the ordering is where that shows.
    const paidAt = Math.max(
      page.indexOf("Deeper, if you want our labour"),
      page.indexOf("Nothing on the shelf sells a deeper read"),
    );
    expect(paidAt, `${path} says nothing about a deeper read`).toBeGreaterThan(freeAt);
  });

  it("58.4 — gives a person a literal line to hand to their agent", async () => {
    const page = await html(path);
    expect(page).toContain("Or hand it to your agent");
    // Literal, not an invitation to go and read the documentation:
    // the URL a person pastes has to be in the sentence.
    expect(page).toContain(`${BASE}${path}`);
    expect(page).toContain("Accept: application/json");
  });

  it("58.4 — names any paid path with a price the menu charges", async () => {
    const page = await html(path);
    const rungs = room.deeper ?? [];
    if (rungs.length === 0) {
      expect(
        page,
        `${path} sells nothing deeper and does not say so`,
      ).toContain("Nothing on the shelf sells a deeper read");
      return;
    }
    for (const id of rungs) {
      const item = MENU_ITEMS.find((candidate) => candidate.id === id)!;
      expect(page).toContain(`/menu/${id}`);
      // Derived, never typed: the amount shown is the shelf's.
      expect(page).toContain(`$${item.price_usdc}`);
    }
    // The agent line for a room with a rung names the buy door too,
    // or the person cannot hand the paid half over.
    const first = MENU_ITEMS.find((candidate) => candidate.id === rungs[0])!;
    expect(page).toContain(`${BASE}/api/buy/${first.id}`);
  });
});

describe("the room that writes its own is still held", () => {
  /**
   * /doors opts out of the derived section because it says all of
   * this in its own voice. An opt-out that stopped satisfying the
   * clause would be the quietest possible regression, so the clause
   * is checked against it directly rather than trusted.
   */
  it("/doors still answers 58.3 and 58.4 in its own words", async () => {
    const page = await html("/doors");
    expect(page).toContain("Free, and first");
    expect(page).toContain("Or hand it to your agent");
    expect(page).toContain(`${BASE}/doors.json`);
    // And it does NOT carry the derived one on top of its own.
    expect(
      (page.match(/What you can do with this/g) ?? []).length,
      "/doors renders its go-deeper section twice",
    ).toBe(1);
  });
});
