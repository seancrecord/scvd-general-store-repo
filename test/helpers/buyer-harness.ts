import { createExecutionContext, env, runInDurableObject, waitOnExecutionContext } from "cloudflare:test";
import { afterAll, beforeAll, beforeEach, expect, vi } from "vitest";
import { app } from "@/index";
import { MENU_ITEMS } from "@/store";
import { KV_KEYS } from "@/lib/kv-keys";
import { encodeBase58 } from "@/lib/base58";
import { acceptedNetworks, POLYGON_NETWORK } from "@/lib/payments";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./facilitator-mock";
import { buildPaymentSignature, type ChallengeRequirement } from "./payment";
import { AGENT, CARD_URL, fixture as a2aFixture } from "./a2a-fixture";

// An acceptance audit, intentionally stricter than the existing probe rule.
// No production validator or argument mapper is used as the test's oracle.
// Prices/fields/tools come from the actual served catalog and tools/list.
// The facilitator is a local double: this measures settlement calls, NOT chain finality.
export const BASE = "https://scvd.store";
export const NOW = new Date("2026-09-05T12:00:00Z");
export const SOL = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
export type Obj = Record<string, unknown>;
export type Schema = { properties: Record<string, Obj>; required?: string[]; allOf?: Obj[]; examples?: Obj[] };
export type Item = { id: string; buy_url: string; spec: { inputs: Schema }; price_usdc: number };
export type Tool = { name: string; inputSchema: Schema };
export type Door = "http" | "mcp";
export type Reading = { protocolError: boolean; status: number; code: unknown; charged: unknown; message: string; quote: boolean; verifies: number; settles: number; writes: string[]; body: Obj; offers: ChallengeRequirement[] };
export const object = (value: unknown): Obj => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
export let items: Item[] = [];
export let tools: Tool[] = [];
export let facilitator: ReturnType<typeof installFacilitatorMock>;
let writes: string[] = [];
let rpcId = 0;
export const sourceEnv = env as unknown as Env;
export const testEnv: Env = { ...sourceEnv, SOLANA_PAY_TO: SOL,
  POLYGON_PAY_TO: "0x1111111111111111111111111111111111111111",
  // Public, disposable fixture key. All egress is intercepted, including field spending.
  FIELD_WALLET_KEY: `0x${"01".repeat(32)}`,
};
for (const name of ["ORDERS", "PATRONS", "GUESTBOOK", "COUNTERS"] as const) {
  testEnv[name] = new Proxy(sourceEnv[name], { get(target, prop) {
    const member = Reflect.get(target, prop);
    if (prop === "put" || prop === "delete") return async (...args: unknown[]) => {
      // Refusal/challenge telemetry in COUNTERS is allowed. All business stores
      // and the patron allocator are observed, including transient writes.
      if (name !== "COUNTERS" || args[0] === KV_KEYS.patronNumber) writes.push(`${name}:${String(args[0])}`);
      return Reflect.apply(member, target, args);
    };
    return typeof member === "function" ? member.bind(target) : member;
  } });
}
export async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(new URL(path, BASE), init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
export function shelves(item: Item): Tool[] {
  return tools.filter(tool => (tool.inputSchema.properties.item_id?.enum as unknown[] | undefined)?.includes(item.id));
}
export function requirements(schema: Schema, id: string): string[] {
  const required = new Set(schema.required ?? []);
  for (const branch of schema.allOf ?? []) {
    const condition = object(object(object(branch.if).properties).item_id);
    if (condition.const === id) for (const field of object(branch.then).required as string[] ?? []) required.add(field);
  }
  required.delete("item_id");
  return [...required].sort();
}
// Independent buyer inputs. These are examples, not a second paid-item roster.
export const values: Obj = {
  url: "https://buyer-fixture.example/api/paid", host: "buyer-fixture.example",
  address: "0x1111111111111111111111111111111111111111",
  wallet: "0x2222222222222222222222222222222222222222",
  tx_hash: `0x${"ab".repeat(32)}`, tx_hashes: `0x${"ab".repeat(32)},0x${"cd".repeat(32)}`,
  digest: "ab".repeat(32), summary: "Ada awaits Bea's signed reading of the launch endpoint.",
  mandate: "Observe the launch endpoint. Spend at most one dollar.", confession: "I claimed the build was done before checking it.",
  win: "The build shipped.", tag: "Ada was here", detail: "Read this door and return the transcript.",
};
export function baseline(item: Item): Obj {
  return Object.fromEntries((item.spec.inputs.required ?? []).map(field => {
    if (!(field in values)) throw new Error(`No independent valid input for new required field ${item.id}.${field}`);
    return [field, item.id === "a2a_repair_kit" && field === "url" ? CARD_URL : values[field]];
  }));
}
export function signature(offer: ChallengeRequirement): string {
  // The basic harness mocks verification, but the intent journal now reads
  // real wire framing. Use a unique framed message instead of arbitrary text.
  // Payment-valid signatures and instructions belong to buyer-signed-payments.
  const solana = new Uint8Array(134);
  solana[0] = 1;
  solana.set([1, 0, 0, 1], 65);
  solana.set(crypto.getRandomValues(new Uint8Array(32)), 101);
  return offer.network.startsWith("solana:")
    ? btoa(JSON.stringify({ x402Version: 2, accepted: offer, payload: { transaction: btoa(String.fromCharCode(...solana)) } }))
    : buildPaymentSignature(offer);
}
export async function call(item: Item, door: Door, args: Obj, tool?: Tool, payment?: string, key?: string): Promise<Reading> {
  writes = [];
  const v = facilitator.verifyCalls, s = facilitator.settleCalls;
  const query = new URLSearchParams(Object.entries(args).map(([k, value]) => [k, String(value)]));
  const response = door === "http"
    ? await request(`${item.buy_url}?${query}`, { headers: { ...(payment ? { "PAYMENT-SIGNATURE": payment } : {}), ...(key ? { "Idempotency-Key": key } : {}) } })
    : await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool!.name, arguments: { item_id: item.id, ...args }, ...(payment ? { _meta: { "x402/payment": payment, "x402/idempotency-key": key } } : {}) } }) });
  const raw = object(await response.json());
  const error = object(raw.error), data = object(error.data);
  const body = door === "http" ? raw : Object.keys(error).length ? data : object(object(raw.result).structuredContent);
  const encoded = response.headers.get("PAYMENT-REQUIRED");
  const challenge = encoded ? object(JSON.parse(atob(encoded))) : object(data["x402/payment-required"]);
  return { protocolError: door === "http" ? response.status >= 400 : Object.keys(error).length > 0 || object(raw.result).isError === true, status: door === "http" ? response.status : Number(error.code ?? response.status), code: body.code,
    charged: body.charged, message: String(door === "http" ? raw.error ?? "" : error.message ?? ""),
    quote: encoded !== null || error.code === 402, verifies: facilitator.verifyCalls - v,
    settles: facilitator.settleCalls - s, writes: [...writes], body,
    offers: (challenge.accepts ?? []) as ChallengeRequirement[] };
}
export async function clean(): Promise<void> {
  // The clock is fixed across cases; each buyer gets a fresh admission budget.
  const budget = sourceEnv.A2A_KITS!.get(sourceEnv.A2A_KITS!.idFromName("a2a-free-budget"));
  await runInDurableObject(budget, async (_instance, state) => state.storage.deleteAll());
  for (const ns of [sourceEnv.ORDERS, sourceEnv.PATRONS, sourceEnv.GUESTBOOK, sourceEnv.COUNTERS]) {
    let cursor: string | undefined;
    do {
      const page = await ns.list({ cursor });
      await Promise.all(page.keys.map(key => ns.delete(key.name)));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  await sourceEnv.COUNTERS.put(KV_KEYS.keeperLastSeen, NOW.toISOString());
  // Make the profile's readiness precondition real, so a closed fixture does
  // not masquerade as validation. The corpus remains a local unsigned fixture.
  await sourceEnv.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000001`, JSON.stringify({
    snapshot: { version: 1, sequence: 1, taken_at: NOW.toISOString(), previous_digest: null, source: "ward_round", week: "2026-W36",
      round: { week: "2026-W36", at: NOW.toISOString(), listed_resources: 1, coverage_suspect: false, capped: false, our_search_presence: true,
        hosts: [{ host: "buyer-fixture.example", url: values.url, verdict: "ready", failed: [], advisories: [] }] } },
    digest: "0".repeat(64), signature: "0".repeat(128), public_key: "0".repeat(64),
  }));
}
export function installBuyerHarness(): void {
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  facilitator = installFacilitatorMock();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    // A2A includes deliberately invalid JSON. Handle its operator-owned fixture
    // before the chain-RPC parser so the test observes the protocol's response.
    if (url.origin === AGENT) return a2aFixture().fetchImpl(url.href, init);
    if (url.pathname.endsWith("/x402/supported")) {
      const response = await inner(input, init);
      const supported = object(await response.json());
      (supported.kinds as Obj[]).push({ x402Version: 2, scheme: "exact", network: POLYGON_NETWORK });
      return Response.json(supported);
    }
    if (init?.body && typeof init.body === "string") {
      const json: unknown = JSON.parse(init.body);
      const batch = Array.isArray(json) ? json : [json];
      if (batch.every(entry => typeof object(entry).method === "string" && String(object(entry).method).startsWith("eth_"))) {
        const results = batch.map(entry => {
          const rpc = object(entry);
          const answers: Obj = { eth_blockNumber: "0x2ff0000", eth_getTransactionReceipt: null, eth_getLogs: [], eth_chainId: "0x2105", eth_call: `0x${"0".repeat(64)}` };
          if (!(String(rpc.method) in answers)) throw new Error(`Unmocked RPC: ${String(rpc.method)}`);
          return { jsonrpc: "2.0", id: rpc.id, result: answers[String(rpc.method)] };
        });
        return Response.json(Array.isArray(json) ? results : results[0]);
      }
    }
    if (url.pathname.endsWith("/x402/verify") || url.pathname.endsWith("/x402/settle")) {
      const requestBody = object(JSON.parse(String(init?.body ?? "{}")));
      const payment = object(requestBody.paymentPayload);
      const accepted = object(payment.accepted);
      const response = await inner(input, init);
      const body = object(await response.json());
      if (body.success === true) {
        body.transaction = `0x${crypto.randomUUID().replace(/-/g, "").repeat(2)}`;
        body.network = accepted.network;
      }
      if (String(accepted.network).startsWith("solana:")) {
        body.payer = SOL;
        if (body.success === true) {
          // A replay broadcasts the SAME Solana transaction. Return a stable,
          // unique fixture tx id; another broadcast is not another chain debit.
          const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(object(payment.payload).transaction))));
          // Preserve leading zero bytes: integer conversion shortened some
          // otherwise valid 64-byte fixture identifiers into malformed ones.
          const tx = encodeBase58(Uint8Array.from([...bytes, ...bytes]));
          body.network = accepted.network; body.transaction = tx;
        }
      }
      return Response.json(body, { status: response.status, headers: response.headers });
    }
    if (url.hostname.endsWith(".example")) return new Response("fixture", { status: 200 });
    return inner(input, init); // Unknown egress throws; it cannot spend real money.
  });
  await clean();
  items = object(await (await request("/menu.json")).json()).items as Item[];
  const rpc = object(await (await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/list", params: {} }) })).json());
  tools = object(rpc.result).tools as Tool[];
  expect(items.map(item => item.id).sort()).toEqual(MENU_ITEMS.map(item => item.id).sort());
});
beforeEach(clean);
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });


}
