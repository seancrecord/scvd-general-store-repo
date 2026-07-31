import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CONVENTIONAL_REDIRECTS } from "@/routes/conventional";
import { ROOMS } from "@/store/rooms";

const BASE = "https://scvd.store";

/**
 * A 404 IS AN ANSWER AND IT WAS THE WRONG ONE.
 *
 * /about, /contact, /terms, /privacy and the rest all 404'd, and an
 * outside model evaluating this store reported it could find no
 * company identity, no contact route and no terms. Accurate: every one
 * of those IS answered here, at a URL nobody would guess. To a
 * checklist, "no terms page" and "terms are somewhere you did not
 * look" are indistinguishable, and it files the first reading.
 */
describe("a guessed URL lands somewhere real", () => {
  it("redirects permanently rather than answering nothing", async () => {
    for (const [guessed, target] of Object.entries(CONVENTIONAL_REDIRECTS)) {
      const response = await SELF.fetch(`${BASE}${guessed}`, {
        redirect: "manual",
      });
      expect(response.status, `${guessed} does not redirect`).toBe(301);
      expect(response.headers.get("location"), guessed).toBe(target);
    }
  });

  it("never points at a page that does not answer", async () => {
    // A redirect to somewhere vaguely adjacent, to look complete, is
    // worse than the 404: it costs a hop before disappointing.
    for (const [guessed, target] of Object.entries(CONVENTIONAL_REDIRECTS)) {
      const response = await SELF.fetch(`${BASE}${target}`);
      expect(
        response.status,
        `${guessed} redirects to ${target}, which does not answer`,
      ).toBe(200);
    }
  });

  it("carries no fragment nothing renders", () => {
    // /contact once pointed at /what#contact. No such anchor exists —
    // a redirect to a fragment that renders nothing is a small lie
    // that tells a reader nobody checked.
    for (const target of Object.values(CONVENTIONAL_REDIRECTS)) {
      expect(target, `${target} points at an anchor`).not.toContain("#");
    }
  });

  it("adds no room, so nothing new is surfaced to a human", async () => {
    // The keeper's instruction: do these, do not surface them. A
    // redirect is routing; a room would be a second, duller voice.
    const paths = ROOMS.map((room) => room.path);
    for (const guessed of Object.keys(CONVENTIONAL_REDIRECTS)) {
      expect(paths, `${guessed} became a room`).not.toContain(guessed);
    }
    const sitemap = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    for (const guessed of Object.keys(CONVENTIONAL_REDIRECTS)) {
      expect(sitemap, `${guessed} is in the sitemap`).not.toContain(
        `<loc>${BASE}${guessed}</loc>`,
      );
    }
  });
});

describe("the data stance is published where the question gets asked", () => {
  it("answers what /privacy would have, as structured data", async () => {
    // It was enforced in metrics.ts and stated to nobody, so a
    // diligence pass asking "is there a privacy policy" correctly
    // found none while the actual stance was stronger than most.
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as { data_handling: Record<string, string> };
    expect(body.data_handling["cookies"]).toMatch(/none/i);
    expect(body.data_handling["ip_addresses"]).toMatch(/not stored/i);
    // The load-bearing one: a limit you can inspect beats a policy you
    // have to trust.
    expect(body.data_handling["uniqueness"]).toMatch(/deliberately unavailable/i);
  });
});
