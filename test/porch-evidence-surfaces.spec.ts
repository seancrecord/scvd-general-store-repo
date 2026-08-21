import { describe, expect, it } from "vitest";
import { porchSurface } from "@/lib/porch-surface";

/**
 * THE INSTRUMENT POINTS AT THE THING THE SHOP IS FOR.
 *
 * The porch map grew one line per shelf while the evidence layer grew
 * beside it and nobody added a line — so on 2026-08-21 the store could
 * say how many agents read the menu and nothing whatsoever about
 * whether anyone used the corpus, the passports, or the chip. Six of
 * the keeper's nine leading indicators were unanswerable not because
 * they are hard but because the instrument was aimed at the storefront.
 *
 * This test is the guard against that recurring: every evidence
 * surface the store serves must resolve to a porch surface. A new
 * evidence room that forgets its line fails here rather than going
 * quietly unmeasured for a month.
 */

/** Every path whose USE is a leading indicator, and what it means. */
const EVIDENCE_SURFACES: Array<{
  path: string;
  surface: string;
  why: string;
}> = [
  {
    path: "/corpus",
    surface: "corpus",
    why: "somebody came to read the record",
  },
  {
    path: "/corpus.json",
    surface: "corpus.json",
    why: "a machine took the whole dataset",
  },
  {
    path: "/corpus/host/x402.org.json",
    surface: "corpus:host",
    why: "somebody asked about ONE endpoint — the strongest corpus signal",
  },
  {
    path: "/corpus/34.json",
    surface: "corpus:week",
    why: "somebody read one week's signed round",
  },
  {
    path: "/registry",
    surface: "registry",
    why: "the census's public tally was read",
  },
  {
    path: "/fresh-set",
    surface: "fresh-set",
    why: "routing data taken — evidence used to choose a door",
  },
  {
    path: "/passport",
    surface: "passport",
    why: "the passport index was read",
  },
  {
    path: "/passport/x402.org",
    surface: "passport:host",
    why: "somebody looked up one host's standing",
  },
  {
    path: "/badges/passport/x402.org.svg",
    surface: "chip",
    why: "our verdict is rendering on somebody else's page",
  },
  {
    path: "/trust",
    surface: "trust",
    why: "the trust panel was read",
  },
  {
    path: "/api/watch/watch_abc123",
    surface: "watch:history",
    why: "a watch somebody bought is being read — a watch nobody reads is a subscription, not evidence",
  },
  {
    path: "/api/conformance-watch/cwatch_abc123",
    surface: "conformance-watch:history",
    why: "the daily sibling, same question",
  },
];

describe("the porch watches the evidence layer, not just the shop", () => {
  for (const { path, surface, why } of EVIDENCE_SURFACES) {
    it(`logs ${path} — ${why}`, () => {
      expect(porchSurface(path, "GET")).toBe(surface);
    });
  }

  /**
   * BOUNDED KEY SPACE, and this is a cost rule with teeth: a
   * per-host surface would let any stranger's hostname mint its own
   * counter key, which is an unbounded KV key space bought with
   * somebody else's traffic. The bucket carries the count; the event
   * row carries the detail.
   */
  it("buckets per-host reads instead of minting a key per stranger", () => {
    const hosts = ["a.example", "b.example", "c.example"];
    const corpusSurfaces = new Set(
      hosts.map((host) => porchSurface(`/corpus/host/${host}.json`, "GET")),
    );
    const passportSurfaces = new Set(
      hosts.map((host) => porchSurface(`/passport/${host}`, "GET")),
    );
    const chipSurfaces = new Set(
      hosts.map((host) => porchSurface(`/badges/passport/${host}.svg`, "GET")),
    );
    expect(corpusSurfaces.size).toBe(1);
    expect(passportSurfaces.size).toBe(1);
    expect(chipSurfaces.size).toBe(1);
  });

  it("still knows the storefront it started with", () => {
    // The extraction moved this logic out of the Worker entry; the
    // shop's own surfaces have to survive the move untouched.
    expect(porchSurface("/", "GET")).toBe("storefront");
    expect(porchSurface("/menu.json", "GET")).toBe("menu.json");
    expect(porchSurface("/api/guestbook", "POST")).toBe("guestbook:write");
    expect(porchSurface("/api/guestbook", "GET")).toBe("guestbook:read");
    expect(porchSurface("/.well-known/x402.json", "GET")).toBe("well-known");
    expect(porchSurface("/menu/hello", "GET")).toBe("item:hello");
    // A path that is not a shelf mints nothing.
    expect(porchSurface("/menu/not-a-real-item", "GET")).toBeUndefined();
    expect(porchSurface("/some/random/path", "GET")).toBeUndefined();
  });
});
