import { describe, expect, it } from "vitest";

/**
 * THE THIRD TIME IS A MECHANISM, NOT A MEMORY.
 *
 * A scheme-and-host prefix with nothing after it is true of any host
 * that merely begins with the named one — the ".evil.com suffix"
 * shape. CodeQL has called it high severity three separate times in
 * this repo now (the developer-portal spec, the ward-round rail spec,
 * and the Night Watch burst spec), each caught after the push rather
 * than before it, each fixed by hand, and each time the next one got
 * written anyway. So it gets a guard.
 *
 * It is "only tests", and that is the argument FOR the guard rather
 * than against it: a fake seller that answers for hosts it was never
 * meant to answer for makes a test pass for a request the code should
 * never have sent. A loose matcher in a stub hides routing bugs —
 * the one class of bug those stubs exist to catch.
 *
 * WHAT PASSES. Two shapes are host-safe and neither is flagged: the
 * scheme alone, which claims no host at all; and a prefix ending in
 * the slash that terminates the authority, which no suffix can
 * extend. WHAT FAILS is the pair in between.
 *
 * The fix is never a longer string. It is `new URL(...)` and an
 * equality check on `.hostname` — the live form is in
 * test/ward-round-rail.spec.ts and test/watch-burst.spec.ts.
 */

const sources = {
  ...(import.meta.glob("/src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/test/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

/** Scheme + host with no terminating "/" — the flagged shape. */
const LOOSE = /\.startsWith\(\s*(["'`])(https?:\/\/[^"'`/\s]+)\1\s*\)/g;

/** This file quotes the shape it forbids, in prose and in its own
 * self-test; scanning itself would be the tautology rule 46 names. */
const SELF = "/test/host-matchers-are-hostnames.spec.ts";

describe("a host matcher matches a host", () => {
  it("nothing pins a URL by scheme-and-host prefix alone", () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (path === SELF) continue;
      for (const match of text.matchAll(LOOSE)) {
        const line = text.slice(0, match.index ?? 0).split("\n").length;
        offenders.push(`${path}:${line}  ${match[0]}`);
      }
    }
    expect(
      offenders,
      `These answer for any host that merely BEGINS with the named one. ` +
        `Parse the URL and compare .hostname, as test/ward-round-rail.spec.ts ` +
        `does:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the guard would actually catch the shape it names", () => {
    // Assembled rather than written out, so the guard's own source
    // does not contain the literal it forbids.
    const call = (arg: string) => `if (url.startsWith(${arg})) {`;
    expect([...call('"https://door.example"').matchAll(LOOSE)]).toHaveLength(1);
    expect([...call("'https://door.example'").matchAll(LOOSE)]).toHaveLength(1);
    expect([...call('"https://"').matchAll(LOOSE)]).toHaveLength(0);
    expect([...call('"https://shop.example/"').matchAll(LOOSE)]).toHaveLength(0);
  });

  it("sees a real tree, not an empty one", () => {
    // A glob that resolves to nothing would pass the first case
    // forever while checking nothing — the shape this store keeps
    // finding in other people's instruments.
    expect(Object.keys(sources).length).toBeGreaterThan(200);
  });
});
