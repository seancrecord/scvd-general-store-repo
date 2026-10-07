import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import { presentInputNames } from "@/lib/bazaar-discovery";
import { INPUT_NAME_CAP, INPUTS_PRESENT_CAP, recordPaymentDecline, type MetricEvent } from "@/lib/metrics";
import { renderDeclinesPage } from "@/pages/admin/declines-page";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
/** A signature-shaped header: the door treats the request as a purchase and books its refusal. */
const SIGNED = { "User-Agent": "node", "PAYMENT-SIGNATURE": "not-a-real-signature" };

beforeAll(() => {
  installFacilitatorMock();
});

async function clearEvents(): Promise<void> {
  for (const prefix of ["evt:", "declevt:"]) {
    let cursor: string | undefined;
    for (;;) {
      const listed = await testEnv.COUNTERS.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
      if (listed.list_complete) break;
      cursor = listed.cursor;
    }
  }
}
beforeEach(clearEvents);

/** Every stored decline row, raw, so a test can say what the books do NOT hold. */
async function storedRows(): Promise<string[]> {
  const rows: string[] = [];
  for (const prefix of ["evt:", "declevt:"]) {
    for (const key of (await testEnv.COUNTERS.list({ prefix })).keys) {
      const raw = await testEnv.COUNTERS.get(key.name);
      if (raw && raw.includes('"decline"')) rows.push(raw);
    }
  }
  return rows;
}

/**
 * WHAT THE REFUSED REQUEST BROUGHT (2026-09-30, off the decline desk).
 *
 * `node` was refused three times in ten seconds at spot_check for a
 * missing host, two days after every document carried the buy
 * template, and the books could not say whether it had sent nothing
 * (a stock client retrying the bare door) or ?url= (the sibling's
 * spelling, on the one door that says ?host=). Those are different
 * fixes. The row now carries the NAMES of the inputs that arrived and
 * never their values.
 */
describe("a missing-input refusal books the names of what did arrive", () => {
  it("at the HTTP door, names only, sorted, with the value nowhere in the books", async () => {
    const secret = "the-buyer's-own-text-9f3a";
    const response = await SELF.fetch(
      `${BASE}/api/buy/bitcoin_anchor?${new URLSearchParams({ hash: secret, agent_name: "probe" })}`,
      { headers: SIGNED },
    );
    expect(response.status).toBe(400);
    const { declines } = await readDeclines(testEnv);
    const row = declines.find((r) => r.item === "bitcoin_anchor");
    expect(row?.reason).toBe("local:input_missing:digest");
    expect(row?.inputs_present).toEqual(["agent_name", "hash"]);
    expect(row?.reading).toContain("THIS REQUEST ARRIVED WITH: `agent_name`, `hash`");
    for (const raw of await storedRows()) expect(raw).not.toContain(secret);
  });

  it("books the bare door as [] — nothing arrived — which an older row cannot say", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/bitcoin_anchor`, { headers: SIGNED });
    expect(response.status).toBe(400);
    const { declines } = await readDeclines(testEnv);
    const row = declines.find((r) => r.item === "bitcoin_anchor");
    expect(row?.inputs_present).toEqual([]);
    expect(row?.reading).toContain("ARRIVED WITH NO INPUTS AT ALL");
  });

  it("at the MCP door, from the tool arguments, without the shelf selector", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "User-Agent": "node", "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "buy_observation",
          arguments: { item_id: "bitcoin_anchor", hash: "abc", purpose: "why" },
          _meta: { "x402/payment": "not-a-real-payment" },
        },
      }),
    });
    expect(response.status).toBe(200);
    const answer = await response.text();
    const { declines } = await readDeclines(testEnv);
    const row = declines.find((r) => r.item === "bitcoin_anchor");
    expect(row?.reason, answer).toBe("local:input_missing:digest");
    expect(row?.inputs_present).toEqual(["hash", "purpose"]);
  });

  it("leaves the house secret and the attribution markers out, and stays bounded", () => {
    expect(presentInputNames({ house: "secret", src: "x", source: "y", ref: "z", item_id: "hello", url: "https://a.example" })).toEqual(["url"]);
    expect(presentInputNames({ blank: "  ", none: undefined, nil: null, zero: 0 })).toEqual(["zero"]);
    expect(INPUTS_PRESENT_CAP).toBe(8);
    expect(INPUT_NAME_CAP).toBe(40);
  });

  it("caps the count and the length of what one row keeps", async () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, n) => [`p${String(n).padStart(2, "0")}${"x".repeat(60)}`, "v"]));
    await recordPaymentDecline(testEnv, "/api/buy/bitcoin_anchor", "local:input_missing:digest", {
      userAgent: "node",
      inputsPresent: presentInputNames(many),
    });
    const { declines } = await readDeclines(testEnv);
    const row = declines.find((r) => r.item === "bitcoin_anchor");
    expect(row?.inputs_present).toHaveLength(INPUTS_PRESENT_CAP);
    for (const name of row?.inputs_present ?? []) expect(name.length).toBeLessThanOrEqual(INPUT_NAME_CAP);
  });

  it("reads an older row as not recorded, never as nothing", async () => {
    const event: MetricEvent = {
      kind: "decline",
      item: "spot_check",
      channel: "direct",
      house: false,
      note: "local:input_missing:host",
      user_agent: "node",
      at: "2026-09-30T02:27:08.000Z",
    };
    await testEnv.COUNTERS.put(`declevt:${String(10_000_000_000_000 - Date.parse(event.at)).padStart(14, "0")}:old`, JSON.stringify(event));
    const report = await readDeclines(testEnv);
    const row = report.declines.find((r) => r.item === "spot_check");
    expect(row?.inputs_present).toBeUndefined();
    expect(row?.reading).not.toContain("ARRIVED WITH");
    const html = renderDeclinesPage({ report });
    expect(html).toContain("<th>arrived with</th>");
    expect(html).toContain("<em>not recorded</em>");
  });
});
