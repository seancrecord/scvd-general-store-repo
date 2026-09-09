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

// These reviewed writes are DurableObjectTransaction.put, not
// KVNamespace.put. Do not exempt the file or every receiver named txn:
// a KV alias in the same service must still fail this guard.
const DURABLE_TRANSACTION_WRITES: Record<string, readonly string[]> = {
  "/src/services/a2a-kit.ts": [
    'await txn.put("budget", { minute, used: used + 1 }); return true;',
    'await txn.put("kit", kit);',
    'await txn.put("pass:0", { slot: 0, report: prepared.report } satisfies WatchPass);',
    'await txn.put("recheck", { status: "running" } satisfies RecheckResult); return true;',
  ],
  "/src/services/a2a-tasks.ts": [
    'await txn.put("task", { task, expiresAt } satisfies StoredTask);',
  ],
  "/src/services/hosted-observation.ts": [
    'await txn.put(key, { purchase, observation } satisfies HostedGrant);',
    'await txn.put("hosted:current", current ? newer(observation, current) : observation);',
    'await txn.put("hosted:current", observation);',
    'await txn.put("hosted:current", value);',
  ],
  "/src/services/paid-recovery.ts": [
    // One storage transaction commits the refund claim, resolution, and lookup.
    'await txn.put(claim, key);',
    'await txn.put(row, record);',
    'await txn.put(`human-transaction:${statement.transaction.startsWith("0x") ? statement.transaction.toLowerCase() : statement.transaction}`, key);',
    'await txn.put("observation", { path, digest, value: proposal });',
    'await txn.put("purchase", { ...current, delivery });',
    'await txn.put("purchase", { ...latest, reconciliation: update.reconciliation });',
    'await txn.put("purchase", proposal);',
    'await txn.put("purchase", { ...prior, ...update });',
    'await txn.put("attempt", { digest, token, purchase } satisfies RecoveryAttempt);',
    'await txn.put("attempt", { ...prior, response });',
    'await txn.put("artifact", record);',
    'await txn.put(key, proposal);',
    'await txn.put("artifact:credit_started", true);',
  ],
};

function unguardedAliasWrite(path: string, line: string): boolean {
  return Boolean(line.match(/^\s*(?:await\s+)?[a-z][A-Za-z]*\.put\(/)) &&
    !line.includes("kvPut(") && !line.includes("withKvRetry") &&
    !DURABLE_TRANSACTION_WRITES[path]?.includes(line.trim());
}

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
          unguardedAliasWrite(path, line)
        ) {
          offenders.push(`${path}:${index + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the Durable Object exception does not exempt KV aliases", () => {
  it("permits only the reviewed transaction writes at their reviewed source", () => {
    for (const [path, writes] of Object.entries(DURABLE_TRANSACTION_WRITES)) {
      for (const line of writes) {
        expect(sources[path], "a reviewed exception went stale").toContain(line);
        expect(unguardedAliasWrite(path, line)).toBe(false);
        expect(unguardedAliasWrite("/src/services/other.ts", line)).toBe(true);
      }
    }
  });

  it("still catches new aliases in the recovery service, including one named txn", () => {
    const path = "/src/services/paid-recovery.ts";
    for (const line of [
      'await kv.put("receipt", value);',
      'await txn.put("receipt", value);',
      'namespace.put("receipt", value);',
    ]) expect(unguardedAliasWrite(path, line), line).toBe(true);
    expect('await env.COUNTERS.put("receipt", value);'.match(BARE_PUT)).not.toBeNull();
  });
});
