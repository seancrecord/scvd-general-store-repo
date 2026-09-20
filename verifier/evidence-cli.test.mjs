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

test("subject reading selects only authenticated exact-URL corpus rows and preserves gaps and dates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "scvd-subject-test-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const url = "https://merchant.example/paid?kind=one";
  const row = { url, observed_at: "2026-09-07T00:00:00Z", verdict: "ready", failed: [], gaps: ["no payment made"] };
  const snapshot = { version: 1, sequence: 1, taken_at: "2026-09-18T00:00:00Z", previous_digest: null, source: "ward_round", week: "2026-W38", round: { hosts: [row, { ...row, url: "https://merchant.example/paid?kind=two" }] } };
  const source = join(dir, "original.json");
  const save = async () => {
    const payload = JSON.stringify(snapshot);
    const doc = { snapshot, digest: createHash("sha256").update(payload).digest("hex"), signature: sign(null, Buffer.from(payload), privateKey).toString("hex"), public_key: key,
      history: [{ ...row, observed_at: "2026-09-18T00:00:00Z" }, row, row] };
    await writeFile(source, JSON.stringify(doc));
    return doc;
  };
  const args = ["verify-source", source, "--public-key", key, "--subject", url];
  try {
    const doc = await save();
    const original = await readFile(source, "utf8");
    const good = await run(args);
    assert.equal(good.code, 0, good.stderr);
    const reading = JSON.parse(good.stdout).subject_evidence;
    assert.equal(reading.status, "present");
    assert.equal(reading.matched_observations, 1);
    assert.equal(reading.snapshot_taken_at, snapshot.taken_at);
    assert.deepEqual(reading.observations, [{ signed_claims_pointer: "/round/hosts/0", value: row }]);
    assert.equal(reading.omitted_observations, 0);
    assert.equal(await readFile(source, "utf8"), original);
    assert.deepEqual(await readdir(dir), ["original.json"]);
    const absent = await run([...args.slice(0, -1), "https://merchant.example/paid"]);
    assert.equal(absent.code, 0); // Exit codes still describe signature/bindings, not subject presence.
    assert.equal(JSON.parse(absent.stdout).subject_evidence.status, "absent_from_snapshot");
    const badKey = await run(["verify-source", source, "--public-key", "0".repeat(64), "--subject", url]);
    assert.equal(badKey.code, 1);
    assert.equal(JSON.parse(badKey.stdout).subject_evidence.status, "not_verified");
    assert.deepEqual(JSON.parse(badKey.stdout).subject_evidence.observations, []);
    doc.snapshot.round.hosts[0].verdict = "tampered";
    doc.digest = createHash("sha256").update(JSON.stringify(doc.snapshot)).digest("hex");
    await writeFile(source, JSON.stringify(doc));
    const tampered = await run(args);
    assert.equal(tampered.code, 1);
    assert.deepEqual(JSON.parse(tampered.stdout).subject_evidence.observations, []);
    snapshot.round.hosts = Array.from({ length: 40 }, () => ({ ...row, large: "x".repeat(4096) }));
    await save();
    const cappedOutput = await run(args);
    const capped = JSON.parse(cappedOutput.stdout).subject_evidence;
    assert.equal(capped.matched_observations, 40);
    assert.ok(capped.omitted_observations > 0);
    assert.equal(capped.observations.length + capped.omitted_observations, 40);
    assert.ok(Buffer.byteLength(JSON.stringify(capped.observations)) <= capped.observations_max_bytes);
    assert.ok(Buffer.byteLength(cappedOutput.stdout) < capped.observations_max_bytes + 4096);
    assert.deepEqual(capped.observations[0].value, snapshot.round.hosts[0]); // Whole rows, no hidden gap stripping.
    snapshot.round.hosts = [{ ...row, large: "x".repeat(40000) }];
    await save();
    const oversized = JSON.parse((await run(args)).stdout).subject_evidence;
    assert.equal(oversized.status, "present");
    assert.equal(oversized.matched_observations, 1);
    assert.equal(oversized.omitted_observations, 1);
    assert.deepEqual(oversized.observations, []);
    let nested = { gap: "not observed" };
    for (let i = 0; i < 500; i++) nested = { nested };
    snapshot.round.hosts = [{ ...row, nested, unicode: "🦖".repeat(10000) }, { ...row, nested }];
    await save();
    const nestedOutput = await run(args);
    const nestedReading = JSON.parse(nestedOutput.stdout).subject_evidence;
    assert.equal(nestedReading.matched_observations, 2);
    assert.equal(nestedReading.omitted_observations, 1); // Count UTF-8 bytes, not JS characters.
    assert.deepEqual(nestedReading.observations[0].value, snapshot.round.hosts[1]);
    assert.ok(Buffer.byteLength(nestedOutput.stdout) < nestedReading.observations_max_bytes + 4096);
    const payload = JSON.stringify({ cert_id: "cert_other", url });
    await writeFile(source, JSON.stringify({ algorithm: "ed25519", signed_payload: payload, signature: sign(null, Buffer.from(payload), privateKey).toString("hex"), public_key: key }));
    const unsupported = await run(args);
    assert.equal(unsupported.code, 0);
    assert.equal(JSON.parse(unsupported.stdout).subject_evidence.status, "unsupported_artifact");
    assert.equal((await run([...args.slice(0, -1), "not-a-url"])).code, 2);
    assert.equal((await run([...args.slice(0, -1), "https://user:secret@merchant.example/"])).code, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("export refuses a redirect, reads only the named URL and its own origin's key document, and never fetches a URL the payload names", async () => {
  // README: "Export reads the chosen URL and its same-origin key document
  // only; redirects are refused and embedded URLs are never fetched." A
  // transport claim on a published package's front page with no test
  // behind it is a sentence, not a property; this is the check.
  const dir = await mkdtemp(join(tmpdir(), "scvd-evidence-transport-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const elsewhere = { hits: [] };
  const other = createServer((req, res) => { elsewhere.hits.push(req.url); res.setHeader("Content-Type", "application/json"); res.end("{}"); });
  await new Promise(resolve => other.listen(0, "127.0.0.1", resolve));
  const otherBase = `http://127.0.0.1:${other.address().port}`;
  // The payload names another origin; a naive exporter might follow it.
  const payload = `{ "cert_id": "cert_transport", "item": "a receipt", "see_also": "${otherBase}/embedded", "issuer_key_url": "${otherBase}/.well-known/scvd-signing-key" }`;
  const doc = { algorithm: "ed25519", signed_payload: payload, public_key: key, signature: sign(null, Buffer.from(payload), privateKey).toString("hex") };
  const here = { hits: [] };
  const origin = createServer((req, res) => {
    here.hits.push(req.url);
    if (req.url === "/redirected") { res.statusCode = 302; res.setHeader("Location", `${otherBase}/api/verify/cert_transport`); res.end(); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url.startsWith("/api/") ? doc : { algorithm: "ed25519", public_key: key }));
  });
  await new Promise(resolve => origin.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${origin.address().port}`;
  try {
    const redirected = await run(["export", `${base}/redirected`, "--out", join(dir, "redirected")]);
    assert.equal(redirected.code, 2, redirected.stdout);
    assert.deepEqual(here.hits, ["/redirected"]);
    assert.deepEqual(elsewhere.hits, [], "the redirect target was fetched");
    await assert.rejects(readdir(join(dir, "redirected")), "nothing was written for a refused redirect");

    here.hits.length = 0;
    const exported = await run(["export", `${base}/api/verify/cert_transport`, "--out", join(dir, "saved")]);
    assert.equal(exported.code, 0, exported.stderr);
    // Exactly the named URL and this origin's key document, in that order; nothing the payload named.
    assert.deepEqual(here.hits, ["/api/verify/cert_transport", "/.well-known/scvd-signing-key"]);
    assert.deepEqual(elsewhere.hits, [], "a URL embedded in the payload was fetched");
    assert.equal(await readFile(join(dir, "saved", "payload.json"), "utf8"), payload);
  } finally {
    origin.close(); other.close();
    await rm(dir, { recursive: true, force: true });
  }
});

// Exercise the command a cold buyer actually sees, not a second hand-written
// invocation that could keep passing while the installable guide drifts.
test("buyer guide command selects signed endpoint evidence without authenticating adjacent history", async (t) => {
  const guide = await readFile(new URL("../skills/scvd-x402-verification/SKILL.md", import.meta.url), "utf8");
  const command = [...guide.matchAll(/```sh\n([\s\S]*?)\n```/g)]
    .map(match => match[1].replace(/\\\n\s*/g, " ").trim())
    .find(block => block.startsWith("scvd-evidence verify-source ") && block.includes("--subject"));
  assert.ok(command, "the buyer guide must provide an executable exact-subject verification command");
  const words = command.match(/'[^']*'|"[^"]*"|\S+/g).map(word => word.replace(/^(['"])(.*)\1$/, "$2"));
  const dir = await mkdtemp(join(tmpdir(), "scvd-buyer-guide-"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const url = "https://merchant.example/paid?kind=one";
  const row = { url, verdict: "ready", observed_at: "2026-09-07T02:30:20.531Z", gaps: ["delivery untested"] };
  const snapshot = { version: 1, sequence: 7, taken_at: "2026-09-18T14:22:58.378Z", previous_digest: null, source: "ward_round", week: "2026-W37", round: { hosts: [row, { ...row, url: "https://merchant.example/paid?kind=two" }] } };
  const payload = JSON.stringify(snapshot);
  const doc = { snapshot, digest: createHash("sha256").update(payload).digest("hex"), signature: sign(null, Buffer.from(payload), privateKey).toString("hex"), public_key: key,
    context: { tier: "unsigned-tier", observation_count: 3, observed_at: "2026-09-19T00:00:00Z" } };
  const source = join(dir, "original.json");
  const substitutions = { "./evidence/original.json": source, TRUSTED_PUBLIC_KEY_HEX: key, CALLER_MAX_BYTES: "32768", EXACT_ENDPOINT_URL: url };
  const args = words.slice(1).map(word => substitutions[word] ?? word);
  const noNetwork = join(dir, "no-network.mjs");
  await writeFile(noNetwork, 'globalThis.fetch = () => { throw new Error("network_forbidden"); };');
  const invoke = (overrides = {}) => run(args.map(arg => overrides[arg] ?? arg), ["--import", noNetwork]);
  try {
    await writeFile(source, JSON.stringify(doc));
    await t.test("one exact signed row, separate observation date, unchanged original", async () => {
      const before = await readFile(source, "utf8"), result = await invoke();
      assert.equal(result.code, 0, result.stderr);
      const reading = JSON.parse(result.stdout);
      assert.equal(reading.valid, true); assert.equal(reading.evidence_complete, true);
      assert.equal(reading.subject_evidence.status, "present");
      assert.equal(reading.subject_evidence.matched_observations, 1);
      assert.equal(reading.subject_evidence.omitted_observations, 0);
      assert.deepEqual(reading.subject_evidence.observations.map(entry => entry.value), [row]);
      assert.equal(reading.subject_evidence.snapshot_taken_at, snapshot.taken_at);
      assert.equal(result.stdout.includes("unsigned-tier"), false);
      assert.equal(await readFile(source, "utf8"), before);
      assert.deepEqual((await readdir(dir)).sort(), ["no-network.mjs", "original.json"]);
    });
    await t.test("exit zero for a valid snapshot does not establish an absent subject", async () => {
      const result = await invoke({ [url]: "https://merchant.example/paid" });
      assert.equal(result.code, 0);
      const reading = JSON.parse(result.stdout).subject_evidence;
      assert.equal(reading.status, "absent_from_snapshot");
      assert.deepEqual(reading.observations, []);
    });
    await t.test("wrong key exposes no authenticated observations", async () => {
      const result = await invoke({ [key]: "0".repeat(64) });
      assert.equal(result.code, 1);
      assert.deepEqual(JSON.parse(result.stdout).subject_evidence.observations, []);
    });
    await t.test("tampered and rehashed signed row still fails", async () => {
      const changed = structuredClone(doc); changed.snapshot.round.hosts[0].verdict = "changed";
      changed.digest = createHash("sha256").update(JSON.stringify(changed.snapshot)).digest("hex");
      await writeFile(source, JSON.stringify(changed));
      const result = await invoke();
      assert.equal(result.code, 1);
      assert.equal(JSON.parse(result.stdout).subject_evidence.status, "not_verified");
      assert.deepEqual(JSON.parse(result.stdout).subject_evidence.observations, []);
    });
    await t.test("unsigned host history cannot substitute for an original", async () => {
      await writeFile(source, JSON.stringify({ host: "merchant.example", tier: doc.context.tier, timeline: [row], public_key: key }));
      const result = await invoke();
      assert.equal(result.code, 2);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
