import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readDeclines } from "@/lib/declines";
import { buyInputSchema, missingRequiredInputs } from "@/lib/bazaar-discovery";
import { inputAliasesFor, resolveInputRecord, resolvePurchaseArgs } from "@/lib/input-aliases";
import { purchaseInputFrom, queryArgs, toolArgs } from "@/lib/purchase-args";
import { getMenuItem } from "@/store";
import type { Env, MenuItem } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const OUTSIDE = { "User-Agent": "buyer-client/1.0" };
/** A signature-shaped header: the door treats the request as a purchase and validates in full. */
const SIGNED = { ...OUTSIDE, "PAYMENT-SIGNATURE": "not-a-real-signature" };

const ADDRESS = "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7";
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;

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

const item = (id: string): MenuItem => getMenuItem(id) as MenuItem;
const declared = (id: string): string[] => Object.keys(buyInputSchema(item(id)).properties);

async function buy(id: string, query: Record<string, string>, headers: Record<string, string>) {
  const response = await SELF.fetch(`${BASE}/api/buy/${id}?${new URLSearchParams(query)}`, { headers });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

/**
 * A SIBLING DOOR'S NAME FOR THE SAME INPUT (2026-09-28, off the decline
 * desk). `local:input_missing:urls` and `:tx_hashes` were seen from
 * more than one client: a caller that learned ?url= or ?tx_hash= on one
 * door carried it to the sibling and was refused for an input it had
 * brought under the other name. The alias is read as the canonical
 * name; the value crosses verbatim and meets the canonical rule.
 */
describe("which names a door reads as its own", () => {
  it("is the sibling's name, only for a name the door declares, and never one it declares itself", () => {
    expect(inputAliasesFor(declared("research_comparison"), "urls")).toEqual(["url"]);
    expect(inputAliasesFor(declared("provenance_check"), "address")).toEqual(["wallet"]);
    expect(inputAliasesFor(declared("the_statement"), "wallet")).toEqual(["address"]);
    expect(inputAliasesFor(declared("attestation_bundle"), "tx_hashes")).toEqual(["tx_hash"]);
    expect(inputAliasesFor(declared("the_case_file"), "tx_hash")).toEqual(["tx_hashes"]);
    // A name the door does not take has no aliases on that door.
    expect(inputAliasesFor(declared("spot_check"), "host")).toEqual([]);
    expect(inputAliasesFor(declared("spot_check"), "url")).toEqual([]);
    // A door that declared both names of a pair reads each as itself.
    expect(inputAliasesFor(["url", "urls"], "url")).toEqual([]);
    expect(inputAliasesFor(["url", "urls"], "urls")).toEqual([]);
  });

  it("counts the alias as the required input being present", () => {
    expect(missingRequiredInputs(item("research_comparison"), { url: "https://a.example/x" })).toEqual([]);
    expect(missingRequiredInputs(item("research_comparison"), {})).toEqual(["urls"]);
    expect(missingRequiredInputs(item("research_comparison"), { url: "  " })).toEqual(["urls"]);
    expect(missingRequiredInputs(item("attestation_bundle"), { tx_hash: `${HASH_A},${HASH_B}` })).toEqual([]);
    expect(missingRequiredInputs(item("the_case_file"), { tx_hashes: HASH_A })).toEqual([]);
    expect(missingRequiredInputs(item("the_statement"), { address: ADDRESS })).toEqual([]);
    expect(missingRequiredInputs(item("provenance_check"), { wallet: ADDRESS })).toEqual([]);
    expect(missingRequiredInputs(item("good_buyer"), { urls: "https://a.example/x" })).toEqual([]);
  });

  it("lets the canonical name win when both are supplied, and never removes the alias key", () => {
    const record = resolveInputRecord(declared("research_comparison"), { urls: "canonical", url: "alias" });
    expect(record.urls).toBe("canonical");
    expect(record.url).toBe("alias");
    const blankCanonical = resolveInputRecord(declared("the_case_file"), { tx_hash: "", tx_hashes: HASH_A });
    expect(blankCanonical.tx_hash).toBe(HASH_A);
  });

  it("reads the same way through both doors' argument readers", () => {
    const http = resolvePurchaseArgs(declared("the_statement"), queryArgs((name) => ({ address: ADDRESS })[name]));
    expect(http.get("wallet")).toBe(ADDRESS);
    expect(http.field("wallet")).toBe("wallet query parameter (read from your address)");
    const mcp = resolvePurchaseArgs(declared("attestation_bundle"), toolArgs({ tx_hash: `${HASH_A},${HASH_B}` }));
    expect(mcp.get("tx_hashes")).toBe(`${HASH_A},${HASH_B}`);
    expect(mcp.has?.("tx_hashes")).toBe(true);
    expect(mcp.raw?.("tx_hashes")).toBe(`${HASH_A},${HASH_B}`);
    // Supplied under its own name, the label is the plain one.
    const plain = resolvePurchaseArgs(declared("the_statement"), queryArgs((name) => ({ wallet: ADDRESS })[name]));
    expect(plain.field("wallet")).toBe("wallet query parameter");
  });
});

describe("fulfillment reads the canonical field whichever name the buyer used", () => {
  it("so the certificate never learns the spelling", () => {
    const via = (id: string, query: Record<string, string>) =>
      purchaseInputFrom(item(id), queryArgs((name) => query[name]));
    expect(via("the_statement", { address: ADDRESS }).statementWallet).toBe(ADDRESS);
    expect(via("operator_statement", { address: ADDRESS }).statementWallet).toBe(ADDRESS);
    expect(via("provenance_check", { wallet: ADDRESS }).subjectAddress).toBe(ADDRESS);
    expect(via("research_comparison", { url: "https://a.example/x" }).comparisonUrls).toBe("https://a.example/x");
    expect(via("good_buyer", { urls: "https://a.example/x" }).targetUrl).toBe("https://a.example/x");
    expect(via("attestation_bundle", { tx_hash: `${HASH_A},${HASH_B}` }).bundleTxHashes).toEqual([HASH_A, HASH_B]);
    expect(via("the_case_file", { tx_hashes: HASH_A }).caseFileInput?.txHash).toBe(HASH_A);
    // The same through the MCP reader.
    expect(purchaseInputFrom(item("the_statement"), toolArgs({ address: ADDRESS })).statementWallet).toBe(ADDRESS);
  });
});

describe("the alias meets the canonical field's own validation, at the HTTP door", () => {
  it("refuses a bad address the same way under either name, and books the canonical field", async () => {
    const asWallet = await buy("the_statement", { wallet: "not-an-address" }, SIGNED);
    const asAddress = await buy("the_statement", { address: "not-an-address" }, SIGNED);
    expect(asWallet.status).toBe(400);
    expect(asAddress.status).toBe(400);
    expect(asAddress.body.code).toBe(asWallet.body.code);
    expect(asAddress.body.input_field).toBe("wallet");
    expect(asAddress.body.charged).toBe(false);
    expect(String(asAddress.body.error)).toContain("(read from your address)");
    const { declines } = await readDeclines(testEnv);
    const reasons = declines.filter((row) => row.item === "the_statement").map((row) => row.reason);
    expect(reasons).toHaveLength(2);
    expect(new Set(reasons)).toEqual(new Set(["local:input_invalid:wallet"]));
  });

  it("holds a single url sent to research_comparison to the urls rule, not to absence", async () => {
    const { status, body } = await buy("research_comparison", { url: "https://a.example/x" }, SIGNED);
    expect(status).toBe(400);
    expect(body.input_field).toBe("urls");
    expect(body.charged).toBe(false);
    const { declines } = await readDeclines(testEnv);
    const row = declines.find((r) => r.item === "research_comparison");
    expect(row?.reason).toBe("local:input_invalid:urls");
  });

  it("passes a sheaf sent as tx_hash through to the gate exactly as tx_hashes does", async () => {
    const canonical = await buy("attestation_bundle", { tx_hashes: `${HASH_A},${HASH_B}` }, SIGNED);
    const alias = await buy("attestation_bundle", { tx_hash: `${HASH_A},${HASH_B}` }, SIGNED);
    // Past input validation, the fake signature is the gate's to refuse: a 402, never a 400.
    expect(canonical.status).toBe(402);
    expect(alias.status).toBe(canonical.status);
    expect(alias.body.input_field).toBeUndefined();
    const { declines } = await readDeclines(testEnv);
    expect(declines.filter((r) => r.reason.startsWith("local:input_"))).toEqual([]);
  });

  it("treats an unsigned ask that brought the input under the sibling's name as a composed purchase", async () => {
    // Not a probe: validated in full, and a valid target still gets its 402.
    const composed = await buy("good_buyer", { urls: "https://example.com/door" }, OUTSIDE);
    expect(composed.status).toBe(402);
    // A blank alias is still a probe, and a probe still quotes.
    const probe = await buy("good_buyer", { urls: "" }, OUTSIDE);
    expect(probe.status).toBe(402);
  });
});

describe("the MCP door reads the same aliases", () => {
  it("quotes the statement for an address sent as address", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { ...OUTSIDE, "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "buy_observation", arguments: { item_id: "the_statement", address: ADDRESS } },
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    const error = payload["error"] as Record<string, unknown> | undefined;
    const data = error?.["data"] as Record<string, unknown> | undefined;
    expect(data?.["x402/payment-required"], JSON.stringify(payload).slice(0, 300)).toBeTruthy();
    expect(data?.["input_field"]).toBeUndefined();
  });
});

describe("the 402 names the aliases beside the canonical requirement", () => {
  it("under input_aliases, only where the door has one", async () => {
    const comparison = await buy("research_comparison", {}, OUTSIDE);
    expect(comparison.status).toBe(402);
    expect(comparison.body.required_params).toEqual(["urls"]);
    expect(comparison.body.input_aliases).toEqual({ urls: ["url"] });
    const caseFile = await buy("the_case_file", {}, OUTSIDE);
    expect(caseFile.body.input_aliases).toEqual({ tx_hash: ["tx_hashes"] });
    const spot = await buy("spot_check", {}, OUTSIDE);
    expect(spot.body.required_params).toEqual(["host"]);
    expect(spot.body.input_aliases).toBeUndefined();
    // The published input schema is untouched: it documents the canonical name alone.
    const schema = buyInputSchema(item("research_comparison"));
    expect(Object.keys(schema.properties)).toContain("urls");
    expect(Object.keys(schema.properties)).not.toContain("url");
  });
});
