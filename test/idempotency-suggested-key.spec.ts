import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import {
  IDEMPOTENCY_TTL_SECONDS,
  idempotencyBucket,
  jsonBodyDigest,
  lookupIdempotentWithBucketGrace,
  storeIdempotent,
  SUGGESTED_KEY_BODY_TAG_LENGTH,
  SUGGESTED_KEY_BUCKET_SECONDS,
  suggestedIdempotencyKey,
  usableIdempotencyKey,
} from "@/lib/idempotency";
import { isRecord, type Env } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * THE SUGGESTED IDEMPOTENCY KEY (CORRESPONDENCE T11).
 *
 * An agent cannot send a header it does not know exists, so the 402
 * hands it one to echo. The thing that makes this safe rather than a
 * skeleton key is ledger #19: the cache read now requires a VERIFIED
 * payer, which turns the key from an authentication mechanism into a
 * bucketing function. It can be fully public and derivable, and it is
 * deliberately written to look that way.
 *
 * The tests that matter are the ones about TIME, because a suggestion
 * that changes on every fetch would be useless for the exact failure
 * it exists to stop — a looping agent re-fetches the challenge each
 * pass and would get a fresh key every time.
 */

beforeAll(() => {
  installFacilitatorMock();
});

describe("the suggested key itself", () => {
  it("is stable across a retry loop inside the bucket", () => {
    const start = 1_800_000_000_000;
    // The whole point: a loop that re-fetches the challenge repeatedly
    // must be handed the SAME value, or every pass is a fresh charge.
    expect(suggestedIdempotencyKey("hello", start)).toBe(
      suggestedIdempotencyKey("hello", start + 5_000),
    );
    expect(suggestedIdempotencyKey("hello", start + 30_000)).toBe(
      suggestedIdempotencyKey("hello", start),
    );
  });

  it("changes once the bucket turns, which is the honest limit", () => {
    const start = 1_800_000_000_000;
    expect(suggestedIdempotencyKey("hello", start)).not.toBe(
      suggestedIdempotencyKey(
        "hello",
        start + SUGGESTED_KEY_BUCKET_SECONDS * 1000,
      ),
    );
  });

  it("differs per item, so one echoed key is not a store-wide token", () => {
    const now = 1_800_000_000_000;
    expect(suggestedIdempotencyKey("hello", now)).not.toBe(
      suggestedIdempotencyKey("dibs", now),
    );
  });

  it("always clears the store's own minimum length, whatever the item", () => {
    // A key the store would reject as decoration would make the whole
    // suggestion a no-op that still LOOKS like protection.
    for (const item of ["a", "hi", "hello", "graffiti_on_a_train"]) {
      const key = suggestedIdempotencyKey(item, 1_800_000_000_000);
      expect(usableIdempotencyKey(key)).toBe(key);
    }
  });

  it("reads as derivable rather than as entropy", () => {
    // A key that looks like a secret invites being treated as one,
    // and this one is public by design.
    const key = suggestedIdempotencyKey("hello", 1_800_000_000_000);
    expect(key).toContain("suggested");
    expect(key).toContain("hello");
    expect(key).toBe(`scvd-suggested-hello-${idempotencyBucket(1_800_000_000_000)}`);
  });
});

/**
 * THE SUGGESTION BINDS THE BODY (2026-09-11, x402#3325).
 *
 * Item and minute alone handed two purchases that differed only in
 * the request body — a JSON POST, or MCP tool arguments — one
 * suggestion, and the second buyer was replay-served the first's
 * goods. The slot is now body-scoped (idempotency-scope.spec), and the
 * suggestion carries a short digest of the same canonical body so the
 * bucket grace compares like with like.
 */
describe("the suggested key binds the body", () => {
  const now = 1_800_000_000_000;

  it("keeps the exact shipped format when there is no body", async () => {
    // Every live door is a GET: nothing a looping client holds today
    // may change under it.
    expect(suggestedIdempotencyKey("hello", now, null)).toBe(
      `scvd-suggested-hello-${idempotencyBucket(now)}`,
    );
    expect(suggestedIdempotencyKey("hello", now, null)).toBe(
      suggestedIdempotencyKey("hello", now),
    );
  });

  it("appends a short, readable digest tag when there is one", async () => {
    const digest = await jsonBodyDigest({ tag: "FIRST" });
    const key = suggestedIdempotencyKey("hello", now, digest);
    expect(key).toBe(
      `scvd-suggested-hello-${idempotencyBucket(now)}-${digest.slice(0, SUGGESTED_KEY_BODY_TAG_LENGTH)}`,
    );
    expect(usableIdempotencyKey(key)).toBe(key);
  });

  it("differs per body and is stable under key order", async () => {
    const a = await jsonBodyDigest({ tag: "FIRST", note: "x" });
    const b = await jsonBodyDigest({ tag: "SECOND", note: "x" });
    const aReordered = await jsonBodyDigest({ note: "x", tag: "FIRST" });
    expect(suggestedIdempotencyKey("hello", now, a)).not.toBe(
      suggestedIdempotencyKey("hello", now, b),
    );
    expect(suggestedIdempotencyKey("hello", now, aReordered)).toBe(
      suggestedIdempotencyKey("hello", now, a),
    );
  });

  it("is still stable across a retry loop inside the bucket", async () => {
    const digest = await jsonBodyDigest({ tag: "FIRST" });
    expect(suggestedIdempotencyKey("hello", now, digest)).toBe(
      suggestedIdempotencyKey("hello", now + 30_000, digest),
    );
  });
});

describe("the bucket-boundary grace", () => {
  const surface = "/api/buy/hello";

  it("finds a purchase stored under the PREVIOUS bucket's suggestion", async () => {
    /**
     * The case this exists for: a loop starting at second 59 and
     * retrying at second 61 re-fetches the challenge, is handed the
     * next bucket's key, and would otherwise miss its own purchase —
     * a real double charge at every boundary, forever.
     */
    const now = 1_800_000_060_000;
    const previousKey = suggestedIdempotencyKey(
      "hello",
      now - SUGGESTED_KEY_BUCKET_SECONDS * 1000,
    );
    const currentKey = suggestedIdempotencyKey("hello", now);
    expect(previousKey).not.toBe(currentKey);

    await storeIdempotent(
      testEnv,
      surface,
      TEST_PAYER,
      previousKey,
      { cert_id: "cert_boundary" },
      "0xtx",
    );

    const found = await lookupIdempotentWithBucketGrace(
      testEnv,
      surface,
      TEST_PAYER,
      currentKey,
      "hello",
      now,
    );
    expect(found?.body["cert_id"]).toBe("cert_boundary");
  });

  it("reaches back across the boundary for a keyed body, with the same body", async () => {
    // A POST loop straddling second 60 echoes the NEXT bucket's
    // suggestion for the same body and must still find its purchase.
    const now = 1_800_000_240_000;
    const digest = await jsonBodyDigest({ tag: "FIRST" });
    const bodySurface = `${surface}#with-body`;
    await storeIdempotent(
      testEnv,
      bodySurface,
      TEST_PAYER,
      suggestedIdempotencyKey("hello", now - SUGGESTED_KEY_BUCKET_SECONDS * 1000, digest),
      { cert_id: "cert_body_boundary" },
      "0xtx",
    );
    const found = await lookupIdempotentWithBucketGrace(
      testEnv,
      bodySurface,
      TEST_PAYER,
      suggestedIdempotencyKey("hello", now, digest),
      "hello",
      now,
      digest,
    );
    expect(found?.body["cert_id"]).toBe("cert_body_boundary");
  });

  it("never graces across bodies, even on one surface", async () => {
    // Belt and braces: the surface already separates bodies, and the
    // comparison would refuse a different body's echo on its own.
    const now = 1_800_000_300_000;
    const first = await jsonBodyDigest({ tag: "FIRST" });
    const second = await jsonBodyDigest({ tag: "SECOND" });
    const bodySurface = `${surface}#shared`;
    await storeIdempotent(
      testEnv,
      bodySurface,
      TEST_PAYER,
      suggestedIdempotencyKey("hello", now - SUGGESTED_KEY_BUCKET_SECONDS * 1000, first),
      { cert_id: "cert_first_body" },
      "0xtx",
    );
    // The presented key is FIRST's next-bucket suggestion, but the
    // request in hand carries SECOND's body.
    const found = await lookupIdempotentWithBucketGrace(
      testEnv,
      bodySurface,
      TEST_PAYER,
      suggestedIdempotencyKey("hello", now, first),
      "hello",
      now,
      second,
    );
    expect(found).toBeNull();
  });

  it("does NOT reach back for a caller using its own key", async () => {
    // The grace fires only for clients echoing our suggestion. A
    // client with its own key gets exact-match semantics, unchanged.
    const now = 1_800_000_120_000;
    await storeIdempotent(
      testEnv,
      surface,
      TEST_PAYER,
      suggestedIdempotencyKey("hello", now - SUGGESTED_KEY_BUCKET_SECONDS * 1000),
      { cert_id: "cert_not_yours" },
      "0xtx",
    );
    const found = await lookupIdempotentWithBucketGrace(
      testEnv,
      surface,
      TEST_PAYER,
      "a-client-of-its-own-choosing-01",
      "hello",
      now,
    );
    expect(found).toBeNull();
  });

  it("stays scoped to the paying wallet across the grace lookup", async () => {
    // The grace must not become a way around #19: another payer's
    // slot is still another payer's slot.
    const now = 1_800_000_180_000;
    await storeIdempotent(
      testEnv,
      surface,
      TEST_PAYER,
      suggestedIdempotencyKey("hello", now - SUGGESTED_KEY_BUCKET_SECONDS * 1000),
      { cert_id: "cert_theirs" },
      "0xtx",
    );
    const found = await lookupIdempotentWithBucketGrace(
      testEnv,
      surface,
      "0x9999999999999999999999999999999999999999",
      suggestedIdempotencyKey("hello", now),
      "hello",
      now,
    );
    expect(found).toBeNull();
  });
});

describe("the 402 carries it", () => {
  it("offers a suggested key an agent can echo, marked optional and not secret", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(challenge.status).toBe(402);
    const body = (await challenge.json()) as Record<string, unknown>;
    const block = body["idempotency"];
    expect(isRecord(block)).toBe(true);
    const idem = block as Record<string, unknown>;

    // Usable as-is: a suggestion the store would itself reject would
    // be protection theatre.
    const key = String(idem["suggested_key"]);
    expect(usableIdempotencyKey(key)).toBe(key);
    expect(key).toContain("hello");

    // Two claims that must travel with it or it gets misread.
    expect(String(idem["optional"]).toLowerCase()).toContain("entirely");
    expect(String(idem["not_a_secret"]).toLowerCase()).toContain(
      "does not open one",
    );
    expect(idem["stable_for_seconds"]).toBe(SUGGESTED_KEY_BUCKET_SECONDS);
    // The horizon, disclosed where the key is offered (x402#3325).
    expect(idem["replay_ttl_seconds"]).toBe(IDEMPOTENCY_TTL_SECONDS);
    expect(String(idem["replay_horizon"])).toContain(
      `${IDEMPOTENCY_TTL_SECONDS / 3600} hours`,
    );
  });

  it("actually works end to end when an agent echoes it", async () => {
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const suggested = (
      (await challenge.clone().json()) as Record<string, unknown>
    )["idempotency"] as Record<string, unknown>;
    const key = String(suggested["suggested_key"]);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;

    const first = await SELF.fetch(url, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
        "Idempotency-Key": key,
      },
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as Record<string, unknown>;

    // The loop: fresh authorization, same echoed key.
    const second = await SELF.fetch(url, {
      headers: {
        "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
        "Idempotency-Key": key,
      },
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as Record<string, unknown>;
    expect(secondBody["idempotent_replay"]).toBeDefined();
    expect(secondBody["cert_id"] ?? secondBody["certificate"]).toEqual(
      firstBody["cert_id"] ?? firstBody["certificate"],
    );
  });

  it("never becomes required: a purchase with no key at all still works", async () => {
    // The one way this feature could break the store is by hardening
    // a suggestion into an expectation.
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const paid = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, unknown>;
    expect(body["idempotent_replay"]).toBeUndefined();
  });
});

describe("the machine-readable surfaces teach it", () => {
  /**
   * A mechanism an agent cannot discover is a mechanism that does not
   * exist for the reader it was built for. These assert the SHAPE and
   * the two load-bearing caveats, not prose — so the docs can be
   * rewritten freely but cannot quietly lose the field name, the
   * window, or the not-a-secret explanation.
   */
  // /llms-full.txt rather than /llms.txt since the 2026-08-27 split:
  // the retry-safety guidance is part of the paying section, which
  // files under /developers/llms.txt. The complete prose is the guide.
  const surfaces = ["/llms-full.txt", "/agents.md"];

  it("names the field an agent has to read, on every guide", async () => {
    for (const path of surfaces) {
      const text = await (await SELF.fetch(`${BASE}${path}`)).text();
      expect(text, `${path} never names the field`).toContain(
        "suggested_key",
      );
      expect(text, `${path} omits the window`).toContain("60 seconds");
    }
  });

  it("carries the not-a-secret explanation wherever it is offered", async () => {
    // The dangerous misreading is "this is my secret, guard it" —
    // which would make a client hide a value it should be echoing,
    // and might make somebody treat leaking it as an incident.
    for (const path of surfaces) {
      const text = (await (await SELF.fetch(`${BASE}${path}`)).text())
        .toLowerCase();
      expect(text, `${path} lets it read as a secret`).toContain(
        "not a secret",
      );
      expect(text, `${path} omits what it can and cannot do`).toContain(
        "does not open",
      );
    }
  });

  it("keeps the honest warning beside the escape hatch on the MCP tools", async () => {
    const res = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    const result = body["result"] as Record<string, unknown>;
    const tools = result["tools"] as Array<Record<string, unknown>>;
    const shelf = tools.find((t) => t["name"] === "buy_signed_record")!;
    expect(String(shelf["description"])).toContain("suggested_key");
    // The warning must NOT have been softened into a promise: a bare
    // repeat really is a second charge, and the hint says so.
    const annotations = shelf["annotations"] as Record<string, unknown>;
    expect(annotations["idempotentHint"]).toBe(false);
    expect(String(shelf["description"])).toContain("second charge");
  });

  it("is in the standards block a diligence pass reads", async () => {
    const trust = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as Record<string, unknown>;
    const standards = trust["standards"] as Record<string, unknown>;
    const safety = standards["wallet_safety_for_buggy_clients"] as Record<
      string,
      unknown
    >;
    expect(String(safety["you_do_not_have_to_invent_a_key"])).toContain(
      "suggested_key",
    );
    expect(String(safety["never_required"]).toLowerCase()).toContain(
      "can refuse a sale",
    );
  });
});

describe("the MCP door offers the same thing", () => {
  it("carries the suggestion in its 402 error data", async () => {
    const res = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "buy_signed_record", arguments: { item_id: "hello" } },
      }),
    });
    const reply = (await res.json()) as Record<string, unknown>;
    const error = reply["error"] as Record<string, unknown>;
    expect(error["code"]).toBe(402);
    const data = error["data"] as Record<string, unknown>;
    const idem = data["idempotency"] as Record<string, unknown>;
    const key = String(idem["suggested_key"]);
    expect(usableIdempotencyKey(key)).toBe(key);
    // Both doors are fed by one helper; if they ever drift, this fails.
    // This door's body is its tool arguments, so the suggestion carries
    // their digest — the same object the tool received.
    expect(key).toBe(
      suggestedIdempotencyKey("hello", Date.now(), await jsonBodyDigest({ item_id: "hello" })),
    );
    expect(idem["replay_ttl_seconds"]).toBe(IDEMPOTENCY_TTL_SECONDS);
  });

  it("names the horizon in the tool-result payment profile's envelope", async () => {
    const res = await SELF.fetch(`${BASE}/mcp?payment=tool-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "buy_signed_record", arguments: { item_id: "hello" } },
      }),
    });
    const reply = (await res.json()) as Record<string, unknown>;
    const result = reply["result"] as Record<string, unknown>;
    expect(result["isError"]).toBe(true);
    const meta = result["_meta"] as Record<string, unknown>;
    expect(meta["x402/idempotency-key"]).toBe(
      suggestedIdempotencyKey("hello", Date.now(), await jsonBodyDigest({ item_id: "hello" })),
    );
    expect(meta["scvd/idempotency-replay-ttl-seconds"]).toBe(IDEMPOTENCY_TTL_SECONDS);
  });
});
