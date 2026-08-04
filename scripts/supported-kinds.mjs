#!/usr/bin/env node
/**
 * THE SUPPORTED-KINDS CHECK — the Solana door's first hard gate.
 *
 * PAYMENT_RAILS.md's standing rule for every new rail: hard facts
 * verified before a line of door code. For Solana-exact the first
 * fact is whether the facilitator the store ALREADY trusts to settle
 * (CDP) lists a solana kind at /platform/v2/x402/supported. If it
 * does, the second rail reuses the whole existing settle path. If it
 * does not, "add Solana" secretly means "add a second facilitator" —
 * a different and much bigger decision that should be made with eyes
 * open, not discovered mid-build.
 *
 * Read-only. Mints a short-lived JWT, does one GET, prints the kinds
 * and a verdict. Never writes, never spends, never prints a secret.
 *
 * Usage, from the repo root (same key plumbing as bazaar:check):
 *
 *   CDP_KEY_FILE=~/Downloads/cdp_api_key.json npm run supported:kinds
 *
 * INSTRUMENT HONESTY (AT_SCALE rule 5): a miss here means THIS
 * facilitator cannot settle it — not that nobody can. The verdict
 * says which of those it is measuring.
 */

import { readFileSync } from "node:fs";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const HOST = "api.cdp.coinbase.com";
const PATH = "/platform/v2/x402/supported";

function loadDevVars() {
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .dev.vars is fine; the environment may already carry the keys.
  }
}

/** The portal's JSON download carries both halves; read it whole. */
function loadKeyFile() {
  const path = process.env.CDP_KEY_FILE;
  if (!path) return;
  const resolved = path.replace(/^~/, process.env.HOME ?? "~");
  let raw;
  try {
    raw = readFileSync(resolved, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.error(`No file at ${resolved} — that path was an example.`);
      console.error("Find yours:  ls -t ~/Downloads | head -20");
      process.exit(2);
    }
    throw error;
  }
  if (raw.trimStart().startsWith("{")) {
    const parsed = JSON.parse(raw);
    const id = parsed.id ?? parsed.name ?? parsed.apiKeyId;
    const secret = parsed.privateKey ?? parsed.privateKeySecret ?? parsed.secret;
    if (id) process.env.CDP_API_KEY_ID ||= String(id);
    if (secret) process.env.CDP_API_KEY_SECRET ||= String(secret);
  }
}

loadDevVars();
loadKeyFile();

const apiKeyId = process.env.CDP_API_KEY_ID;
const rawSecret = process.env.CDP_API_KEY_SECRET;
const apiKeySecret = rawSecret?.includes("\\n")
  ? rawSecret.replace(/\\n/g, "\n")
  : rawSecret;

if (!apiKeyId || !apiKeySecret) {
  console.error("Need CDP_API_KEY_ID and CDP_API_KEY_SECRET.");
  console.error("Easiest: point at the portal's JSON download —");
  console.error("");
  console.error("  CDP_KEY_FILE=~/Downloads/cdp_api_key.json npm run supported:kinds");
  console.error("");
  console.error("bazaar:check has the full shape diagnostics if the key fights you.");
  process.exit(2);
}

const token = await generateJwt({
  apiKeyId,
  apiKeySecret,
  requestMethod: "GET",
  requestHost: HOST,
  requestPath: PATH,
});

const response = await fetch(`https://${HOST}${PATH}`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
  console.error(`GET ${PATH} answered ${response.status}.`);
  console.error(await response.text());
  process.exit(1);
}
const body = await response.json();
const kinds = Array.isArray(body?.kinds) ? body.kinds : [];

console.log(`The facilitator at ${HOST} lists ${kinds.length} kind${kinds.length === 1 ? "" : "s"}:`);
console.log("");
for (const kind of kinds) {
  console.log(
    `  x402Version ${kind.x402Version ?? "?"}  scheme ${kind.scheme ?? "?"}  network ${kind.network ?? "?"}`,
  );
}
console.log("");

const solana = kinds.filter((kind) =>
  `${kind.network ?? ""} ${kind.scheme ?? ""}`.toLowerCase().includes("solana"),
);
if (solana.length > 0) {
  console.log("VERDICT: SOLANA PRESENT on the facilitator the store already");
  console.log("uses. The second rail can reuse the existing settle path —");
  console.log("the remaining gates are the receive-address ceremony and the");
  console.log("reconciliation-limit ruling (PAYMENT_RAILS.md).");
} else {
  console.log("VERDICT: no solana kind ON THIS FACILITATOR. That is a fact");
  console.log("about CDP's settle surface, not about the ecosystem. Adding");
  console.log("Solana would mean adding a second facilitator — take THAT");
  console.log("question to PAYMENT_RAILS.md's intake rule before any code.");
}
