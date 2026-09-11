import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { doors } from "@/lib/doors-app";
import { installLaborAdmissionHarness, laborNetworks, signLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, request, object, testEnv, facilitator, BASE, call, shelves, type Obj } from "./helpers/buyer-harness";
installLaborAdmissionHarness();

/**
 * THE PROBE RULE, AND THE HALF OF BUY-002 THAT SURVIVES IT (2026-09-11).
 *
 * PR #636 validated every unsigned request before terms. Within fifteen
 * minutes x402-list's checker — bare probe, expects 402 — counted 7 of
 * 32 doors alive and marked the store degraded; the store's own
 * preflight would have failed the same 25 doors on status-402. So:
 *
 *   PROBE     — unsigned and missing a required input: 402, always,
 *               with required_params and input_contract_url beside the
 *               signable terms. Every item, both Workers.
 *   COMPOSED  — every required input supplied, signed or not: validated
 *               in full before terms. Garbage gets a field refusal and
 *               no offer, so a client never signs terms it cannot use.
 *   SIGNED    — a missing input still fails before verification.
 */

async function get(surface: "store" | "doors", path: string, headers?: HeadersInit): Promise<Response> {
  if (surface === "store") return request(path, { headers });
  // The real doors Worker lacks the field wallet. Reads needing that private
  // capability must reach the store through its existing service binding.
  const binding = { fetch: (input: Request) => request(input.url, { method: input.method, headers: input.headers }) } as unknown as Fetcher;
  const env = { ...testEnv, STORE: binding };
  delete env.FIELD_WALLET_KEY;
  const ctx = createExecutionContext(), response = await doors.fetch(new Request(new URL(path, BASE), { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
const urlFor = (id: string, args: Obj) => `/api/buy/${id}?${new URLSearchParams(Object.entries(args).map(([key, value]) => [key, String(value)]))}`;

for (const menu of MENU_ITEMS) for (const surface of ["store", "doors"] as const) {
  it(`${menu.id} ${surface}: a bare probe answers 402 and names what the door needs`, async () => {
    const item = items.find(row => row.id === menu.id)!, required = item.spec.inputs.required ?? [];
    const verifies = facilitator.verifyCalls, response = await get(surface, `/api/buy/${menu.id}`), body = object(await response.json());
    expect(response.status, menu.id).toBe(402);
    expect(response.headers.has("PAYMENT-REQUIRED")).toBe(true);
    if (required.length) {
      expect(body.required_params).toEqual(required);
      expect(typeof body.required_params_note).toBe("string");
      expect(body.input_contract_url).toBe(`${BASE}/menu/${menu.id}?view=compact`);
    } else {
      expect(body.required_params).toBeUndefined();
    }
    expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(0);
  });
}

for (const menu of MENU_ITEMS) for (const surface of ["store", "doors"] as const) for (const mode of ["omitted", "empty", "whitespace"] as const) {
  it(`${menu.id} ${surface} ${mode}: a required input left blank is still a probe, not a purchase`, async () => {
    const item = items.find(row => row.id === menu.id)!, required = item.spec.inputs.required ?? [];
    if (!required.length) return;
    for (const field of required) {
      const args = { ...baseline(item) };
      if (mode === "omitted") delete args[field]; else args[field] = mode === "empty" ? "" : " \t\n ";
      const verifies = facilitator.verifyCalls, response = await get(surface, urlFor(item.id, args)), body = object(await response.json());
      expect(response.status, `${item.id}.${field}`).toBe(402);
      expect(response.headers.has("PAYMENT-REQUIRED")).toBe(true);
      expect(body.required_params).toContain(field);
      expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(0);
    }
  });
}

for (const menu of MENU_ITEMS) for (const surface of ["store", "doors"] as const) {
  it(`${menu.id} ${surface}: the free contract says a bare probe is answered, and a composed valid request is quoted`, async () => {
    const response = await request(`/menu/${menu.id}?view=compact`), contract = object(await response.json());
    expect(response.status).toBe(200);
    expect(response.headers.has("PAYMENT-REQUIRED")).toBe(false);
    expect(contract.price_usdc).toBe(menu.price_usdc);
    expect(contract.price_discovery_url).toBe(`${BASE}/menu/${menu.id}?view=compact`);
    expect(object(contract.checkout)).toMatchObject({ bare_probe_answers_402: true, valid_inputs_required_before_quote: false, price_discovery_url: `${BASE}/api/catalog/v1` });
    const schema = object(contract.input_schema);
    const item = items.find(row => row.id === menu.id)!;
    expect(schema.required).toEqual(item.spec.inputs.required);
    const quote = await get(surface, urlFor(item.id, baseline(item)));
    expect(quote.status).toBe(402);
    expect(quote.headers.has("PAYMENT-REQUIRED")).toBe(true);
    expect(transfers).toBe(0);
  });
}

const malformed = [
  ["standing_watch", "url", "javascript:alert(1)"],
  ["launch_check", "url", "not a URL"],
  ["a2a_repair_kit", "url", "not a URL"],
  ["bitcoin_anchor", "digest", "xyz"],
  ["settlement_attestation", "tx_hash", "not a transaction"],
  ["attestation_bundle", "tx_hashes", "not a transaction"],
  ["the_statement", "wallet", "not a wallet"],
  ["spot_check", "host", "https://buyer.example/path"],
] as const;
for (const [id, field, value] of malformed) for (const surface of ["store", "doors"] as const) {
  it(`${id} ${surface}: a supplied malformed ${field} is not a probe and never produces payment terms`, async () => {
    const item = items.find(row => row.id === id)!;
    const response = await get(surface, urlFor(id, { ...baseline(item), [field]: value }));
    expect(response.status).toBe(400);
    expect(response.headers.has("PAYMENT-REQUIRED")).toBe(false);
    expect(response.headers.has("X-PAYMENT-REQUIRED")).toBe(false);
    const body = object(await response.json());
    expect(body.accepts).toBeUndefined();
    expect(body).toMatchObject({ charged: false, input_field: field, input_contract_url: `${BASE}/menu/${id}?view=compact` });
    expect(typeof body.code).toBe("string");
    expect(facilitator.verifyCalls).toBe(0); expect(transfers).toBe(0);
  });
}

for (const network of laborNetworks()) for (const surface of ["store", "doors"] as const) for (const header of ["PAYMENT-SIGNATURE", "X-PAYMENT"] as const) {
  it(`${surface} ${network} ${header}: signed missing inputs fail before verification on canonical and trailing-slash paths`, async () => {
    const item = items.find(row => row.id === "context_anchor")!, args = baseline(item);
    const quote = await call(item, "mcp", args, shelves(item)[0]!);
    const payment = btoa(JSON.stringify(await signLabor(quote.offers.find(offer => offer.network === network)!)));
    for (const suffix of ["", "/"]) {
      const response = await get(surface, `/api/buy/${item.id}${suffix}`, { [header]: payment });
      expect(response.status).toBe(400);
      expect(response.headers.has("PAYMENT-REQUIRED")).toBe(false);
      expect(await response.json()).toMatchObject({ charged: false, input_field: "summary" });
      expect(facilitator.verifyCalls).toBe(0); expect(transfers).toBe(0);
    }
  });
}
