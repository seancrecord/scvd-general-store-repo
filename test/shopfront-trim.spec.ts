import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS, invertedTimestamp } from "@/lib/kv-keys";
import { scrubBrokenText } from "@/lib/sanitize";
import { listGuestbook } from "@/services/guestbook";
import { computeStats, storefrontLedgerLine } from "@/services/stats";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE SHOPFRONT, AFTER THE KEEPER READ IT AS A STRANGER WOULD
 * (2026-08-06). Four complaints, all of them about the front of the
 * building saying too much in the wrong places:
 *
 *   1. The books arrived as a paragraph — six figures, two URLs and a
 *      house-flagging policy in 0.72rem grey, under the neon. The
 *      number that matters is organic sales. The paragraph belongs at
 *      /stats, where somebody asked for it.
 *   2. Two rails have been open for weeks and the only place that said
 *      so was inside the agent door, in a terminal font.
 *   3. A U+FFFD had been sitting on the wall for days, which reads as
 *      the store being broken rather than as a sender's encoding.
 *   4. The footer had reached eight paragraphs and buried its own
 *      links.
 *
 * What is testable about copy is placement, arithmetic and restraint.
 * That is what this file holds.
 */
describe("the front of the store, trimmed", () => {
  it("prints the organic count, not the whole ledger paragraph", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    // The paragraph's own furniture, all of which now lives at /stats.
    expect(page).not.toContain("Operating since");
    expect(page).not.toContain("Settled purchases:");
    expect(page).not.toContain("house-flagged proprietor tests");
    expect(page).not.toContain("free shelf included");
    // And the claim itself is still on the page, with its door to the books.
    expect(page).toMatch(/\d+ organic sale/);
    expect(page).toContain('href="/stats"');
  });

  it("says on the human side of the page which rails it takes", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    const human = page.slice(0, page.indexOf('class="door-agent"'));
    // Before the trim, "Base or Solana" appeared ONLY inside the agent
    // door — a terminal panel a buyer's human never reads.
    expect(human).toContain("USDC");
    expect(human).toContain("Base");
    expect(human).toContain("Solana");
  });

  it("splits the organic figure by rail without the split ever disagreeing with it", async () => {
    const month = new Date().toISOString().slice(0, 7);
    // Five organic settles on the counters — the substrate the organic
    // figure has always come from.
    await testEnv.COUNTERS.put(`metric:${month}:paid:hello`, "5");
    // Four of them placed on a rail by the certificates. The fifth is a
    // penny page: real money, no certificate, and therefore no rail.
    await testEnv.COUNTERS.put(
      KV_KEYS.railSplit,
      JSON.stringify({
        base: 3,
        solana: 1,
        unknown: 0,
        truncated: false,
        computed_at: new Date().toISOString(),
      }),
    );
    const stats = await computeStats(testEnv);
    const rail = stats.organic_by_rail;
    expect(rail, "a written snapshot never reached the books").toBeTruthy();
    expect(rail?.base).toBe(3);
    expect(rail?.solana).toBe(1);
    expect(rail?.rail_not_recorded).toBe(1);
    expect(rail!.base + rail!.solana + rail!.rail_not_recorded).toBe(
      stats.organic_settlements,
    );
  });

  it("drops the split entirely rather than publish one that overshoots", async () => {
    const month = new Date().toISOString().slice(0, 7);
    await testEnv.COUNTERS.put(`metric:${month}:paid:hello`, "1");
    // Two substrates, and this is what it looks like when they part
    // company: more certificate-backed sales than the counters know of.
    // A negative remainder is not a number this store gets to print, so
    // the split goes away and the organic count stands alone.
    await testEnv.COUNTERS.put(
      KV_KEYS.railSplit,
      JSON.stringify({
        base: 9,
        solana: 4,
        unknown: 0,
        truncated: false,
        computed_at: new Date().toISOString(),
      }),
    );
    const stats = await computeStats(testEnv);
    expect(stats.organic_by_rail).toBeUndefined();
  });

  it("never invents a rail split out of a missing snapshot", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.railSplit);
    const stats = await computeStats(testEnv);
    expect(stats.organic_by_rail).toBeUndefined();
    // And the line still stands on the number that is the claim.
    expect(storefrontLedgerLine(stats)).toContain("organic sale");
    expect(storefrontLedgerLine(stats)).not.toContain("Base");
  });

  it("names both rails on the line once the walk has run", () => {
    const line = storefrontLedgerLine({
      operating_since: "2026-07-22",
      settled_purchases_total: 92,
      organic_settlements: 6,
      house_settlements: 85,
      reclassified_house: 0,
      pre_meter_settlements: 1,
      artifacts_issued: 89,
      organic_by_rail: {
        base: 4,
        polygon: 0,
        solana: 2,
        rail_not_recorded: 0,
        computed_at: "2026-08-06T00:00:00.000Z",
      },
      computed_at: "2026-08-06T00:00:00.000Z",
    });
    expect(line).toBe("6 organic sales — 4 on Base, 2 on Solana.");
  });

  it("prints what neither record could place, rather than absorbing it", () => {
    const line = storefrontLedgerLine({
      operating_since: "2026-07-22",
      settled_purchases_total: 92,
      organic_settlements: 6,
      house_settlements: 85,
      reclassified_house: 0,
      pre_meter_settlements: 1,
      artifacts_issued: 89,
      organic_by_rail: {
        base: 4,
        polygon: 0,
        solana: 1,
        rail_not_recorded: 1,
        computed_at: "2026-08-06T00:00:00.000Z",
      },
      computed_at: "2026-08-06T00:00:00.000Z",
    });
    // 4 + 1 + 1 = 6, and a reader can do that subtraction and have it
    // come out. The last time this store printed a split that did not,
    // the keeper found it before anybody else did.
    //
    // The WORDS matter as much as the number. "1 unattributed" was the
    // first cut and it read, next to a page advertising two chains, as
    // a third chain we couldn't name or as money we'd lost. This says
    // what actually happened: the sale is fine, the bookkeeping was
    // late.
    expect(line).toContain("1 from before we logged the rail");
    expect(line).not.toContain("unattributed");
  });
});

describe("the wall", () => {
  it("drops a replacement character rather than publishing it", async () => {
    const key = KV_KEYS.guestbookEntry(invertedTimestamp(Date.now()), "mojibake");
    await testEnv.GUESTBOOK.put(
      key,
      JSON.stringify({
        id: "mojibake",
        name: "encoding_walker",
        // Exactly the shape that reached the wall: a character that
        // arrived as broken bytes and decoded to U+FFFD.
        message: "Testing every shelf � verifying the store works.",
        date: new Date().toISOString(),
      }),
    );
    const entries = await listGuestbook(testEnv, 20);
    const entry = entries.find((row) => row.id === "mojibake");
    expect(entry, "the seeded entry never came back").toBeTruthy();
    expect(entry?.message).not.toContain("�");
    expect(entry?.message).toBe("Testing every shelf verifying the store works.");
  });

  it("keeps emoji, which are the accident's next-door neighbour", () => {
    // A matched surrogate pair is an ordinary emoji. The first cut of
    // the scrub stripped the whole surrogate range and would have eaten
    // every one of them.
    expect(scrubBrokenText("rang the bell \u{1F514}")).toBe(
      "rang the bell \u{1F514}",
    );
    // A lone high surrogate is the same accident wearing a different hat.
    expect(scrubBrokenText("half a character \uD83D here")).toBe(
      "half a character here",
    );
  });

  it("is set apart from the copy the store writes about itself", async () => {
    await SELF.fetch(`${BASE}/api/guestbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "wall-spec",
        message: "Signed to prove the wall renders.",
      }),
    });
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    expect(page).toContain('class="wall-slips"');
    expect(page).toContain('class="guest-sig"');
    // Its own face, not the page's body serif.
    expect(page).toContain("Palatino");
  });
});

describe("the footer", () => {
  it("is a door to every room and little else", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    const footer = page.slice(page.indexOf('class="porch-print"'));
    // The paragraphs that each have a room of their own to say it in.
    expect(footer).not.toContain("founding edition");
    expect(footer).not.toContain("A dinosaur keeps the shelf");
    expect(footer).not.toContain("Nothing but vibes");
    expect(footer).not.toContain("Digital items: always open");
    // What it kept.
    expect(footer).toContain("Every room, all free to read");
    expect(footer).toContain("/api/verify/{id}");
  });

  it("stops sending people to the Gazette from the front of the store", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    expect(page).not.toContain('href="/gazette"');
    expect(page).not.toContain('href="/gazette/founding"');
    // Still open, still free, still named where an agent reads.
    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain("/gazette");
  });

  it("gives the address without the flourish the keeper struck", async () => {
    const page = await (await SELF.fetch(BASE, { headers: HTML })).text();
    expect(page).toContain("Oak City");
    expect(page).not.toContain("that's the whole address");
    expect(page).not.toContain("that&#39;s the whole address");
  });
});
