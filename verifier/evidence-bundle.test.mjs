import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createEvidenceBundle, verifyEvidenceBundle, detachedTimestamp } from "./evidence-bundle.js";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const pair = generateKeyPairSync("ed25519");
const key = pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const evidence = Buffer.from('{"observed":"a door answered"}');
function response(fields = {}) {
  const signed_payload = JSON.stringify({ cert_id: "cert_example", date: "2026-09-08T12:00:00Z", attests: hash(evidence), ...fields });
  return { algorithm: "ed25519", signed_payload, public_key: key,
    signature: sign(null, Buffer.from(signed_payload), pair.privateKey).toString("hex"),
    artifact_hash: hash(signed_payload), valid: true };
}
async function bundle(fields) {
  return createEvidenceBundle(response(fields), { capturedAt: "2026-09-08T13:00:00Z", sourceUrl: "https://issuer.example/api/verify/cert_example", attachments: [{ name: "observation.json", bytes: evidence }] });
}

test("exact signed bytes and attached evidence verify offline against a separately held key", async () => {
  const b = await bundle();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("offline"); };
  try {
    const r = await verifyEvidenceBundle(b, { publicKey: key });
    assert.equal(r.valid, true);
    assert.equal(r.evidence_complete, true);
    assert.deepEqual(r.signed_claims, JSON.parse(response().signed_payload));
    assert.equal(r.timestamp.status, "absent");
    assert.equal(r.timestamp.verified, false);
    assert.match(r.scope, /supplied/);
  } finally { globalThis.fetch = oldFetch; }
});

test("the embedded key never appoints itself trusted", async () => {
  const r = await verifyEvidenceBundle(await bundle());
  assert.equal(r.valid, false);
  assert.ok(r.problems.includes("trusted_key_required"));
});

for (const [name, mutate] of [
  ["signed payload", b => { b.artifact.signed_payload = b.artifact.signed_payload.replace("a", "b"); }],
  ["signature", b => { b.artifact.signature = "00".repeat(64); }],
  ["embedded key", b => { b.artifact.public_key = "11".repeat(32); }],
  ["algorithm", b => { b.artifact.algorithm = "ML-DSA-65"; }],
  ["format version", b => { b.format = "scvd-evidence-bundle/v2"; }],
  ["attachment, including a forged new checksum", b => { b.attachments[0].bytes_base64 = Buffer.from("fake").toString("base64"); b.attachments[0].sha256 = hash("fake"); }],
  ["attachment relabelled as unrelated", b => { b.attachments[0].binding = "unrelated"; }],
  ["duplicate attachment", b => { b.attachments.push(b.attachments[0]); }],
]) test(`rejects changed ${name}`, async () => {
  const b = await bundle(); mutate(b);
  assert.equal((await verifyEvidenceBundle(b, { publicKey: key })).valid, false);
});

test("deleting evidence preserves the signature result but cannot preserve completeness", async () => {
  const b = await bundle(); b.attachments = [];
  const r = await verifyEvidenceBundle(b, { publicKey: key });
  assert.equal(r.valid, true);
  assert.equal(r.evidence_complete, false);
  assert.deepEqual(r.missing_evidence, ["attests"]);
});

test("source metadata cannot overwrite signed claims, even if rehashed or labelled valid", async () => {
  const b = await bundle();
  b.context = { valid: true, public_key: "00".repeat(32), certificate: { item: "a different good" } };
  const r = await verifyEvidenceBundle(b, { publicKey: key });
  assert.equal(r.valid, true);
  assert.equal(r.signed_claims.item, undefined);
  assert.equal(r.context_authenticated, false);
});

test("an issuer's bounded label and altered proof never become an independently verified timestamp", async () => {
  const doc = response();
  doc.existence = { status: "bounded", digest: doc.artifact_hash, proof_base64: Buffer.from([0, 1, 2]).toString("base64"), existed_by: { block_height: 999 } };
  const b = await createEvidenceBundle(doc);
  b.timestamp.proof_base64 = Buffer.from("changed").toString("base64");
  const r = await verifyEvidenceBundle(b, { publicKey: key });
  assert.equal(r.timestamp.status, "unverified");
  assert.equal(r.timestamp.verified, false);
  b.timestamp.digest = "00".repeat(32);
  assert.equal((await verifyEvidenceBundle(b, { publicKey: key })).valid, false);
});

test("OTS export wraps the raw calendar operations with detached-file header and the exact payload digest", async () => {
  const digest = hash("payload");
  const ops = Buffer.from("000588960d73d719010101", "hex");
  const file = detachedTimestamp(digest, ops.toString("base64"));
  assert.equal(Buffer.from(file).toString("hex"), "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294" + "0108" + digest + ops.toString("hex"));
});

test("rejects malformed or oversized inputs and attachments without a signed binding", async () => {
  await assert.rejects(() => createEvidenceBundle({ ...response(), public_key: [key] }));
  await assert.rejects(() => createEvidenceBundle({ ...response(), signature: [response().signature] }));
  await assert.rejects(() => createEvidenceBundle({ ...response(), algorithm: "none" }));
  await assert.rejects(() => createEvidenceBundle(response(), { attachments: [{ name: "extra", bytes: Buffer.from("unbound") }] }));
  assert.equal((await verifyEvidenceBundle(null, { publicKey: key })).valid, false);
  const b = await bundle(); b.attachments[0].bytes_base64 = "not base64!";
  assert.equal((await verifyEvidenceBundle(b, { publicKey: key })).valid, false);
  await assert.rejects(() => createEvidenceBundle({ ...response(), signed_payload: "a".repeat(16 * 1024 * 1024) }));
});

test("corpus canonical field order is fixed, and a changed digest or unsupported schema is refused", async () => {
  const snapshot = { version:1,sequence:1,taken_at:"2026-09-09",previous_digest:null,source:"ward_round",week:"2026-W37",round:{hosts:[]} };
  const payload = JSON.stringify(snapshot);
  const doc = {snapshot:Object.fromEntries(Object.entries(snapshot).reverse()),digest:hash(payload),signature:sign(null,Buffer.from(payload),pair.privateKey).toString('hex'),public_key:key};
  const bundle = await createEvidenceBundle(doc);
  assert.equal(bundle.artifact.signed_payload,payload);
  assert.equal((await verifyEvidenceBundle(bundle,{publicKey:key})).valid,true);
  await assert.rejects(createEvidenceBundle({...doc,digest:'0'.repeat(64)}),/corpus_digest_mismatch/);
  await assert.rejects(createEvidenceBundle({...doc,snapshot:{...snapshot,version:2}}),/unsupported_corpus_snapshot/);
});
