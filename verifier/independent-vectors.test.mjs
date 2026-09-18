import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyArtifact, verifyOffer, verifyReceipt } from "./x402-verify.js";
import { digest, validateInventory, nativeJws, assertOracle } from "./test-support/independent-matrix.mjs";

const matrix = JSON.parse(readFileSync(new URL("./fixtures/independent/matrix.json", import.meta.url)));

test("matrix inventory and hashes cannot quietly lose a control or invent support", () => {
  validateInventory(matrix);
});

test("SCVD remains a hashed supplemental issuer case within Ed25519", async () => {
  for (const row of matrix.issuerCases) {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/${row.fixture}`, import.meta.url)));
    assert.equal(digest(fixture), row.sha256);
    assert.equal(row.family, 'EdDSA');
    const artifact = fixture.offer ?? fixture.receipt;
    const result = await verifyArtifact(artifact, { kind: fixture.offer ? 'offer' : 'receipt',
      publicKey: fixture.publicKeyHex, nowSeconds: matrix.clock });
    assert.equal(result.status, 'valid');
  }
});

for (const vector of matrix.vectors) {
  test(`${vector.id}: independent bytes and scoped package result`, async () => {
    // Node/OpenSSL is a separate implementation from the noble generator.
    if (vector.oracle.encoding === "jws") {
      assertOracle(vector, nativeJws(vector));
    }
    const key = vector.publicJwk?.kty === "OKP" ? Buffer.from(vector.publicJwk.x, "base64url") : undefined;
    let cryptoCalls = 0;
    const options = { kind: vector.kind, nowSeconds: matrix.clock, publicKey: key,
      fetch: async () => { throw Error("matrix never uses a live issuer"); } };
    const result = await verifyArtifact(vector.artifact, options);
    assert.equal(result.status, vector.expectedPackage.status, vector.id);
    assert.equal(result.ok, vector.expectedPackage.status === "valid");
    for (const reason of vector.expectedPackage.reasons) assert.ok(result.reasonCodes.includes(reason), `${vector.id}: ${reason}`);
    if (vector.expectedPackage.signature) {
      assert.equal(result.checks.find((c) => c.name === "signature")?.status, vector.expectedPackage.signature);
    }
    // A deliberately permissive crypto seam must never enable another family.
    if (vector.expectedPackage.status === "unsupported") {
      const unsupported = await verifyArtifact(vector.artifact, { ...options, verify: () => { cryptoCalls++; return true; } });
      assert.equal(unsupported.ok, false);
      assert.equal(cryptoCalls, 0);
    }
    const bounded = await (vector.kind === "offer" ? verifyOffer({ offer: vector.artifact, publicKey: key }, options)
      : verifyReceipt({ receipt: vector.artifact, publicKey: key }, options));
    assert.equal(bounded.status, result.status);
    if (vector.case === "wrong-authority" || vector.case === "authority-unavailable") {
      assert.equal(vector.oracle.signature, true);
      assert.notEqual(vector.oracle.claim, "valid");
      assert.ok(bounded.doesNotEstablish.some((text) => text.includes("authorization")));
    }
  });
}

test("independent Ed25519 controls agree via pinned hex, DID JWK and caller-selected key documents", async () => {
  for (const vector of matrix.vectors.filter((v) => v.family === "EdDSA" && v.oracle.encoding === "jws")) {
    const header = JSON.parse(Buffer.from(vector.artifact.split(".")[0], "base64url"));
    const document = { verificationMethod: [{ id: header.kid, publicKeyJwk: vector.publicJwk }] };
    let calls = 0;
    const options = { nowSeconds: matrix.clock, fetch: async () => { calls++; return new Response(JSON.stringify(document)); } };
    assert.equal((await verifyArtifact(vector.artifact, { ...options, kind: vector.kind })).status, vector.expectedPackage.status);
    assert.equal(calls, 1);
    assert.equal((await verifyArtifact(vector.artifact, { kind: vector.kind, nowSeconds: matrix.clock,
      publicKey: Buffer.from(vector.publicJwk.x, 'base64url').toString('hex') })).status, vector.expectedPackage.status);
    const verify = vector.kind === "offer" ? verifyOffer : verifyReceipt;
    for (const body of [document, vector.publicJwk, { publicKeyHex: Buffer.from(vector.publicJwk.x, "base64url").toString("hex") }]) {
      assert.equal((await verify({ [vector.kind]: vector.artifact, issuerKeyUrl: "https://issuer.test/key" }, {
        nowSeconds: matrix.clock, fetch: async () => new Response(JSON.stringify(body)),
      })).status, vector.expectedPackage.status);
    }
    if (vector.case === 'positive') {
      const missing = await verifyArtifact(vector.artifact, { kind: vector.kind, nowSeconds: matrix.clock, fetch: async () => new Response('{"verificationMethod":[]}') });
      assert.equal(missing.status, "inconclusive");
      assert.ok(missing.reasonCodes.includes("key_unavailable"));
    }
  }
});

test("the harness rejects missing families and missing negative controls", () => {
  const family = structuredClone(matrix);
  family.families = family.families.filter((row) => row.id !== 'ES256K');
  assert.throws(() => validateInventory(family));
  const control = structuredClone(matrix);
  control.vectors = control.vectors.filter((row) => row.id !== 'EdDSA/offer/wrong-authority');
  assert.throws(() => validateInventory(control), /lacks wrong-authority/);
});

test("rehashed signature, authority and schema mutants cannot manufacture a valid claim", () => {
  const original = matrix.vectors.find((v) => v.family === 'EdDSA' && v.kind === 'offer' && v.case === 'positive');
  const rehash = (vector) => { delete vector.sha256; vector.sha256 = digest(vector); return vector; };
  const mutants = [
    (v) => { const parts = v.artifact.split('.'); parts[2] = Buffer.alloc(64).toString('base64url'); v.artifact = parts.join('.'); },
    (v) => { v.authorization['https://independent.example.test'] = ['wrong-authority']; },
    (v) => { v.authorization = {}; },
  ];
  for (const mutate of mutants) {
    const vector = structuredClone(original); mutate(vector); rehash(vector);
    // Hash bookkeeping alone passes; an independent claim check must fail.
    validateInventory({ ...matrix, vectors: matrix.vectors.map((v) => v.id === vector.id ? vector : v) });
    assert.throws(() => assertOracle(vector, nativeJws(vector)), /independent claim/);
  }
  const badSchema = structuredClone(matrix.vectors.find((v) => v.family === 'EdDSA' && v.case === 'wrong-field-type'));
  badSchema.oracle.schema = true; badSchema.oracle.claim = 'valid'; rehash(badSchema);
  assert.throws(() => assertOracle(badSchema, nativeJws(badSchema)), /independent claim/);
});
