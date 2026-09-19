import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { spawn } from "node:child_process";
import { CAPABILITIES, DOES_NOT_ESTABLISH, runtimeCapabilities, verifyArtifact, resolveDidWeb } from "./x402-verify.js";

/**
 * THE INVENTORY IS HELD TO THE CODE, NOT THE OTHER WAY ROUND. A list of
 * what a package supports is a claim; this proves each row against the
 * dispatch (a listed algorithm verifies, an unlisted one earns the
 * listed reason code), holds the list to the type declarations and the
 * README so the three cannot drift apart, and proves the runtime probe
 * answers "verified" only when a known vector actually verifies.
 */
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const receipt = fixture("receipt-valid");
const segment = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const parts = receipt.receipt.split(".");
const header = JSON.parse(Buffer.from(parts[0], "base64url"));
const payload = JSON.parse(Buffer.from(parts[1], "base64url"));
const withHeader = (patch) => [segment({ ...header, ...patch }), parts[1], parts[2]].join(".");
const withPayload = (patch) => [parts[0], segment({ ...payload, ...patch }), parts[2]].join(".");
const codes = (result) => result.reasonCodes;
const types = readFileSync(new URL("./x402-verify.d.ts", import.meta.url), "utf8");
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");

test("every listed algorithm verifies and every unlisted one earns the listed reason code", async () => {
  for (const alg of CAPABILITIES.algorithms) {
    const result = await verifyArtifact(withHeader({ alg }), { publicKey: receipt.publicKeyHex, subtle: webcrypto.subtle });
    assert.equal(result.status, "valid", `${alg}: ${JSON.stringify(result.reasonCodes)}`);
  }
  for (const alg of ["ES256", "ES256K", "HS256", "RS256"]) {
    assert.ok(!CAPABILITIES.algorithms.includes(alg));
    const result = await verifyArtifact(withHeader({ alg }), { publicKey: receipt.publicKeyHex, subtle: webcrypto.subtle });
    assert.equal(result.status, "unsupported");
    assert.ok(codes(result).includes("unsupported_algorithm"));
  }
});

test("each unsupported reason code the inventory lists is one the dispatch actually produces", async () => {
  const produced = new Set();
  const collect = (result) => { for (const code of codes(result)) if (code.startsWith("unsupported_")) produced.add(code); };
  collect(await verifyArtifact({ format: "labelled-jws", value: receipt.receipt }, { publicKey: receipt.publicKeyHex }));
  collect(await verifyArtifact(withHeader({ alg: "ES256K" }), { publicKey: receipt.publicKeyHex }));
  collect(await verifyArtifact(withPayload({ version: CAPABILITIES.payload_schema_versions.at(-1) + 1 }), { publicKey: receipt.publicKeyHex, subtle: webcrypto.subtle }));
  const didKey = await resolveDidWeb("did:key:z6Mk");
  if (didKey.reasonCode) produced.add(didKey.reasonCode);
  const document = { verificationMethod: [{ id: header.kid, publicKeyJwk: { kty: "EC", crv: "secp256k1", x: "AA", y: "AA" } }] };
  collect(await verifyArtifact(receipt.receipt, { fetch: async () => new Response(JSON.stringify(document)) }));
  collect(await verifyArtifact(receipt.receipt, { publicKey: receipt.publicKeyHex, subtle: { importKey: undefined, verify: undefined } }));
  assert.deepEqual([...CAPABILITIES.unsupported_reason_codes].sort(), [...produced].sort());
  // And the type union names no unsupported code the inventory omits.
  const declared = [...types.matchAll(/"(unsupported_[a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(declared)].sort(), [...CAPABILITIES.unsupported_reason_codes].sort());
});

test("the check names, kinds, schema versions and non-claims match the declarations and the code", async () => {
  const declaredChecks = types.split("export interface VerifyCheck")[1].split("ok: boolean")[0].match(/"([a-z-]+)"/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...CAPABILITIES.checks], declaredChecks);
  for (const name of CAPABILITIES.advisory_checks) assert.ok(CAPABILITIES.checks.includes(name));
  const result = await verifyArtifact(receipt.receipt, { publicKey: receipt.publicKeyHex, subtle: webcrypto.subtle });
  const ran = result.checks.map((check) => check.name);
  for (const name of ran) assert.ok(CAPABILITIES.checks.includes(name), name);
  for (const check of result.checks) assert.equal(check.advisory === true, CAPABILITIES.advisory_checks.includes(check.name), check.name);
  assert.equal(CAPABILITIES.not_established, DOES_NOT_ESTABLISH);
  assert.deepEqual([...CAPABILITIES.artifact_kinds].sort(), ["offer", "receipt"]);
  // Revision 1 is the one schema the local checks know; the next one is refused above.
  assert.deepEqual([...CAPABILITIES.payload_schema_versions], [1]);
  assert.match(CAPABILITIES.scope, /no payment rail/);
  assert.ok(Object.isFrozen(CAPABILITIES) && Object.isFrozen(CAPABILITIES.algorithms));
});

test("the README's capability rows name what the inventory names, and nothing the code lacks", () => {
  const section = readme.split("## Capability inventory")[1]?.split("\n## ")[0];
  assert.ok(section, "the README carries the inventory section");
  for (const list of ["artifact_formats", "algorithms", "key_types", "did_methods", "unsupported_reason_codes", "checks"]) {
    for (const entry of CAPABILITIES[list]) assert.ok(section.includes(`\`${entry}\``), `${list}: ${entry}`);
  }
  assert.ok(section.includes("`runtimeCapabilities(") && section.includes("`CAPABILITIES`"));
  assert.ok(section.includes("scvd-evidence capabilities"));
  // The supported-checks table stays consistent with the inventory's refusals.
  const table = readme.split("## Supported checks")[1].split("\n## ")[0];
  for (const code of ["unsupported_algorithm", "unsupported_format"]) assert.ok(table.includes(`\`${code}\``), code);
});

test("the runtime probe proves Ed25519 on a known vector and never reports it by declaration", async () => {
  const node = await runtimeCapabilities({ subtle: webcrypto.subtle });
  assert.deepEqual({ ...node }, { ed25519: "verified", ed25519_source: "webcrypto", did_resolution: "global-fetch", sha256: "webcrypto" });
  const none = await runtimeCapabilities({ subtle: { importKey: undefined, verify: undefined }, fetch: undefined });
  assert.equal(none.ed25519, "unavailable");
  assert.equal(none.ed25519_source, "unavailable");
  const liar = await runtimeCapabilities({ verify: async () => false });
  assert.deepEqual([liar.ed25519, liar.ed25519_source], ["failed", "injected"]);
  const honest = await runtimeCapabilities({ verify: (input, signature, key) => webcrypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, ["verify"]).then((k) => webcrypto.subtle.verify({ name: "Ed25519" }, k, signature, new TextEncoder().encode(input))), digest: () => "00", fetch: async () => new Response("{}") });
  assert.deepEqual({ ...honest }, { ed25519: "verified", ed25519_source: "injected", did_resolution: "injected", sha256: "injected" });
  const throwing = await runtimeCapabilities({ subtle: { importKey: async () => { throw Object.assign(new Error("no"), { name: "NotSupportedError" }); }, verify: async () => true, digest: async () => new ArrayBuffer(32) } });
  assert.equal(throwing.ed25519, "unavailable");
});

test("scvd-evidence capabilities prints the inventory beside this runtime's proven answer", async () => {
  const cli = new URL("./evidence-cli.mjs", import.meta.url);
  const run = (args, nodeFlags = []) => new Promise((resolve) => {
    const child = spawn(process.execPath, [...nodeFlags, cli.pathname, ...args]);
    let stdout = "", stderr = "";
    child.stdout.on("data", (x) => stdout += x); child.stderr.on("data", (x) => stderr += x);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  const printed = await run(["capabilities"]);
  assert.equal(printed.code, 0, printed.stderr);
  const document = JSON.parse(printed.stdout);
  assert.deepEqual(document.package, JSON.parse(JSON.stringify(CAPABILITIES)));
  assert.equal(document.runtime.ed25519, "verified");
  // Node 18's disabled global still reaches WebCrypto through node:crypto, as the other commands do.
  assert.equal(JSON.parse((await run(["capabilities"], ["--no-experimental-global-webcrypto"])).stdout).runtime.ed25519, "verified");
  assert.equal((await run(["capabilities", "extra"])).code, 2);
});
