import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { app } from "@/index";

/**
 * CORRECTION-CHAIN VISIBILITY, FIRST-CLASS (outside review,
 * 2026-08-27, accepted): "if any old artifact or public page is
 * superseded, the newer correction should be more discoverable than
 * the stale claim."
 *
 * The house cannot retro-edit signed history — that refusal is the
 * spine — so the discoverability has to run the other way: every
 * EVIDENCE surface carries a pointer to the corrections desk, so a
 * reader standing on any claim this store ever signed is one hop
 * from the record of what later proved wrong. A surface that serves
 * evidence without that pointer is a stale claim waiting to outrank
 * its own correction.
 *
 * This spec is the standing check, not a one-time audit: a NEW
 * evidence surface added without the pointer fails here, by name.
 *
 * WHICH IT COULD NOT DO UNTIL 2026-08-29, because the roster was six
 * paths somebody typed. /registry, /inflows and /doors.json were all
 * published after it was written and none of them was walked; the
 * sentence above claimed a standing check and delivered a snapshot.
 * The roster is the dataset catalogue now, plus the handful of
 * evidence surfaces that are deliberately not catalogued datasets,
 * each named with its reason. A staleness check below fails if one of
 * those reasons stops describing a live door.
 */

/**
 * Evidence surfaces the dataset catalogue does not name, each with
 * the reason it is not a catalogued dataset. These are the only
 * hand-written entries left here; everything else derives.
 */
const NAMED_EVIDENCE: Record<string, string> = {
  "/passport":
    "a live read of one endpoint's current standing, not a dataset anybody polls as a series",
  "/coverage.json":
    "a statement about OUR gaps rather than an observation of anybody else — evidence about the observer",
  "/corpus/trajectory.json":
    "a derived read over the catalogued corpus, not a separate dataset",
  "/corpus/wallet-facts.json":
    "a derived read over the catalogued corpus, not a separate dataset",
  "/corpus/battery-delta.json":
    "a derived read over the catalogued corpus, not a separate dataset",
};

/**
 * WHAT THE HAND HAD, kept as a floor. The six paths this file walked
 * before 2026-08-29, so a derivation that ever stops reaching one of
 * them fails by name instead of passing on an empty roster.
 */
const ONCE_TYPED_BY_HAND = [
  "/corpus.json",
  "/corpus/trajectory.json",
  "/corpus/wallet-facts.json",
  "/defects.json",
  "/fresh-set",
  "/passport",
];

const EVIDENCE_SURFACES = [
  ...new Set([
    ...PUBLISHED_DATASETS.map((dataset) => dataset.path),
    ...Object.keys(NAMED_EVIDENCE),
  ]),
].sort();

describe("every evidence surface is one hop from the corrections desk", () => {
  for (const path of EVIDENCE_SURFACES) {
    it(`${path} points at /corrections`, async () => {
      const response = await SELF.fetch(`https://scvd.store${path}`, {
        headers: { Accept: "application/json" },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("/corrections");
    });
  }

  it("still reaches every surface the typed list held", async () => {
    const missing = ONCE_TYPED_BY_HAND.filter(
      (path) => !EVIDENCE_SURFACES.includes(path),
    );
    expect(
      missing,
      `the derived roster dropped surfaces a person had already listed:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("no corpus read escapes the roster by being built later", async () => {
    /*
     * The corpus family is where a derived read gets added without
     * anybody thinking of this file. Every static /corpus door that
     * hands a stranger JSON carries the pointer — checked directly
     * here rather than by roster membership, so a new corpus read
     * needs no bookkeeping in this file to be covered by it. One that
     * does not answer (diff.json needs parameters) is out of scope
     * for a pointer nobody can read, and so is the area guide.
     */
    const escaped: string[] = [];
    for (const route of app.routes) {
      if (route.method !== "GET") continue;
      const path = route.path;
      if (!path.startsWith("/corpus")) continue;
      if (path.includes(":") || path.includes("*") || path.includes("{")) continue;
      if (EVIDENCE_SURFACES.includes(path)) continue;
      const response = await SELF.fetch(`https://scvd.store${path}`, {
        headers: { Accept: "application/json" },
      });
      // JSON only: the area llms.txt is a guide, not a document
      // somebody quotes a figure out of.
      const type = response.headers.get("Content-Type") ?? "";
      if (response.status !== 200 || !type.includes("json")) continue;
      if (!(await response.text()).includes("/corrections")) escaped.push(path);
    }
    expect(
      escaped,
      `a corpus read hands a machine a claim with no hop to the corrections desk:\n${escaped.join("\n")}`,
    ).toEqual([]);
  });

  it("every named exception is still a live door", async () => {
    // An exception whose route is gone is a reason nobody re-read.
    const dead: string[] = [];
    for (const path of Object.keys(NAMED_EVIDENCE)) {
      const response = await SELF.fetch(`https://scvd.store${path}`, {
        headers: { Accept: "application/json" },
      });
      if (response.status !== 200) dead.push(`${path} -> ${response.status}`);
    }
    expect(dead, `a named exception no longer answers:\n${dead.join("\n")}`).toEqual(
      [],
    );
  });

  it("the per-host history carries the pointer too", async () => {
    // Any host answers — the shape is what is under test, and the
    // pointer must ride even a history of gaps.
    const response = await SELF.fetch(
      "https://scvd.store/corpus/host/never-met.example.json",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/corrections");
  });
});
