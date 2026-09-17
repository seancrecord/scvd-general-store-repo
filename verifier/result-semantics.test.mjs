import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyArtifact, verifyReceipt, verifyOffer, verifyEd25519, formatResult } from "./x402-verify.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const receipt = fixture("receipt-valid");
const key = receipt.publicKeyHex;
const document = fixture("issuer-key-document");
const response = (body) => async () => new Response(JSON.stringify(body));
const offline = async () => { throw new Error("offline control"); };
const segment = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function changed({ header, payload, signature } = {}) {
  const parts = receipt.receipt.split(".");
  return [header === undefined ? parts[0] : segment(header), payload === undefined ? parts[1] : segment(payload), signature ?? parts[2]].join(".");
}
const header = JSON.parse(Buffer.from(receipt.receipt.split(".")[0], "base64url"));
const check = (result, name) => result.checks.find((entry) => entry.name === name);
function outcome(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.ok ?? result.valid, status === "valid");
  if (code) assert.ok(result.reasonCodes.includes(code), JSON.stringify(result));
  else assert.deepEqual(result.reasonCodes, []);
}

test("actual signatures, wrong keys, schema failures and expiry keep their distinct meanings", async () => {
  outcome(await verifyArtifact(receipt.receipt, { publicKey: key }), "valid");
  outcome(await verifyReceipt({ receipt: receipt.receipt, publicKey: key }), "valid");
  const wrong = fixture("receipt-wrong-key");
  outcome(await verifyReceipt({ receipt: wrong.receipt, publicKey: wrong.publicKeyHex }), "invalid", "signature_invalid");
  const bad = fixture("receipt-missing-payer");
  const result = await verifyReceipt({ receipt: bad.receipt, publicKey: bad.publicKeyHex });
  outcome(result, "invalid", "schema_invalid");
  assert.equal(check(result, "signature").ok, true);
  const expired = fixture("offer-expired-but-wellformed");
  const expiry = JSON.parse(Buffer.from(expired.offer.split(".")[1], "base64url")).validUntil;
  const offer = await verifyOffer({ offer: expired.offer, publicKey: expired.publicKeyHex }, { nowSeconds: expiry + 10, leewaySeconds: 0 });
  outcome(offer, "valid");
  assert.equal(check(offer, "expiry").reasonCode, "offer_expired");
  assert.equal(check(offer, "expiry").advisory, true);
});

for (const alg of ["ES256", "ES256K", "HS256", "not-a-known-algorithm"]) {
  test(`unsupported ${alg} never runs Ed25519 or invents a bad-signature finding`, async () => {
    let calls = 0;
    const result = await verifyArtifact(changed({ header: { ...header, alg } }), { publicKey: key, verify: () => { calls++; return true; } });
    outcome(result, "unsupported", "unsupported_algorithm");
    assert.equal(calls, 0);
    assert.equal(check(result, "signature").status, "unobserved");
    assert.equal(check(result, "signature").ok, false);
  });
}

for (const input of [null, 17, {}, "not-a-jws", changed({ header: 42 }), changed({ payload: "text" }), changed({ payload: [] })]) {
  test(`malformed input returns a report: ${JSON.stringify(input).slice(0, 55)}`, async () => {
    outcome(await verifyArtifact(input, { fetch: offline }), "invalid", "malformed_input");
    outcome(await verifyReceipt({ receipt: input }, { fetch: offline }), "invalid", "malformed_input");
  });
}

test("missing wrapper input is a malformed-input report", async () => {
  outcome(await verifyReceipt(), "invalid", "malformed_input");
  outcome(await verifyOffer({}), "invalid", "malformed_input");
});

test("an explicitly identified external signature family is unsupported, without expanding accepted inputs", async () => {
  for (const artifact of [{ format: "eip712", payload: {}, signature: "0x00" }, { format: "future", signature: "abc" }, { format: "jws", signature: receipt.receipt }]) {
    outcome(await verifyArtifact(artifact), "unsupported", "unsupported_format");
    outcome(await verifyReceipt({ receipt: artifact }), "unsupported", "unsupported_format");
  }
});

test("a missing algorithm is malformed, and a demonstrated schema failure outranks unsupported algorithm", async () => {
  outcome(await verifyArtifact(changed({ header: { kid: header.kid } }), { publicKey: key }), "invalid", "malformed_header");
  const result = await verifyArtifact(changed({ header: { ...header, alg: "ES256" }, payload: { version: 1 } }), { publicKey: key, kind: "receipt" });
  outcome(result, "invalid", "schema_invalid");
  assert.ok(result.reasonCodes.includes("unsupported_algorithm"));
  assert.equal(check(result, "signature").status, "unobserved");
});

test("a future schema is unsupported; its fields are not judged using revision one's schema", async () => {
  const result = await verifyArtifact(changed({ payload: { version: 2 } }), { publicKey: key, verify: () => true });
  outcome(result, "unsupported", "unsupported_schema_version");
  assert.equal(check(result, "schema").status, "unsupported");
  const failed = await verifyArtifact(changed({ payload: { version: 2 } }), { publicKey: key });
  outcome(failed, "invalid", "signature_invalid");
});

test("unsupported DID resolution is scoped: an explicit key can still verify bytes", async () => {
  const artifact = changed({ header: { ...header, kid: "did:pkh:eip155:1:0x123#key" } });
  outcome(await verifyArtifact(artifact, { fetch: offline }), "unsupported", "unsupported_did_method");
  // The seam controls signature validity here; the test concerns resolution, not cryptography.
  outcome(await verifyArtifact(artifact, { publicKey: key, verify: () => true }), "valid");
});

test("a malformed DID escape is a report, not a URIError", async () => {
  outcome(await verifyArtifact(changed({ header: { ...header, kid: "did:web:%ZZ#key" } }), { fetch: offline }), "invalid", "malformed_kid");
});

for (const fetch of [offline, async () => new Response("gone", { status: 404 }), response({ verificationMethod: [] })]) {
  test("missing remote evidence is inconclusive through both resolution paths", async () => {
    for (const result of [await verifyArtifact(receipt.receipt, { fetch }), await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, { fetch })]) {
      outcome(result, "inconclusive", "key_unavailable");
      assert.equal(check(result, "signature").status, "unobserved");
      assert.equal(check(result, "signature").ok, false);
    }
  });
}

test("unsupported key representations are not mistaken for a missing key or a bad signature", async () => {
  const unsupportedKey = { id: header.kid, publicKeyJwk: { kty: "EC", crv: "P-256", x: "AA", y: "AA" } };
  for (const fetch of [response({ verificationMethod: [unsupportedKey] }), response({ verificationMethod: [{ id: header.kid, publicKeyMultibase: "zOtherKey" }] })]) {
    outcome(await verifyArtifact(receipt.receipt, { fetch }), "unsupported", "unsupported_key_type");
    outcome(await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, { fetch }), "unsupported", "unsupported_key_type");
  }
  outcome(await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, { fetch: response(unsupportedKey.publicKeyJwk) }), "unsupported", "unsupported_key_type");
});

for (const body of [null, [], { verificationMethod: {} }, { verificationMethod: "oops" }, { verificationMethod: [{ id: header.kid, publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "AA" } }] }]) {
  test("malformed remote key documents remain inconclusive", async () => {
    outcome(await verifyArtifact(receipt.receipt, { fetch: response(body) }), "inconclusive", "key_document_invalid");
    outcome(await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, { fetch: response(body) }), "inconclusive", "key_document_invalid");
  });
}

test("bad explicit keys never fall back to a network key", async () => {
  for (const publicKey of ["zz", "aa", new Uint8Array(2), {}]) {
    let calls = 0;
    const result = await verifyReceipt({ receipt: receipt.receipt, publicKey }, { fetch: async () => { calls++; return new Response(JSON.stringify(document)); } });
    outcome(result, "inconclusive", "invalid_public_key");
    assert.equal(calls, 0);
  }
});

test("malformed or unsupported input cannot be hidden behind issuer fetch failure", async () => {
  outcome(await verifyReceipt({ receipt: "broken", issuerKeyUrl: "https://issuer.test/key" }, { fetch: offline }), "invalid", "malformed_input");
  outcome(await verifyReceipt({ receipt: changed({ header: { ...header, alg: "ES256" } }), issuerKeyUrl: "https://issuer.test/key" }, { fetch: offline }), "unsupported", "unsupported_algorithm");
});

test("malformed signature is a definite failure even when the key cannot be obtained", async () => {
  const result = await verifyArtifact(changed({ signature: "AA" }), { fetch: offline });
  outcome(result, "invalid", "signature_malformed");
  assert.equal(check(result, "signature").ok, false);
});

test("unsupported crypto is different from a false signature and an unexpected verifier error", async () => {
  const unavailable = { importKey: async () => { throw new DOMException("no Ed25519", "NotSupportedError"); }, verify: async () => true };
  outcome(await verifyArtifact(receipt.receipt, { publicKey: key, subtle: unavailable }), "unsupported", "unsupported_runtime");
  outcome(await verifyArtifact(receipt.receipt, { publicKey: key, subtle: {} }), "unsupported", "unsupported_runtime");
  outcome(await verifyArtifact(receipt.receipt, { publicKey: key, verify: () => { throw Error("do not leak this provider detail"); } }), "inconclusive", "verification_error");
  outcome(await verifyArtifact(receipt.receipt, { publicKey: key, verify: () => false }), "invalid", "signature_invalid");
  const failure = await verifyArtifact(receipt.receipt, { publicKey: key, verify: () => { throw Error("private provider detail"); } });
  assert.ok(!JSON.stringify(failure).includes("private provider detail"));
  assert.equal(await verifyEd25519("bytes", new Uint8Array(64), new Uint8Array(32), { verify: () => { throw Error("failure"); } }), false);
});

test("caller-selected issuer resolution is single-fetch, with no fallback to artifact-controlled origin", async () => {
  const urls = [];
  const result = await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, { fetch: async (url) => { urls.push(url); return new Response(JSON.stringify(document)); } });
  outcome(result, "valid");
  assert.deepEqual(urls, ["https://issuer.test/key"]);
  assert.equal(result.issuer.keyUrl, urls[0]);
  assert.ok(result.scope.includes(urls[0]));
});

test("existing fixture booleans are preserved and human summaries name uncertainty", async () => {
  for (const name of ["receipt-valid", "receipt-wrong-key", "receipt-missing-payer", "offer-valid", "offer-expired-but-wellformed", "offer-tampered-payload"]) {
    const item = fixture(name);
    const result = await verifyArtifact(item.receipt ?? item.offer, { publicKey: item.publicKeyHex, nowSeconds: 1767226000 });
    assert.equal(result.ok, item.expect.valid, name);
  }
  const result = await verifyArtifact(receipt.receipt, { fetch: offline });
  assert.match(formatResult(result), /INCONCLUSIVE/);
  assert.doesNotMatch(formatResult(result), /FAIL  signature/);
});

test("missing kid and an object-valued schema version report malformed fields without throwing", async () => {
  outcome(await verifyArtifact(changed({ header: { alg: "EdDSA" } }), { publicKey: key }), "invalid", "malformed_kid");
  outcome(await verifyArtifact(changed({ payload: { version: { toString: null } } }), { publicKey: key }), "invalid", "schema_invalid");
});

test("unreadable JSON and duplicate selected key IDs cannot establish a key", async () => {
  const method = document.verificationMethod[0];
  for (const fetch of [async () => new Response("not json"), response({ verificationMethod: [method, method] })]) {
    outcome(await verifyReceipt({ receipt: receipt.receipt, issuerKeyUrl: "https://issuer.test/key" }, { fetch }), "inconclusive", "key_document_invalid");
  }
});

test("a nonboolean verifier response cannot establish signature validity", async () => {
  outcome(await verifyArtifact(receipt.receipt, { publicKey: key, verify: () => "true" }), "inconclusive", "verification_error");
});

test("missing or unsupported expiry is unobserved rather than called expired", async () => {
  for (const version of [1, 2]) {
    const result = await verifyOffer({ offer: changed({ payload: { version } }), publicKey: key }, { verify: () => true, nowSeconds: 1767226000 });
    const expiry = check(result, "expiry");
    assert.equal(expiry.status, "unobserved");
    assert.equal(expiry.reasonCode, "expiry_not_checked");
    assert.equal(expiry.advisory, true);
    assert.ok(!result.reasonCodes.includes("expiry_not_checked"));
  }
});

test("schema failure and unsupported revision each retain missing-key evidence with the stated precedence", async () => {
  for (const version of [1, 2]) {
    const result = await verifyArtifact(changed({ payload: { version } }), { fetch: offline });
    outcome(result, version === 1 ? "invalid" : "unsupported", version === 1 ? "schema_invalid" : "unsupported_schema_version");
    assert.ok(result.reasonCodes.includes("key_unavailable"));
    assert.equal(check(result, "key-resolution").status, "inconclusive");
    assert.equal(check(result, "signature").status, "unobserved");
  }
});

test("missing WebCrypto is structured at the artifact boundary and preserves the legacy raw helper exception", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    outcome(await verifyArtifact(receipt.receipt, { publicKey: key }), "unsupported", "unsupported_runtime");
    await assert.rejects(verifyEd25519("bytes", new Uint8Array(64), new Uint8Array(32)), /No WebCrypto available/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  }
});
