#!/usr/bin/env node
/**
 * THE BAZAAR CHECK — is the store still in the CDP discovery list?
 *
 * The browsable mirrors (x402-list, agent-tools, x402scan) are
 * selective importers, not a window onto the CDP list. Their silence
 * tests nothing. This asks the source directly, with the store's own
 * CDP keys — the same question the 2026-07-22 full-catalog scan
 * answered TRUE for /api/buy/hello.
 *
 * Read-only. Mints a short-lived JWT, does GETs, prints a verdict.
 * Never writes, never spends, never prints a secret.
 *
 * Usage, from the repo root:
 *
 *   node scripts/bazaar-check.mjs
 *
 * Keys come from the environment, or from .dev.vars if it exists
 * (CDP_API_KEY_ID, CDP_API_KEY_SECRET). Optional: DEBUG=1 to print
 * the first raw payload, PATHS="/a,/b" to override the candidates.
 */

import { readFileSync } from "node:fs";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const HOST = "api.cdp.coinbase.com";
const NEEDLE = "scvd.store";

/**
 * The v2 x402 route is confirmed from the installed @coinbase/x402
 * (verify/settle/supported hang off it). The discovery path is NOT
 * exported by any installed SDK, so we try the plausible ones and
 * report which answers. Whichever returns 200 is the real one; write
 * it down in registry/ when we know.
 */
const CANDIDATE_PATHS = (
  process.env.PATHS ??
  [
    "/platform/v2/x402/discovery/resources",
    "/platform/v2/x402/discovery",
    "/platform/v2/x402/resources",
    "/platform/v2/x402/list",
    "/platform/v2/x402/bazaar/resources",
  ].join(",")
).split(",");

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

loadDevVars();

const apiKeyId = process.env.CDP_API_KEY_ID;
/**
 * The secret is either a single-line base64 Ed25519 key or a
 * multi-line EC PEM. A PEM does not survive a shell variable or a
 * .dev.vars line intact, so CDP_API_KEY_SECRET_FILE takes a path and
 * reads it whole.
 */
const apiKeySecret = process.env.CDP_API_KEY_SECRET_FILE
  ? readFileSync(process.env.CDP_API_KEY_SECRET_FILE, "utf8").trim()
  : process.env.CDP_API_KEY_SECRET;

if (!apiKeyId || !apiKeySecret) {
  console.error(
    "Need CDP_API_KEY_ID and CDP_API_KEY_SECRET — in the environment, or in .dev.vars beside this repo.",
  );
  console.error("");
  console.error("Wrangler secrets live in Cloudflare, not on this machine, so");
  console.error("a fresh clone has no local copy. Either paste them into");
  console.error(".dev.vars (gitignored, copy .dev.vars.example), or pass them");
  console.error("for one run:");
  console.error("");
  console.error("  CDP_API_KEY_ID='...' CDP_API_KEY_SECRET='...' npm run bazaar:check");
  console.error("");
  console.error("If the secret is a multi-line EC PEM rather than a one-line");
  console.error("base64 Ed25519 key, save it to a file and use:");
  console.error("");
  console.error("  CDP_API_KEY_ID='...' CDP_API_KEY_SECRET_FILE=./cdp-key.pem npm run bazaar:check");
  process.exit(2);
}

async function get(requestPath) {
  const token = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "GET",
    requestHost: HOST,
    requestPath,
  });
  const response = await fetch(`https://${HOST}${requestPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await response.text();
  return { status: response.status, body };
}

/** Pull every string in the payload that looks like a resource URL. */
function urlsIn(value, found = []) {
  if (typeof value === "string") {
    if (value.startsWith("http")) found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) urlsIn(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) urlsIn(item, found);
  }
  return found;
}

let answered = null;

for (const path of CANDIDATE_PATHS) {
  let result;
  try {
    result = await get(path);
  } catch (error) {
    console.log(`  ${path} → request failed: ${String(error)}`);
    continue;
  }
  console.log(`  ${path} → HTTP ${result.status}`);
  if (result.status === 200) {
    answered = { path, ...result };
    break;
  }
  if (result.status === 401 || result.status === 403) {
    console.log(
      "    (auth rejected — the keys are wrong, revoked, or lack the scope)",
    );
  }
}

console.log("");

if (!answered) {
  console.log("VERDICT: no candidate path answered 200.");
  console.log(
    "Nothing is proven about the listing. Get the current discovery path from",
  );
  console.log(
    "the CDP x402 docs and re-run with PATHS=/the/right/path, or say the word",
  );
  console.log("and we file it as unknown rather than guessing.");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(answered.body);
} catch {
  console.log(`VERDICT: ${answered.path} answered 200 but not JSON.`);
  console.log(answered.body.slice(0, 400));
  process.exit(1);
}

if (process.env.DEBUG) {
  console.log(JSON.stringify(payload, null, 2).slice(0, 4000));
  console.log("");
}

const urls = urlsIn(payload);
const ours = [...new Set(urls.filter((url) => url.includes(NEEDLE)))];

console.log(`Discovery path that answered: ${answered.path}`);
console.log(`Resource-ish URLs in the payload: ${urls.length}`);
console.log("");

if (ours.length > 0) {
  console.log(`VERDICT: PRESENT — ${ours.length} of ours in the list.`);
  for (const url of ours.sort()) console.log(`  ${url}`);
  console.log("");
  console.log("Means: the CDP side is fine and the mirrors simply never");
  console.log("imported us. Stop waiting on auto-import; self-submit to");
  console.log("x402scout, x402-list /submit, and agent-tools directly.");
} else {
  console.log("VERDICT: ABSENT from this page of the list.");
  console.log("");
  console.log("Before concluding we aged out, check whether the response is");
  console.log("paginated (DEBUG=1 shows the raw payload) — this reads one");
  console.log("page. If it really is absent: either ingestion stopped, or the");
  console.log("list is scoped to recent settlement activity and we aged out,");
  console.log("which fits our only settles being 07-22 and 07-24. That case is");
  console.log("fixed by re-verifying the declarations and getting a settlement");
  console.log("through, not by marketing.");
}
