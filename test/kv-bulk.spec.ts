import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { bulkGetJson, bulkGetText } from "@/lib/kv-bulk";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const PREFIX = "bulktest:";

/**
 * THE SHARED BULK READ, tested for the property that matters when
 * things are already going badly: ONE BAD ROW MUST NOT BLIND A WHOLE
 * INSTRUMENT.
 *
 * KV's bulk JSON read fails the entire batch with a 400 if a single
 * key holds something unparseable. Every list-then-read in this store
 * goes through this helper, so that behaviour meant one corrupt row
 * could 500 a published trust surface or blind the delivery audit —
 * whose entire job is to notice when something has gone wrong. An
 * instrument that stops working exactly when the data is damaged is
 * the wrong shape for a safety net.
 */

async function clear(): Promise<void> {
  const listed = await testEnv.ORDERS.list({ prefix: PREFIX });
  for (const key of listed.keys) {
    await testEnv.ORDERS.delete(key.name);
  }
}

beforeEach(async () => {
  await clear();
});

describe("bulkGetJson", () => {
  it("reads a clean batch", async () => {
    await testEnv.ORDERS.put(`${PREFIX}a`, JSON.stringify({ n: 1 }));
    await testEnv.ORDERS.put(`${PREFIX}b`, JSON.stringify({ n: 2 }));
    const got = await bulkGetJson<{ n: number }>(testEnv.ORDERS, [
      `${PREFIX}a`,
      `${PREFIX}b`,
    ]);
    expect(got.get(`${PREFIX}a`)?.n).toBe(1);
    expect(got.get(`${PREFIX}b`)?.n).toBe(2);
  });

  it("keeps the readable rows when one row is corrupt", async () => {
    // The regression this exists for. Before the fallback, this threw
    // and every good row went down with the bad one.
    await testEnv.ORDERS.put(`${PREFIX}good1`, JSON.stringify({ n: 1 }));
    await testEnv.ORDERS.put(`${PREFIX}junk`, "not json at all");
    await testEnv.ORDERS.put(`${PREFIX}good2`, JSON.stringify({ n: 2 }));

    const got = await bulkGetJson<{ n: number }>(testEnv.ORDERS, [
      `${PREFIX}good1`,
      `${PREFIX}junk`,
      `${PREFIX}good2`,
    ]);
    expect(got.get(`${PREFIX}good1`)?.n).toBe(1);
    expect(got.get(`${PREFIX}good2`)?.n).toBe(2);
    // The bad row degrades to null — the same thing a missing key
    // does, which is the case every caller already handles.
    expect(got.get(`${PREFIX}junk`)).toBeNull();
  });

  it("degrades a single corrupt key to null rather than throwing", async () => {
    await testEnv.ORDERS.put(`${PREFIX}only`, "{{{ broken");
    const got = await bulkGetJson(testEnv.ORDERS, [`${PREFIX}only`]);
    expect(got.get(`${PREFIX}only`)).toBeNull();
  });

  it("reports a missing key as null, unchanged", async () => {
    const got = await bulkGetJson(testEnv.ORDERS, [`${PREFIX}absent`]);
    expect(got.get(`${PREFIX}absent`)).toBeNull();
  });

  it("handles an empty request without a round trip", async () => {
    expect((await bulkGetJson(testEnv.ORDERS, [])).size).toBe(0);
  });
});

describe("transient server errors — the 2026-08-04 GET_BULK 500", () => {
  /**
   * A live Cloudflare-side 500 on a bulk read killed a whole
   * corrections walk: the JSON attempt threw, and the text fallback —
   * built for data-shaped 400s, not server-shaped blips — threw the
   * same 500 uncaught. These pin the repaired shape with a fake
   * namespace, since real KV cannot be told to fail on cue.
   */
  function flakyKv(failures: number, rows: Record<string, string>) {
    let remaining = failures;
    const get = async (
      keys: string | string[],
      _type?: string,
    ): Promise<unknown> => {
      if (remaining > 0) {
        remaining -= 1;
        throw new Error("KV GET_BULK failed: 500 Internal Server Error");
      }
      if (Array.isArray(keys)) {
        return new Map(keys.map((k) => [k, rows[k] ?? null]));
      }
      return rows[keys] ?? null;
    };
    return { get } as unknown as Env["ORDERS"];
  }

  it("absorbs a blip: fails twice, succeeds on the retry", async () => {
    // Both the JSON attempt and the first text fallback throw; the
    // retried text read lands. Before the fix this threw.
    const kv = flakyKv(2, { a: JSON.stringify({ n: 1 }), b: JSON.stringify({ n: 2 }) });
    const got = await bulkGetJson<{ n: number }>(kv, ["a", "b"]);
    expect(got.get("a")?.n).toBe(1);
    expect(got.get("b")?.n).toBe(2);
  });

  it("still throws when the failure outlasts the retries — loud, never partial", async () => {
    // Silently nulling a failed chunk would let a correction publish
    // while missing up to 100 rows: a wrong number wearing a
    // correction's authority. Persistent failure must stay an error.
    const kv = flakyKv(99, { a: JSON.stringify({ n: 1 }) });
    await expect(bulkGetJson(kv, ["a", "b"])).rejects.toThrow("500");
  });
});

describe("bulkGetText", () => {
  it("returns raw strings, corrupt or not, because text cannot be corrupt", async () => {
    await testEnv.ORDERS.put(`${PREFIX}t1`, "not json at all");
    await testEnv.ORDERS.put(`${PREFIX}t2`, "plain");
    const got = await bulkGetText(testEnv.ORDERS, [
      `${PREFIX}t1`,
      `${PREFIX}t2`,
    ]);
    expect(got.get(`${PREFIX}t1`)).toBe("not json at all");
    expect(got.get(`${PREFIX}t2`)).toBe("plain");
  });
});
