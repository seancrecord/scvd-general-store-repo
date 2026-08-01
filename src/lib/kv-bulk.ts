import type { Env } from "@/types";

/**
 * Bulk KV reads. One .get(array) fetches up to 100 keys in a single
 * subrequest, which is the difference between the admin page loading
 * and the Worker tripping the per-request subrequest cap. Every
 * list-then-read-each pattern in the store goes through here.
 */

type Namespace = Env["ORDERS"];

const CHUNK = 100;

/**
 * ONE BAD ROW MUST NOT BLIND A WHOLE INSTRUMENT.
 *
 * KV's bulk JSON read fails the ENTIRE batch — 400, "at least one of
 * the requested keys corresponds to a non-json value" — if a single
 * key holds something unparseable. Every list-then-read in this store
 * goes through here, which meant one corrupt row could take down a
 * published trust surface (the anchor log) or, worse, blind the
 * delivery audit, whose whole job is to notice when something has
 * gone wrong. An instrument that stops working precisely when the
 * data is already damaged is the wrong shape for a safety net.
 *
 * So a failed batch falls back to reading the same chunk as text and
 * parsing each row on its own: the readable rows survive, and an
 * unreadable one becomes a `null` for its caller to decide about
 * rather than an exception that discards its neighbours. Callers
 * already handle `null` (a key can always be missing), so this is the
 * degradation they were written for.
 *
 * Found 2026-08-02 by a test that put junk in a row on purpose.
 */
export async function bulkGetJson<T>(
  kv: Namespace,
  names: string[],
): Promise<Map<string, T | null>> {
  const result = new Map<string, T | null>();
  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK);
    if (chunk.length === 1) {
      // The array overload requires 2+ keys on some runtimes; keep it simple.
      const only = chunk[0]!;
      try {
        result.set(only, await kv.get<T>(only, "json"));
      } catch {
        result.set(only, null);
      }
      continue;
    }
    try {
      const got = await kv.get<T>(chunk, "json");
      for (const [name, value] of got) {
        result.set(name, value);
      }
    } catch {
      const raw = await kv.get(chunk, "text");
      for (const [name, value] of raw) {
        if (value === null) {
          result.set(name, null);
          continue;
        }
        try {
          result.set(name, JSON.parse(value) as T);
        } catch {
          result.set(name, null);
        }
      }
    }
  }
  return result;
}

export async function bulkGetText(
  kv: Namespace,
  names: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK);
    if (chunk.length === 1) {
      result.set(chunk[0]!, await kv.get(chunk[0]!));
      continue;
    }
    const got = await kv.get(chunk, "text");
    for (const [name, value] of got) {
      result.set(name, value);
    }
  }
  return result;
}
