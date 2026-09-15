import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { completeOrder } from "@/services/orders";
import { verifyMessageSignature } from "@/lib/signing";
import { humanResolutionStore, humanResolutionKey } from "@/services/human-resolution-record";
import { installLaborAdmissionHarness, laborNetworks, signLabor, sendLabor, certificateId, transfers, type LaborDoor } from "./helpers/labor-admission";
import { evmBuyer, solBuyer, signSolClaim } from "./helpers/buyer-signed-payments";
import { baseline, items, shelves, call, request, object, testEnv, sourceEnv, type Obj } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
const other = privateKeyToAccount(`0x${"09".repeat(32)}`);
async function claim(certId?: unknown, network = laborNetworks()[0]!, stranger = false) {
  const sol = network.startsWith("solana:"), address = stranger ? other.address : sol ? solBuyer : evmBuyer.address;
  const start = await request("/api/claims/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
  const challenge = String(object(await start.json()).challenge);
  const signature = stranger ? await other.signMessage({ message: challenge }) : sol ? await signSolClaim(challenge) : await evmBuyer.signMessage({ message: challenge });
  const response = await request("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, signature, ...(certId === undefined ? {} : { cert_id: certId }) }) });
  return { response, body: object(await response.json()) };
}
async function buy(id: string, door: LaborDoor, network = laborNetworks()[0]!) {
  const item = items.find(i => i.id === id)!;
  const args: Obj = { ...baseline(item), purpose: `SCVD-E2E claims ${crypto.randomUUID()}`, ...(id === "spot_check" ? { host: "claims-fixture.example" } : id === "the_confession" ? { confession: `private fixture ${crypto.randomUUID()}` } : {}) };
  const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
  const first = await sendLabor(id, door, args, await signLabor(offer), crypto.randomUUID());
  expect(first.refused).toBe(false);
  const certId = String(certificateId(first.body)), cert = object(first.body.certificate ?? JSON.parse(String(first.body.signed_payload)));
  const ns = sourceEnv.PAID_RECOVERIES!;
  return { first: first.body, certId, args, cert, stub: ns.get(ns.idFromName(`${network}:${cert.settlement_tx}`)) };
}
for (const network of laborNetworks()) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${network} ${door}: wallet proof retrieves original signed words without another settlement`, async () => {
    const p = await buy("small_blessing", door, network);
    const result = await claim(p.certId, network);
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("Cache-Control")).toContain("no-store");
    expect(result.body).toMatchObject({ cert_id: p.certId, recovery_state: "ready", settlement_attempted: false, charged_again: false });
    const good = object(result.body.fulfillment);
    expect(good.signed_payload).toBe(p.first.signed_payload);
    expect(good.deliverable).toBe(p.first.deliverable);
    expect(good.purchased_text).toEqual(p.first.purchased_text);
    const proof = object(good.purchased_text);
    expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
    expect(transfers).toBe(1);
  });
}
for (const id of ["spot_check", "the_confession"]) it(`${id}: list explains recovery and a fresh proof returns the exact private good`, async () => {
  const p = await buy(id, "mcp-standard");
  const list = await claim();
  expect(String(list.body.recover_original_good)).toContain("cert_id");
  expect(String(list.body.recover_original_good)).toContain("fresh challenge");
  expect(JSON.stringify(list.body)).not.toContain(p.args.confession ?? "\"observation\":");
  const recovered = await claim(p.certId);
  expect(recovered.body.recovery_state).toBe("ready");
  const good = object(recovered.body.fulfillment);
  expect(good.signed_payload).toBe(p.first.signed_payload);
  expect(good.observation ?? good.confession_receipt).toEqual(p.first.observation ?? p.first.confession_receipt);
  expect(transfers).toBe(1);
});
it("a proven different wallet and an absent id receive the same non-disclosing response", async () => {
  const p = await buy("the_confession", "http");
  const otherWallet = await claim(p.certId, undefined, true), absent = await claim("cert_absent");
  expect(otherWallet.response.status).toBe(404);expect(absent.response.status).toBe(404);
  expect(otherWallet.body).toEqual(absent.body);
  expect(JSON.stringify(otherWallet.body)).not.toContain(p.args.confession);
  expect(transfers).toBe(1);
});
it("missing original response remains an explicit gap and does not remint", async () => {
  const p = await buy("small_blessing", "http");
  await runInDurableObject(p.stub, async (_instance, ctx) => { await ctx.storage.delete("artifact:response"); });
  const result = await claim(p.certId);
  expect(result.body).toMatchObject({ recovery_state: "unavailable", next_action: "contact_keeper", settlement_attempted: false });
  expect(result.body.fulfillment).toBeUndefined();
  expect(transfers).toBe(1);
  expect(await p.stub.artifactStage("wrong", "response")).toBeNull();
});
it("a cross-wired retained response fails closed instead of returning another good", async () => {
  const a = await buy("small_blessing", "http"), b = await buy("the_confession", "http");
  await runInDurableObject(a.stub, async (_instance, ctx) => { await ctx.storage.put("artifact:response", JSON.stringify(b.first)); });
  const result = await claim(a.certId);
  expect(result.response.status).toBe(503);
  expect(result.body.fulfillment).toBeUndefined();
  expect(JSON.stringify(result.body)).not.toContain(b.args.confession);
  expect(transfers).toBe(2);
});
it("legacy certificates without retained goods have no invented fulfillment", async () => {
  const p = await buy("small_blessing", "http");
  await runInDurableObject(p.stub, async (_instance, ctx) => { await ctx.storage.deleteAll(); });
  const result = await claim(p.certId);
  expect(result.body.recovery_state).toBe("unavailable");
  expect(result.body.fulfillment).toBeUndefined();
  expect(transfers).toBe(1);
});
for (const certId of ["", 1, {}, null, "cert_x/y", `cert_${"x".repeat(124)}`]) it(`invalid cert selector ${JSON.stringify(certId)} is not silently ignored`, async () => {
  const result = await claim(certId);
  expect(result.response.status).toBe(400);
  expect(result.body.certificates).toBeUndefined();
  expect(result.body.settlement_attempted).toBe(false);
});
it("purchase state reads do not leak raw storage exceptions", async () => {
  const p = await buy("small_blessing", "http");
  const ns = testEnv.PAID_RECOVERIES;
  testEnv.PAID_RECOVERIES = undefined;
  try { const result = await claim(p.certId);expect(result.response.status).toBe(503);expect(result.body.fulfillment).toBeUndefined(); }
  finally { testEnv.PAID_RECOVERIES = ns; }
});

it("a signature damaged in the retained response is not presented as the original good", async () => {
  const p = await buy("small_blessing", "http");
  await runInDurableObject(p.stub, async (_instance, ctx) => {
    const body = object(JSON.parse(String(await ctx.storage.get("artifact:response"))));
    body.signed_payload = String(body.signed_payload).replace("SCVD-E2E", "wrong-subject");
    await ctx.storage.put("artifact:response", JSON.stringify(body));
  });
  const result = await claim(p.certId);
  expect(result.response.status).toBe(503);
  expect(result.body.charged).toBe(true);
  expect(result.body.fulfillment).toBeUndefined();
  expect(transfers).toBe(1);
});

for (const field of ["payer", "network", "transaction"]) it(`retained ${field} mismatch cannot disclose a good`, async () => {
  const p = await buy("the_confession", "http");
  await runInDurableObject(p.stub, async (_instance, ctx) => {
    const a = object(await ctx.storage.get("artifact"));
    object(object(a.purchase).payment)[field] = field === "payer" ? other.address : "different";
    await ctx.storage.put("artifact", a);
  });
  const result = await claim(p.certId);
  expect(result.body.recovery_state).toBe("unavailable");
  expect(JSON.stringify(result.body)).not.toContain(p.args.confession);
  expect(result.body.fulfillment).toBeUndefined();
});

it("Solana ownership does not fold base58 case", async () => {
  const network = laborNetworks().find(n=>n.startsWith("solana:"))!;
  const p = await buy("small_blessing", "http", network);
  expect(solBuyer).not.toBe(solBuyer.toLowerCase());
  await runInDurableObject(p.stub, async (_instance, ctx) => {
    const a = object(await ctx.storage.get("artifact"));
    object(object(a.purchase).payment).payer = solBuyer.toLowerCase();
    await ctx.storage.put("artifact", a);
  });
  const result = await claim(p.certId, network);
  expect(result.body.recovery_state).toBe("unavailable");
  expect(result.body.fulfillment).toBeUndefined();
});

for (const missingOriginal of [false, true]) it(`a recorded refund takes precedence even when original storage is missing: ${missingOriginal}`, async () => {
  const p = await buy("small_blessing", "http"), network = String(p.cert.network), transaction = String(p.cert.settlement_tx);
  const statement = { path: "/api/buy/small_blessing", transaction, network, payer: evmBuyer.address, paid_usdc: .005, outcome: "refunded", evidence: { refund_tx: `0x${"ab".repeat(32)}` } };
  await runInDurableObject(humanResolutionStore(sourceEnv), async (_instance, ctx) => {
    // A pre-existing resolution fixture; this test does not qualify refund evidence.
    await ctx.storage.put(`human-resolution:${humanResolutionKey(network, transaction)}`, { statement, signed_payload: JSON.stringify(statement), signature: "retained-resolution-signature", public_key: "retained-resolution-key" });
  });
  if (missingOriginal) await runInDurableObject(p.stub, async (_instance, ctx) => { await ctx.storage.deleteAll(); });
  const result = await claim(p.certId);
  expect(result.body).toMatchObject({ recovery_state: "resolved", next_action: "read_resolution", refunded: true, settlement_attempted: false });
  expect(result.body.fulfillment).toBeUndefined();
  expect(object(result.body.resolution).statement).toEqual(statement);
  expect(transfers).toBe(1);
});

it("OpenAPI lists the actual response keys and declares the certificate selector", async () => {
  const spec = object(await (await request("/openapi.json")).json());
  const op = object(object(object(spec.paths)["/api/claims"]).post);
  function deref(value: unknown): Obj {
    const s = object(value);if (typeof s.$ref !== "string") return s;
    let v: unknown = spec;for (const part of s.$ref.slice(2).split("/")) v = object(v)[part];return object(v);
  }
  const input = deref(object(object(object(op.requestBody).content)["application/json"]).schema);
  expect(object(input.properties).cert_id).toBeDefined();
  const result = deref(object(object(object(object(op.responses)["200"]).content)["application/json"]).schema);
  const variants = (result.oneOf as unknown[]).map(deref);
  const list = await claim();
  const listing = variants.find(s => (s.required as string[]).includes("certificates"))!;
  for (const key of listing.required as string[]) expect(list.body).toHaveProperty(key);
  expect(listing.required).not.toContain("wallet");
  const p = await buy("small_blessing", "http"), recovered = await claim(p.certId);
  const selected = variants.find(s => (s.required as string[]).includes("cert_id"))!;
  for (const key of selected.required as string[]) expect(recovered.body).toHaveProperty(key);
});

for (const door of ["http", "mcp", "mcp-standard"] as const) it(`${door}: wallet-only recovery follows the same queued order through completion`, async () => {
  const p = await buy("aura_walk", door);
  const pending = await claim(p.certId);
  expect(pending.body.recovery_state).toBe("ready");
  expect(object(pending.body.fulfillment)).toMatchObject({ order_id: p.first.order_id, status: "queued" });
  expect(object(pending.body.fulfillment).deliverable).toBeUndefined();
  const finished = "SCVD-E2E completed original wallet-recovered commission";
  const order = await completeOrder(testEnv, String(p.first.order_id), finished);
  expect(order?.status).toBe("completed");
  const recovered = await claim(p.certId);
  expect(object(recovered.body.fulfillment)).toMatchObject({ order_id: p.first.order_id, status: "completed", deliverable: finished });
  const proof = object(object(recovered.body.fulfillment).completion_proof);
  expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
  expect(transfers).toBe(1);
});
it("an older completed recovery attempt still returns its original bytes", async () => {
  const p = await buy("small_blessing", "http");
  await runInDurableObject(p.stub, async (_instance, ctx) => {
    const artifact = object(await ctx.storage.get("artifact"));
    await ctx.storage.put("attempt", { digest: artifact.digest, token: "fixture", purchase: artifact.purchase, response: await ctx.storage.get("artifact:response") });
    await ctx.storage.delete(["artifact", "artifact:response"]);
  });
  const recovered = await claim(p.certId);
  expect(recovered.body.recovery_state).toBe("ready");
  expect(object(recovered.body.fulfillment).signed_payload).toBe(p.first.signed_payload);
  expect(transfers).toBe(1);
});
it("a certificate selector cannot bypass proof or reuse a consumed challenge", async () => {
  const p = await buy("the_confession", "http");
  const address = evmBuyer.address;
  const start = await request("/api/claims/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
  const challenge = String(object(await start.json()).challenge);
  const post = (signature: string) => request("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, signature, cert_id: p.certId }) });
  const invalid = await post(await other.signMessage({ message: challenge }));
  expect(invalid.status).toBe(403);
  expect(await invalid.text()).not.toContain(p.args.confession);
  // A fresh proof is needed after any verification attempt.
  const fresh = await claim(p.certId);
  expect(fresh.body.recovery_state).toBe("ready");
  const used = await post(await evmBuyer.signMessage({ message: challenge }));
  expect(used.status).toBe(400);
  expect(object(await used.json()).fulfillment).toBeUndefined();
  expect(transfers).toBe(1);
});

for (const field of ["payer", "network", "transaction", "path"]) it(`a resolution with a different ${field} cannot override this purchase`, async () => {
  const p = await buy("the_confession", "http"), network = String(p.cert.network), transaction = String(p.cert.settlement_tx);
  const statement = { path: "/api/buy/the_confession", transaction, network, payer: evmBuyer.address, paid_usdc: .01, outcome: "refunded", evidence: { private_note: "foreign resolution canary" }, [field]: field === "payer" ? other.address : "different" };
  await runInDurableObject(humanResolutionStore(sourceEnv), async (_instance, ctx) => {
    await ctx.storage.put(`human-resolution:${humanResolutionKey(network, transaction)}`, { statement, signed_payload: JSON.stringify(statement), signature: "fixture", public_key: "fixture" });
  });
  const result = await claim(p.certId);
  expect(result.body.recovery_state).toBe("ready");
  expect(object(result.body.fulfillment).signed_payload).toBe(p.first.signed_payload);
  expect(JSON.stringify(result.body)).not.toContain("foreign resolution canary");
  expect(transfers).toBe(1);
});
it("reading the original good leaves its durable purchase journal unchanged", async () => {
  const p = await buy("small_blessing", "http");
  const before = await runInDurableObject(p.stub, async (_instance, ctx) => [...await ctx.storage.list()]);
  const result = await claim(p.certId);
  expect(result.body.recovery_state).toBe("ready");
  const after = await runInDurableObject(p.stub, async (_instance, ctx) => [...await ctx.storage.list()]);
  expect(after).toEqual(before);
  expect(transfers).toBe(1);
});
