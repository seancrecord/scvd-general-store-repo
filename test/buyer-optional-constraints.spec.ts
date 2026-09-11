import { beforeEach, expect, it, vi } from "vitest";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers } from "./helpers/labor-admission";
import { items, baseline, call, shelves, object, facilitator, type Obj } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
let verifies = 0;
beforeEach(() => { verifies = facilitator.verifyCalls; });
const cases: { id: string; field: string; value: unknown }[] = [];
for (const id of ["settlement_attestation", "settlement_reconciliation", "the_case_file"]) {
  for (const field of ["payer", "recipient"]) for (const value of ["not-an-address", "0x1234", "x".repeat(70), "<b>0x" + "11".repeat(20) + "</b>"]) cases.push({ id, field, value });
  const field = id === "settlement_attestation" ? "amount_usdc" : id === "settlement_reconciliation" ? "declared_cap_usdc" : "expected_amount_usdc";
  for (const value of ["1trailing", "Infinity", "NaN", "0x10", "-1", "0"]) cases.push({ id, field, value });
}
for (const value of ["not-a-nonce", "0x01", "0x" + "aa".repeat(33)]) cases.push({ id: "settlement_attestation", field: "nonce", value });
for (const value of ["x", btoa("{}"), btoa(JSON.stringify({ payload: { authorization: { nonce: "junk" } } }))]) cases.push({ id: "settlement_attestation", field: "payment_payload", value });
for (const value of ["1trailing", "Infinity", "NaN", "0x10", "-1"]) cases.push({ id: "good_buyer", field: "max_usd", value });
for (const value of ["yes", "1", "TRUE", "true "]) cases.push({ id: "good_buyer", field: "no_spend_controls", value });
for (const { id, field, value } of cases) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${door} ${field}=${String(value).slice(0,35)}: refuses an invalid optional constraint before quoting`, async () => {
    const item = items.find(i => i.id === id)!, result = await sendLabor(id, door, { ...baseline(item), [field]: value });
    expect(result.refused).toBe(true); expect(result.quote).toBe(false);
    expect(result.body).toMatchObject({ code: "bad_request", input_field: field, charged: false });
    expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(0);
  });
}
for (const id of ["settlement_attestation", "settlement_reconciliation", "good_buyer"]) for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${id} ${door} ${network}: a signed payment does not bypass malformed optional constraints`, async () => {
    const item = items.find(i => i.id === id)!, args = baseline(item);
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const field = id === "good_buyer" ? "max_usd" : "payer";
    const result = await sendLabor(id, door, { ...args, [field]: "not-valid" }, await signLabor(offer), crypto.randomUUID());
    expect(result.refused).toBe(true); expect(result.quote).toBe(false);
    expect(result.body).toMatchObject({ code: "bad_request", input_field: field, charged: false });
    expect(facilitator.verifyCalls).toBe(verifies); expect(transfers).toBe(0);
  });
}
for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${door} ${network}: accepted numeric and nonce constraints survive in the signed query`, async () => {
    const item = items.find(i => i.id === "settlement_attestation")!;
    const nonce = `0x${"ab".repeat(32)}`, payer = `0x${"12".repeat(20)}`, recipient = `0x${"34".repeat(20)}`;
    const args = { ...baseline(item), payer, recipient, amount_usdc: 0.125, nonce: ` ${nonce} `, payment_payload: btoa(JSON.stringify({ payload: { authorization: { nonce } } })) };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const payment = await signLabor(offer), bought = await sendLabor(item.id, door, args, payment, crypto.randomUUID());
    expect(bought.refused).toBe(false);
    // Model an already-consumed authorization: the verifier no longer
    // admits spending, while the original signed query must remain readable.
    const inner = globalThis.fetch;
    const spent = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname.endsWith("/x402/verify")) return Response.json({ isValid: false, invalidReason: "nonce_already_used" });
      return inner(input, init);
    });
    let retry: Awaited<ReturnType<typeof sendLabor>>;
    try { retry = await sendLabor(item.id, door, args, payment); } finally { spent.mockRestore(); }
    expect(retry.refused).toBe(false);
    expect(retry.body.attestation).toEqual(bought.body.attestation);
    expect(object(object(bought.body.attestation).query)).toMatchObject({ payer, recipient, nonce, amountUsdc: args.amount_usdc });
    expect(transfers).toBe(1);
  });
  it(`${door} ${network}: a declared zero client cap survives instead of becoming the default`, async () => {
    const item = items.find(i => i.id === "good_buyer")!, args = { ...baseline(item), max_usd: "0", no_spend_controls: "false" };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const bought = await sendLabor(item.id, door, args, await signLabor(offer), crypto.randomUUID());
    expect(bought.refused).toBe(false);
    expect(object(object(bought.body.reading).client_profile_as_declared)).toEqual({ max_amount_per_payment_usd: 0, spend_controls_disabled: false });
  });
}
for (const door of ["http", "mcp", "mcp-standard"] as const) it(`${door}: conflicting explicit and payload nonces are refused, even when either alone is valid`, async () => {
  const item = items.find(i => i.id === "settlement_attestation")!, args: Obj = { ...baseline(item), nonce: `0x${"11".repeat(32)}`,
    payment_payload: btoa(JSON.stringify({ payload: { authorization: { nonce: `0x${"22".repeat(32)}` } } })) };
  const result = await sendLabor(item.id, door, args);
  expect(result.refused).toBe(true); expect(result.body).toMatchObject({ input_field: "payment_payload", charged: false });
});
