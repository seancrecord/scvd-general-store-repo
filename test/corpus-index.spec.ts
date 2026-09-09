import { env, SELF } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";
const e = env as unknown as Env;
const key = (n: number) => `${KV_KEYS.corpusPrefix}${String(n).padStart(9, "0")}`;
beforeEach(async () => {
  const keys = await e.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(keys.keys.map(k => e.COUNTERS.delete(k.name)));
});
it("pages compact metadata without resolving R2 or embedding a snapshot", async () => {
  for (let n = 1; n <= 2; n++) await e.COUNTERS.put(key(n), JSON.stringify({ pointer: true, sequence: n, week: "2026-W36", digest: "a".repeat(64), signature: "b".repeat(128), public_key: "c".repeat(64), r2_key: `corpus/${n}.json` }));
  const response = await SELF.fetch("https://scvd.store/corpus/index.json?limit=1");
  expect(response.status).toBe(200);
  const body = await response.json() as { entries: { sequence: number }[]; next: string; has_more: boolean; r2_bodies_read: boolean };
  expect(body.entries.map(x => x.sequence)).toEqual([1]);
  expect(body.has_more).toBe(true);
  expect(body.r2_bodies_read).toBe(false);
  expect(JSON.stringify(body)).not.toContain('"signature"');
  const next = await (await SELF.fetch(body.next)).json() as { entries: { sequence: number }[]; has_more: boolean; next: null };
  expect(next.entries.map(x => x.sequence)).toEqual([2]);
  expect(next.has_more).toBe(false);
  expect(next.next).toBeNull();
});
it("keeps corrupt index rows in the denominator and refuses invalid limits", async () => {
  await e.COUNTERS.put(key(1), "not json");
  await e.COUNTERS.put(key(2), JSON.stringify({ pointer: true, sequence: 7 }));
  const body = await (await SELF.fetch("https://scvd.store/corpus/index.json")).json() as { listed: number; unreadable: number; entries: unknown[] };
  expect(body.listed).toBe(2);
  expect(body.unreadable).toBe(2);
  expect(body.entries).toHaveLength(2);
  expect((await SELF.fetch("https://scvd.store/corpus/index.json?limit=0")).status).toBe(400);
});

it("projects a legacy body without rewriting it and marks oversized records", async () => {
  const { corpusIndexPage, CORPUS_INDEX_RECORD_BYTES } = await import("@/services/corpus-index");
  const legacy = JSON.stringify({ snapshot: { sequence: 1, week: "2026-W36", round: { data: "x".repeat(9 * 1024 * 1024) } }, digest: "a".repeat(64) });
  await e.COUNTERS.put(key(1), legacy);
  await e.COUNTERS.put(key(2), "x".repeat(CORPUS_INDEX_RECORD_BYTES + 1));
  const read = vi.spyOn(e.CORPUS_R2!, "get");
  try {
    const page = await corpusIndexPage(e);
    expect(page.entries.map(row => row.status)).toEqual(["metadata_available", "too_large"]);
    expect(page.listed).toBe(2);
    expect(page.unreadable).toBe(1);
    expect(JSON.stringify(page).length).toBeLessThan(3000);
    expect(read).not.toHaveBeenCalled();
    expect(await e.COUNTERS.get(key(1))).toBe(legacy);
  } finally { read.mockRestore(); }
});
