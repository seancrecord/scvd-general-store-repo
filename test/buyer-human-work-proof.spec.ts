import { afterEach, expect, it, vi } from "vitest";
import { verifyAsync } from "@noble/ed25519";
import { getMenuItem } from "@/store";
import { completeOrder, createOrder, getOrder } from "@/services/orders";
import { KV_KEYS } from "@/lib/kv-keys";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, certificateId } from "./helpers/labor-admission";
import { items, baseline, call, shelves, request, object, testEnv, sourceEnv, NOW, type Obj } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
afterEach(() => vi.restoreAllMocks());
const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map(pair => parseInt(pair, 16)));
const digest = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, "0")).join("");
async function signed(proof: Obj): Promise<Obj> {
  expect(typeof proof.signed_payload).toBe("string");
  expect(await verifyAsync(bytes(String(proof.signature)), new TextEncoder().encode(String(proof.signed_payload)), bytes(String(proof.public_key)))).toBe(true);
  return object(JSON.parse(String(proof.signed_payload)));
}
async function status(orderId: string) {
  const http = object(await (await request(`/api/order/${orderId}`)).json());
  const rpc = object(await (await request("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_order", arguments: { order_id: orderId } },
  }) })).json());
  expect(object(rpc.result).structuredContent).toEqual(http);
  return http;
}
for (const id of ["the_collab", "aura_walk"]) for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${id} ${door} ${network}: acceptance and completion bind the exact brief, target, goods and certificate`, async () => {
    const item = items.find(i => i.id === id)!;
    const detail = "  SCVD-E2E vector<int> & 🧵\nRead the whole brief.  ";
    const args: Obj = { ...baseline(item), detail, callback_url: "https://buyer.example/human-proof" };
    const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const first = await sendLabor(id, door, args, await signLabor(offer), crypto.randomUUID());
    expect(first.refused).toBe(false);
    const orderId = String(first.body.order_id), commission = object(first.body.commission);
    const acceptance = await signed(commission);
    const inputs = JSON.stringify({ detail, target_url: typeof args.url === "string" ? args.url : null });
    expect(acceptance).toMatchObject({ type: "scvd.human-commission.v1", order_id: orderId, cert_id: certificateId(first.body),
      item_id: id, inputs_sha256: await digest(inputs), sla_hours: first.body.sla_hours, accepted_at: NOW.toISOString() });
    expect(String(commission.signed_payload)).not.toContain(detail);
    expect(acceptance.inputs_sha256).not.toBe(await digest(JSON.stringify({ detail: "changed brief", target_url: null })));
    const before = await status(orderId); expect(before.commission).toEqual(commission); expect(before.completion_proof).toBeUndefined();
    let callback: Obj | undefined;
    const inner = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === args.callback_url) { callback = object(JSON.parse(String(init?.body))); return new Response(null, { status: 204 }); }
      return inner(input, init);
    });
    const goods = `Completed the original brief:\n${detail}\nTarget: ${typeof args.url === "string" ? args.url : "none"}`;
    await completeOrder(testEnv, orderId, goods);
    const after = await status(orderId), proof = object(after.completion_proof), completion = await signed(proof);
    expect(completion).toMatchObject({ type: "scvd.human-completion.v1", order_id: orderId, cert_id: certificateId(first.body), item_id: id,
      commission_sha256: await digest(String(commission.signed_payload)), inputs_sha256: acceptance.inputs_sha256,
      deliverable_sha256: await digest(goods), completed_at: after.completed_at, acceptance_basis: "signed_commission" });
    expect(after.deliverable).toBe(goods); expect(after.commission).toEqual(commission);
    expect(callback).toMatchObject({ deliverable: goods, commission, completion_proof: proof });
    expect(completion.deliverable_sha256).not.toBe(await digest("replacement goods"));
    const tampered = String(proof.signed_payload).replace(orderId, "ord_another");
    expect(await verifyAsync(bytes(String(proof.signature)), new TextEncoder().encode(tampered), bytes(String(proof.public_key)))).toBe(false);
  });
}
for (const tamper of ["brief", "target", "certificate", "commission_signature"]) it(`a ${tamper} mutation cannot acquire a completion proof for the accepted work`, async () => {
  const order = await createOrder(testEnv, { item: getMenuItem("aura_walk")!, paidUsdc: 1, tipUsdc: 0, patronNumber: 1,
    certId: "cert_fixture", detail: "Original brief", targetUrl: "https://buyer.example/original" });
  if (tamper === "brief") order.detail = "Changed brief";
  if (tamper === "target") order.target_url = "https://buyer.example/changed";
  if (tamper === "certificate") order.cert_id = "cert_other";
  if (tamper === "commission_signature") order.commission = { ...(order.commission ?? {
    signed_payload: "{}", public_key: "00".repeat(32), signature_covers: "untrusted fixture",
  }), signature: "00".repeat(64) };
  await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
  await expect(completeOrder(testEnv, order.order_id, "claimed completion")).rejects.toThrow(/commission/);
  expect((await getOrder(testEnv, order.order_id))?.status).toBe("queued");
});
it("a legacy completion says that no acceptance signature survives", async () => {
  const order = await createOrder(testEnv, { item: getMenuItem("the_collab")!, paidUsdc: 1, tipUsdc: 0, patronNumber: 1, certId: "cert_legacy", detail: "retained brief" });
  delete order.commission;
  await sourceEnv.ORDERS.put(KV_KEYS.order(order.order_id), JSON.stringify(order));
  const done = await completeOrder(testEnv, order.order_id, "legacy work");
  expect(done?.commission).toBeUndefined();
  expect(await signed(object(done?.completion_proof))).toMatchObject({ commission_sha256: null, acceptance_basis: "retained_order_without_acceptance_signature" });
});

it("a signing failure leaves the accepted order queued and sends no completion callback", async () => {
  const order = await createOrder(testEnv, { item: getMenuItem("the_collab")!, paidUsdc: 1, tipUsdc: 0, patronNumber: 1,
    certId: "cert_signing_failure", detail: "Accepted brief", callbackUrl: "https://buyer.example/signing-failure" });
  const inner = globalThis.fetch;
  let callbacks = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input) === order.callback_url) { callbacks++; return new Response(null, { status: 204 }); }
    return inner(input, init);
  });
  await expect(completeOrder({ ...testEnv, SIGNING_KEY: "invalid" }, order.order_id, "unsigned completion")).rejects.toThrow();
  expect(await getOrder(testEnv, order.order_id)).toMatchObject({ status: "queued", commission: order.commission });
  expect((await getOrder(testEnv, order.order_id))?.completion_proof).toBeUndefined();
  expect(callbacks).toBe(0);
});

it("concurrent managed completions retain the proof for the body actually published", async () => {
  const item = items.find(i => i.id === "the_collab")!, args = { detail: "Keep each completion with its own evidence." };
  const offer = (await call(item, "mcp", args, shelves(item)[0]!)).offers[0]!;
  const bought = await sendLabor(item.id, "mcp", args, await signLabor(offer), crypto.randomUUID());
  const orderId = String(bought.body.order_id), answers = ["First exact answer 🧵", "Second exact answer\n<code>kept</code>"];
  await Promise.all(answers.map(answer => completeOrder(testEnv, orderId, answer)));
  const current = await status(orderId), proof = await signed(object(current.completion_proof));
  expect(answers).toContain(current.deliverable);
  expect(proof).toMatchObject({ deliverable_sha256: await digest(String(current.deliverable)), completed_at: current.completed_at,
    commission_sha256: await digest(String(object(bought.body.commission).signed_payload)) });
});

it("invalid Unicode cannot acquire a completion digest that silently replaces its bytes", async () => {
  const order = await createOrder(testEnv, { item: getMenuItem("the_collab")!, paidUsdc: 1, tipUsdc: 0, patronNumber: 1,
    certId: "cert_bad_unicode", detail: "Accepted brief" });
  const refused = await completeOrder(testEnv, order.order_id, "broken\ud83d").then(() => false, () => true);
  expect(refused).toBe(true);
  expect((await getOrder(testEnv, order.order_id))?.status).toBe("queued");
});
