import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "@/index";

const BASE = "https://scvd.store";

/**
 * A WRONG METHOD IS NOT A MISSING DOOR.
 *
 * Six public POST doors answered GET with a 404 whose body says
 * "this path was never a door" — false about our own endpoints, and
 * read by an external index as six failing endpoints on 2026-08-25.
 *
 * The subjects are DERIVED from the router, not typed here: any
 * POST-only literal route is a subject, so a seventh added later is
 * covered without anybody remembering this file exists.
 */
describe("a door that takes POST says so instead of denying it exists", () => {
  const postOnly = (() => {
    const byPath = new Map<string, Set<string>>();
    for (const route of app.routes) {
      if (route.path.includes(":") || route.path.includes("*")) continue;
      if (!route.path.startsWith("/api/")) continue;
      const method = route.method.toUpperCase();
      if (method === "ALL") continue;
      const set = byPath.get(route.path) ?? new Set<string>();
      set.add(method);
      byPath.set(route.path, set);
    }
    return [...byPath.entries()]
      .filter(([, methods]) => methods.has("POST") && !methods.has("GET"))
      .map(([path]) => path);
  })();

  it("finds POST-only public doors to check at all", () => {
    /*
     * Rule 46: a guard that cannot fail argues for the lie. If the
     * derivation ever returns nothing, every assertion below passes
     * vacuously and this file becomes a test that the bug be kept.
     */
    expect(postOnly.length).toBeGreaterThan(0);
  });

  it("answers 405 with Allow, never 404, on the wrong method", async () => {
    for (const path of postOnly) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path} answered ${response.status}`).toBe(405);
      expect(response.headers.get("Allow"), `${path} Allow header`).toContain(
        "POST",
      );
      const body = (await response.json()) as { allow?: string[] };
      expect(body.allow, `${path} states its methods in-band`).toContain(
        "POST",
      );
    }
  });

  it("still says 404 for a path that genuinely is not a door", async () => {
    const response = await SELF.fetch(`${BASE}/api/definitely-not-a-door`);
    expect(response.status).toBe(404);
    expect(response.headers.get("Allow")).toBeNull();
  });
});
