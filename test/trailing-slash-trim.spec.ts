import { describe, expect, it } from "vitest";
import { stripTrailingSlashes } from "@/lib/trailing-slash";
import { itemKeyFromPath } from "@/lib/metrics";
import { buyItemId, buyRequestPath } from "@/routes/door-checks";

/**
 * The one trim behind five request-path sites (lib/trailing-slash.ts).
 * Behaviour is held on the edges the sites care about, and cost is held
 * linear on the input CodeQL warned about: a path that is nothing but
 * slashes, at a length no real URL reaches.
 */
describe("stripTrailingSlashes", () => {
  it("drops every trailing slash and nothing else", () => {
    expect(stripTrailingSlashes("/api/buy/hello/")).toBe("/api/buy/hello");
    expect(stripTrailingSlashes("/api/buy/hello///")).toBe("/api/buy/hello");
    expect(stripTrailingSlashes("/api/buy/hello")).toBe("/api/buy/hello");
    expect(stripTrailingSlashes("/a/b/c/")).toBe("/a/b/c");
    expect(stripTrailingSlashes("hello/")).toBe("hello");
    expect(stripTrailingSlashes("/")).toBe("");
    expect(stripTrailingSlashes("//")).toBe("");
    expect(stripTrailingSlashes("")).toBe("");
    // A slash inside the path is not trailing.
    expect(stripTrailingSlashes("/a//b")).toBe("/a//b");
  });

  it("returns the same string when there is nothing to trim", () => {
    const path = "/api/buy/hello";
    expect(stripTrailingSlashes(path)).toBe(path);
  });

  it("is linear on a path made of slashes", () => {
    const hostile = `/api/buy/hello${"/".repeat(500_000)}`;
    const started = performance.now();
    expect(stripTrailingSlashes(hostile)).toBe("/api/buy/hello");
    expect(stripTrailingSlashes("/".repeat(500_000))).toBe("");
    // Half a million characters twice, well under a request's budget;
    // the quadratic regex this replaced takes seconds on the same input.
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("the sites that read it agree on the slashed spellings", () => {
    expect(itemKeyFromPath("/api/buy/hello/")).toBe("hello");
    expect(itemKeyFromPath("/api/buy/hello//")).toBe("hello");
    expect(itemKeyFromPath("/")).toBe("");
    expect(itemKeyFromPath("/corpus/index.json/")).toBe("corpus:index.json");
    expect(buyRequestPath({ req: { path: "/api/buy/hello/" } })).toBe("/api/buy/hello");
    expect(buyRequestPath({ req: { path: "/" } })).toBe("/");
    expect(buyItemId({ req: { path: "/api/buy/hello//" } })).toBe("hello");
  });
});
