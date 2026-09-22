import { env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth } from "@/lib/metrics";
import {
  canonicalizeStoreMonth,
  listStoreMonths,
  sealStoreMonth,
  unsealedMonths,
  verifyStoreMonthChain,
  type StoreMonthRecord,
} from "@/services/store-month";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE STORE'S OWN MONTH, SIGNED — the third chain, held to the same
 * law as the other two.
 *
 * The tamper cases are the point of this file. A chain that is only
 * ever checked on its happy path is a claim, not a mechanism, and
 * test/verifier-anchor.spec.ts is the pattern being followed: edit a
 * document, edit-and-rehash one, delete an entry from the middle, and
 * desynchronize a link. Each must be caught, and each must be caught
 * by its OWN name, because "the chain is broken" does not tell a
 * reader whether a row was edited, a key was wrong, or an entry was
 * lifted out.
 */

/**
 * KV persists across the tests in a file, and this is an append-only
 * surface, so the prefix is cleared here or the second test in the
 * file inherits the first one's chain.
 */
beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({
    prefix: KV_KEYS.storeMonthPrefix,
  });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
});

/** A calendar that always takes the digest, so no test touches the network. */
const takesIt = async () => ({
  status: "pending" as const,
  submitted_at: "2026-09-22T00:00:00.000Z",
  proof_base64: "AA==",
  calendar: "https://calendar.example",
});

/**
 * A chain test that quietly skips itself is not a test (AT_SCALE rule
 * 5: a null result from a probe that could not run is not evidence).
 * The store opened 2026-07 and the pulse keeps six trailing months, so
 * from its second month on there are always at least two CLOSED months
 * to link — this says so out loud rather than returning early, and
 * fails by name on the day that stops being true.
 */
const TWO_MONTHS =
  "fewer than two closed months the pulse can see — the link and contiguity cases below cannot run";

/** The months this store could actually seal right now, oldest first. */
async function sealable(): Promise<string[]> {
  return unsealedMonths(testEnv);
}

async function storedRecords(): Promise<StoreMonthRecord[]> {
  return (await listStoreMonths(testEnv)).records;
}

/** Write a record back under its own key, tampered however the test says. */
async function rewrite(record: StoreMonthRecord): Promise<void> {
  await testEnv.COUNTERS.put(
    `${KV_KEYS.storeMonthPrefix}${String(record.document.sequence).padStart(9, "0")}`,
    JSON.stringify(record),
  );
}

it("seals a closed month, signs it, and the chain verifies", async () => {
  const months = await sealable();
  expect(months.length, "no closed month the pulse can still see").toBeGreaterThan(0);
  const pass = await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  expect(pass.sealed, pass.sealed ? "" : pass.reason).toBe(true);
  if (!pass.sealed) return;
  expect(pass.record.document.sequence).toBe(1);
  expect(pass.record.document.previous_digest).toBeNull();
  expect(pass.record.document.month).toBe(months[0]);
  expect(pass.record.document.issuer).toMatch(/^did:web:/);
  expect(pass.record.digest).toMatch(/^[0-9a-f]{64}$/);
  expect(pass.record.ots?.status).toBe("pending");
  const verdict = await verifyStoreMonthChain(testEnv);
  expect(verdict.faults).toEqual([]);
  expect(verdict.intact).toBe(true);
  expect(verdict.entries).toBe(1);
  expect(verdict.checks[0]).toMatchObject({
    digest_matches: true,
    signature_valid: true,
    links_to_previous: true,
  });
});

it("refuses the month in progress, a month already sealed, and a month the pulse cannot see", async () => {
  const current = await sealStoreMonth(testEnv, metricsMonth(), { submit: takesIt });
  expect(current.sealed).toBe(false);
  expect(current.sealed === false && current.reason).toContain("month in progress");

  const months = await sealable();
  const first = months[0]!;
  expect((await sealStoreMonth(testEnv, first, { submit: takesIt })).sealed).toBe(true);
  const again = await sealStoreMonth(testEnv, first, { submit: takesIt });
  expect(again.sealed).toBe(false);
  expect(again.sealed === false && again.reason).toContain("already sealed");

  // A month before the store opened is outside the pulse's window by
  // construction, so this needs no fixture to be unreadable.
  const ancient = await sealStoreMonth(testEnv, "2019-01", { submit: takesIt });
  expect(ancient.sealed).toBe(false);
  expect(ancient.sealed === false && ancient.reason).toContain("no longer carries");
});

it("links each entry to the one before it", async () => {
  const months = await sealable();
  expect(months.length, TWO_MONTHS).toBeGreaterThan(1);
  await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  await sealStoreMonth(testEnv, months[1]!, { submit: takesIt });
  const records = await storedRecords();
  expect(records).toHaveLength(2);
  expect(records[1]!.document.previous_digest).toBe(records[0]!.digest);
  expect(records[1]!.document.sequence).toBe(2);
  expect((await verifyStoreMonthChain(testEnv)).intact).toBe(true);
});

it("catches a document edited after it was sealed", async () => {
  const months = await sealable();
  await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  const [record] = await storedRecords();
  // The lie a store would most want to tell about itself.
  record!.document.figures.organic_settled += 1000;
  await rewrite(record!);
  const verdict = await verifyStoreMonthChain(testEnv);
  expect(verdict.intact).toBe(false);
  expect(verdict.checks[0]!.digest_matches).toBe(false);
  expect(verdict.faults.join("\n")).toContain("does not hash to its recorded digest");
});

it("catches a document edited AND rehashed, which the digest alone would miss", async () => {
  const months = await sealable();
  await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  const [record] = await storedRecords();
  record!.document.figures.organic_settled += 1000;
  // Recompute the digest so the cheap check passes; only the signature
  // can still tell, because we do not hold the key that signed it.
  const canonical = canonicalizeStoreMonth(record!.document);
  const bytes = new TextEncoder().encode(canonical);
  record!.digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  await rewrite(record!);
  const verdict = await verifyStoreMonthChain(testEnv);
  expect(verdict.checks[0]!.digest_matches, "the rehash should satisfy the digest check").toBe(true);
  expect(verdict.checks[0]!.signature_valid).toBe(false);
  expect(verdict.intact).toBe(false);
  expect(verdict.faults.join("\n")).toContain("signature does not verify");
});

it("catches an entry lifted out of the middle", async () => {
  const months = await sealable();
  expect(months.length, TWO_MONTHS).toBeGreaterThan(1);
  await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  await sealStoreMonth(testEnv, months[1]!, { submit: takesIt });
  await testEnv.COUNTERS.delete(`${KV_KEYS.storeMonthPrefix}${"0".repeat(8)}1`);
  const verdict = await verifyStoreMonthChain(testEnv);
  expect(verdict.entries).toBe(1);
  expect(verdict.intact).toBe(false);
  // The survivor still hashes and verifies; what is wrong is where it sits.
  expect(verdict.checks[0]!.digest_matches).toBe(true);
  expect(verdict.faults.join("\n")).toMatch(/not contiguous|previous_digest/);
});

it("catches a link desynchronized from the entry it names", async () => {
  const months = await sealable();
  expect(months.length, TWO_MONTHS).toBeGreaterThan(1);
  await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  await sealStoreMonth(testEnv, months[1]!, { submit: takesIt });
  const records = await storedRecords();
  const second = records[1]!;
  second.document.previous_digest = "f".repeat(64);
  const canonical = canonicalizeStoreMonth(second.document);
  const bytes = new TextEncoder().encode(canonical);
  second.digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  await rewrite(second);
  const verdict = await verifyStoreMonthChain(testEnv);
  expect(verdict.checks[1]!.links_to_previous).toBe(false);
  expect(verdict.intact).toBe(false);
  expect(verdict.faults.join("\n")).toContain("does not name the entry before it");
});

it("seals the month even when every calendar refuses, and says the stamp failed", async () => {
  const months = await sealable();
  const pass = await sealStoreMonth(testEnv, months[0]!, {
    submit: async () => ({
      status: "failed" as const,
      submitted_at: "2026-09-22T00:00:00.000Z",
      error: "every calendar refused",
    }),
  });
  expect(pass.sealed).toBe(true);
  if (!pass.sealed) return;
  expect(pass.record.ots?.status).toBe("failed");
  // Money fails closed; a decoration fails open. The record is ours.
  expect((await verifyStoreMonthChain(testEnv)).intact).toBe(true);
});

it("names no wallet and no host", async () => {
  const months = await sealable();
  await sealStoreMonth(testEnv, months[0]!, { submit: takesIt });
  const [record] = await storedRecords();
  const printed = JSON.stringify(record);
  expect(printed).not.toMatch(/0x[0-9a-f]{40}/i);
  // The histogram counts subjects; it must never carry one by name.
  expect(Object.keys(record!.document.figures.host_pages)).toEqual(
    expect.arrayContaining(["subjects", "by_formats", "repeat"]),
  );
});
