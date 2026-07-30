import { SELF, env } from "cloudflare:test";
import { decodePaymentRequired } from "./helpers/payment";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  findAlmanacEntry,
  listAlmanacEntries,
  removeAlmanacEntry,
  saveAlmanacEntry,
  slugify,
} from "@/services/almanac-store";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE ALMANAC, WRITABLE FROM THE OFFICE.
 *
 * The store's first sale to a stranger was an almanac page, and adding
 * another one required editing TypeScript and pushing a commit — so the
 * single highest-leverage thing this store can do was the one thing the
 * keeper could not do from his phone. His own standing rule from the
 * same day says everything should be visible AND MANAGEABLE from the
 * office. This is that rule applied where it costs the most to ignore.
 */
describe("writing a page from the office", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  const TITLE = "A Test Page From The Office";
  const SLUG = slugify(TITLE);

  it("puts a page on the shelf without a deploy", async () => {
    const result = await saveAlmanacEntry(testEnv, {
      title: TITLE,
      date: "2026-07-30",
      teaser: "One free line.",
      markdown: "# A Test Page\n\nBody.",
    });
    expect(result.refused).toBeUndefined();
    expect(result.saved?.slug).toBe(SLUG);

    // It is on sale immediately: the index lists it and the page gates.
    const index = (await (
      await SELF.fetch(`${BASE}/almanac`)
    ).json()) as { entries: { slug: string }[] };
    expect(index.entries.some((entry) => entry.slug === SLUG)).toBe(true);

    const gated = await SELF.fetch(`${BASE}/almanac/${SLUG}`);
    expect(gated.status, "a new page is not behind the till").toBe(402);
    /**
     * AND IT MUST BE PAYABLE, which the first cut of this test did not
     * check. A bare 402 with no PAYMENT-REQUIRED header is what the
     * gate returns for a route it has no config for — so asserting the
     * status alone passed while the page was unbuyable. A 402 is not
     * evidence of a purchasable page; a decodable challenge is.
     */
    const challenge = decodePaymentRequired(gated);
    expect(challenge.accepts.length).toBeGreaterThan(0);
    expect(challenge.accepts[0]?.amount).toBeTruthy();
  });

  it("refuses rather than mangles, and says why", async () => {
    // A page that silently lost its body would be worse than one that
    // never saved: the keeper is the only author this shelf has.
    for (const [input, because] of [
      [{ title: "", date: "2026-07-30", teaser: "t", markdown: "m" }, "title"],
      [{ title: "T", date: "July 30", teaser: "t", markdown: "m" }, "YYYY-MM-DD"],
      [{ title: "T", date: "2026-07-30", teaser: "", markdown: "m" }, "teaser"],
      [{ title: "T", date: "2026-07-30", teaser: "t", markdown: "" }, "empty"],
    ] as const) {
      const result = await saveAlmanacEntry(testEnv, input);
      expect(result.saved, `${because} slipped through`).toBeUndefined();
      expect(String(result.refused).toLowerCase()).toContain(
        because.toLowerCase(),
      );
    }
  });

  it("lets a page be corrected without a deploy", async () => {
    await saveAlmanacEntry(testEnv, {
      title: TITLE,
      date: "2026-07-30",
      teaser: "Corrected line.",
      markdown: "# A Test Page\n\nCorrected body.",
    });
    const entry = await findAlmanacEntry(testEnv, SLUG);
    expect(entry?.teaser).toBe("Corrected line.");
  });

  it("keeps the compiled seed pages, and lets one be overridden", async () => {
    const all = await listAlmanacEntries(testEnv);
    expect(
      all.some((entry) => entry.slug === "notes-from-a-tuesday-in-oak-city"),
      "the seed page vanished when KV pages appeared",
    ).toBe(true);
    expect(all.some((entry) => entry.slug === SLUG)).toBe(true);
    // Newest first, by the date the entry is about.
    const dates = all.map((entry) => entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("takes a page back off the shelf", async () => {
    await removeAlmanacEntry(testEnv, SLUG);
    expect(await findAlmanacEntry(testEnv, SLUG)).toBeUndefined();
    const gone = await SELF.fetch(`${BASE}/almanac/${SLUG}`);
    expect(gone.status).toBe(404);
  });
});

describe("the lever states its condition, like every other lever", () => {
  it("lists what has been written from the office", async () => {
    await saveAlmanacEntry(testEnv, {
      title: "Lever State Page",
      date: "2026-07-29",
      teaser: "t",
      markdown: "m",
    });
    const page = await (
      await SELF.fetch(`${BASE}/admin/tools`, { headers: adminAuth })
    ).text();
    expect(page).toContain("Lever State Page");
    expect(page).toContain("Write a page".replace("W", "w"));
    await removeAlmanacEntry(testEnv, slugify("Lever State Page"));
  });

  it("says the voice rule on the lever itself", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/admin/tools`, { headers: adminAuth })
    ).text();
    expect(page).toContain("Your words only");
    expect(page).toContain("posted on Medium");
  });
});
