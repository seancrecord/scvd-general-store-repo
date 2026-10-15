import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { doors } from "@/lib/doors-app";
import { installLaborAdmissionHarness, sendLabor, transfers } from "./helpers/labor-admission";
import { BASE, request, object, testEnv, facilitator } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
async function get(surface: "store" | "doors", path: string) {
  if (surface === "store") return request(path);
  const ctx = createExecutionContext();
  const binding = { fetch: (input: Request) => request(input.url, { method: input.method, headers: input.headers }) } as unknown as Fetcher;
  const response = await doors.fetch(new Request(new URL(path, BASE)), { ...testEnv, STORE: binding }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

for (const surface of ["store", "doors"] as const) {
  it(`${surface}: every bare purchase puts the next action before the detailed quote`, async () => {
    for (const item of MENU_ITEMS) {
      const response = await get(surface, `/api/buy/${item.id}`);
      expect(response.status, item.id).toBe(402);
      expect(response.headers.has("PAYMENT-REQUIRED")).toBe(true);
      const body = object(await response.json()), step = object(body.next_step);
      const required = buyInputSchema(item).required ?? [];
      expect(Object.keys(body)[0]).toBe("next_step");
      expect(step.action, item.id).toBe(required.length ? "complete_inputs" : "review_payment");
      expect(step.payment_required).toBe(required.length === 0);
      if (required.length) {
        expect(step.missing_fields).toEqual(required);
        expect(Object.keys(object(step.fields))).toEqual(required);
        expect(String(step.url_template)).toContain(`/api/buy/${item.id}?`);
      }
    }
    expect(facilitator.verifyCalls).toBe(0);
    expect(transfers).toBe(0);
  });
}

it("repairs only the bad field, preserving correctly encoded optional inputs without forwarding unknown fields", async () => {
  const name = "Ada & Bea + café";
  const response = await request(`/api/buy/spot_check?host=https%3A%2F%2Fbuyer.example%2Fwrong&agent_name=${encodeURIComponent(name)}&secret=do-not-echo`);
  expect(response.status).toBe(400);
  const body = object(await response.json()), step = object(body.next_step);
  expect(step).toMatchObject({ action: "repair_inputs", payment_required: false, method: "GET" });
  expect(Object.keys(object(step.fields))).toEqual(["host"]);
  const corrected = String(step.url_template).replace("<host>", "buyer-fixture.example");
  expect(new URL(corrected).searchParams.get("agent_name")).toBe(name);
  expect(corrected).not.toContain("do-not-echo");
  const quote = await request(corrected);
  expect(quote.status).toBe(402);
  expect(object(object(await quote.json()).next_step)).toMatchObject({ action: "review_payment", url: corrected });
  expect(facilitator.verifyCalls).toBe(0);
});

it("a partial quote preserves the supplied host and names only the missing baseline", async () => {
  const response = await request("/api/buy/change_check?host=buyer-fixture.example&purpose=compare");
  expect(response.status).toBe(402);
  const step = object(object(await response.json()).next_step);
  expect(step.missing_fields).toEqual(["baseline_cert_id"]);
  const url = new URL(String(step.url_template));
  expect(url.searchParams.get("host")).toBe("buyer-fixture.example");
  expect(url.searchParams.get("purpose")).toBe("compare");
  expect(url.searchParams.get("baseline_cert_id")).toBe("<baseline_cert_id>");
});

for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${door}: a missing baseline gives a free, exact-host history read and a usable retry template`, async () => {
    const result = await sendLabor("change_check", door, { host: "buyer-fixture.example", baseline_cert_id: "cert_missing", purpose: "compare" });
    expect(result.quote).toBe(false);
    expect(result.body.code).toBe("baseline_unavailable");
    const step = object(result.body.next_step);
    expect(step).toMatchObject({ action: "supply_baseline", payment_required: false, url: `${BASE}/corpus/host/buyer-fixture.example.json` });
    expect(String(step.note)).toContain("retained");
    const retry = object(step.retry);
    if (door === "http") {
      const target = new URL(String(retry.url_template));
      expect(target.searchParams.get("host")).toBe("buyer-fixture.example");
      expect(target.searchParams.get("purpose")).toBe("compare");
      expect(target.searchParams.get("baseline_cert_id")).toBe("<baseline_cert_id>");
    } else expect(retry.arguments).toMatchObject({ host: "buyer-fixture.example", baseline_cert_id: "<baseline_cert_id>", purpose: "compare" });
    expect((await request(String(step.url))).status).toBe(200);
    expect(transfers).toBe(0);
  });
  it(`${door}: A2A admission refusal points directly to setup with structured repair guidance`, async () => {
    const result = await sendLabor("a2a_repair_kit", door, { url: "https://unsupported.example/.well-known/agent-card.json" });
    expect(result.quote).toBe(false);
    const step = object(result.body.next_step);
    expect(step).toMatchObject({ action: "complete_setup", payment_required: false, url: `${BASE}/a2a-desk.json` });
    expect(step.reason).toBe(result.body.code);
    expect((await request(String(step.url))).status).toBe(200);
    expect(transfers).toBe(0);
  });
  it(`${door}: complete inputs lead straight to reviewing the offered payment`, async () => {
    const result = await sendLabor("context_anchor", door, { summary: "Keep the original text & punctuation." });
    expect(result.quote).toBe(true);
    expect(object(result.body.next_step)).toMatchObject({ action: "review_payment", payment_required: true });
    expect(transfers).toBe(0);
  });
}

it("MCP input repair preserves the caller's good arguments and requires an unsigned quote", async () => {
  const result = await sendLabor("settlement_attestation", "mcp", { tx_hash: "bad", agent_name: "Ada" });
  const step = object(result.body.next_step);
  expect(step).toMatchObject({ action: "repair_inputs", payment_required: false, same_tool: true,
    arguments: { item_id: "settlement_attestation", tx_hash: "<tx_hash>", agent_name: "Ada" } });
  expect(object(step.fields).tx_hash).toBeDefined();
  expect(transfers).toBe(0);
});

it("a rejected signed request does not direct the buyer to sign a replacement payment", async () => {
  const response = await request("/api/buy/context_anchor?agent_name=private-name", { headers: { "PAYMENT-SIGNATURE": "private-payment" } });
  expect(response.status).toBe(400);
  const body = object(await response.json()), step = object(body.next_step);
  expect(step).toMatchObject({ action: "recover_payment", payment_required: false });
  expect(JSON.stringify(step)).not.toMatch(/private-name|private-payment/);
  expect(facilitator.verifyCalls).toBe(0);
});

it("OpenAPI distinguishes a runnable unpaid probe from placeholder purchase examples", async () => {
  const doc = object(await (await request("/openapi.json")).json());
  const guidance = object(doc["x-scvd-payment-probing"]);
  expect(guidance).toMatchObject({ method: "GET", send_payment: false, use_parameter_examples: false });
  for (const item of MENU_ITEMS) {
    const operation = object(object(object(doc.paths)[`/api/buy/${item.id}`]).get);
    const input = object(object(operation["x-payment-info"]).input);
    expect(input.probe_url).toBe(`${BASE}/api/buy/${item.id}`);
  }
});

it("a complete quote preserves the exact request URL, including aliases and encoding", async () => {
  const url = `${BASE}/api/buy/spot_check?url=https%3A%2F%2Fbuyer-fixture.example%2Fthing&purpose=A%20B&src=skill`;
  const response = await request(url);
  expect(response.status).toBe(402);
  expect(object(object(await response.json()).next_step)).toMatchObject({ action: "review_payment", url });
});

it("publication quotes carry the same direct payment action", async () => {
  const response = await request("/almanac/notes-from-a-tuesday-in-oak-city");
  expect(response.status).toBe(402);
  expect(object(object(await response.json()).next_step)).toMatchObject({ action: "review_payment", payment_required: true });
});
