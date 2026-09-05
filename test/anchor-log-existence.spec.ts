import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { bitcoinProofBytes, pendingProofBytes } from "./helpers/ots";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  appendAnchor,
  existenceOfEntries,
  listAnchors,
  saveAnchor,
} from "@/services/anchor-log";
import { submitToOts, upgradeOtsProof } from "@/services/anchor-submit";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const CALENDARS = ["https://calendar.test"];
const HEIGHT = 912_345;

function answering(bytes: Uint8Array): typeof fetch {
  return (async () => new Response(bytes, { status: 200 })) as unknown as typeof fetch;
}

async function clearAnchors(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.anchorLogPrefix });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

/** Submit and upgrade one entry so its own proof names a block. */
async function confirm(sequenceIndex: number, height = HEIGHT): Promise<void> {
  const records = await listAnchors(testEnv);
  const pending = await submitToOts(testEnv, records[sequenceIndex]!, {
    fetch: answering(pendingProofBytes()),
    calendars: CALENDARS,
  });
  await upgradeOtsProof(testEnv, pending, { fetch: answering(bitcoinProofBytes(height)) });
}

interface Existed {
  status: string;
  block_height: number | null;
  via_sequence?: number;
}

async function fetchLog(): Promise<{
  last_confirmed_sequence: number | null;
  declared_only_from_sequence: number | null;
  existed_by_note: string;
  entries: Array<{ existed_by: Existed }>;
}> {
  return (await (await SELF.fetch(`${BASE}/.well-known/anchor-log.json`)).json()) as never;
}

/**
 * THE LINE THROUGH THE LOG. A periodically anchored chain has a
 * confirmed half and a declared half, and the reader on the x402
 * receipt thread was right that a whole-log grade hides where the
 * line is. Every entry now says which side it sits on.
 */
describe("each anchor-log entry says which side of the last confirmed anchor it sits on", () => {
  beforeEach(clearAnchors);

  it("nothing confirmed: everything is declared_only and the line is at sequence 1", async () => {
    await appendAnchor(testEnv);
    await appendAnchor(testEnv);
    const log = await fetchLog();
    expect(log.entries.map((e) => e.existed_by.status)).toEqual([
      "declared_only",
      "declared_only",
    ]);
    expect(log.last_confirmed_sequence).toBeNull();
    expect(log.declared_only_from_sequence).toBe(1);
  });

  it("a confirmed middle entry vouches for what is behind it and nothing ahead of it", async () => {
    for (let i = 0; i < 3; i += 1) await appendAnchor(testEnv);
    await confirm(1);
    const log = await fetchLog();
    const [first, second, third] = log.entries.map((e) => e.existed_by);
    expect(second).toEqual({ status: "bitcoin_confirmed", block_height: HEIGHT });
    expect(first).toEqual({
      status: "covered_by_later_anchor",
      block_height: HEIGHT,
      via_sequence: 2,
    });
    expect(third).toEqual({ status: "declared_only", block_height: null });
    expect(log.last_confirmed_sequence).toBe(2);
    expect(log.declared_only_from_sequence).toBe(3);
  });

  it("the newest entry confirmed: no declared half", async () => {
    for (let i = 0; i < 2; i += 1) await appendAnchor(testEnv);
    await confirm(1);
    const log = await fetchLog();
    expect(log.declared_only_from_sequence).toBeNull();
    expect(log.last_confirmed_sequence).toBe(2);
  });

  it("coverage quotes the tightest block, not the nearest anchor", async () => {
    for (let i = 0; i < 3; i += 1) await appendAnchor(testEnv);
    await confirm(1, HEIGHT + 100);
    await confirm(2, HEIGHT);
    const log = await fetchLog();
    // Entry 1 is behind both; the later anchor happens to name the
    // earlier block, and the earlier block is the bound.
    expect(log.entries[0]!.existed_by).toEqual({
      status: "covered_by_later_anchor",
      block_height: HEIGHT,
      via_sequence: 3,
    });
  });

  it("a pending proof is still declared_only: a calendar's promise is not a block", async () => {
    await appendAnchor(testEnv);
    const [record] = await listAnchors(testEnv);
    await submitToOts(testEnv, record!, {
      fetch: answering(pendingProofBytes()),
      calendars: CALENDARS,
    });
    const log = await fetchLog();
    expect(log.entries[0]!.existed_by.status).toBe("declared_only");
  });

  it("a broken chain forfeits coverage: only an entry's own proof counts", async () => {
    for (let i = 0; i < 2; i += 1) await appendAnchor(testEnv);
    await confirm(1);
    const [first] = await listAnchors(testEnv);
    // Rewrite history under the confirmed anchor: the link no longer
    // recomputes, so the later stamp vouches for nothing behind it.
    await saveAnchor(testEnv, {
      ...first!,
      snapshot: { ...first!.snapshot, artifacts_issued_total: 99_999 },
    });
    const log = await fetchLog();
    expect(log.entries[0]!.existed_by.status).toBe("declared_only");
    expect(log.entries[1]!.existed_by.status).toBe("bitcoin_confirmed");
  });

  it("a proof marked complete that names no block gets no height and no confirmed status", async () => {
    await appendAnchor(testEnv);
    const [record] = await listAnchors(testEnv);
    await saveAnchor(testEnv, {
      ...record!,
      ots: { status: "complete", proof_base64: btoa("\\x09\\x09\\x09") },
    });
    const existence = await existenceOfEntries(await listAnchors(testEnv), true);
    expect(existence[0]).toEqual({ status: "declared_only", block_height: null });
  });

  it("says in words what each state means and that heights are parsed, not verified", async () => {
    const log = await fetchLog();
    expect(log.existed_by_note).toContain("declared_only");
    expect(log.existed_by_note).toContain("covered_by_later_anchor");
    expect(log.existed_by_note).toContain("same-day rewrite");
    expect(log.existed_by_note).toContain("ots verify");
  });
});
