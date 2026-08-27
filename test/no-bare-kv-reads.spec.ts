import { describe, expect, it } from "vitest";

/**
 * THE READ HALF OF THE MECHANISM (task #17; the write half is
 * no-bare-kv-writes.spec.ts, incident 2026-08-27).
 *
 * The read-side receipts are older than the write-side ones:
 * 2026-08-04, "KV GET_BULK failed: 500" killed a corrections walk;
 * 2026-08-21, "KV GET failed: 500" took down the hourly bank
 * reconciliation from a one-key cursor read. The retry policy those
 * incidents built (withKvRetry, kvGet, kvGetJson) has existed since —
 * applied one alarm at a time, which is exactly how the write side
 * went until its guard ended the class.
 *
 * Same law here: every KV read and list in src/ rides withKvRetry —
 * via kvGet / kvGetJson / kvList, or an explicit withKvRetry wrapper
 * on the same line. A failure that survives the retries still THROWS;
 * the retry absorbs the blip and nothing else. A new bare read fails
 * the build, not a walk.
 *
 * kv-retry.ts is the one file allowed to touch the namespace raw: it
 * IS the wrapper. kv-bulk.ts and kv-list.ts carry their own wrappers
 * on aliased receivers, which this direct-form check never sees — and
 * both already retry internally.
 */

const sources = import.meta.glob("/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const BARE_GET =
  /(?:c\.)?env\.(?:ORDERS|GUESTBOOK|COUNTERS|PATRONS)\.get(?:<[^>]*>)?\(/;
const BARE_LIST =
  /(?:c\.)?env\.(?:ORDERS|GUESTBOOK|COUNTERS|PATRONS)\.list(?:<[^>]*>)?\(/;

function offendersOf(pattern: RegExp): string[] {
  const offenders: string[] = [];
  for (const [path, text] of Object.entries(sources)) {
    if (path.endsWith("/lib/kv-retry.ts")) continue;
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      // An inline withKvRetry wrapper on the same line is the
      // explicit form of the same protection, not an offender.
      if (line.includes("withKvRetry(")) return;
      if (pattern.test(line)) {
        offenders.push(`${path}:${index + 1}  ${line.trim().slice(0, 80)}`);
      }
    });
  }
  return offenders;
}

describe("no bare KV reads anywhere in src/", () => {
  it("every get rides the retry, or wraps itself in withKvRetry on the same line", () => {
    const offenders = offendersOf(BARE_GET);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every list rides the retry the same way", () => {
    const offenders = offendersOf(BARE_LIST);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
