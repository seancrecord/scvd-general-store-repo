import { beforeAll, beforeEach, vi } from "vitest";
import { acceptedNetworks, ARBITRUM_NETWORK, WORLD_NETWORK, SOLANA_NETWORK } from "@/lib/payments";
import { installBuyerHarness, items, shelves, call, request, object, testEnv, facilitator, type Obj } from "./buyer-harness";
import { evmPayment, evmValid, initializeSol, solPayment, solFacts, solFeePayer } from "./buyer-signed-payments";
import type { ChallengeRequirement } from "./payment";
export type LaborDoor = "http" | "mcp" | "mcp-standard";
export let transfers = 0;
export function installLaborAdmissionHarness() {
  // Enable every implemented rail; these are public fixture recipients.
  testEnv.ARBITRUM_PAY_TO = testEnv.POLYGON_PAY_TO;
  testEnv.WORLD_PAY_TO = testEnv.POLYGON_PAY_TO;
  installBuyerHarness();
  beforeAll(async () => {
    await initializeSol();
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("/x402/supported")) {
        const body = object(await (await inner(input, init)).json());
        const kinds = body.kinds as Obj[];
        for (const network of [ARBITRUM_NETWORK, WORLD_NETWORK]) {
          if (!kinds.some(kind => kind.network === network)) kinds.push({ x402Version: 2, scheme: "exact", network });
        }
        for (const kind of kinds) if (kind.network === SOLANA_NETWORK) kind.extra = { ...object(kind.extra), feePayer: solFeePayer };
        return Response.json(body);
      }
      if (!/\/x402\/(verify|settle)$/.test(url.pathname)) return inner(input, init);
      const body = object(JSON.parse(String(init?.body))), wire = object(body.paymentPayload);
      const offer = body.paymentRequirements as ChallengeRequirement;
      const sol = offer.network === SOLANA_NETWORK ? await solFacts(wire) : null;
      const payer = sol?.payer ?? object(object(wire.payload).authorization).from;
      if (url.pathname.endsWith("/verify")) {
        facilitator.verifyCalls++;
        return Response.json({ isValid: sol ? sol.valid : await evmValid(wire, offer), payer });
      }
      const response = await inner(input, init), receipt = object(await response.json());
      if (receipt.success) transfers++;
      return Response.json({ ...receipt, payer, ...(sol ? { transaction: sol.tx } : {}) }, { status: response.status });
    });
  });
  beforeEach(() => { transfers = 0; });
}
export const laborNetworks = () => acceptedNetworks(testEnv);
export const signLabor = (offer: ChallengeRequirement) => offer.network === SOLANA_NETWORK ? solPayment(offer) : evmPayment(offer);
export const certificateId = (body: Obj) => body.cert_id ?? object(body.certificate).cert_id;
export async function sendLabor(id: string, door: LaborDoor, args: Obj, payment?: Obj, key?: string) {
  const item = items.find(i => i.id === id)!, tool = shelves(item)[0]!;
  if (door === "http") {
    const r = await call(item, "http", args, tool, payment ? btoa(JSON.stringify(payment)) : undefined, key);
    return { refused: r.protocolError, body: r.body, quote: r.quote, status: r.status };
  }
  const response = await request(door === "mcp" ? "/mcp" : "/mcp?payment=tool-result", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {
      name: tool.name, arguments: { item_id: id, ...args }, ...(payment ? { _meta: { "x402/payment": payment, "x402/idempotency-key": key } } : {}),
    } }),
  });
  const raw = object(await response.json()), result = object(raw.result), error = object(raw.error);
  return { quote: error.code === 402 || Array.isArray(object(result.structuredContent).accepts),
    refused: Object.keys(error).length > 0 || result.isError === true, status: response.status,
    body: Object.keys(error).length ? object(error.data) : object(result.structuredContent) };
}
