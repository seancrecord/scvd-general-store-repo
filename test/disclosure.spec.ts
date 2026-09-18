import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { purchaseInputFrom, toolArgs, queryArgs } from "@/lib/purchase-args";
import {
  DISCLOSURE_FIELDS,
  DISCLOSURE_PROPERTIES,
  censusValue,
  readDisclosure,
  returningVerdict,
} from "@/lib/disclosure";
import { canonicalAddress } from "@/lib/addresses";
import { DISCLOSURE_VALUE_CAP, readDisclosureCensus, recordDisclosure } from "@/services/disclosure-census";
import { getMenuItem } from "@/store";
import { isRecord } from "@/types";
import type { Env } from "@/types";
import { TEST_PAYER, installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

/**
 * THE DISCLOSURE BLOCK, held together (2026-09-18).
 *
 * The finding it answers: six cold walkers read everything, took six
 * usable quotes, and supplied no name, no purpose, no operator — the
 * fields existed, optional and unexplained. So the block is one flat
 * set of strings on every door a buyer meets, each saying what it
 * changes (nothing about price, delivery, credit or the certificate),
 * and every call is counted whether or not it filled a field, so the
 * rate of disclosure always has its denominator beside it.
 */

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  for (const key of listed.keys) {
    if (key.name.includes(":disclosure:")) await testEnv.COUNTERS.delete(key.name);
  }
});

const IMPERATIVE_OPENERS = [
  "leave", "omit", "pass", "call", "use", "send", "set", "ignore",
  "prefer", "keep", "add", "supply", "provide", "include", "always",
  "never", "do", "don't", "must", "should",
];
function openers(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+/)
    .map((sentence) => (sentence.trim().split(/[\s,:]+/)[0] ?? "").replace(/[^A-Za-z']/g, "").toLowerCase())
    .filter(Boolean);
}

describe("the ask rides every door in one shape", () => {
  it("every paid item's input schema carries the six fields, none of them required", () => {
    for (const item of MENU_ITEMS) {
      const schema = buyInputSchema(item);
      for (const field of DISCLOSURE_FIELDS) {
        expect(schema.properties[field], `${item.id} lacks ${field}`).toBeDefined();
        expect(schema.required ?? [], `${item.id} requires ${field}`).not.toContain(field);
      }
    }
  });

  it("the three pre-payment instruments carry the same fields", () => {
    const tools = mcpToolCatalog(BASE);
    for (const name of ["preflight_endpoint", "look_at_door", "check_before_you_pay"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      const properties = (tool!.inputSchema as { properties: Record<string, unknown> }).properties;
      for (const field of DISCLOSURE_FIELDS) expect(properties[field], `${name} lacks ${field}`).toBeDefined();
    }
  });

  it("every description is under the parameter guidance and opens with no order", () => {
    for (const field of DISCLOSURE_FIELDS) {
      const description = DISCLOSURE_PROPERTIES[field]["description"] as string;
      expect(description.length, field).toBeLessThanOrEqual(150);
      expect(openers(description).filter((w) => IMPERATIVE_OPENERS.includes(w)), field).toEqual([]);
    }
  });

  it("openapi.json carries the block once, as a component every paid door composes", async () => {
    const doc = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
      paths: Record<string, { get?: Record<string, unknown> }>;
    };
    const block = doc.components.schemas["DisclosureBlock"];
    expect(block).toBeDefined();
    for (const field of DISCLOSURE_FIELDS) expect(block!.properties?.[field], field).toBeDefined();
    const info = doc.paths["/api/buy/hello"]?.get?.["x-payment-info"] as { input: { schema: Record<string, unknown> } };
    expect(info.input.schema["allOf"]).toEqual([{ $ref: "#/components/schemas/DisclosureBlock" }]);
    expect(info.input.schema["unevaluatedProperties"]).toBe(false);
    // Inlined per door it would not fit the read budget; the readability test holds the number.
  });
});

describe("reading the block", () => {
  it("reads what was said, on either door, and nothing that was not", () => {
    const item = getMenuItem("hello")!;
    const mcp = purchaseInputFrom(item, toolArgs({
      model: " Claude-Opus-5 ", client: "claude-code", operator: "Record Creative Co.",
      operator_kind: "company", came_from: "https://cursor.directory/plugins/scvd?ref=x", prior_cert_id: "CERT_4dww28dx5j",
    }));
    expect(mcp.disclosure).toEqual({
      model: "Claude-Opus-5", client: "claude-code", operator: "Record Creative Co.",
      operator_kind: "company", came_from: "https://cursor.directory/plugins/scvd?ref=x", prior_cert_id: "cert_4dww28dx5j",
    });
    const http = purchaseInputFrom(item, queryArgs((name) => ({ model: "gpt-5.6" } as Record<string, string>)[name]));
    expect(http.disclosure).toEqual({ model: "gpt-5.6" });
    expect(purchaseInputFrom(item, toolArgs({})).disclosure).toBeUndefined();
  });

  it("narrows a malformed value to nothing rather than refusing", () => {
    const told = readDisclosure((name) => ({ operator_kind: "cartel", prior_cert_id: "not-a-cert", model: 42, client: "<b>cursor</b>" } as Record<string, unknown>)[name]);
    expect(told).toEqual({ client: "cursor" });
  });

  it("verifies a prior certificate by payer, never by its word", () => {
    expect(returningVerdict("0xABC", "0xabc", canonicalAddress)).toBe("verified");
    expect(returningVerdict("0xabc", "0xdef", canonicalAddress)).toBe("payer_mismatch");
    expect(returningVerdict(null, "0xabc", canonicalAddress)).toBe("not_found");
    expect(returningVerdict("0xabc", undefined, canonicalAddress)).toBe("no_payer");
  });

  it("keeps software as a value and never a person or a wallet join", () => {
    expect(censusValue("model", " Claude Opus 5 ")).toBe("claude-opus-5");
    expect(censusValue("came_from", "https://cursor.directory/plugins/x?token=abc")).toBe("cursor.directory");
    expect(censusValue("came_from", "another agent")).toBe("another-agent");
    expect(censusValue("operator", "Sean")).toBeUndefined();
    expect(censusValue("prior_cert_id", "cert_x")).toBeUndefined();
  });
});

describe("the census counts the ignores beside the answers", () => {
  it("offered, disclosed and ignored add up, per door, with values capped", async () => {
    expect(await readDisclosureCensus(testEnv, "free")).toMatchObject({ offered: 0, disclosed: 0, ignored: 0 });
    await recordDisclosure(testEnv, "free", {});
    await recordDisclosure(testEnv, "free", { model: "claude-opus-5", operator: "somebody" });
    await recordDisclosure(testEnv, "free", { model: "claude-opus-5", came_from: "https://skills.sh/x" });
    const free = await readDisclosureCensus(testEnv, "free");
    expect(free.offered).toBe(3);
    expect(free.disclosed).toBe(2);
    expect(free.ignored).toBe(1);
    expect(free.supplied.model).toBe(2);
    expect(free.supplied.operator).toBe(1);
    expect(free.values.model).toEqual({ "claude-opus-5": 2 });
    expect(free.values.came_from).toEqual({ "skills.sh": 1 });
    expect(free.values.operator).toBeUndefined();
    // The doors share no denominator, so they share no key.
    expect((await readDisclosureCensus(testEnv, "paid")).offered).toBe(0);

    for (let i = 0; i < DISCLOSURE_VALUE_CAP + 3; i += 1) {
      await recordDisclosure(testEnv, "paid", { client: `client-${i}` }, i === 0 ? "verified" : undefined);
    }
    const paid = await readDisclosureCensus(testEnv, "paid");
    expect(Object.keys(paid.values.client ?? {}).length).toBe(DISCLOSURE_VALUE_CAP + 1);
    expect(paid.values.client?.["other"]).toBe(3);
    expect(paid.returning).toEqual({ verified: 1 });
  });

  it("a free HTTP door counts the call whether or not the block was filled", async () => {
    await SELF.fetch(`${BASE}/api/preflight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://nothing-here.invalid/api/x", model: "gpt-5.6", operator_kind: "solo" }),
    });
    await SELF.fetch(`${BASE}/api/preflight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://nothing-here.invalid/api/x" }),
    });
    const free = await readDisclosureCensus(testEnv, "free");
    expect(free.offered).toBe(2);
    expect(free.disclosed).toBe(1);
    expect(free.values.model).toEqual({ "gpt-5.6": 1 });
    expect(free.values.operator_kind).toEqual({ solo: 1 });
  });
});

describe("at the till", () => {
  async function buy(query: string): Promise<Record<string, unknown>> {
    const url = `${BASE}/api/buy/hello${query}`;
    const quote = await SELF.fetch(url);
    expect(quote.status).toBe(402);
    const challenge = decodePaymentRequired(quote);
    const paid = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) },
    });
    expect(paid.status, await paid.clone().text()).toBe(200);
    return (await paid.json()) as Record<string, unknown>;
  }

  it("a buyer who says nothing gets no block, is counted, and pays the same", async () => {
    const quiet = await buy("");
    expect(quiet["disclosure"]).toBeUndefined();
    expect((await readDisclosureCensus(testEnv, "paid")).ignored).toBe(1);
  });

  it("a buyer who tells us is answered with what was recorded, and the prior certificate is checked by payer", async () => {
    const first = await buy("?model=claude-opus-5&client=claude-code");
    const firstBlock = first["disclosure"] as Record<string, unknown>;
    expect(firstBlock["recorded"]).toEqual(["model", "client"]);
    expect(firstBlock["returning"]).toBeUndefined();
    expect(String(firstBlock["changed"])).toContain("Same price");
    const certId = String(first["cert_id"] ?? (first["certificate"] as Record<string, unknown> | undefined)?.["cert_id"] ?? "");
    expect(certId.startsWith("cert_"), JSON.stringify(Object.keys(first))).toBe(true);

    const second = await buy(`?prior_cert_id=${certId}&came_from=memory`);
    const secondBlock = second["disclosure"] as Record<string, unknown>;
    expect(secondBlock["returning"]).toBe("verified");
    expect(String(secondBlock["returning_means"])).toContain("one buyer");

    const stranger = await buy(`?prior_cert_id=cert_doesnotexist1`);
    expect((stranger["disclosure"] as Record<string, unknown>)["returning"]).toBe("not_found");

    const paid = await readDisclosureCensus(testEnv, "paid");
    expect(paid.offered).toBe(3);
    expect(paid.disclosed).toBe(3);
    expect(paid.returning).toEqual({ verified: 1, not_found: 1 });
    expect(paid.values.came_from).toEqual({ memory: 1 });
    // Nothing a buyer told us reaches the certificate.
    const cert = (await (await SELF.fetch(`${BASE}/api/verify/${certId}`)).json()) as Record<string, unknown>;
    expect(JSON.stringify(cert)).not.toContain("claude-code");
    expect(TEST_PAYER.length).toBe(42);
  });

  it("the keeper's page renders both doors with their denominators", async () => {
    await recordDisclosure(testEnv, "free", { model: "claude-opus-5" });
    const page = await SELF.fetch(`${BASE}/admin/disclosure`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("offered the block");
    expect(html).toContain("the ignores");
    expect(html).toContain("claude-opus-5 ×1");
    expect(html).toContain("counted, never listed");
  });

  it("the free tools over MCP count the call too", async () => {
    const res = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "preflight_endpoint", arguments: { url: "https://nothing-here.invalid/api/x", client: "cursor" } } }),
    });
    expect(res.status).toBeLessThan(500);
    const free = await readDisclosureCensus(testEnv, "free");
    expect(free.offered).toBe(1);
    expect(free.values.client).toEqual({ cursor: 1 });
    expect(isRecord(free.values)).toBe(true);
  });
});
