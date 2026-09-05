import { describe, expect, it } from "vitest";
import { ADMIN_PAGES, EVERY_ROOM } from "@/pages/admin/layout";

/**
 * NO ROOM WITHOUT A DOOR (2026-09-04). The keeper could not reach the
 * census without typing its URL, and six other GET pages under /admin
 * were reachable from nowhere at all — built, tested, and lost. Every
 * static GET route under /admin must be on the nav or on the back
 * shelf's "every room" list. Routes are read off the source, so a page
 * added later without a door fails here.
 */
const routeSources = import.meta.glob("../src/routes/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("every admin page has a door", () => {
  const reachable = new Set<string>([
    ...ADMIN_PAGES.map((p) => p.href),
    ...EVERY_ROOM.map((r) => r.href),
  ]);
  const routes = new Set<string>();
  for (const source of Object.values(routeSources)) {
    for (const m of String(source).matchAll(/adminRoutes\.get\("(\/admin[^"]*)"/g)) {
      const path = m[1] ?? "";
      if (!path.includes(":")) routes.add(path);
    }
  }

  it("found the routes at all", () => {
    expect(routes.size).toBeGreaterThan(20);
    expect(routes.has("/admin/census")).toBe(true);
  });

  it("lists every static GET route on the nav or the back shelf", () => {
    const orphans = [...routes].filter((r) => !reachable.has(r));
    expect(orphans, `pages with no door: ${orphans.join(", ")}`).toEqual([]);
  });

  it("does not list a door that leads nowhere", () => {
    const dead = [...reachable].filter((h) => !routes.has(h));
    expect(dead, `links to no route: ${dead.join(", ")}`).toEqual([]);
  });
});
