import type { Env } from "@/types";

/**
 * Bulk KV reads. One .get(array) fetches up to 100 keys in a single
 * subrequest, which is the difference between the admin page loading
 * and the Worker tripping the per-request subrequest cap. Every
 * list-then-read-each pattern in the store goes through here.
 */

type Namespace = Env["ORDERS"];

const CHUNK = 100;

export async function bulkGetJson<T>(
  kv: Namespace,
  names: string[],
): Promise<Map<string, T | null>> {
  const result = new Map<string, T | null>();
  for (let start = 0; start < names.length; start += CHUNK) {
    const chunk = names.slice(start, start + CHUNK);
    if (chunk.length === 1) {
      // The array overload requires 2+ keys on some runtimes; keep it simple.
      result.set(chunk[0]!, await kv.get<T>(chunk[0]!, "json"));
      continue;
    }
    const got = await kv.get<T>(chunk, "json");
    for (const [name, value] of got) {
      result.set(name, value);
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
