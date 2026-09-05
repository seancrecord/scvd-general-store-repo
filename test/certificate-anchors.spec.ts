import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { bitcoinProofBytes, pendingProofBytes } from "./helpers/ots";
import { KV_KEYS } from "@/lib/kv-keys";
import { cachedPublicKeyHex } from "@/lib/signing";
import { lookupBlockTime } from "@/lib/bitcoin-block-time";
import { mintCertificate } from "@/services/certificates";
import {
  CERT_ANCHOR_BACKFILL_PER_PASS,
  CERT_ANCHOR_SUBMISSIONS_PER_PASS,
  anchorCertificate,
  certificateAnchorDigest,
  existenceVerdict,
  sweepCertificateAnchors,
} from "@/services/certificate-anchors";
import { findBitcoinAttestations } from "@/services/ots-proof";
import { EXISTENCE_BOUND_MEANS, NOT_BUILT } from "@/store/attestation-spec";
import { RETIRED_KEYS } from "@/store/key-registry";
import type { CertificateRecord, Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HEIGHT = 912_345;
const BLOCK_HASH = "0000000000000000000" + "1".repeat(45);
const BLOCK_TIME_UNIX = 1_756_684_800; // 2025-09-01T00:00:00Z
const EXPLORER = "https://explorer.test";

/**
 * One fake network for the whole lifecycle, dispatched by URL: the
 * calendar accepts a digest, later answers the upgrade with a Bitcoin
 * attestation, and the explorer maps the height to a header. Nothing
 * here reaches a real host — the property under test is what the
 * store does with each answer, and a live calendar cannot be asked to
 * confirm a block on demand.
 */
function network(overrides: {
  upgrade?: () => Response;
  explorer?: (url: string) => Response;
} = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    // Dispatch on the parsed origin and path, never on a substring of
    // the string: a prefix match on a host is the sanitization hole
    // CodeQL rightly flags, even in a mock.
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.endsWith("/digest")) return new Response(pendingProofBytes());
    if (path.startsWith("/timestamp/")) {
      return overrides.upgrade
        ? overrides.upgrade()
        : new Response(bitcoinProofBytes(HEIGHT));
    }
    if (parsed.origin === EXPLORER) {
      if (overrides.explorer) return overrides.explorer(url);
      if (path.startsWith("/api/block-height/")) return new Response(BLOCK_HASH);
      if (path.startsWith("/api/block/")) {
        return new Response(
          JSON.stringify({ height: HEIGHT, timestamp: BLOCK_TIME_UNIX }),
        );
      }
    }
    return new Response("unexpected", { status: 500 });
  }) as unknown as typeof fetch;
}

const CALENDARS = ["https://calendar.test"];
const options = (fetchImpl: typeof fetch) => ({
  fetch: fetchImpl,
  calendars: CALENDARS,
  blockTime: { sources: [EXPLORER] },
});

async function resetStore(): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.certAnchorCursor);
  await testEnv.COUNTERS.delete(KV_KEYS.patronNumber);
  for (const prefix of [KV_KEYS.certPrefix, "patron:", KV_KEYS.certAnchorPendingPrefix]) {
    let cursor: string | undefined;
    do {
      const page = await testEnv.PATRONS.list({ prefix, cursor });
      for (const key of page.keys) await testEnv.PATRONS.delete(key.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

async function readCert(certId: string): Promise<CertificateRecord> {
  const raw = await testEnv.PATRONS.get(KV_KEYS.cert(certId), "json");
  return raw as CertificateRecord;
}

describe("the proof walker reads a Bitcoin attestation", () => {
  it("returns the block height a completed proof states", async () => {
    const found = await findBitcoinAttestations(
      bitcoinProofBytes(HEIGHT),
      "ab".repeat(32),
    );
    expect(found).toEqual([{ block_height: HEIGHT }]);
  });

  it("finds nothing on a proof still pending, and null on junk", async () => {
    expect(
      await findBitcoinAttestations(pendingProofBytes(), "ab".repeat(32)),
    ).toEqual([]);
    expect(
      await findBitcoinAttestations(new Uint8Array([9, 9, 9]), "ab".repeat(32)),
    ).toBeNull();
  });
});

describe("the block-time lookup", () => {
  it("maps a height to the header's time and names the source", async () => {
    const time = await lookupBlockTime(HEIGHT, {
      fetch: network(),
      sources: [EXPLORER],
    });
    expect(time).toEqual({
      block_hash: BLOCK_HASH,
      block_time: "2025-09-01T00:00:00.000Z",
      source: EXPLORER,
    });
  });

  it("answers null, never throws, when no explorer answers", async () => {
    const time = await lookupBlockTime(HEIGHT, {
      fetch: network({ explorer: () => new Response("down", { status: 503 }) }),
      sources: [EXPLORER],
    });
    expect(time).toBeNull();
  });

  it("refuses a header for a different height", async () => {
    const time = await lookupBlockTime(HEIGHT, {
      fetch: network({
        explorer: (url) =>
          new URL(url).pathname.startsWith("/api/block/")
            ? new Response(JSON.stringify({ height: HEIGHT + 1, timestamp: 1 }))
            : new Response(BLOCK_HASH),
      }),
      sources: [EXPLORER],
    });
    expect(time).toBeNull();
  });
});

describe("anchoring one certificate", () => {
  beforeEach(resetStore);

  it("digests the exact signed payload /api/verify serves as artifact_hash", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const record = await readCert(minted.certificate.cert_id);
    const { digest, form } = await certificateAnchorDigest(record);
    expect(form).toBe("current");
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`)
    ).json()) as { artifact_hash: string };
    expect(digest).toBe(body.artifact_hash);
  });

  it("stores a pending proof outside the signature and marks the open work", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const anchored = await anchorCertificate(
      testEnv,
      minted.certificate.cert_id,
      options(network()),
    );
    expect(anchored?.anchor?.ots.status).toBe("pending");
    expect(anchored?.signature).toBe(minted.signature);
    expect(
      await testEnv.PATRONS.get(KV_KEYS.certAnchorPending(minted.certificate.cert_id)),
    ).toBe("1");
    // The signature still verifies: the anchor sits beside it.
    const body = (await (
      await SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`)
    ).json()) as { valid: boolean; existence: { status: string } };
    expect(body.valid).toBe(true);
    expect(body.existence.status).toBe("pending");
  });

  it("is idempotent: a second call does not resubmit", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    let calls = 0;
    const counting = (async (input: RequestInfo | URL) => {
      calls += 1;
      return network()(input);
    }) as unknown as typeof fetch;
    await anchorCertificate(testEnv, minted.certificate.cert_id, options(counting));
    await anchorCertificate(testEnv, minted.certificate.cert_id, options(counting));
    expect(calls).toBe(1);
  });
});

describe("the sweep", () => {
  beforeEach(resetStore);

  it("first run walks everything on backfill, newest first, and records lag honestly", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push((await mintCertificate(testEnv, { itemId: "hello" })).certificate.cert_id);
    }
    const waiting = network({ upgrade: () => new Response("", { status: 404 }) });
    const sweep = await sweepCertificateAnchors(testEnv, options(waiting));
    expect(sweep.submitted).toBe(0);
    expect(sweep.backfilled).toBe(3);
    expect(sweep.behind_head).toBe(0);
    expect(sweep.behind_backfill).toBe(0);
    for (const id of ids) {
      expect((await readCert(id)).anchor?.ots.status).toBe("pending");
    }
    const cursor = (await testEnv.COUNTERS.get(KV_KEYS.certAnchorCursor, "json")) as {
      head: number;
      backfill: number;
    };
    expect(cursor.head).toBe(3);
    expect(cursor.backfill).toBe(0);
  });

  it("a receipt minted after the first run is picked up forward from the head", async () => {
    const waiting = network({ upgrade: () => new Response("", { status: 404 }) });
    await mintCertificate(testEnv, { itemId: "hello" });
    await sweepCertificateAnchors(testEnv, options(waiting));
    const later = await mintCertificate(testEnv, { itemId: "hello" });
    const sweep = await sweepCertificateAnchors(testEnv, options(waiting));
    expect(sweep.submitted).toBe(1);
    expect(sweep.backfilled).toBe(0);
    expect((await readCert(later.certificate.cert_id)).anchor?.ots.status).toBe(
      "pending",
    );
  });

  it("is bounded per pass and says how far behind it is", async () => {
    const total = CERT_ANCHOR_BACKFILL_PER_PASS + 2;
    for (let i = 0; i < total; i += 1) {
      await mintCertificate(testEnv, { itemId: "hello" });
    }
    const first = await sweepCertificateAnchors(testEnv, options(network()));
    expect(first.backfilled).toBe(CERT_ANCHOR_BACKFILL_PER_PASS);
    expect(first.behind_backfill).toBe(2);
    const second = await sweepCertificateAnchors(testEnv, options(network()));
    expect(second.backfilled).toBe(2);
    expect(second.behind_backfill).toBe(0);
    expect(CERT_ANCHOR_SUBMISSIONS_PER_PASS).toBeGreaterThan(0);
  });

  it("does not stall on a patron number with nothing behind it", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    // A second number claimed with no certificate written: the hole
    // the allocator can leave under contention.
    await testEnv.COUNTERS.put(KV_KEYS.patronNumber, "2");
    const sweep = await sweepCertificateAnchors(testEnv, options(network()));
    expect(sweep.backfilled).toBe(1);
    expect(sweep.behind_backfill).toBe(0);
    expect((await readCert(minted.certificate.cert_id)).anchor).toBeDefined();
  });

  it("upgrades a pending proof, reads the block off it, looks the time up, and closes the marker", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    // Pass one: submitted, no block yet. Pass two: the block has mined.
    const waiting = network({ upgrade: () => new Response("", { status: 404 }) });
    const first = await sweepCertificateAnchors(testEnv, options(waiting));
    expect(first.still_pending).toBe(1);
    const sweep = await sweepCertificateAnchors(testEnv, options(network()));
    expect(sweep.upgraded).toBe(1);
    const record = await readCert(minted.certificate.cert_id);
    expect(record.anchor?.ots.status).toBe("complete");
    expect(record.anchor?.bitcoin).toEqual({
      block_height: HEIGHT,
      block_hash: BLOCK_HASH,
      block_time: "2025-09-01T00:00:00.000Z",
      block_time_source: EXPLORER,
    });
    expect(
      await testEnv.PATRONS.get(KV_KEYS.certAnchorPending(minted.certificate.cert_id)),
    ).toBeNull();
    // Terminal: a third pass touches nothing.
    const third = await sweepCertificateAnchors(testEnv, options(network()));
    expect(third.upgraded).toBe(0);
    expect(third.still_pending).toBe(0);
  });

  it("completes in one pass when the block has already mined", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const sweep = await sweepCertificateAnchors(testEnv, options(network()));
    expect(sweep.backfilled).toBe(1);
    expect(sweep.upgraded).toBe(1);
    expect((await readCert(minted.certificate.cert_id)).anchor?.ots.status).toBe(
      "complete",
    );
  });

  it("keeps the height when no explorer answers — the time is a courtesy", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const quiet = network({ explorer: () => new Response("", { status: 503 }) });
    await sweepCertificateAnchors(testEnv, options(quiet));
    const record = await readCert(minted.certificate.cert_id);
    expect(record.anchor?.ots.status).toBe("complete");
    expect(record.anchor?.bitcoin).toEqual({ block_height: HEIGHT });
  });

  it("a block not yet mined is still pending, not failed", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const waiting = network({ upgrade: () => new Response("", { status: 404 }) });
    await sweepCertificateAnchors(testEnv, options(waiting));
    const sweep = await sweepCertificateAnchors(testEnv, options(waiting));
    expect(sweep.still_pending).toBe(1);
    expect((await readCert(minted.certificate.cert_id)).anchor?.ots.status).toBe(
      "pending",
    );
  });

  it("records a refused submission as failed and resubmits next pass", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    const dead = (async () => {
      throw new Error("calendar unreachable");
    }) as unknown as typeof fetch;
    await sweepCertificateAnchors(testEnv, options(dead));
    expect((await readCert(minted.certificate.cert_id)).anchor?.ots.status).toBe(
      "failed",
    );
    const sweep = await sweepCertificateAnchors(testEnv, options(network()));
    expect(sweep.resubmitted).toBe(1);
    expect((await readCert(minted.certificate.cert_id)).anchor?.ots.status).toBe(
      "pending",
    );
  });
});

/**
 * THE VERDICT, tested with the forgery the thread named: a retired key
 * signing a receipt DATED inside its window. The service-window check
 * passes it; only the bound can say anything, and what it says on a
 * late bound is "unproven", never "forged" and never "in service".
 */
describe("the existence verdict on /api/verify", () => {
  beforeEach(resetStore);
  const retiredKey = RETIRED_KEYS[0]!;

  async function plant(
    certId: string,
    publicKey: string,
    date: string,
    anchor?: CertificateRecord["anchor"],
  ): Promise<void> {
    await testEnv.PATRONS.put(
      KV_KEYS.cert(certId),
      JSON.stringify({
        certificate: { cert_id: certId, item: "hello", patron_number: 1, date },
        signature: "ab".repeat(64),
        public_key: publicKey,
        ...(anchor ? { anchor } : {}),
      }),
    );
  }

  const bounded = (blockTime: string, digest = "cd".repeat(32)) => ({
    digest,
    form: "current" as const,
    ots: { status: "complete" as const, submitted_at: "2026-09-05T00:00:00.000Z", proof_base64: "AA==" },
    bitcoin: {
      block_height: HEIGHT,
      block_time: blockTime,
      block_time_source: EXPLORER,
    },
  });

  async function verify(certId: string): Promise<{
    existence: {
      status: string;
      key_window: string;
      verdict: string;
      means: string;
      digest_matches_artifact_hash?: boolean;
      existed_by?: { block_height: number };
    };
    signed_by: { service_window: { status: string } };
    artifact_hash: string;
  }> {
    return (await (await SELF.fetch(`${BASE}/api/verify/${certId}`)).json()) as never;
  }

  it("no anchor: unproven, with the reason", async () => {
    await plant("cert_ex_none", retiredKey.public_key, "2026-07-25T12:00:00.000Z");
    const body = await verify("cert_ex_none");
    expect(body.existence.status).toBe("none");
    expect(body.existence.key_window).toBe("unbounded");
    expect(body.existence.verdict).toContain("unproven");
    expect(body.existence.means).toBe(EXISTENCE_BOUND_MEANS);
  });

  it("the careful forgery: retired key, dated inside the window, bounded after retirement", async () => {
    await plant(
      "cert_ex_late",
      retiredKey.public_key,
      "2026-07-25T12:00:00.000Z",
      bounded("2026-09-05T10:00:00.000Z"),
    );
    const body = await verify("cert_ex_late");
    // The window check still passes it on its own date — which is
    // exactly the gap.
    expect(body.signed_by.service_window.status).toBe("in_service");
    expect(body.existence.status).toBe("bounded");
    expect(body.existence.key_window).toBe("bound_after_retirement");
    expect(body.existence.verdict).toContain("UNPROVEN");
    expect(body.existence.verdict).toContain("once current");
    expect(body.existence.verdict).not.toMatch(/forg(ed|ery) /);
    expect(body.existence.existed_by?.block_height).toBe(HEIGHT);
  });

  it("the honest case: retired key, bounded on or before retirement", async () => {
    await plant(
      "cert_ex_early",
      retiredKey.public_key,
      "2026-07-25T12:00:00.000Z",
      bounded(`${retiredKey.retired_on}T23:00:00.000Z`),
    );
    const body = await verify("cert_ex_early");
    expect(body.existence.key_window).toBe("signed_while_current");
    expect(body.existence.verdict).toContain("Signed while the key was current");
  });

  it("the current key: bounded, no retirement to fall after", async () => {
    const current = await cachedPublicKeyHex(testEnv.SIGNING_KEY);
    await plant(
      "cert_ex_current",
      current,
      new Date().toISOString(),
      bounded("2026-09-05T10:00:00.000Z"),
    );
    const body = await verify("cert_ex_current");
    expect(body.existence.key_window).toBe("current_key");
  });

  it("an unrecognised key: existence bounded, attribution not", async () => {
    await plant(
      "cert_ex_stranger",
      "cc".repeat(32),
      "2026-07-25T12:00:00.000Z",
      bounded("2026-09-05T10:00:00.000Z"),
    );
    const body = await verify("cert_ex_stranger");
    expect(body.existence.key_window).toBe("key_unrecognised");
  });

  it("a height with no looked-up time is placed by nobody, and says so", async () => {
    const anchor = bounded("x");
    delete (anchor.bitcoin as { block_time?: string }).block_time;
    delete (anchor.bitcoin as { block_time_source?: string }).block_time_source;
    await plant("cert_ex_notime", retiredKey.public_key, "2026-07-25T12:00:00.000Z", anchor);
    const body = await verify("cert_ex_notime");
    expect(body.existence.key_window).toBe("block_time_unknown");
    expect(body.existence.verdict).toContain("your own node");
  });

  it("compares the anchored digest against artifact_hash derived on the same response", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    await anchorCertificate(testEnv, minted.certificate.cert_id, options(network()));
    const body = await verify(minted.certificate.cert_id);
    expect(body.existence.digest_matches_artifact_hash).toBe(true);
    // A planted digest that is not the payload's is named as such.
    await plant(
      "cert_ex_wrongdigest",
      retiredKey.public_key,
      "2026-07-25T12:00:00.000Z",
      bounded("2026-07-25T12:00:00.000Z", "ef".repeat(32)),
    );
    const wrong = await verify("cert_ex_wrongdigest");
    expect(wrong.existence.digest_matches_artifact_hash).toBe(false);
  });

  it("the verdict function never reads the artifact's own date", () => {
    const record: CertificateRecord = {
      certificate: {
        cert_id: "cert_ex_pure",
        item: "hello",
        patron_number: 1,
        date: "2020-01-01T00:00:00.000Z",
      },
      signature: "ab".repeat(64),
      public_key: retiredKey.public_key,
      anchor: bounded("2026-09-05T10:00:00.000Z"),
    };
    const late = existenceVerdict(record, {
      artifactHash: "cd".repeat(32),
      key: { status: "retired", retiredOn: retiredKey.retired_on },
    });
    expect(late.key_window).toBe("bound_after_retirement");
    // Same record, dated after retirement instead: the same verdict,
    // because the date was never consulted.
    record.certificate.date = "2030-01-01T00:00:00.000Z";
    expect(
      existenceVerdict(record, {
        artifactHash: "cd".repeat(32),
        key: { status: "retired", retiredOn: retiredKey.retired_on },
      }).key_window,
    ).toBe("bound_after_retirement");
  });

  it("the receipt page carries the bound in words", async () => {
    await plant(
      "cert_ex_page",
      retiredKey.public_key,
      "2026-07-25T12:00:00.000Z",
      bounded("2026-09-05T10:00:00.000Z"),
    );
    const html = await (
      await SELF.fetch(`${BASE}/api/verify/cert_ex_page`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("Existed by");
    expect(html).toContain(`Bitcoin block ${HEIGHT}`);
    expect(html).toContain("UNPROVEN");
  });
});

describe("the /attestation page says what the bound adds and does not", () => {
  it("scopes the no-chain line rather than deleting it", () => {
    const line = NOT_BUILT.find((entry) => entry.includes("OVER SOLD ARTIFACTS"));
    expect(line).toContain("existed-by");
    expect(line).toContain("says nothing about what was withheld");
  });
});
