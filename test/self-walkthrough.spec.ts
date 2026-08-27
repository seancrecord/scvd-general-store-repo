import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CATALOG_PATHS } from "@/discovery/self-module";

/**
 * THE SELF-PASSPORT WALKTHROUGH (outside review, 2026-08-27,
 * accepted): "here is how SCVD checks itself" as one readable page,
 * not an exercise left to whoever can decode a module list.
 *
 * It lives ON the /passport landing — the noun stays frozen; no new
 * room — and it NARRATES the live self-passport rather than
 * describing a process from memory: the surfaces walked come from the
 * same CATALOG_PATHS the walk fetches, and each module's verdict and
 * evidence hash on the page are the live object's own. A walkthrough
 * that could drift from the walk would be prose wearing an
 * instrument's name.
 */

describe("the /passport landing walks its own check", () => {
  it("names every surface the self-walk fetches, from the walk's own list", async () => {
    const html = await (
      await SELF.fetch("https://scvd.store/passport", {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toMatch(/how this store checks itself/i);
    for (const path of Object.values(CATALOG_PATHS)) {
      expect(html).toContain(path);
    }
  });

  it("narrates each live module — and cannot disagree with the signed object on the same page", async () => {
    /*
     * One fetch, deliberately: each request issues the self-passport
     * live, and the evidence hash binds the issue instant, so two
     * requests would honestly carry two hashes. The law is that ONE
     * page agrees with ITSELF — the walkthrough's narration against
     * the signed object embedded further down the same render.
     */
    const html = await (
      await SELF.fetch("https://scvd.store/passport", {
        headers: { Accept: "text/html" },
      })
    ).text();
    // The signed object rides the page HTML-escaped in the <pre>.
    const signedHashes = [
      ...html.matchAll(/evidence_hash&quot;: &quot;([0-9a-f]{64})/g),
    ].map((m) => m[1]!);
    expect(signedHashes.length).toBeGreaterThanOrEqual(2);

    const sections = [...html.matchAll(/data-walkthrough="([\w-]+)"/g)].map(
      (m) => m[1]!,
    );
    expect(sections.length).toBe(signedHashes.length);
    for (const id of sections) {
      const anchor = html.indexOf(`data-walkthrough="${id}"`);
      const section = html.slice(anchor, anchor + 2000);
      const prefix = /<code>([0-9a-f]{12})…<\/code>/.exec(section)?.[1];
      expect(prefix, `hash prefix in walkthrough for ${id}`).toBeDefined();
      expect(
        signedHashes.some((hash) => hash.startsWith(prefix!)),
        `walkthrough hash for ${id} appears in the signed object`,
      ).toBe(true);
    }
  });

  it("says the posture out loud: ourselves first, re-checkable by anyone", async () => {
    const html = await (
      await SELF.fetch("https://scvd.store/passport", {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toMatch(/on ourselves first|ourselves before|checks itself first/i);
    expect(html).toMatch(/re-check|recheck|with your own tools/i);
  });
});
