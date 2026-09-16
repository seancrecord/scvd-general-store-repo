/**
 * node --test scripts/ownership-check.test.mjs
 *
 * The guard's own guard. scripts/ownership-check.mjs exists to catch
 * one silent failure — a rotated payTo wallet leaving a published
 * proof pointing at a wallet nobody is paid at any more — and a
 * verifier that always answered "false" would report that failure
 * forever while a verifier that always answered "true" would never
 * report it. Neither is visible from the script's own output, so both
 * directions are exercised here against a real signature over a local
 * document.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { privateKeyToAccount } from "viem/accounts";

const run = promisify(execFile);

/** One document shaped like ours: proofs at the root, payTo in the accepts. */
function docWith(proofs, payTo) {
  return {
    openapi: "3.1.0",
    info: { title: "fixture", version: "0" },
    "x-agentcash-provenance": { ownershipProofs: proofs },
    paths: {
      "/api/buy/thing": {
        get: { "x-payment-info": { accepts: [{ payTo, network: "eip155:8453", amount: "1" }] } },
      },
    },
  };
}

/**
 * The served document is MUTABLE on purpose. The message a proof
 * signs is the origin, and the origin includes the port the OS hands
 * us — so the document can only be built after the listener is up.
 * Serving one doc and signing against another was the first version
 * of this file, and it failed for a reason that had nothing to do
 * with the code under test.
 */
async function serve(doc) {
  const held = { doc };
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(held.doc));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, held, close: () => new Promise((r) => server.close(r)) };
}

async function check(doc, extra = []) {
  const { base, close } = await serve(doc);
  try {
    const { stdout } = await run("node", ["scripts/ownership-check.mjs", `--base=${base}`, "--json", ...extra]);
    return { code: 0, reading: JSON.parse(stdout) };
  } catch (error) {
    return { code: error.code ?? 1, reading: JSON.parse(error.stdout) };
  } finally {
    await close();
  }
}

/** The origin the script will verify against is the base it was given. */
async function proofFor(base, key) {
  return privateKeyToAccount(key).signMessage({ message: new URL(base).origin });
}

test("a signature by the advertised payTo proves the origin", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const probe = await serve(docWith([], account.address));
  try {
    // Sign the origin this listener actually answers on, then serve it.
    const proof = await account.signMessage({ message: new URL(probe.base).origin });
    probe.held.doc = docWith([proof], account.address);

    const { stdout } = await run("node", ["scripts/ownership-check.mjs", `--base=${probe.base}`, "--json"]);
    const reading = JSON.parse(stdout);
    assert.equal(reading.trust_tier, "ownership_verified");
    assert.deepEqual(reading.verified_addresses, [account.address]);
    assert.deepEqual(reading.unproved_addresses, []);
    assert.equal(reading.unmatched_proofs, 0);
  } finally {
    await probe.close();
  }
});

test("a proof for a wallet that is no longer the payTo fails, and exits 1", async () => {
  const stranger = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const current = privateKeyToAccount(`0x${"33".repeat(32)}`);
  const probe = await serve(docWith([], current.address));
  try {
    // A proof over the right origin by the WRONG wallet: the rotation case.
    const stale = await stranger.signMessage({ message: new URL(probe.base).origin });
    probe.held.doc = docWith([stale], current.address);

    let code = 0;
    let stdout = "";
    try {
      ({ stdout } = await run("node", ["scripts/ownership-check.mjs", `--base=${probe.base}`, "--json"]));
    } catch (error) {
      code = error.code ?? 1;
      stdout = error.stdout;
    }
    const reading = JSON.parse(stdout);
    assert.equal(code, 1, "a stale proof must fail the check");
    assert.equal(reading.unmatched_proofs, 1);
    assert.equal(reading.trust_tier, "origin_hosted");
    assert.deepEqual(reading.verified_addresses, []);
    assert.deepEqual(reading.unproved_addresses, [current.address]);
  } finally {
    await probe.close();
  }
});

test("no proof published is a missing claim, not a failure — unless --require-proof", async () => {
  const account = privateKeyToAccount(`0x${"44".repeat(32)}`);
  const doc = docWith([], account.address);
  delete doc["x-agentcash-provenance"];

  const quiet = await check(doc);
  assert.equal(quiet.code, 0);
  assert.equal(quiet.reading.trust_tier, "origin_hosted");

  const strict = await check(doc, ["--require-proof"]);
  assert.equal(strict.code, 1, "--require-proof must fail an unproved origin");
});
