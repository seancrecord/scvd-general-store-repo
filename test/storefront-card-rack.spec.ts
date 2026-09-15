import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { releaseCommits } from "@/services/cards";
import { CURRENT_SEASON } from "@/store/cards";
import { app } from "@/index";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * THE CARD RACK ON THE FRONT PAGE (2026-09-13, the keeper: "feels like
 * a 'card' and a button for it would be good for humans too to know
 * about").
 *
 * Paywall shipped as a room, a shelf line and a set of JSON doors —
 * which is how an agent finds anything here and is not how a person
 * does. A human landing on the storefront met one card in a grid of
 * sixteen and a link in the footer, and no way at all to learn that
 * the browser till behind it has been live since August.
 *
 * Held here: the rack is on the page, it shows a real card face, it
 * points at the till rather than at the raw 402, it prints the two
 * one-of-one commits, and — the part that matters for the front
 * page's latency — it costs no KV read to render.
 */
describe("the card rack", () => {
  async function storefront(): Promise<string> {
    const page = await SELF.fetch(BASE, { headers: { Accept: "text/html" } });
    expect(page.status).toBe(200);
    return page.text();
  }

  it("puts a card and a button where a person will see them", async () => {
    const html = await storefront();
    expect(html).toContain("THE CARD RACK");
    // A real card face, not a drawing of one: the specimen route.
    expect(html).toContain('src="/p/specimen.svg"');
    // And it says the specimen is a specimen, so nobody reads it as a pull.
    expect(html).toContain("printed to show the form");
    /*
     * THE THREE DOORS, in the order a person meets them. The buy
     * button goes to the ITEM PAGE and not to /api/buy/pack: the item
     * page carries the browser till (house rule 53), which is the only
     * one of the three a human with a wallet can actually walk
     * through. A front-page button pointing at a raw 402 would be a
     * button that hands a person a JSON error.
     */
    expect(html).toContain('href="/menu/pack"');
    expect(html).toContain('href="/design"');
    expect(html).toContain('href="/bell"');
    expect(html).not.toContain('class="door-cta rack-buy" href="/api/buy/pack"');
  });

  it("prints both one-of-one commits, and they are the store's real ones", async () => {
    const html = await storefront();
    const commits = await releaseCommits(testEnv);
    expect(commits).toHaveLength(2);
    for (const entry of commits) {
      expect(entry.commit).toMatch(/^[0-9a-f]{64}$/);
      // Truncated on the page, whole at the door it names.
      expect(html).toContain(entry.commit.slice(0, 24));
      expect(html).toContain(entry.name);
    }
    expect(html).toContain("/api/paywall/releases");
    /*
     * AND NEVER THE MILESTONE. The whole promise is that the number
     * behind the commit is unknown until the card lands; a front page
     * that leaked it would let anyone count packs and buy the one that
     * crosses. The rack is given commits and nothing else by
     * construction — this asserts the construction held.
     */
    const wheel = await import("@/services/cards");
    for (const entry of await wheel.releaseStates(testEnv)) {
      expect(entry.landed).toBeNull();
    }
    expect(JSON.stringify(commits)).not.toContain("milestone");
    expect(JSON.stringify(commits)).not.toContain("reveal");
  });

  it("costs the hottest door in the store no KV read at all", async () => {
    /**
     * The front page is the most-served door here, and a picture of a
     * card is not worth a read on it. releaseCommits is four HMACs and
     * two digests over the signing key: no namespace is touched, so a
     * KV outage shows the rack exactly as a working day does.
     */
    let reads = 0;
    const namespaces = [testEnv.PATRONS, testEnv.COUNTERS] as const;
    const originals = namespaces.map((ns) => [ns.get.bind(ns), ns.list.bind(ns)] as const);
    for (const ns of namespaces) {
      const realGet = ns.get.bind(ns);
      const realList = ns.list.bind(ns);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ns as any).get = (...args: unknown[]) => { reads += 1; return (realGet as any)(...args); };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ns as any).list = (...args: unknown[]) => { reads += 1; return (realList as any)(...args); };
    }
    try {
      const commits = await releaseCommits(testEnv);
      expect(commits).toHaveLength(CURRENT_SEASON.cards.filter((card) => card.rarity === "keeper").length);
    } finally {
      namespaces.forEach((ns, index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ns as any).get = originals[index]![0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ns as any).list = originals[index]![1];
      });
    }
    expect(reads).toBe(0);
  });

  it("never links a door that refuses a GET", async () => {
    /**
     * THE BUG THIS TEST EXISTS FOR (2026-09-15, the keeper on a phone:
     * "Clicking 'ring the bell' on home page gives me this" — the
     * store's own method refusal, offered as a bell.json download).
     *
     * The rack shipped with "Ring the bell — free" as an anchor at
     * /api/bell, which is POST-only. An anchor is a GET, so the one
     * free thing on the front page answered a person with
     * {"error":"This door exists and takes POST, not GET."}. The
     * refusal was correct; the link was wrong. And the case above
     * asserted that exact href, so a full green suite shipped it.
     *
     * A link is a GET by definition, so this reads the app's OWN route
     * table and fails on any anchor the storefront points at a path
     * that is registered for POST and not for GET. Typing a list of
     * known-bad paths would repeat the original mistake one layer up.
     */
    const registered = app.routes as ReadonlyArray<{ path: string; method: string }>;
    const getPaths = new Set(registered.filter((r) => r.method === "GET" || r.method === "ALL").map((r) => r.path));
    const postOnly = new Set(
      registered.filter((r) => r.method === "POST" && !getPaths.has(r.path)).map((r) => r.path),
    );
    expect(postOnly.size, "sanity: the store does have POST-only doors").toBeGreaterThan(0);
    expect(postOnly.has("/api/bell"), "sanity: /api/bell is one of them").toBe(true);

    const html = await storefront();
    const linked = [...html.matchAll(/href="(\/[^"#?]*)/g)].map(([, path]) => path!);
    expect(linked.length).toBeGreaterThan(10);
    const broken = [...new Set(linked)].filter((path) => postOnly.has(path));
    expect(broken, "the front page links a door that answers a GET with a refusal").toEqual([]);
  });

  it("names the release wheel where the shelf and the guide describe the pack", async () => {
    /*
     * The wheel changed what a pack IS, so every surface that sells one
     * has to say so — not only the room it was built in. These are the
     * three a buyer actually reads before paying.
     */
    const menu = await (await SELF.fetch(`${BASE}/menu/pack`, { headers: { Accept: "application/json" } })).text();
    expect(menu).toContain("a milestone committed before the season opened");
    const guide = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    expect(guide).toContain("/api/paywall/releases");
    expect(guide).toContain("he cannot say whose");
    const index = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(index).toContain("/api/paywall/releases");
  });
});
