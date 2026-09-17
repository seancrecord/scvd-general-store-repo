import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
const cli = new URL("./evidence-cli.mjs", import.meta.url);
function run(args, nodeFlags = []) { return new Promise(resolve => {
  const child = spawn(process.execPath, [...nodeFlags, cli.pathname, ...args]);
  let stdout = "", stderr = "";
  child.stdout.on("data", x => stdout += x); child.stderr.on("data", x => stderr += x);
  child.on("close", code => resolve({ code, stdout, stderr }));
}); }
test("export is bounded, preserves bytes and verifies after the origin disappears; refuses overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scvd-evidence-test-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const payload = '{ "cert_id": "cert_test", "item": "a receipt" }';
  const doc = { algorithm: "ed25519", signed_payload: payload, public_key: key, signature: sign(null, Buffer.from(payload), privateKey).toString("hex") };
  const server = createServer((req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(req.url.startsWith("/api/") ? doc : { public_key: key })); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/verify/cert_test`;
  try {
    const out = join(dir, "saved");
    const exported = await run(["export", url, "--out", out]);
    assert.equal(exported.code, 0, exported.stderr);
    assert.equal(await readFile(join(out, "payload.json"), "utf8"), payload);
    server.close();
    const verified = await run(["verify", join(out, "bundle.json"), "--public-key", key]);
    assert.equal(verified.code, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).valid, true);
    assert.equal((await run(["verify", join(out, "bundle.json"), "--public-key", key], ["--no-experimental-global-webcrypto"])).code, 0);
    assert.equal((await run(["verify", join(out, "bundle.json")])).code, 1);
    // Existing output is refused before another fetch, so this works with the server gone.
    assert.equal((await run(["export", url, "--out", out])).code, 2);
    const b = JSON.parse(await readFile(join(out, "bundle.json"), "utf8"));
    b.artifact.signed_payload += " "; await writeFile(join(out, "bundle.json"), JSON.stringify(b));
    assert.equal((await run(["verify", join(out, "bundle.json"), "--public-key", key])).code, 1);
    assert.equal((await run(["export", "https://user:password@example.test/a", "--out", join(dir, "bad")])).code, 2);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("corpus export above the default cap requires an explicit bounded allowance and detects tampering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scvd-corpus-test-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const snapshot = { version: 1, sequence: 1, taken_at: "2026-09-09T00:00:00Z", previous_digest: null, source: "ward_round", week: "2026-W37", round: { hosts: [], evidence: "x".repeat(9 * 1024 * 1024) } };
  const payload = JSON.stringify(snapshot);
  const { createHash } = await import("node:crypto");
  const doc = { snapshot, digest: createHash("sha256").update(payload).digest("hex"), signature: sign(null, Buffer.from(payload), privateKey).toString("hex"), public_key: key };
  const server = createServer((req, res) => res.end(JSON.stringify(req.url.startsWith("/corpus/") ? doc : { public_key: key })));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/corpus/1.json`;
  try {
    const out = join(dir, "saved");
    assert.equal((await run(["export", url, "--out", out])).code, 2);
    const exported = await run(["export", url, "--out", out, "--max-bytes", String(32 * 1024 * 1024)]);
    assert.equal(exported.code, 0, exported.stderr);
    assert.equal(await readFile(join(out, "payload.json"), "utf8"), payload);
    server.close();
    const input = join(out, "bundle.json");
    assert.equal((await run(["verify", input, "--public-key", key])).code, 2);
    assert.equal((await run(["verify", input, "--public-key", key, "--max-bytes", String(32 * 1024 * 1024)])).code, 0);
    for (const value of ["0", "Infinity", "1e8", "67108865"]) assert.equal((await run(["verify", input, "--public-key", key, "--max-bytes", value])).code, 2);
    const bundle = JSON.parse(await readFile(input, "utf8"));
    bundle.artifact.signed_payload += " ";
    await writeFile(input, JSON.stringify(bundle));
    assert.equal((await run(["verify", input, "--public-key", key, "--max-bytes", String(32 * 1024 * 1024)])).code, 1);
  } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
});


test("saved corpus verification stays offline, writes no duplicate files and emits bounded results", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scvd-source-test-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const snapshot = { version: 1, sequence: 1, taken_at: "2026-09-17T00:00:00Z", previous_digest: null, source: "ward_round", week: "2026-W38", round: { hosts: [], evidence: "x".repeat(11 * 1024 * 1024) } };
  const payload = JSON.stringify(snapshot);
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  const doc = { snapshot, digest: digest(payload), signature: sign(null, Buffer.from(payload), privateKey).toString("hex"), public_key: key };
  const original = JSON.stringify(doc) + "\n", source = join(dir, "original.json");
  const noNetwork = join(dir, "no-network.mjs");
  await writeFile(source, original);
  await writeFile(noNetwork, 'globalThis.fetch = () => { throw new Error("network_forbidden"); };');
  try {
    const args = ["verify-source", source, "--public-key", key, "--max-bytes", String(32 * 1024 * 1024)];
    const result = await run(args, ["--import", noNetwork]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.valid, true); assert.equal(report.evidence_complete, true);
    assert.equal(report.source_sha256, digest(original));
    assert.equal(Object.hasOwn(report, "signed_claims"), false);
    assert.ok(Buffer.byteLength(result.stdout) < 4096);
    assert.equal(await readFile(source, "utf8"), original);
    assert.deepEqual((await readdir(dir)).sort(), ["no-network.mjs", "original.json"]);
    assert.equal((await run(["verify-source", source, "--public-key", key])).code, 2);
    assert.equal((await run(["verify-source", source, "--max-bytes", String(32 * 1024 * 1024)])).code, 1);
    assert.equal((await run([...args, "--out", join(dir, "unexpected")])).code, 2);
    const wrongKey = await run(["verify-source", source, "--public-key", "0".repeat(64), "--max-bytes", String(32 * 1024 * 1024)]);
    assert.equal(wrongKey.code, 1);
    assert.ok(JSON.parse(wrongKey.stdout).problems.includes("embedded_key_differs_from_trusted_key"));
    doc.snapshot.version = 2;
    await writeFile(source, JSON.stringify(doc));
    assert.equal((await run(args)).code, 2);
    doc.snapshot.version = 1;
    doc.snapshot.round.evidence += "tampered";
    await writeFile(source, JSON.stringify(doc));
    assert.equal((await run(args)).code, 2); // The corpus digest no longer binds the snapshot.
    doc.digest = digest(JSON.stringify(doc.snapshot));
    await writeFile(source, JSON.stringify(doc));
    const rehashed = await run(args);
    assert.equal(rehashed.code, 1); assert.equal(JSON.parse(rehashed.stdout).valid, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("saved certificate verification retains missing and tampered attachment failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scvd-source-attachment-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const report = '{"url":"https://merchant.example/","scope":"unpaid"}';
  const payload = JSON.stringify({ cert_id: "cert_test", attests: createHash("sha256").update(report).digest("hex") });
  const source = join(dir, "certificate.json"), attachment = join(dir, "report.json");
  await writeFile(source, JSON.stringify({ algorithm: "ed25519", signed_payload: payload, signature: sign(null, Buffer.from(payload), privateKey).toString("hex"), public_key: key }));
  await writeFile(attachment, report);
  try {
    const args = ["verify-source", source, "--public-key", key];
    const missing = await run(args);
    assert.equal(missing.code, 3); assert.deepEqual(JSON.parse(missing.stdout).missing_evidence, ["attests"]);
    assert.equal((await run([...args, "--evidence", attachment])).code, 0);
    await writeFile(attachment, report + " ");
    assert.equal((await run([...args, "--evidence", attachment])).code, 2);
    assert.equal((await run(["verify-source", "https://merchant.example/original.json", "--public-key", key])).code, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
