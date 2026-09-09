import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
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
