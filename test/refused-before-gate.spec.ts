import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readDeclines, readReason } from "@/lib/declines";
import { missingRequiredInputs } from "@/lib/bazaar-discovery";
import { auditFunnel } from "@/services/funnel";
import { getMenuItem } from "@/store";
import type { Env, MenuItem } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
/** Reads as an outside buyer: no house header, not a house agent. */
const OUTSIDE = { "User-Agent": "buyer-client/1.0" };

beforeAll(() => {
  installFacilitatorMock();
});

/** The bare-quote ask lands via waitUntil, inside the request, not before it. */
async function funnelRowFor(item: string) {
  return vi.waitFor(async () => {
    const row = (await auditFunnel(testEnv)).items.find((r) => r.item === item);
    if (!row) throw new Error(`no funnel row yet for ${item}`);
    return row;
  });
}

async function clearEvents(): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const listed = await testEnv.COUNTERS.list({ prefix: "evt:", limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
}
beforeEach(clearEvents);

/**
 * THE WALLET THAT OPENED AND WAS NEVER COUNTED (2026-09-04).
 *
 * settlement_attestation: 77 asks, 5 wallets, 0 sales, and the funnel
 * called the 72 who never signed "window-shopping". Two things were
 * wrong with that reading, and both were the instrument's.
 *
 * First: that door needs ?tx_hash=, a transaction the buyer already
 * owns. A scanner arriving without one is not a shopper who walked; it
 * is a visitor at a locked door, and nothing on the ask row said which.
 *
 * Second, and worse: a SIGNED request without tx_hash was refused with
 * a 400 before the payment gate — correctly, no money moved — and that
 * path booked NOTHING. A library-driven client reads the header, signs,
 * and retries; it never reads the body that names required_params. It
 * opened its wallet, was refused, and was recorded as somebody who
 * never tried. The funnel's one signal worth having was invisible on
 * every door with a required input: three of the four cheapest.
 */
describe("a signed request refused for a missing input is a decline", () => {
  it("books tx_hash missing on settlement_attestation, and still charges nothing", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation`, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": "not-a-real-signature" },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["charged"]).toBe(false);

    const { declines } = await readDeclines(testEnv);
    const row = declines.find((r) => r.item === "settlement_attestation");
    expect(row, "the refusal left no row in the books").toBeDefined();
    expect(row?.reason).toBe("local:input_missing:tx_hash");
    expect(row?.stage).toBe("verify");
  });

  it("books tx_hash invalid when one arrived in the wrong shape", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation?tx_hash=nope`, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": "not-a-real-signature" },
    });
    expect(response.status).toBe(400);
    const { declines } = await readDeclines(testEnv);
    expect(declines.some((r) => r.reason === "local:input_invalid:tx_hash")).toBe(true);
  });

  it("books nothing for a bare price-ask, which was never a wallet", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation`, { headers: OUTSIDE });
    expect(response.status).toBe(402);
    const { declines } = await readDeclines(testEnv);
    expect(declines.filter((r) => r.item === "settlement_attestation")).toEqual([]);
  });

  it("counts as a wallet opened on the funnel, where it used to be silence", async () => {
    await SELF.fetch(`${BASE}/api/buy/settlement_attestation`, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": "not-a-real-signature" },
    });
    const row = await funnelRowFor("settlement_attestation");
    expect(row.wallets_opened).toBe(1);
    expect(row.declines_organic).toBe(1);
    expect(row.decline_reasons["local:input_missing:tx_hash"]).toBe(1);
  });
});

describe("an ask that could not have bought is marked as such", () => {
  it("stamps the missing input on the HTTP ask row", async () => {
    await SELF.fetch(`${BASE}/api/buy/settlement_attestation`, { headers: OUTSIDE });
    const row = await funnelRowFor("settlement_attestation");
    expect(row.asks_organic).toBe(1);
    expect(row.asks_locked).toBe(1);
    expect(row.locked_inputs).toEqual({ tx_hash: 1 });
    expect(row.verdict).toContain("LOCKED DOOR");
    expect(row.verdict).toContain("tx_hash ×1");
  });

  it("leaves an ask that brought its input unlocked", async () => {
    await SELF.fetch(`${BASE}/api/buy/settlement_attestation?tx_hash=0x${"ab".repeat(32)}`, { headers: OUTSIDE });
    const row = await funnelRowFor("settlement_attestation");
    expect(row.asks_organic).toBe(1);
    expect(row.asks_locked).toBe(0);
    expect(row.verdict).not.toContain("LOCKED DOOR");
  });

  it("never marks a door with no prerequisite", async () => {
    await SELF.fetch(`${BASE}/api/buy/small_blessing`, { headers: OUTSIDE });
    const row = await funnelRowFor("small_blessing");
    expect(row.asks_locked).toBe(0);
    expect(row.verdict).not.toContain("LOCKED DOOR");
  });

  it("stamps the MCP ask row from the tool's arguments", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { ...OUTSIDE, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "buy_observation", arguments: { item_id: "settlement_attestation" } },
      }),
    });
    expect(response.status).toBeLessThan(500);
    const row = await funnelRowFor("settlement_attestation");
    expect(row.asks_organic).toBe(1);
    expect(row.asks_locked).toBe(1);
    expect(row.locked_inputs).toEqual({ tx_hash: 1 });
  });
});

describe("the MCP door books the same refusal", () => {
  it("books input_missing when a payment rode in without the input", async () => {
    // the_confession is one the MCP door refuses before payment; a
    // payment object attached means a wallet was opened for it.
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { ...OUTSIDE, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "buy_signed_record",
          arguments: { item_id: "the_confession" },
          _meta: { "x402/payment": { x402Version: 2 } },
        },
      }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(isRecordLike(body["error"])).toBe(true);
    const { declines } = await readDeclines(testEnv);
    expect(declines.some((r) => r.reason === "local:input_missing:confession")).toBe(true);
  });

  it("books nothing for a bare MCP ask without a payment", async () => {
    await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { ...OUTSIDE, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "buy_signed_record", arguments: { item_id: "the_confession" } },
      }),
    });
    const { declines } = await readDeclines(testEnv);
    expect(declines.filter((r) => r.item === "the_confession")).toEqual([]);
  });
});

function isRecordLike(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

describe("what the desk says about a refusal at the door", () => {
  it("reads all three as THEIRS, names the parameter, and does not blame the SDK", () => {
    for (const code of [
      "local:input_missing:tx_hash",
      "local:input_invalid:tx_hash",
      "local:refused_before_gate",
    ]) {
      const { fault, reading } = readReason(code);
      expect(fault, code).toBe("buyer");
      expect(reading, code).not.toContain("x402 SDK");
      expect(reading, code).toContain("no money moved");
    }
    expect(readReason("local:input_missing:tx_hash").reading).toContain("`tx_hash`");
    expect(readReason("local:input_invalid:host").reading).toContain("`host`");
  });

  it("says when the same miss from DIFFERENT clients would be ours", () => {
    expect(readReason("local:input_missing:tx_hash").reading).toContain("DIFFERENT clients");
  });
});

describe("which required inputs a request lacks", () => {
  const item = getMenuItem("settlement_attestation") as MenuItem;
  it("counts absent, null and blank as missing, and a value as present", () => {
    expect(missingRequiredInputs(item, {})).toEqual(["tx_hash"]);
    expect(missingRequiredInputs(item, { tx_hash: "" })).toEqual(["tx_hash"]);
    expect(missingRequiredInputs(item, { tx_hash: "   " })).toEqual(["tx_hash"]);
    expect(missingRequiredInputs(item, { tx_hash: "0xabc" })).toEqual([]);
  });
  it("is empty for a door that requires nothing", () => {
    expect(missingRequiredInputs(getMenuItem("small_blessing") as MenuItem, {})).toEqual([]);
  });
});
