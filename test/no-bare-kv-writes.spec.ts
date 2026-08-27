import { describe, expect, it } from "vitest";

/**
 * THE MECHANISM TEST THAT ENDS THE CLASS (incident 2026-08-27).
 *
 * The night's alarms were one unguarded KV write found at a time:
 * patronage first, then the challenge counters, then luckies — the
 * same defect wearing a different door each time. Cloudflare KV
 * rate-limits writes to one per second per key; a bare `.put()` in
 * the request path turns that 429 into a 500 handed to whoever is
 * standing at the counter, and on the delivery side it lands AFTER
 * the money moved.
 *
 * Fixing doors one alarm at a time is how this week went. This spec
 * is how it stops: every KV write in src/ must ride withKvRetry —
 * via kvPut, or an explicit withKvRetry wrapper at the site. A new
 * bare put fails the build, not a visitor.
 *
 * kv-retry.ts is the one file allowed to touch the namespace raw:
 * it IS the wrapper.
 */

const sources = import.meta.glob("/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const BARE_PUT = /(?:c\.)?env\.(?:ORDERS|GUESTBOOK|COUNTERS|PATRONS)\.put\(/g;

describe("no bare KV writes anywhere in src/", () => {
  it("every put rides the retry, or names itself here and justifies it", () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith("/lib/kv-retry.ts")) continue;
      const lines = text.split("\n");
      lines.forEach((line, index) => {
        if (line.match(BARE_PUT)) {
          offenders.push(`${path}:${index + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("aliased namespaces do not slip past the direct-form check", () => {
    /*
     * The regex above sees `env.ORDERS.put`; it cannot see
     * `const kv = env.ORDERS; kv.put(...)`. One such alias existed
     * when this spec was written (cold-restore's namespace walk, now
     * wrapped). This companion check keeps the count of raw `.put(`
     * calls on lowercase receivers pinned, so a new alias must come
     * here and explain itself.
     */
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith("/lib/kv-retry.ts")) continue;
      const lines = text.split("\n");
      lines.forEach((line, index) => {
        if (
          line.match(/^\s*(?:await\s+)?[a-z][A-Za-z]*\.put\(/) &&
          !line.includes("kvPut(") &&
          !line.includes("withKvRetry")
        ) {
          offenders.push(`${path}:${index + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
