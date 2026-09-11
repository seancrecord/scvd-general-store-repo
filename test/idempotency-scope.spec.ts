import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import {
  idempotencyScope,
  jsonBodyDigest,
  requestBodyDigest,
  sha256HexBytes,
  suggestedIdempotencyKey,
} from "@/lib/idempotency";
import { isRecord } from "@/types";
import type { FacilitatorMockState } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
let facilitator: FacilitatorMockState;

/**
 * THE CACHE MUST NOT HAND BACK AN ARTIFACT ABOUT SOMETHING ELSE.
 *
 * Found 2026-08-25 by a review pass over the money paths, and
 * measured before it was fixed.
 *
 * The idempotency slot was keyed on (path, payer, hashed key), and the
 * key the store itself SUGGESTS in every 402 body is
 * `scvd-suggested-<item>-<minute>`. Neither carried the query string —
 * and most of this shelf takes its whole input from the query:
 * tx_hash, url, wallet, digest, tag, mandate.
 *
 * So two genuinely different purchases, same item, same payer, same
 * minute, collided. The buyer who asked for `?tag=SECOND` was handed
 * the certificate minted for `?tag=FIRST` — and `tag` is inside
 * CERT_FIELDS, so the ed25519 signature COVERS the wrong value and
 * verifies cleanly against it. A third party checking that artifact
 * gets a valid signature over a fact that was never true for them.
 *
 * On the parameterized doors it is worse than one wrong souvenir: an
 * agent batching settlement attestations over N transactions in a
 * minute receives one attestation about the first, N-1 times.
 *
 * The store publishes the suggested key and tells callers to send it,
 * so this was the store's own advice producing the collision.
 */

beforeAll(() => {
  facilitator = installMultiPurchaseFacilitatorMock();
});

async function buyTag(
  tag: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const url = `${BASE}/api/buy/graffiti_on_a_train?tag=${tag}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0]!;
  const response = await SELF.fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
      "Idempotency-Key": idempotencyKey,
    },
  });
  return (await response.json()) as Record<string, unknown>;
}

function certOf(body: Record<string, unknown>): Record<string, unknown> {
  const cert = body["certificate"];
  return isRecord(cert) ? cert : body;
}

describe("the idempotency slot is scoped to what was actually asked for", () => {
  it("does not serve one purchase's signed artifact to a different purchase", async () => {
    // The store's OWN suggested key: same item, same minute, so the
    // two requests differ only in the argument that decides the goods.
    const key = suggestedIdempotencyKey("graffiti_on_a_train");

    const first = await buyTag("FIRST", key);
    const second = await buyTag("SECOND", key);

    const firstCert = certOf(first);
    const secondCert = certOf(second);

    expect(firstCert["tag"]).toBe("FIRST");
    expect(
      secondCert["tag"],
      "the second buyer was handed a signed artifact about the first buyer's tag",
    ).toBe("SECOND");
    expect(
      secondCert["cert_id"],
      "two different purchases share one certificate id",
    ).not.toBe(firstCert["cert_id"]);
    expect(second["idempotent_replay"]).not.toBe(true);
  });

  it("still replays a genuine retry — the same request, twice", async () => {
    // The mechanism has to keep doing its job: an identical URL with an
    // identical key is a retry loop, not a new purchase, and must not
    // charge twice.
    const key = suggestedIdempotencyKey("graffiti_on_a_train");
    const first = await buyTag("SAME", key);
    const again = await buyTag("SAME", key);
    expect(certOf(again)["cert_id"]).toBe(certOf(first)["cert_id"]);
  });
});

/**
 * THE DELIMITERS ARE NOT DATA — found 2026-08-25 by a review pass over
 * the fix above, hours after it shipped.
 *
 * The first version of idempotencyScope interpolated keys and values
 * raw: `${k}=${v}` joined on "&". So `=` and `&` INSIDE a decoded
 * value were indistinguishable from structure, and two different
 * query strings canonicalized to one string.
 *
 * That is not a theoretical collision. Same item, same payer, same
 * minute, same store-suggested key — one cache slot, and the second
 * caller collects an ed25519-signed artifact naming the wrong
 * subject. Precisely the defect the scope was added to close, back
 * through a hole in the closure.
 */
describe("the scope cannot be forged through its own delimiters", () => {
  it("keeps two different query strings in two different slots", async () => {
    const { idempotencyScope } = await import("@/lib/idempotency");
    const structured = await idempotencyScope(
      "/api/buy/graffiti_on_a_train",
      new URLSearchParams("tag=one&z=two"),
    );
    // One parameter whose VALUE happens to contain the delimiters.
    const injected = await idempotencyScope(
      "/api/buy/graffiti_on_a_train",
      new URLSearchParams([["tag", "one&z=two"]]),
    );
    expect(
      injected,
      "a value carrying & and = collides with real structure",
    ).not.toBe(structured);
  });

  it("is stable under parameter order, which is the property it needs", async () => {
    const { idempotencyScope } = await import("@/lib/idempotency");
    const forwards = await idempotencyScope(
      "/api/buy/x",
      new URLSearchParams("a=1&b=2"),
    );
    const backwards = await idempotencyScope(
      "/api/buy/x",
      new URLSearchParams("b=2&a=1"),
    );
    expect(forwards).toBe(backwards);
  });
});

/**
 * THE BODY IS AN ARGUMENT TOO — 2026-09-11, admitted on x402#3325.
 *
 * The scope above bound the path and the query. A purchase whose input
 * rides in the request BODY — a JSON POST, or MCP tool arguments,
 * which are the body — had no term, so two different purchases by the
 * same payer in the same minute shared a slot and the second was
 * replay-served the first's goods: no settlement, no charge, and a
 * signed artifact naming the wrong subject.
 */
describe("the scope binds the request body", () => {
  const path = "/api/buy/graffiti_on_a_train";
  const query = new URLSearchParams("tag=x");

  it("keeps two bodies in two slots, and no body in today's slot", async () => {
    const a = await idempotencyScope(path, query, await jsonBodyDigest({ tag: "FIRST" }));
    const b = await idempotencyScope(path, query, await jsonBodyDigest({ tag: "SECOND" }));
    expect(a).not.toBe(b);
    // Byte-identical to the pre-body scope: the slots a looping GET
    // client holds right now stay reachable across this change.
    expect(await idempotencyScope(path, query, null)).toBe(
      await idempotencyScope(path, query),
    );
    expect(await idempotencyScope(path, new URLSearchParams(), null)).toBe(path);
  });

  it("canonicalizes JSON, so a re-serialized body is the same purchase", async () => {
    const forwards = await jsonBodyDigest({ tag: "FIRST", nested: { b: 2, a: [1, { z: 1, y: 2 }] } });
    const backwards = await jsonBodyDigest({ nested: { a: [1, { y: 2, z: 1 }], b: 2 }, tag: "FIRST" });
    expect(forwards).toBe(backwards);
    // ...while a difference at any depth, or of type, is a different one.
    expect(await jsonBodyDigest({ nested: { a: [1, { y: 2, z: 2 }], b: 2 }, tag: "FIRST" })).not.toBe(forwards);
    expect(await jsonBodyDigest({ n: 1 })).not.toBe(await jsonBodyDigest({ n: "1" }));
  });

  it("cannot be forged through its own delimiters", async () => {
    const digest = await jsonBodyDigest({ tag: "FIRST" });
    // A query VALUE spelling out the body term is data, not structure.
    const spoofed = await idempotencyScope(path, new URLSearchParams([["x", `#body:${digest}`]]), null);
    const real = await idempotencyScope(path, new URLSearchParams([["x", ""]]), digest);
    expect(spoofed).not.toBe(real);
    // And a JSON string value carrying JSON punctuation stays a string.
    expect(await jsonBodyDigest({ tag: '"},"z":"' })).not.toBe(await jsonBodyDigest({ tag: "", z: "" }));
  });

  it("reads the body of a request without consuming it", async () => {
    const json = { tag: "FIRST", n: 1 };
    const request = new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(json),
    });
    expect(await requestBodyDigest(request)).toBe(await jsonBodyDigest(json));
    // The handler behind the gate still gets its body.
    expect(await request.json()).toEqual(json);
    // A re-serialization of the same JSON is the same digest.
    const reordered = new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n: 1, tag: "FIRST" }),
    });
    expect(await requestBodyDigest(reordered)).toBe(await jsonBodyDigest(json));
  });

  it("is null for GET and for an empty body — the format shipped today", async () => {
    expect(await requestBodyDigest(new Request(`${BASE}${path}?tag=x`))).toBeNull();
    expect(await requestBodyDigest(new Request(`${BASE}${path}`, { method: "POST" }))).toBeNull();
    expect(await requestBodyDigest(new Request(`${BASE}${path}`, { method: "POST", body: "" }))).toBeNull();
  });

  it("hashes anything that is not JSON as the bytes on the wire", async () => {
    const bytes = new TextEncoder().encode("tag=FIRST");
    const plain = new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bytes,
    });
    expect(await requestBodyDigest(plain)).toBe(await sha256HexBytes(bytes));
    // Claims JSON, is not: hashed as what it is, never dropped.
    const broken = new TextEncoder().encode("{not json");
    const claimsJson = new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: broken,
    });
    expect(await requestBodyDigest(claimsJson)).toBe(await sha256HexBytes(broken));
  });
});

/**
 * THE MCP DOOR, END TO END. Its tool arguments ARE the body, and two
 * buys that differ only there must each be charged and each get their
 * own goods — including when a client keeps echoing the FIRST
 * challenge's suggested key, which is the exact shape of the loop the
 * suggestion exists for.
 */
async function mcpCall(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params }),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function buyTagOverMcp(
  tag: string,
  idempotencyKey?: string,
): Promise<{ suggested: string; body: Record<string, unknown>; settles: number }> {
  const args = { item_id: "graffiti_on_a_train", tag };
  const challenge = await mcpCall({ name: "buy_signed_record", arguments: args });
  const error = challenge["error"] as Record<string, unknown>;
  expect(error["code"]).toBe(402);
  const data = error["data"] as Record<string, unknown>;
  const suggested = String((data["idempotency"] as Record<string, unknown>)["suggested_key"]);
  const required = data["x402/payment-required"] as { accepts: Array<Parameters<typeof buildPaymentSignature>[0]> };
  const before = facilitator.settleCalls;
  const paid = await mcpCall({
    name: "buy_signed_record",
    arguments: args,
    _meta: {
      "x402/payment": buildPaymentSignature(required.accepts[0]!),
      "x402/idempotency-key": idempotencyKey ?? suggested,
    },
  });
  expect(paid["error"], JSON.stringify(paid["error"])).toBeUndefined();
  const result = paid["result"] as Record<string, unknown>;
  return {
    suggested,
    body: result["structuredContent"] as Record<string, unknown>,
    settles: facilitator.settleCalls - before,
  };
}

describe("the MCP door binds its tool arguments", () => {
  it("charges two different argument sets separately, each with its own goods", async () => {
    const first = await buyTagOverMcp("MCP-FIRST");
    const second = await buyTagOverMcp("MCP-SECOND");
    // The suggestions themselves already differ: the digest is in them.
    expect(second.suggested).not.toBe(first.suggested);
    expect(first.settles).toBe(1);
    expect(second.settles, "the second buyer was not charged").toBe(1);
    expect(certOf(first.body)["tag"]).toBe("MCP-FIRST");
    expect(certOf(second.body)["tag"], "the second buyer was handed the first buyer's goods").toBe("MCP-SECOND");
    expect(certOf(second.body)["cert_id"]).not.toBe(certOf(first.body)["cert_id"]);
    expect(second.body["idempotent_replay"]).not.toBe(true);
  });

  it("still charges a different purchase that echoes the FIRST purchase's key", async () => {
    // A client that cached one suggestion and reuses it: the slot is
    // scoped by the arguments, so the key cannot reach the other goods.
    const first = await buyTagOverMcp("MCP-KEPT-KEY-A");
    const second = await buyTagOverMcp("MCP-KEPT-KEY-B", first.suggested);
    expect(second.settles).toBe(1);
    expect(certOf(second.body)["tag"]).toBe("MCP-KEPT-KEY-B");
    expect(second.body["idempotent_replay"]).not.toBe(true);
  });

  it("still replays the identical call — same arguments, same suggestion", async () => {
    const first = await buyTagOverMcp("MCP-SAME");
    const again = await buyTagOverMcp("MCP-SAME");
    expect(again.suggested).toBe(first.suggested);
    expect(again.settles, "a genuine retry was charged again").toBe(0);
    expect(again.body["idempotent_replay"]).toBe(true);
    expect(certOf(again.body)["cert_id"]).toBe(certOf(first.body)["cert_id"]);
  });
});
