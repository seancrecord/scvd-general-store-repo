import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  guideHeadings,
  llmsForArea,
  LLMS_AREAS,
  storeGuideText,
} from "@/routes/llms";

const BASE = "https://scvd.store";

/**
 * THE GUIDE, SPLIT — AND THE PROOF THAT IT IS A SPLIT.
 *
 * /llms.txt was 90,540 bytes against the convention's 30,000-character
 * recommendation, and separately scored nothing for having no
 * per-area files. Both findings point the same way and neither is
 * answered by writing less: this store's pitch is that the evidence is
 * the product, so the depth stays.
 *
 * The load-bearing assertion in this file is the FIRST one. Splitting
 * a long document is the exact task where prose quietly becomes two
 * prose, a derived figure quietly becomes a typed one, and a paragraph
 * quietly gets "tidied". So /llms-full.txt is hashed against the byte
 * digest of the document as it stood before any of this was written.
 * If a single character of the guide changed, that test fails, and it
 * fails for a rewrite dressed as a restructure exactly as loudly as it
 * fails for a typo.
 */

/**
 * The document as it stood on 2026-08-27, before the split, with the
 * two per-request dates normalised out.
 *
 * A CONSTANT, AND RULE 46 SAYS DERIVE OR REFUSE — so it is worth
 * saying why this one is neither a memorised value nor a guard that
 * cannot fail. It is a QUOTATION: the point is precisely that the
 * bytes do not move. Deriving it from the thing that would change it
 * would mean deriving it from the document, which would make it agree
 * with itself forever and assert nothing at all.
 *
 * When the keeper genuinely edits the guide, this fails, and the fix
 * is to re-take the digest in the same commit as the edit — which is
 * the review moment this exists to force.
 */
const GUIDE_DIGEST_BEFORE_THE_SPLIT =
  "2a9c1961db8a1f909e7754c21093799dbc7e423d1c5b38fd33a1b9c0ed93e0e6";

/** The llmstxt.org recommendation the index is being held to. */
const INDEX_CHARACTER_BUDGET = 30_000;

function normalize(text: string): string {
  return text
    .replace(/Served: \d{4}-\d{2}-\d{2}/g, "Served: <DATE>")
    .replace(/Last checked by hand: \d{4}-\d{2}-\d{2}/g, "Last checked: <DATE>");
}

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function body(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, path).toBe(200);
  return response.text();
}

describe("nothing was rewritten", () => {
  it("serves the complete guide at /llms-full.txt, byte for byte", async () => {
    const full = await body("/llms-full.txt");
    expect(await digest(normalize(full))).toBe(GUIDE_DIGEST_BEFORE_THE_SPLIT);
  });

  it("keeps /llms-full.txt and storeGuideText the same document", async () => {
    /*
     * The MCP read_store_guide tool serves storeGuideText too. An
     * agent that asked the server for the guide must get the whole
     * thing, not the index — the split is a WEB convention, and a tool
     * call is not a crawler.
     */
    expect(await body("/llms-full.txt")).toBe(storeGuideText(BASE));
  });
});

describe("the index is an index", () => {
  it("fits the convention's recommendation, with room", async () => {
    const index = await body("/llms.txt");
    expect(index.length).toBeLessThan(INDEX_CHARACTER_BUDGET);
    // And is genuinely smaller than what it replaced, not trimmed to
    // the line: the whole guide is over 89,000 characters.
    expect(index.length).toBeLessThan(storeGuideText(BASE).length / 3);
  });

  it("is no longer the same document as /llms-full.txt", async () => {
    /*
     * Until today these two paths served identical bytes and the
     * preamble apologised for it. The convention reserves llms-full
     * for the complete prose precisely so llms.txt can be a map.
     */
    expect(await body("/llms.txt")).not.toBe(await body("/llms-full.txt"));
  });

  it("names every area file, and every one of them answers", async () => {
    const index = await body("/llms.txt");
    expect(LLMS_AREAS.length).toBeGreaterThan(1);
    for (const area of LLMS_AREAS) {
      const url = `${BASE}${area.path}/llms.txt`;
      expect(index, area.slug).toContain(url);
      expect((await SELF.fetch(url)).status, url).toBe(200);
    }
  });

  it("points at a human page only where one exists", async () => {
    /*
     * `page` is absent on the shelf because /menu serves no page: the
     * catalog is machine-readable at /menu.json and rendered for
     * people on the front of the store. Both directions are asserted,
     * so neither an absent page that exists nor a claimed one that
     * does not can survive.
     */
    for (const area of LLMS_AREAS) {
      const response = await SELF.fetch(`${BASE}${area.path}`, {
        headers: { Accept: "text/html" },
      });
      if (area.page) {
        expect(response.status, `${area.path} is claimed as a page`).toBe(200);
      } else {
        expect(
          response.status,
          `${area.path} claims no page, so it must not serve one`,
        ).not.toBe(200);
      }
    }
  });

  it("keeps the door list, which is what the orphan guard reads", async () => {
    /*
     * Moving "Every door, in one list" into an area file would have
     * made every door one hop further from the surface
     * test/no-orphan-capability.spec.ts checks. It stays on the index.
     */
    const index = await body("/llms.txt");
    expect(index).toContain("## Every door, in one list");
    expect(index).toContain("## When to use this store, and when not to");
  });
});

describe("every section is filed exactly once", () => {
  it("loses no section between the index and the area files", { timeout: 15_000 }, async () => {
    /*
     * THE MAP IS THE ONE HAND-TYPED THING IN THIS SPLIT, so it is the
     * one thing guarded in both directions. A heading in the document
     * and in no file publishes a store with a hole in it; a heading in
     * two files publishes it twice and lets the copies drift.
     */
    const rendered = guideHeadings(BASE);
    expect(rendered.length).toBeGreaterThan(30);

    /*
     * EACH DOCUMENT IS FETCHED ONCE, then every heading is checked
     * against the in-memory copies. The first cut re-fetched every
     * area file per heading — thirty-odd headings times every area,
     * hundreds of identical renders — and on saturated CI runners
     * (imports alone at 1,700s, twice on 2026-08-27) that loop blew
     * the 5s default and failed the build on main. Same test timing
     * out twice is ours by house rule; the fix is the redundant work,
     * not the assertion.
     */
    const index = await body("/llms.txt");
    const areaTexts = new Map<string, string>();
    for (const area of LLMS_AREAS) {
      areaTexts.set(`${area.path}/llms.txt`, await body(`${area.path}/llms.txt`));
    }
    const seen = new Map<string, string[]>();

    for (const heading of rendered) {
      const homes: string[] = [];
      if (index.includes(`## ${heading}\n`)) {
        homes.push("/llms.txt");
      }
      for (const [path, text] of areaTexts) {
        if (text.includes(`## ${heading}\n`)) {
          homes.push(path);
        }
      }
      seen.set(heading, homes);
    }

    const orphaned = [...seen.entries()].filter(([, homes]) => homes.length === 0);
    const duplicated = [...seen.entries()].filter(([, homes]) => homes.length > 1);
    expect(orphaned.map(([heading]) => heading)).toEqual([]);
    expect(
      duplicated.map(([heading, homes]) => `${heading}: ${homes.join(", ")}`),
    ).toEqual([]);
  });

  it("files nothing under an area that does not exist", () => {
    // The other way a filing map rots: a heading that was renamed, and
    // an entry pointing at a slug nobody serves.
    const slugs = new Set(LLMS_AREAS.map((area) => area.slug));
    for (const area of LLMS_AREAS) {
      expect(llmsForArea(BASE, area.slug), area.slug).toBeTruthy();
    }
    expect(llmsForArea(BASE, "not-an-area")).toBeNull();
    expect(slugs.size).toBe(LLMS_AREAS.length);
  });

  it("carries each area's sections whole, not summarised", async () => {
    /*
     * The failure this whole file exists to prevent, checked from the
     * other end: an area file must contain its sections VERBATIM as
     * the full document renders them, not a paraphrase of them.
     */
    const full = storeGuideText(BASE);
    const sections = full.split(/^## /m).slice(1);
    for (const area of LLMS_AREAS) {
      const text = await body(`${area.path}/llms.txt`);
      const mine = sections.filter((section) =>
        text.includes(`## ${section.split("\n")[0]}\n`),
      );
      expect(mine.length, area.slug).toBeGreaterThan(0);
      for (const section of mine) {
        expect(text, `${area.slug}: ${section.split("\n")[0]}`).toContain(
          `## ${section}`.trimEnd(),
        );
      }
    }
  });

  it("ends every area file somewhere, never on a dead end", async () => {
    for (const area of LLMS_AREAS) {
      const text = await body(`${area.path}/llms.txt`);
      expect(text, area.slug).toContain(`${BASE}/llms-full.txt`);
      expect(text, area.slug).toContain(`${BASE}/llms.txt`);
      // And names its siblings, so a reader who landed here by search
      // can reach the rest without going back to the index first.
      for (const other of LLMS_AREAS.filter((entry) => entry !== area)) {
        expect(text, `${area.slug} -> ${other.slug}`).toContain(
          `${BASE}${other.path}/llms.txt`,
        );
      }
    }
  });

  it("says out loud that the shelf file is the big one", async () => {
    /*
     * NOT EVERY AREA FILE IS SMALL, and pretending otherwise would be
     * the same shape of half-truth as the 90kB llms.txt. The shelf is
     * 27,000 characters of per-item prose derived from MENU_ITEMS —
     * splitting it further would mean cutting the menu in half at some
     * arbitrary item. The convention's budget is on llms.txt, which is
     * met; this records that one section file exceeds it on purpose.
     */
    const shelf = LLMS_AREAS.find((area) => area.slug === "menu");
    expect(shelf).toBeTruthy();
    const text = await body(`${shelf!.path}/llms.txt`);
    expect(text.length).toBeGreaterThan(INDEX_CHARACTER_BUDGET);

    // Every other area file does fit, and that is worth holding.
    for (const area of LLMS_AREAS.filter((entry) => entry.slug !== "menu")) {
      expect(
        (await body(`${area.path}/llms.txt`)).length,
        area.slug,
      ).toBeLessThan(INDEX_CHARACTER_BUDGET);
    }
  });
});
