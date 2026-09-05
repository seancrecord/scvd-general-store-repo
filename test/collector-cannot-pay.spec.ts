import { describe, expect, it } from "vitest";

/**
 * THE COLLECTOR CANNOT PAY, STRUCTURALLY (roadmap N9, 2026-09-02).
 *
 * The store's probes — the weekly ward round, the preflight battery,
 * the two watches, the paid refresh, the population census, the long
 * walk and the door bank — observe doors and never pay them. Paying is
 * a separate, named, reason-logging instrument: the launch check (and
 * the payouts that borrow its field signer). Until this file that was
 * a policy. Every probe root could REACH the signer through the
 * import graph — the menu's copy quoted the field spend cap from
 * launch-check.ts, and the ward round imports the menu — so a future
 * refactor could have put a signing call one import away from a probe
 * with nothing to say so.
 *
 * This walks the import graph, static and dynamic, from each probe
 * root and fails the build if any signing-capable module is reachable.
 * Type-only imports are erased at runtime and do not count. The
 * signer set is derived from the sources (who imports viem/accounts),
 * and pinned, so a new signer has to be named here on purpose.
 */

const sources = import.meta.glob("/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Modules that can produce a payment signature. Pinned on purpose. */
const KNOWN_SIGNERS = ["/src/services/launch-check.ts"];

/** The observing instruments: doors are knocked on, never paid. */
const PROBE_ROOTS = [
  "/src/services/ward-round.ts",
  "/src/services/preflight.ts",
  "/src/services/standing-watch.ts",
  "/src/services/conformance-watch.ts",
  "/src/services/passport-refresh.ts",
  "/src/services/population.ts",
  "/src/services/watch-sweep.ts",
  "/src/services/long-walk.ts",
  "/src/services/door-bank.ts",
];

/** The paying instruments, which SHOULD reach the signer: proves the walk sees. */
const PAYING_TOOLS = [
  "/src/services/launch-check.ts",
  "/src/services/bounty-board.ts",
  "/src/services/store-credit.ts",
  /* The directory walker pays x402scan a cent a page (2026-09-04); the
   * round reads its completed pass through directory-pass.ts and never
   * this module. Named here so the walk is proven to see the signer. */
  "/src/services/directory-walk.ts",
];

const STATIC_IMPORT = /^import\s+(?!type\s)[^;]*?from\s*["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/gms;
const SIDE_EFFECT_IMPORT = /^import\s*["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/gm;
const DYNAMIC_IMPORT = /import\(\s*["'](@\/[^"']+|\.{1,2}\/[^"']+)["']\s*\)/g;
const SIGNS = /^import[^;]*from\s*["']viem\/accounts["']|await import\(\s*["']viem\/accounts["']\s*\)/m;

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? `/src/${spec.slice(2)}`
    : new URL(spec, `file://${from}`).pathname;
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (candidate in sources) return candidate;
  }
  return null;
}

function dependencies(path: string): string[] {
  const text = sources[path] ?? "";
  const specs = [
    ...[...text.matchAll(STATIC_IMPORT)].map((m) => m[1]!),
    ...[...text.matchAll(SIDE_EFFECT_IMPORT)].map((m) => m[1]!),
    ...[...text.matchAll(DYNAMIC_IMPORT)].map((m) => m[1]!),
  ];
  return specs.map((spec) => resolve(path, spec)).filter((p): p is string => p !== null);
}

/** Every module reachable from `root`, with the edge it was reached by. */
function reachable(root: string): Map<string, string | null> {
  const seen = new Map<string, string | null>([[root, null]]);
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of dependencies(current)) {
      if (!seen.has(next)) {
        seen.set(next, current);
        stack.push(next);
      }
    }
  }
  return seen;
}

function pathTo(seen: Map<string, string | null>, target: string): string {
  const chain = [target];
  while (seen.get(chain[chain.length - 1]!) !== null) {
    chain.push(seen.get(chain[chain.length - 1]!)!);
  }
  return chain.reverse().map((p) => p.replace("/src/", "")).join(" -> ");
}

describe("the collector cannot pay, as a property of the import graph", () => {
  it("the signer set is derived from the sources and matches the pinned list", () => {
    const signers = Object.entries(sources)
      .filter(([, text]) => SIGNS.test(text))
      .map(([path]) => path)
      .sort();
    expect(signers, "a module gained a payment signer; name it in KNOWN_SIGNERS on purpose").toEqual(KNOWN_SIGNERS);
  });

  it("every probe root exists, so a rename cannot silently empty the walk", () => {
    for (const root of PROBE_ROOTS) {
      expect(sources[root], `${root} is not in src/`).toBeDefined();
    }
  });

  it("no probe root reaches a signing-capable module, statically or dynamically", () => {
    const offences: string[] = [];
    for (const root of PROBE_ROOTS) {
      const seen = reachable(root);
      for (const signer of KNOWN_SIGNERS) {
        if (seen.has(signer)) offences.push(pathTo(seen, signer));
      }
    }
    expect(
      offences,
      `a probe can reach a payment signer:\n${offences.join("\n")}`,
    ).toEqual([]);
  });

  it("the paying tools do reach the signer, which is how we know the walk sees", () => {
    for (const tool of PAYING_TOOLS) {
      const seen = reachable(tool);
      expect(
        KNOWN_SIGNERS.some((signer) => seen.has(signer)),
        `${tool} no longer reaches the signer; either it stopped paying or the walk went blind`,
      ).toBe(true);
    }
  });
});
