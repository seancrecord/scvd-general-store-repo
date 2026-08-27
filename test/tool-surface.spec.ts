import { describe, expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { mcpResourceCatalog } from "@/lib/mcp-resources";
import { ROUTES, toolFor } from "@/lib/when-to-buy";

const BASE = "https://scvd.store";

/**
 * THE TOOL SURFACE IS THE STORE'S ANSWER-ENGINE SURFACE.
 *
 * A tool `description` is not documentation. It is the entire text a
 * model reads when deciding whether this store is the right answer,
 * and an `outputSchema` is how it decides whether it is confident
 * enough to call. Nothing else in the repo is read by more models
 * more often, and none of it was guarded: the audit of 2026-08-27
 * found `buy_simple` — the tool placed FIRST among the paid ones
 * precisely because a weak model reaches for something early and
 * plausible — as the only tool in the catalog that never said what
 * came back.
 *
 * That is the flattering direction rule 52 names: the surface most
 * likely to be reached for by the least capable caller was the one
 * telling it least. These guards exist so the next instance fails a
 * build instead of waiting for another audit.
 */
describe("every tool tells a model what it gets back", () => {
  const catalog = mcpToolCatalog(BASE);

  it("declares an outputSchema on every tool, without exception", () => {
    const missing = catalog.filter((tool) => !tool.outputSchema);
    expect(missing.map((tool) => tool.name)).toEqual([]);
  });

  it("declares behavioural annotations and a human title on every tool", () => {
    const thin = catalog.filter((tool) => !tool.annotations?.title);
    expect(thin.map((tool) => tool.name)).toEqual([]);
  });

  it("says enough to be chosen on purpose, wherever a job sends somebody", () => {
    /*
     * A floor, not a target. Two hundred characters is roughly "what
     * it does, what it costs, and one thing it is not" — under that a
     * description is a label, and a label competes for selection on
     * name alone.
     *
     * IT APPLIES ONLY WHERE SELECTION IS AT STAKE. The first cut of
     * this test flunked `ring_bell` and `sign_guestbook`, and it was
     * the test that was wrong: those are free novelties nobody has a
     * JOB for, and "Ring the store bell. Free, once per visitor per
     * day; the count is public." is not thin, it is finished. A floor
     * that forces padding onto a complete sentence makes the catalog
     * worse and the budget below larger.
     *
     * So the exemption is DERIVED, never an allowlist of names: a
     * tool may be short exactly when no route in the routing table
     * sends anyone to it. Give a novelty a job tomorrow and the floor
     * starts applying to it that same commit, with nobody remembering
     * to update a list.
     */
    const routed = new Set(
      ROUTES.flatMap((route) => route.items.map((id) => toolFor(id))).filter(
        (name): name is string => Boolean(name),
      ),
    );
    const thin = catalog.filter(
      (tool) =>
        routed.has(tool.name) && (tool.description ?? "").length < 200,
    );
    expect(thin.map((tool) => tool.name)).toEqual([]);
  });

  it("keeps the exemption honest about what it is exempting", () => {
    /*
     * The escape hatch above is only defensible while the tools it
     * lets through really are jobless. If a short tool ever becomes
     * routable, this says so out loud rather than letting the derived
     * exemption quietly widen.
     */
    const routed = new Set(
      ROUTES.flatMap((route) => route.items.map((id) => toolFor(id))).filter(
        (name): name is string => Boolean(name),
      ),
    );
    const exempted = catalog
      .filter((tool) => (tool.description ?? "").length < 200)
      .map((tool) => tool.name);
    // Empty since 2026-08-27: the audience sentences (evidence
    // instrument vs store errand) carried the last two short
    // descriptions over the floor. The hatch stays, stated, for the
    // next genuinely jobless tool.
    expect(exempted.sort()).toEqual([]);
    for (const name of exempted) expect(routed.has(name)).toBe(false);
  });

  it("still bites when a tool goes thin", () => {
    // Guard the guard (rule 46): the assertions above are all "this
    // list is empty", the shape that passes forever once the check
    // stops matching.
    const fake = [{ name: "buy_nothing", description: "Buys nothing." }];
    expect(fake.filter((t) => t.description.length < 200).map((t) => t.name)).toEqual(
      ["buy_nothing"],
    );
  });
});

/**
 * WHAT tools/list COSTS EVERY CLIENT, EVERY SESSION.
 *
 * The catalog is sent on connection, before a model has decided
 * anything, and it is paid for out of the same context the caller
 * needs for its actual work. It is therefore a budget, and an
 * unbudgeted one drifts upward forever — every description reads as
 * worth its length in isolation.
 *
 * The ceiling is deliberately loose: this is a tripwire for the day
 * somebody pastes an essay into a description, not a style rule. When
 * it fires the answer may well be to raise it — but on purpose, in a
 * commit, rather than by nobody noticing.
 */
describe("the catalog stays inside a context budget", () => {
  const catalog = mcpToolCatalog(BASE);
  const total = catalog.reduce(
    (sum, tool) => sum + (tool.description ?? "").length,
    0,
  );

  it("keeps the whole tools/list description payload under 32k characters", () => {
    expect(total).toBeLessThan(32_000);
  });

  it("keeps any single tool under half the payload", () => {
    /*
     * One tool that is half the catalog is a semantic-match problem
     * as much as a budget one: it crowds the others out of a model's
     * attention, and some clients truncate.
     */
    const longest = Math.max(
      ...catalog.map((tool) => (tool.description ?? "").length),
    );
    expect(longest).toBeLessThan(total / 2);
  });
});

/**
 * THE ROUTING RESOURCE HAS TO STAY REACHABLE, or it is a document
 * nobody can find — which is the same failure it exists to fix.
 */
describe("the routing surface is served", () => {
  it("lists the which_instrument resource", () => {
    const uris = mcpResourceCatalog().map((resource) => resource.uri);
    expect(uris).toContain("scvd://when");
  });

  it("gives every resource a description long enough to route on", () => {
    const thin = mcpResourceCatalog().filter(
      (resource) => (resource.description ?? "").length < 120,
    );
    expect(thin.map((resource) => resource.uri)).toEqual([]);
  });
});
