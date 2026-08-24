import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { RETIRED_ITEMS } from "@/store/retired";

const BASE = "https://scvd.store";

/**
 * A RETIRED DOOR MUST SAY SO IN A DIALECT PROBERS ALREADY SPEAK.
 *
 * Found 2026-08-24 by way of an outside directory. This store handed
 * x402-list.com a listing on 2026-08-18 and retired `daily_fortune`
 * on 2026-08-20, without re-submitting. Their prober kept knocking on
 * the closed door, read a status that was not 402, and scored the
 * store DEGRADED — correctly, by its own lights.
 *
 * Nothing was broken here. The 410 is right, and the JSON body was
 * already generous: what happened, when, what it folded into, and a
 * note that certificates issued under it verify forever. The gap was
 * that a prober has no reason to read a body shaped like ours.
 *
 * WHAT THIS DOES AND DOES NOT FIX. It does not un-stale the listing —
 * only re-submitting does that, and that is a letter, not a commit.
 * It stops the NEXT directory from needing to be told, which is the
 * only half a codebase can own.
 *
 * The lesson is the ordinary one pointed at ourselves: we published
 * an entry in somebody's index and let it rot, which is the exact
 * defect class this store sells checking for.
 */
describe("the retired shelf answers in standard headers", () => {
  const folded = RETIRED_ITEMS.filter((entry) => entry.folded_into);
  expect(folded.length).toBeGreaterThan(0);

  it("carries Deprecation and Sunset on every retired item", async () => {
    for (const entry of RETIRED_ITEMS) {
      const response = await SELF.fetch(`${BASE}/api/buy/${entry.id}`);
      expect(response.status).toBe(410);

      // RFC 9745: an @-prefixed unix timestamp.
      const deprecation = response.headers.get("Deprecation");
      expect(deprecation).toMatch(/^@\d+$/);

      // RFC 8594: an HTTP-date, and the SAME moment the body names.
      const sunset = response.headers.get("Sunset");
      expect(sunset).toBeTruthy();
      expect(new Date(sunset!).toISOString().slice(0, 10)).toBe(
        entry.retired_on,
      );
    }
  });

  it("points at the successor where one exists, and invents one where it does not", async () => {
    for (const entry of RETIRED_ITEMS) {
      const response = await SELF.fetch(`${BASE}/api/buy/${entry.id}`);
      const link = response.headers.get("Link");
      if (entry.folded_into) {
        expect(link).toContain('rel="successor-version"');
        expect(link).toContain(`/api/buy/${entry.folded_into}`);
      } else {
        // A cut with nothing behind it must not manufacture a
        // replacement; pointing somewhere plausible would be a
        // recommendation the retirement never made.
        expect(link).toBeNull();
      }
    }
  });

  it("still says it in plain language, because headers are not the record", async () => {
    const entry = folded[0]!;
    const response = await SELF.fetch(`${BASE}/api/buy/${entry.id}`);
    const body = (await response.json()) as Record<string, string>;
    expect(body["error"]).toContain(entry.retired_on);
    expect(body["certificates_note"]).toContain("verify forever");
  });
});
