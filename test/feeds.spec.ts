import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FEEDS, briefEntries, correctionEntries, corpusEntries, disagreementEntries } from "@/routes/feeds";
import { listCorpus } from "@/services/corpus";
import { CORRECTIONS } from "@/store/corrections";
import { DISAGREEMENTS } from "@/store/disagreements";
import { ROOMS } from "@/store/rooms";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { FREE_DOORS } from "@/store/atlas";
import type { Env } from "@/types";

/**
 * THE FEEDS (2026-09-03). What this file holds:
 *
 *   - each feed is derived from the store the page reads: one entry
 *     per correction, per disagreement, per signed snapshot, per
 *     signed week, and no entry without a source row;
 *   - every feed is well-formed Atom with a stable id, a dated
 *     updated and a link to the page, newest first;
 *   - the four pages the feeds mirror advertise them in the head;
 *   - the index page is a registered room, a published dataset and an
 *     atlas door, and carries the corrections pointer.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

function parseFeed(xml: string): { ids: string[]; updated: string[]; links: string[] } {
  const ids = [...xml.matchAll(/<entry>[\s\S]*?<id>([^<]+)<\/id>/g)].map((m) => m[1]!);
  const updated = [...xml.matchAll(/<entry>[\s\S]*?<updated>([^<]+)<\/updated>/g)].map((m) => m[1]!);
  const links = [...xml.matchAll(/<entry>[\s\S]*?<link rel="alternate" href="([^"]+)"\/>/g)].map((m) => m[1]!);
  return { ids, updated, links };
}

describe("derived from the record", () => {
  it("one entry per correction and per disagreement, newest first, linking the page", () => {
    const corrections = correctionEntries(BASE);
    expect(corrections).toHaveLength(CORRECTIONS.length);
    for (const entry of corrections) expect(entry.link).toBe(`${BASE}/corrections`);
    expect(corrections.map((e) => e.updated)).toEqual([...corrections.map((e) => e.updated)].sort().reverse());

    const disagreements = disagreementEntries(BASE);
    expect(disagreements).toHaveLength(DISAGREEMENTS.length);
    for (const entry of DISAGREEMENTS) {
      const row = disagreements.find((e) => e.id === `${BASE}/disagreements#${entry.id}`);
      expect(row?.summary).toContain(entry.state);
      expect(row?.summary).toContain(entry.ours.said);
      expect(row?.summary).toContain(entry.theirs.said);
    }
  });

  it("one entry per signed snapshot and per signed week, from the chain", async () => {
    const records = await listCorpus(testEnv);
    const corpus = await corpusEntries(testEnv, BASE);
    expect(corpus).toHaveLength(records.length);
    for (const record of records) {
      expect(corpus.map((e) => e.link)).toContain(`${BASE}/corpus/${record.snapshot.sequence}.json`);
    }
    const brief = await briefEntries(testEnv, BASE);
    const weeks = new Set(records.map((record) => record.snapshot.week));
    expect(brief.length).toBeLessThanOrEqual(weeks.size);
    for (const entry of brief) {
      expect(entry.summary).toMatch(/\d+ doors named, \d+ probed, \d+ payable and \d+ not/);
      expect(entry.summary).toContain("Not a ranking");
    }
  });
});

describe("the feeds on the wire", () => {
  it("serve well-formed Atom with stable ids, dated entries and page links", async () => {
    for (const feed of FEEDS) {
      const response = await SELF.fetch(`${BASE}${feed.path}`);
      expect(response.status, feed.path).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/atom+xml");
      const xml = await response.text();
      expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
      expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
      expect(xml).toContain(`<link rel="self" type="application/atom+xml" href="${BASE}${feed.path}"/>`);
      expect(xml).toMatch(/<updated>\d{4}-\d{2}-\d{2}T[^<]+<\/updated>/);
      const { ids, updated, links } = parseFeed(xml);
      expect(ids.length).toBe(updated.length);
      expect(ids.length).toBe(links.length);
      expect(new Set(ids).size).toBe(ids.length);
      for (const link of links) expect(link.startsWith(BASE)).toBe(true);
      expect(updated).toEqual([...updated].sort().reverse());
      if (feed.path !== "/feeds/corpus.xml") expect(xml).toContain("/corrections");
    }
  });

  it("are advertised in the head of the pages they mirror", async () => {
    const pairs: [string, string][] = [
      ["/corrections", "/feeds/corrections.xml"],
      ["/disagreements", "/feeds/disagreements.xml"],
      ["/corpus", "/feeds/corpus.xml"],
      ["/corpus/brief", "/feeds/brief.xml"],
    ];
    for (const [page, feed] of pairs) {
      const html = await (await SELF.fetch(`${BASE}${page}`, { headers: { Accept: "text/html" } })).text();
      expect(html, `${page} does not advertise ${feed}`).toContain(
        `<link rel="alternate" type="application/atom+xml" href="${BASE}${feed}"`,
      );
    }
  });

  it("have an index that is a room, a dataset and an atlas door, with the pointer", async () => {
    expect(ROOMS.map((room) => room.path)).toContain("/feeds");
    expect(PUBLISHED_DATASETS.map((dataset) => dataset.path)).toContain("/feeds");
    expect(FREE_DOORS.map((door) => door.path)).toContain("/feeds");
    const body = (await (await SELF.fetch(`${BASE}/feeds`, { headers: { Accept: "application/json" } })).json()) as {
      feeds: { path: string; url: string }[];
      corrections: string;
    };
    expect(body.feeds.map((feed) => feed.path)).toEqual(FEEDS.map((feed) => feed.path));
    expect(body.corrections).toContain("/corrections");
    const html = await (await SELF.fetch(`${BASE}/feeds`, { headers: { Accept: "text/html" } })).text();
    for (const feed of FEEDS) expect(html).toContain(`href="${feed.path}"`);
  });
});
