import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { purchaseInputFrom } from "@/lib/purchase-args";
import type { MenuItem } from "@/types";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => {
  facilitator = installFacilitatorMock();
});

/**
 * ONE DOOR LAW, TWO DOORS (2026-09-04, from CV's field notes).
 *
 * A bitcoin_anchor bought over MCP settled, minted a certificate, and
 * then died in the goods step — "reached goods with no digest" — and
 * answered 500. Money moved, patron #195 was issued, nothing was
 * delivered; the keeper finished it by hand. The digest had been sent.
 * The MCP tool's own schema required it. The MCP door read five
 * arguments by name and dropped every other one on the floor, while
 * the HTTP door ran twenty-three checks and mapped sixty lines of
 * query parameters. The same session's attestation_bundle had gone
 * the same way, and a statement and a mandate bought over MCP had
 * "worked" by signing a statement about no wallet and a mandate with
 * no text.
 *
 * Main fixed the same defect the same day (lib/purchase-args.ts, one
 * law and one map for both doors); this file is the guard that would
 * have caught all four against that map, in three
 * parts: the mapping reads every field a shelf advertises (derived
 * from the schema, per item, so a field added next month is caught
 * the day it ships); the MCP door refuses a bad input before any
 * settlement and delivers a good one; and the anchor itself, over
 * MCP, ends holding the digest.
 */

const DIGEST = "ab".repeat(32);

function rpc(params: Record<string, unknown>): Promise<Response> {
  return SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params }),
  });
}

async function paymentFor(path: string): Promise<Record<string, unknown>> {
  const challenge = decodePaymentRequired(await SELF.fetch(`${BASE}${path}`));
  return JSON.parse(atob(buildPaymentSignature(challenge.accepts[0]!))) as Record<
    string,
    unknown
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The goods out of a tools/call result, however the door wraps them. */
function goodsOf(body: Record<string, unknown>): Record<string, unknown> {
  const result = body["result"];
  if (!isRecord(result)) {
    throw new Error(`not a result: ${JSON.stringify(body).slice(0, 300)}`);
  }
  if (isRecord(result["structuredContent"])) return result["structuredContent"];
  const content = result["content"] as Array<{ text?: string }>;
  return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
}

/**
 * The fields of `advertised` the mapping never asks for. A field the
 * schema names and the till never receives is the defect itself,
 * whichever door it arrived through.
 */
function droppedFields(item: MenuItem, advertised: string[]): string[] {
  const asked = new Set<string>();
  purchaseInputFrom(item, {
    get: (name) => {
      asked.add(name);
      return undefined;
    },
    field: (name) => name,
  });
  return advertised.filter((field) => !asked.has(field));
}

describe("every field a shelf advertises reaches the till", () => {
  it("the guard sees a dropped field at all, or it guards nothing", () => {
    // Rule 46: a guard whose failing state was never witnessed is a
    // guard nobody has checked. A field no mapping reads must show.
    const anchor = MENU_ITEMS.find((item) => item.id === "bitcoin_anchor")!;
    expect(droppedFields(anchor, ["digest", "a_field_nobody_reads"])).toEqual([
      "a_field_nobody_reads",
    ]);
  });

  for (const item of MENU_ITEMS) {
    it(`${item.id}: the mapping reads each field its schema names`, () => {
      const advertised = Object.keys(buyInputSchema(item).properties);
      expect(advertised.length).toBeGreaterThan(0);
      expect(
        droppedFields(item, advertised),
        `${item.id} advertises a field the till never receives — the MCP anchor's defect, on a new field`,
      ).toEqual([]);
    });
  }
});

describe("the MCP door refuses a bad input before any money moves", () => {
  it("refuses a missing digest, and says so in the door's own dialect", async () => {
    const settlesBefore = facilitator.settleCalls;
    const body = (await (
      await rpc({
        name: "buy_observation",
        arguments: { item_id: "bitcoin_anchor" },
      })
    ).json()) as Record<string, unknown>;
    const error = body["error"] as Record<string, unknown>;
    expect(error["code"]).toBe(-32602);
    const data = error["data"] as Record<string, unknown>;
    expect(data["code"]).toBe("bad_request");
    expect(data["charged"]).toBe(false);
    expect(String(error["message"])).toContain("never see your bytes");
    // The same sentence the HTTP door says, in the vocabulary an MCP
    // caller reads: arguments, not query parameters.
    expect(String(error["message"])).toContain("digest argument");
    expect(String(error["message"])).not.toContain("query parameter");
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("refuses a malformed digest even with a signed payment in hand — no settle call", async () => {
    const settlesBefore = facilitator.settleCalls;
    const payment = await paymentFor(`/api/buy/bitcoin_anchor?digest=${DIGEST}`);
    const body = (await (
      await rpc({
        name: "buy_observation",
        arguments: { item_id: "bitcoin_anchor", digest: `0x${DIGEST}` },
        _meta: { "x402/payment": payment },
      })
    ).json()) as Record<string, unknown>;
    const error = body["error"] as Record<string, unknown>;
    expect(error["code"]).toBe(-32602);
    expect(String(error["message"])).toContain("no 0x prefix");
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });

  it("runs the whole law, not five items of it", async () => {
    const settlesBefore = facilitator.settleCalls;
    const cases: Array<{ args: Record<string, unknown>; says: string }> = [
      // The sheaf CV's earlier run lost the same way as the anchor.
      {
        args: { item_id: "attestation_bundle", tx_hashes: `0x${"ab".repeat(32)}` },
        says: "The sheaf takes",
      },
      // A statement over MCP used to sign a statement about no wallet.
      { args: { item_id: "the_statement" }, says: "No wallet, no charge" },
      // A mandate over MCP used to sign a mandate with no text.
      { args: { item_id: "the_mandate" }, says: "Nothing to record, no charge" },
      // The probe law: our own hostname is refused on this door too.
      {
        args: { item_id: "service_audit", url: `${BASE}/api/buy/hello` },
        says: "own hostname",
      },
    ];
    for (const { args, says } of cases) {
      const body = (await (
        await rpc({ name: "buy_observation", arguments: args })
      ).json()) as Record<string, unknown>;
      const error = body["error"] as Record<string, unknown> | undefined;
      expect(error, `${String(args["item_id"])} was not refused`).toBeTruthy();
      expect(String(error!["message"]), String(args["item_id"])).toContain(says);
      expect((error!["data"] as Record<string, unknown>)["charged"]).toBe(false);
    }
    expect(facilitator.settleCalls).toBe(settlesBefore);
  });
});

describe("what an MCP buyer sends is what the till signs", () => {
  it("a bitcoin anchor bought over MCP ends holding the digest", async () => {
    const payment = await paymentFor(
      `/api/buy/bitcoin_anchor?digest=${DIGEST}&label=field-notes`,
    );
    const response = await rpc({
      name: "buy_observation",
      arguments: { item_id: "bitcoin_anchor", digest: DIGEST, label: "field-notes" },
      _meta: { "x402/payment": payment },
    });
    // The failure this file exists for was a 500 after settlement.
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"], JSON.stringify(body).slice(0, 300)).toBeUndefined();
    const goods = goodsOf(body);
    expect(goods["digest"]).toBe(DIGEST);
    expect(String(goods["anchor_id"])).toMatch(/^banchor_/);
    // The certificate binds the buyer's digest, on this door as on
    // the other: /api/verify vouches for it without a second endpoint.
    // (The MCP door flattens the certificate to its id; the artifact
    // itself is read back from the verify endpoint, which is the read
    // that matters anyway.)
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${String(goods["cert_id"])}`)
    ).json()) as Record<string, unknown>;
    expect(verify["valid"]).toBe(true);
    expect((verify["certificate"] as Record<string, unknown>)["attests"]).toBe(DIGEST);
  });

  it("a mandate bought over MCP records the text that was sent", async () => {
    const text = "Buy nothing over one dollar without asking Kit first.";
    const payment = await paymentFor(
      `/api/buy/the_mandate?mandate=${encodeURIComponent(text)}`,
    );
    const body = (await (
      await rpc({
        name: "buy_observation",
        arguments: { item_id: "the_mandate", mandate: text, submitted_as: "principal" },
        _meta: { "x402/payment": payment },
      })
    ).json()) as Record<string, unknown>;
    expect(body["error"], JSON.stringify(body).slice(0, 300)).toBeUndefined();
    const goods = goodsOf(body);
    const mandate = goods["mandate"] as Record<string, unknown>;
    expect(mandate["mandate_text"]).toBe(text);
  });
});
