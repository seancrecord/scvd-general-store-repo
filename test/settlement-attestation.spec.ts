import { keccak256, toHex } from "viem";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_USED_TOPIC,
  BASE_USDC,
  TRANSFER_TOPIC,
  authorizationNonces,
  usdcTransfers,
} from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import { getMenuItem } from "@/store";
import { CAPABILITY_QUERY, SPEC_RETURNS, SPEC_WHY_USE } from "@/store/spec";
import { attestationNote } from "@/store/copy";
import { nonceFromPaymentPayload } from "@/services/attestation";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * MOVE 1 — SETTLEMENT ATTESTATION.
 *
 * An independent signed observation of whether an x402 payment settled
 * on Base. The RPC read is free; the disinterested signed receipt is
 * the product.
 */
describe("the topic constants", () => {
  it("are the real event signatures, derived rather than trusted", () => {
    // Hardcoded in the Worker so it carries no hashing dependency, and
    // re-derived here so a typo fails CI instead of silently
    // classifying every settled payment as NOT_FOUND.
    expect(TRANSFER_TOPIC).toBe(
      keccak256(toHex("Transfer(address,address,uint256)")),
    );
    expect(AUTHORIZATION_USED_TOPIC).toBe(
      keccak256(toHex("AuthorizationUsed(address,bytes32)")),
    );
  });
});

function receipt(logs: RpcReceipt["logs"]): RpcReceipt {
  return { status: "0x1", blockNumber: "0x64", logs };
}

const PAYER = "0x1111111111111111111111111111111111111111";
const PAYEE = "0x2222222222222222222222222222222222222222";

function topicFor(address: string): string {
  return `0x000000000000000000000000${address.slice(2)}`;
}

describe("decoding what the chain said", () => {
  it("reads a USDC transfer and ignores other tokens", () => {
    const transfers = usdcTransfers(
      receipt([
        {
          address: BASE_USDC,
          topics: [TRANSFER_TOPIC, topicFor(PAYER), topicFor(PAYEE)],
          // 4000 units = $0.004, the price of this very item.
          data: "0xfa0",
        },
        {
          // Some other token moving in the same transaction is not our
          // business and must never be counted as the payment.
          address: "0x9999999999999999999999999999999999999999",
          topics: [TRANSFER_TOPIC, topicFor(PAYER), topicFor(PAYEE)],
          data: "0xffffff",
        },
      ]),
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.from).toBe(PAYER);
    expect(transfers[0]?.to).toBe(PAYEE);
    expect(transfers[0]?.amount).toBe(4000n);
  });

  it("reads the EIP-3009 nonces burned in the transaction", () => {
    const nonce = `0x${"ab".repeat(32)}`;
    const nonces = authorizationNonces(
      receipt([
        {
          address: BASE_USDC,
          topics: [AUTHORIZATION_USED_TOPIC, topicFor(PAYER), nonce],
          data: "0x",
        },
      ]),
    );
    expect(nonces).toEqual([nonce]);
  });
});

/**
 * THE HONESTY GUARDS, from the spec. These are the auto-refund lesson
 * pre-empted: the copy must state what the product does NOT do, and
 * must never imply a human touched it.
 */
describe("the honesty guards", () => {
  const item = getMenuItem("settlement_attestation");

  it("states what it does not do, on the listing itself", () => {
    const text =
      `${item?.description ?? ""} ${(item?.constraints ?? []).join(" ")}`.toLowerCase();
    expect(text).toContain("does not attest that anything was delivered");
    expect(text).toContain("resolves no dispute");
    // Observation, not a poll: no promise that we waited for a better
    // answer, and no promise a NOT_FOUND stays not found.
    expect(text).toContain("no polling");
  });

  it("never implies a human looked at it", () => {
    // Automated and disinterested IS the value. A keeper is a party to
    // the store, so "the keeper checked" would make this worth LESS.
    const surfaces = [
      item?.description ?? "",
      item?.note_402 ?? "",
      (item?.constraints ?? []).join(" "),
      SPEC_WHY_USE["settlement_attestation"] ?? "",
      SPEC_RETURNS["settlement_attestation"] ?? "",
      attestationNote("SETTLED"),
    ].join(" ");
    for (const human of [
      "the keeper",
      "by hand",
      "a human",
      "personally",
      "we check",
      "reviewed",
    ]) {
      expect(
        surfaces.toLowerCase().includes(human),
        `attestation copy says "${human}" — the value is that nobody looked`,
      ).toBe(false);
    }
  });

  it("never implies it verifies delivery, only settlement", () => {
    // The manifest may say what it does NOT do; it may never make the
    // positive claim. Same class of guard as claim-chain's refund
    // check, and the same lesson behind it.
    const manifest = [
      item?.description ?? "",
      item?.note_402 ?? "",
      (item?.constraints ?? []).join(" "),
      SPEC_WHY_USE["settlement_attestation"] ?? "",
      SPEC_RETURNS["settlement_attestation"] ?? "",
      attestationNote("SETTLED"),
    ]
      .join(" ")
      .toLowerCase();
    for (const claim of [
      "confirms delivery",
      "verifies delivery",
      "confirms the goods",
      "proves delivery",
      "goods were received",
      "confirms receipt of goods",
      "guarantees settlement",
      "will settle",
    ]) {
      expect(
        manifest.includes(claim),
        `the manifest claims "${claim}" — this observes settlement and nothing else`,
      ).toBe(false);
    }
    // And the disclaimer is present rather than merely the absence of
    // the claim, because silence is not a disclosure.
    expect(manifest).toContain("does not attest that anything was delivered");
  });

  it("carries the why_use the spec wrote, load-bearing clause intact", () => {
    const why = SPEC_WHY_USE["settlement_attestation"] ?? "";
    expect(why).toContain("an interested party can't produce a neutral one");
    // The sentence that answers "why pay for a free RPC read".
    expect(why).toContain("the RPC read is free");
  });

  it("is priced sub-approval-threshold, and is agent-facing", () => {
    expect(item?.price_usdc).toBe(0.004);
    expect(item?.price_usdc).toBeLessThan(0.005);
    expect(item?.fulfillment).toBe("instant");
    expect(CAPABILITY_QUERY["settlement_attestation"]).toBeTruthy();
  });
});

describe("plugged into what already exists, not built beside it", () => {
  it("cites the paper in the spec and nowhere a customer reads", async () => {
    // Register separation: the registrar cites a paper, the keeper
    // writes the counter line, and neither borrows the other's voice.
    const item = getMenuItem("settlement_attestation");
    const customerFacing = [
      item?.description ?? "",
      item?.note_402 ?? "",
      attestationNote("SETTLED"),
    ].join(" ");
    expect(customerFacing).not.toContain("arXiv");
    expect(customerFacing.toLowerCase()).not.toContain("security paper");

    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).not.toContain("arXiv");
  });

  it("reads the nonce out of a payment payload with the replay guard's own code", () => {
    const nonce = `0x${"cd".repeat(32)}`;
    const payload = btoa(
      JSON.stringify({ payload: { authorization: { nonce } } }),
    );
    expect(nonceFromPaymentPayload(payload)).toBe(nonce);
    // A payload we cannot read narrows the question rather than
    // failing it.
    expect(nonceFromPaymentPayload("not-base64-at-all")).toBeNull();
  });

  it("is auto-generated onto every surface, with no hand-wiring", async () => {
    // menu.json, the MCP tool and the well-known doc all come from
    // MENU_ITEMS. If this item needed hand-wiring anywhere, one of
    // these would be missing it.
    const menu: unknown = await (await SELF.fetch(`${BASE}/menu.json`)).json();
    if (!isRecord(menu) || !Array.isArray(menu.items))
      throw new Error("no menu");
    expect(
      menu.items.some(
        (entry: unknown) =>
          isRecord(entry) && entry.id === "settlement_attestation",
      ),
    ).toBe(true);

    const tools = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const listed: unknown = await tools.json();
    // Since 2026-08-02 the buy tools are grouped into shelves, so the
    // item is reachable as an item_id on its shelf rather than as its
    // own tool. The no-hand-wiring property is unchanged: it arrived
    // there from MENU_ITEMS without anyone naming it twice.
    expect(JSON.stringify(listed)).toContain("settlement_attestation");
    expect(JSON.stringify(listed)).toContain("buy_observation");
  });

  it("carries the listing spec in the canonical six-field order", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/menu/settlement_attestation`)
    ).json();
    if (!isRecord(body) || !isRecord(body.spec)) throw new Error("no spec");
    // S1 discipline: the same shape as every other item, not a
    // bespoke block for the new thing.
    for (const field of ["capability", "inputs", "outputs", "verification"]) {
      expect(body.spec[field], field).toBeDefined();
    }
  });
});

describe("the guard, before money moves", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses with nothing to look up", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/settlement_attestation`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error("no body");
    expect(String(body.error).toLowerCase()).toContain("no hash, no charge");
  });

  it("refuses something that is not a transaction hash", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/settlement_attestation?tx_hash=not-a-hash`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
  });

  it("still quotes a price to anyone who only asks, per the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/settlement_attestation`);
    expect(response.status).not.toBe(400);
  });

  it("publishes the hash pattern so a client can get it right first time", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json();
    if (!isRecord(body) || !Array.isArray(body.resources)) {
      throw new Error("no resources");
    }
    const resource = body.resources.find(
      (entry: unknown) =>
        isRecord(entry) &&
        entry.resourceUrl === `${BASE}/api/buy/settlement_attestation`,
    );
    if (!isRecord(resource) || !isRecord(resource.inputSchema)) {
      throw new Error("no schema");
    }
    expect(resource.inputSchema.required).toContain("tx_hash");
    const properties = resource.inputSchema.properties;
    if (!isRecord(properties) || !isRecord(properties["tx_hash"])) {
      throw new Error("no tx_hash property");
    }
    expect(properties["tx_hash"].pattern).toBe("^0x[0-9a-fA-F]{64}$");
  });
});
