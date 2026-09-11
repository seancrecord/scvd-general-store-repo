import { expect, it } from "vitest";
import { verifyAsync } from "@noble/ed25519";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, transfers, certificateId } from "./helpers/labor-admission";
import { items, call, shelves, object, type Obj } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!.map(pair => parseInt(pair, 16)));
async function valid(proof: Obj, body: Obj): Promise<boolean> {
  if (typeof proof.signed_payload !== "string" || typeof proof.signature !== "string" || typeof proof.public_key !== "string") return false;
  const payload = object(JSON.parse(proof.signed_payload));
  return payload.cert_id === certificateId(body) && payload.item_id === body.item_id && payload.deliverable === body.deliverable &&
    payload.fortune_date === body.fortune_date && await verifyAsync(bytes(proof.signature), new TextEncoder().encode(proof.signed_payload), bytes(proof.public_key));
}
for (const id of ["small_blessing", "daily_fortune"]) for (const door of ["http", "mcp", "mcp-standard"] as const) for (const network of laborNetworks()) {
  it(`${id} ${door} ${network}: purchased words have recipient-verifiable proof and retain it on retry`, async () => {
    const item = items.find(i => i.id === id)!;
    const offer = (await call(item, "mcp", {}, shelves(item)[0]!)).offers.find(o => o.network === network)!;
    const payment = await signLabor(offer), key = crypto.randomUUID();
    const first = await sendLabor(id, door, {}, payment, key);
    expect(first.refused).toBe(false);
    const proof = object(first.body.purchased_text);
    expect(await valid(proof, first.body)).toBe(true);
    expect(await valid(proof, { ...first.body, deliverable: "replacement goods" })).toBe(false);
    expect(await valid(proof, { ...first.body, cert_id: "cert_other_purchase", certificate: { cert_id: "cert_other_purchase" } })).toBe(false);
    if (id === "daily_fortune") expect(await valid(proof, { ...first.body, fortune_date: "1900-01-01" })).toBe(false);
    const changed = { ...proof, signed_payload: JSON.stringify({ ...object(JSON.parse(String(proof.signed_payload))), deliverable: "replacement goods" }) };
    expect(await valid(changed, { ...first.body, deliverable: "replacement goods" })).toBe(false);
    const retry = await sendLabor(id, door, {}, payment, key);
    expect(retry.refused).toBe(false);
    expect(retry.body.purchased_text).toEqual(proof);
    expect(retry.body.deliverable).toBe(first.body.deliverable);
    expect(transfers).toBe(1);
  });
}
