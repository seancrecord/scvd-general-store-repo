import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { KV_KEYS } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import {
  canonicalizeCorpusSnapshot,
  getCorpusEntry,
  latestCorpusEntry,
  listCorpus,
  takeCorpusSnapshot,
  verifyCorpusChain,
} from "@/services/corpus";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE CORPUS — the ecosystem's observed history, kept (the keeper's
 * ruling on the Gretzky brief, 2026-08-07). What is testable is the
 * record's PROPERTIES, because they are the whole product: the chain
 * links and recomputes, the signature verifies against the published
 * key, a week never enters twice, a calendar outage cannot cost an
 * entry, and the published document explains its own verification.
 */

function round(week: string, hosts = 2): WardRound {
  return {
    week,
    at: new Date().toISOString(),
    listed_resources: hosts,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: Array.from({ length: hosts }, (_, index) => ({
      host: `service-${index}.example`,
      resources: 1,
      verdict: "answers",
    })) as unknown as WardRound["hosts"],
  };
}

async function seedRound(week: string): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify(round(week)),
  );
}

async function sweepCorpus(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(
    listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)),
  );
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
}

beforeEach(sweepCorpus);

/** Calendars answer instantly and locally; no network, no flake. */
const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () =>
    new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

const deadCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => {
    throw new Error("calendar unreachable");
  }) as unknown as typeof fetch,
};

describe("the corpus chain", () => {
  it("freezes a round into a signed, linked, stamped entry", async () => {
    await seedRound("2026-W31");
    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(pass.taken).toBe(true);
    if (!pass.taken) return;
    expect(pass.record.snapshot.sequence).toBe(1);
    expect(pass.record.snapshot.previous_digest).toBeNull();
    expect(pass.record.ots?.status).toBe("pending");
    // The signature is checkable with the store's own verify path —
    // the same one a stranger uses.
    expect(
      await verifyMessageSignature(
        canonicalizeCorpusSnapshot(pass.record.snapshot),
        pass.record.signature,
        pass.record.public_key,
      ),
    ).toBe(true);
  });

  it("links entry to entry and never takes a week twice", async () => {
    await seedRound("2026-W31");
    const first = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(first.taken).toBe(true);

    // Same week again: the cron re-fired, nothing grows.
    const again = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(again.taken).toBe(false);

    await seedRound("2026-W32");
    const second = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(second.taken).toBe(true);
    if (!first.taken || !second.taken) return;
    expect(second.record.snapshot.sequence).toBe(2);
    expect(second.record.snapshot.previous_digest).toBe(first.record.digest);

    const chain = await verifyCorpusChain(testEnv);
    expect(chain).toEqual({ intact: true, entries: 2 });
  });

  it("keeps the entry when every calendar is down", async () => {
    await seedRound("2026-W31");
    const pass = await takeCorpusSnapshot(testEnv, deadCalendar);
    expect(pass.taken).toBe(true);
    if (!pass.taken) return;
    // The stamp failed soft ONTO the record; the chain grew anyway.
    expect(pass.record.ots?.status).toBe("failed");
    const stored = await getCorpusEntry(testEnv, 1);
    expect(stored?.digest).toBe(pass.record.digest);
    expect((await verifyCorpusChain(testEnv)).intact).toBe(true);
  });

  it("declines honestly when no round has run", async () => {
    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(pass.taken).toBe(false);
    if (pass.taken) return;
    expect(pass.reason).toContain("no ward round");
  });

  it("detects a rewritten entry the way a stranger would", async () => {
    await seedRound("2026-W31");
    const pass = await takeCorpusSnapshot(testEnv, okCalendar);
    expect(pass.taken).toBe(true);
    if (!pass.taken) return;
    // Tamper: the history quietly gains a host after the fact.
    const doctored = structuredClone(pass.record);
    doctored.snapshot.round.listed_resources = 99;
    await testEnv.COUNTERS.put(
      `${KV_KEYS.corpusPrefix}${String(1).padStart(9, "0")}`,
      JSON.stringify(doctored),
    );
    const chain = await verifyCorpusChain(testEnv);
    expect(chain.intact).toBe(false);
    expect(chain.problem).toContain("does not recompute");
  });
});

describe("the corpus, published", () => {
  it("serves the index with its verification steps and live chain verdict", async () => {
    await seedRound("2026-W31");
    await takeCorpusSnapshot(testEnv, okCalendar);
    const body = (await (
      await SELF.fetch(`${BASE}/corpus.json`)
    ).json()) as Record<string, any>;
    expect(body.entries).toBe(1);
    expect(body.chain.intact).toBe(true);
    expect(body.how_to_verify.length).toBeGreaterThan(3);
    // Rule 43, on the surface itself: the corpus never scores actors.
    expect(body.what_this_is_not).toContain("score");
    expect(body.index[0].url).toBe(`${BASE}/corpus/1.json`);

    const entry = (await (
      await SELF.fetch(`${BASE}/corpus/1.json`)
    ).json()) as Record<string, any>;
    expect(entry.digest).toBe(body.index[0].digest);
    expect(entry.signature).toBeTruthy();
  });

  it("hangs where an agent reads", async () => {
    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain(`${BASE}/corpus.json`);
  });

  it("404s an absent entry toward the index, never a blank", async () => {
    const response = await SELF.fetch(`${BASE}/corpus/999.json`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("/corpus.json");
  });
});

/**
 * THE CORPUS AS A CITABLE ENTITY.
 *
 * Current answer-engine guidance is blunt on one point: first-party
 * data earns citations that third-party statistics cannot, because a
 * citing system names the original source. The corpus is exactly that
 * and was being served as bare JSON — which to a crawler is a file,
 * not a source.
 *
 * These pin the markup rather than the prose, because the markup is
 * the part a machine reads and the part most likely to be dropped by
 * someone tidying the response shape.
 */
describe("the corpus declares itself a dataset", () => {
  it("is JSON-LD and JSON at once, without moving anything that was there", async () => {
    const body = (await (await SELF.fetch(`${BASE}/corpus.json`)).json()) as Record<
      string,
      unknown
    >;
    expect(body["@context"]).toBe("https://schema.org");
    expect(body["@type"]).toBe("Dataset");
    expect(body.isAccessibleForFree).toBe(true);
    // The store's own shape survives alongside the vocabulary.
    expect(body.what_this_is).toBeTruthy();
    expect(body.how_to_verify).toBeTruthy();
    expect(body.chain).toBeTruthy();
  });

  it("asserts no licence, because inventing legal terms is the wrong reflex here", async () => {
    const body = (await (await SELF.fetch(`${BASE}/corpus.json`)).json()) as Record<
      string,
      unknown
    >;
    expect(body.license).toBeUndefined();
    // What a reader actually needs is the fact, not a licence name.
    expect(String(body.conditionsOfAccess)).toContain("Free to read");
  });

  it("is reachable as its own entity from the storefront, not only by guessing the URL", async () => {
    const html = await (await SELF.fetch(`${BASE}/`)).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const types = blocks.map((block) => {
      try {
        return (JSON.parse(block[1]!) as { "@type"?: string })["@type"];
      } catch {
        return null;
      }
    });
    expect(types, "the storefront emits no Dataset node").toContain("Dataset");
  });
});

/**
 * THE OTHER TWO FIRST-PARTY SOURCES.
 *
 * Guidance says a citing system names the ORIGINAL source, which is
 * why first-party data outperforms borrowed statistics. This store has
 * three such sources and was serving all three as bare JSON. The house
 * ledger is the sharpest case: it exists because a risk-scorer read
 * our payment address and returned `review`, and a correction only
 * works if the machines doing that reading can find it.
 */
describe("the other first-party sources declare themselves too", () => {
  it("the house ledger is a dataset, and keeps its own words", async () => {
    const body = (await (await SELF.fetch(`${BASE}/house-ledger.json`)).json()) as Record<
      string,
      unknown
    >;
    expect(body["@type"]).toBe("Dataset");
    expect(body.isAccessibleForFree).toBe(true);
    // No second description: `declares` was already saying it.
    expect(body.description).toBeUndefined();
    expect(String(body.declares)).toContain("Every wallet this store controls");
    expect(body.house_wallets).toBeTruthy();
  });

  it("the conformance vectors are a dataset, with the file's own description intact", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/conformance/offer-receipt-vectors.json`)
    ).json()) as Record<string, unknown>;
    expect(body["@type"]).toBe("Dataset");
    // The compiler caught a second description before it shipped; the
    // file's own is the one that serves both readers.
    expect(String(body.description)).toContain("Conformance vectors");
    expect(body.valid).toBeTruthy();
    expect(body.invalid).toBeTruthy();
  });
});
