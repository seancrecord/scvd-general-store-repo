import { describe, expect, it } from "vitest";
import {
  hmacSha256Hex,
  sha256Hex,
  signTradeRequest,
  timingSafeEqual,
  tradeSigningString,
  verifyTradeRequest,
  type TradeDialect,
} from "@/lib/trade-auth";
import { TRADE_DIALECTS } from "@/store/trade-counter";

/**
 * THE LOCK, TESTED AS A LOCK: every refusal by name, the order the
 * checks run in, both live secrets, and both signed-string shapes.
 * The clock is injected on both sides (AGENTS.md), so nothing here
 * moves with the wall.
 */

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const SECRET = "the-secret-in-service";
const PREVIOUS = "the-secret-on-its-way-out";
const PROVIDER_KEY = "provider-key-0001";
const BODY = JSON.stringify({ summary: "remember this", order_ref: "ord_1" });

const hal = TRADE_DIALECTS.hal;
const canonical = TRADE_DIALECTS.canonical;

function headersOf(record: Record<string, string>): (name: string) => string | undefined {
  const lower = new Map(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
  return (name) => lower.get(name.toLowerCase());
}

async function signed(
  dialect: TradeDialect,
  overrides: Partial<Parameters<typeof signTradeRequest>[0]> = {},
): Promise<Record<string, string>> {
  return signTradeRequest({
    dialect,
    secret: SECRET,
    provider_key: PROVIDER_KEY,
    body: BODY,
    now_ms: NOW,
    ...overrides,
  });
}

function verify(
  dialect: TradeDialect,
  headers: Record<string, string>,
  body = BODY,
  now = NOW,
) {
  return verifyTradeRequest({
    dialect,
    header: headersOf(headers),
    rawBody: body,
    secrets: { signing: SECRET, previous: PREVIOUS, provider_key: PROVIDER_KEY },
    now_ms: now,
  });
}

describe("a well-signed instruction", () => {
  it("verifies, and hands back the nonce as the replay key and the digest of the exact signed string", async () => {
    const headers = await signed(hal);
    const verdict = await verify(hal, headers);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.signed_with).toBe("current");
    expect(verdict.replay_key).toBe(headers["X-Hal-Nonce"]);
    const message = tradeSigningString(hal, headers["X-Hal-Timestamp"]!, headers["X-Hal-Nonce"], BODY);
    expect(verdict.instruction_digest).toBe(await sha256Hex(message));
    expect(verdict.timestamp_ms).toBe(Math.floor(NOW / 1000) * 1000);
  });

  it("verifies under the previous secret during a rotation, and says so", async () => {
    const headers = await signed(hal, { secret: PREVIOUS });
    const verdict = await verify(hal, headers);
    expect(verdict).toMatchObject({ ok: true, signed_with: "previous" });
  });

  it("is the signature the dialect's own words describe", async () => {
    const headers = await signed(hal, { nonce: "0123456789abcdef0123456789abcdef" });
    const expected = await hmacSha256Hex(
      SECRET,
      `${headers["X-Hal-Timestamp"]}.0123456789abcdef0123456789abcdef.${BODY}`,
    );
    expect(headers["X-Hal-Signature"]).toBe(`sha256=${expected}`);
  });
});

describe("every refusal, by name", () => {
  it("missing_headers", async () => {
    const headers = await signed(hal);
    delete headers["X-Hal-Signature"];
    expect(await verify(hal, headers)).toEqual({ ok: false, code: "missing_headers" });
    const noNonce = await signed(hal);
    delete noNonce["X-Hal-Nonce"];
    expect(await verify(hal, noNonce)).toEqual({ ok: false, code: "missing_headers" });
    const noKey = await signed(hal);
    delete noKey["X-Hal-Provider-Key"];
    expect(await verify(hal, noKey)).toEqual({ ok: false, code: "missing_headers" });
  });

  it("bad_provider_key, checked before the clock so a stranger learns nothing about it", async () => {
    const headers = await signed(hal, { provider_key: "wrong", now_ms: NOW - 3600_000 });
    expect(await verify(hal, headers)).toEqual({ ok: false, code: "bad_provider_key" });
  });

  it("bad_timestamp", async () => {
    const headers = await signed(hal);
    headers["X-Hal-Timestamp"] = "yesterday";
    expect(await verify(hal, headers)).toEqual({ ok: false, code: "bad_timestamp" });
  });

  it("stale_timestamp, in both directions", async () => {
    const past = await signed(hal, { now_ms: NOW - 301_000 });
    expect(await verify(hal, past)).toEqual({ ok: false, code: "stale_timestamp" });
    const future = await signed(hal, { now_ms: NOW + 301_000 });
    expect(await verify(hal, future)).toEqual({ ok: false, code: "stale_timestamp" });
    const edge = await signed(hal, { now_ms: NOW - 299_000 });
    expect((await verify(hal, edge)).ok).toBe(true);
  });

  it("bad_nonce", async () => {
    const headers = await signed(hal);
    headers["X-Hal-Nonce"] = "not-hex";
    expect(await verify(hal, headers)).toEqual({ ok: false, code: "bad_nonce" });
  });

  it("bad_signature: the wrong secret, a tampered body, a missing prefix, a bad hex", async () => {
    const wrongSecret = await signed(hal, { secret: "nobody's" });
    expect(await verify(hal, wrongSecret)).toEqual({ ok: false, code: "bad_signature" });

    const good = await signed(hal);
    expect(await verify(hal, good, BODY + " ")).toEqual({ ok: false, code: "bad_signature" });

    const noPrefix = await signed(hal);
    noPrefix["X-Hal-Signature"] = noPrefix["X-Hal-Signature"]!.replace("sha256=", "");
    expect(await verify(hal, noPrefix)).toEqual({ ok: false, code: "bad_signature" });

    const shortHex = await signed(hal);
    shortHex["X-Hal-Signature"] = "sha256=abc";
    expect(await verify(hal, shortHex)).toEqual({ ok: false, code: "bad_signature" });
  });

  it("never verifies against an empty secret in service", async () => {
    // Signed with a real secret; the store's side has none set.
    const headers = await signed(hal);
    const verdict = await verifyTradeRequest({
      dialect: hal,
      header: headersOf(headers),
      rawBody: BODY,
      secrets: { signing: "", provider_key: PROVIDER_KEY },
      now_ms: NOW,
    });
    expect(verdict).toEqual({ ok: false, code: "bad_signature" });
  });
});

describe("the other shapes a marketplace signs in", () => {
  const stripeShaped: TradeDialect = {
    id: "t",
    name: "timestamp.body, milliseconds, no provider key",
    timestamp_header: "X-Sig-Ts",
    signature_header: "X-Sig",
    signature_prefix: "",
    signing_string: "timestamp.body",
    timestamp_unit: "milliseconds",
    window_seconds: 120,
  };

  it("timestamp.body in milliseconds: the instruction digest is the replay key", async () => {
    const headers = await signed(stripeShaped, { provider_key: undefined });
    expect(headers["X-Sig-Ts"]).toBe(String(NOW));
    const verdict = await verify(stripeShaped, headers);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.replay_key).toBe(verdict.instruction_digest);
    expect(verdict.replay_key).toBe(await sha256Hex(`${NOW}.${BODY}`));
  });

  it("our canonical dialect signs and verifies like the first account's, under neutral names", async () => {
    const headers = await signed(canonical);
    expect(Object.keys(headers)).toEqual(
      expect.arrayContaining(["X-Trade-Key", "X-Trade-Timestamp", "X-Trade-Nonce", "X-Trade-Signature"]),
    );
    expect((await verify(canonical, headers)).ok).toBe(true);
  });
});

describe("timingSafeEqual", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  it("agrees only on identical bytes, whatever the length", () => {
    expect(timingSafeEqual(bytes("abc"), bytes("abc"))).toBe(true);
    expect(timingSafeEqual(bytes("abc"), bytes("abd"))).toBe(false);
    expect(timingSafeEqual(bytes("abc"), bytes("abcd"))).toBe(false);
    expect(timingSafeEqual(bytes(""), bytes(""))).toBe(true);
  });
});
