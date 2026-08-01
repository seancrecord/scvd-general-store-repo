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
 * THE SEARCH ENDPOINT IS THE AUTHORITATIVE ANSWER, and the list is not.
 *
 * Added 2026-08-02 after this script's own design lied twice in one
 * day — not to us, but to CV running the equivalent check by hand. He
 * filtered a list endpoint with a parameter the API SILENTLY IGNORES,
 * read the absence as a finding, and reported "not in the Bazaar."
 * Re-run against /discovery/search the store came back immediately:
 * indexed, searchable by name, carrying real lastCalledAt and quality
 * figures that match our own /pulse.
 *
 * This script had the same defect in a different costume. It reads ONE
 * PAGE of a list and prints "VERDICT: ABSENT" when our URL is not on
 * it — while its own help text admits the response may be paginated.
 * A verdict that says ABSENT when it means "not on the first page I
 * happened to read" is an instrument that manufactures findings, and
 * we would have chased that one.
 *
 * So: search decides PRESENT. A list-page miss can no longer print a
 * verdict on its own (AT_SCALE rule 5 — test the instrument; a null
 * from a probe that cannot see the thing is not evidence of absence).
 *
 * The path comes from CV's live run. It is NOT exercised in this
 * repo's environment, which has no CDP keys and no outbound network,
 * so the first real run is the first proof this code is right.
 */
const SEARCH_PATHS = (
  process.env.SEARCH_PATHS ??
  [
    "/platform/v2/x402/discovery/search",
    "/v2/x402/discovery/search",
  ].join(",")
).split(",");

/** What to ask for. The store's name and its domain, both. */
const SEARCH_QUERIES = (
  process.env.SEARCH_QUERIES ??
  ["Sean-Claude Van Damme general store", "scvd.store"].join("|")
).split("|");

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

/**
 * The portal hands you a JSON file when the key is created — that is
 * the only moment the secret is visible. Reading it whole beats
 * copying two values out of it, because a CDP secret is either
 * 88 characters of base64 or a PEM with newlines, and both lose
 * something on the way through a shell.
 *
 *   CDP_KEY_FILE=~/Downloads/cdp_api_key.json npm run bazaar:check
 */
function loadKeyFile() {
  const path = process.env.CDP_KEY_FILE;
  if (!path) return;
  const resolved = path.replace(/^~/, process.env.HOME ?? "~");
  let raw;
  try {
    raw = readFileSync(resolved, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.error(`No file at ${resolved}`);
      console.error("");
      console.error("That path was an example, not a guess at yours. Find the");
      console.error("real one — the portal names it for the key, so the name");
      console.error("varies:");
      console.error("");
      console.error("  ls -t ~/Downloads | head -20");
      console.error("  find ~ -maxdepth 4 \\( -iname '*cdp*' -o -iname '*api*key*.json' \\) 2>/dev/null");
      console.error("");
      console.error("No file anywhere means the secret is gone — it is shown");
      console.error("once and never again. Make a new key in the CDP portal;");
      console.error("keys are additive and the Worker keeps using its own.");
      process.exit(2);
    }
    throw error;
  }
  if (raw.trimStart().startsWith("{")) {
    const parsed = JSON.parse(raw);
    const id = parsed.id ?? parsed.name ?? parsed.apiKeyId;
    const secret =
      parsed.privateKey ?? parsed.privateKeySecret ?? parsed.secret;
    if (id) process.env.CDP_API_KEY_ID ||= String(id);
    if (secret) process.env.CDP_API_KEY_SECRET ||= String(secret);
    return;
  }
  // Not JSON: a scratch file, a .pem, or two values pasted on
  // separate lines in either order, with or without NAME= prefixes.
  // Classify each line by shape rather than by position.
  if (raw.includes("-----BEGIN")) {
    // A PEM is multi-line by nature; take the block whole.
    const begin = raw.indexOf("-----BEGIN");
    const endMarker = raw.indexOf("-----END");
    const end = endMarker >= 0 ? raw.indexOf("\n", raw.indexOf("-----", endMarker + 8)) : -1;
    process.env.CDP_API_KEY_SECRET ||= raw
      .slice(begin, end > 0 ? end : undefined)
      .trim();
  }
  for (const line of raw.split("\n")) {
    const value = line
      .trim()
      // Strip a NAME= prefix — but cap the name at 40 characters, or
      // this eats a base64 secret right up to its trailing "==".
      .replace(/^([A-Za-z][A-Za-z0-9_]{0,39})\s*[:=]\s*(?=\S)/, "")
      .replace(/^["']|["'],?$/g, "")
      .trim();
    if (!value) continue;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      process.env.CDP_API_KEY_ID ||= value;
    } else if (/^organizations\/.+\/apiKeys\/.+/.test(value)) {
      process.env.CDP_API_KEY_ID ||= value;
    } else if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(value)) {
      process.env.CDP_API_KEY_SECRET ||= value;
    }
  }
}

loadKeyFile();

const apiKeyId = process.env.CDP_API_KEY_ID;
/**
 * The secret is either a single-line base64 Ed25519 key or a
 * multi-line EC PEM. A PEM does not survive a shell variable or a
 * .dev.vars line intact, so CDP_API_KEY_SECRET_FILE takes a path and
 * reads it whole.
 */
const rawSecret = process.env.CDP_API_KEY_SECRET_FILE
  ? readFileSync(process.env.CDP_API_KEY_SECRET_FILE, "utf8").trim()
  : process.env.CDP_API_KEY_SECRET;
// Copied out of JSON, a PEM's newlines arrive as the two characters
// backslash-n. Put them back before the SDK sees them.
const apiKeySecret = rawSecret?.includes("\\n")
  ? rawSecret.replace(/\\n/g, "\n")
  : rawSecret;

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
  console.error("");
  console.error("Easiest of all: point at the JSON the CDP portal downloaded");
  console.error("when the key was created. It carries both halves.");
  console.error("");
  console.error("  CDP_KEY_FILE=~/Downloads/cdp_api_key.json npm run bazaar:check");
  process.exit(2);
}

/**
 * Five secrets live in this project and several of them are "a long
 * string of hex," so the wrong one gets pasted eventually. The CDP
 * SDK's answer to that is "Invalid key format," which names the
 * problem without naming the cause. This does.
 *
 * Shapes only — never the value, never a fragment of it.
 */
function diagnoseSecret(secret) {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return "64 hex characters — that is the store's own SIGNING_KEY (the ed25519 seed from `npm run keys:generate`). Ours, not Coinbase's.";
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(secret)) {
    return "0x + 64 hex — that is a WALLET PRIVATE KEY (the shopping run's burner). Never send it anywhere; it spends money.";
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(secret)) {
    return "0x + 40 hex — that is PAY_TO_ADDRESS, the wallet that receives. Public, harmless, wrong key.";
  }
  if (secret.includes("BEGIN") && secret.includes("PRIVATE KEY")) {
    return "a PEM block, but it arrived with its line breaks mangled. Save it to a file and use CDP_API_KEY_SECRET_FILE.";
  }
  if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(secret)) {
    return "base64 of an unexpected length. A CDP Ed25519 secret is usually 88 characters ending in `==`.";
  }
  return `${secret.length} characters, no shape I recognize. If it is the password you picked, that is ADMIN_PASSWORD.`;
}

/**
 * DOCTOR=1 reports what was found and stops. Shapes and lengths only,
 * never a value or a fragment of one — the whole point is to diagnose
 * a key without anyone having to look at it.
 */
if (process.env.DOCTOR) {
  const idShape = !apiKeyId
    ? "MISSING"
    : /^[0-9a-f-]{36}$/i.test(apiKeyId)
      ? "a UUID — correct shape for CDP_API_KEY_ID"
      : /^organizations\//.test(apiKeyId)
        ? "an organizations/.../apiKeys/... path — the legacy id form, also fine"
        : `${apiKeyId.length} characters, not a UUID — probably not the id`;
  const secretShape = !apiKeySecret
    ? "MISSING"
    : /^[A-Za-z0-9+/]{80,90}={0,2}$/.test(apiKeySecret)
      ? `${apiKeySecret.length} characters of base64 — correct shape for an Ed25519 CDP secret`
      : apiKeySecret.includes("-----BEGIN")
        ? `a PEM block, ${apiKeySecret.split("\n").length} lines, ${apiKeySecret.includes("-----END") ? "END marker present" : "END MARKER MISSING — it was cut short"}`
        : diagnoseSecret(apiKeySecret);
  console.log("What the script found:");
  console.log("");
  console.log(`  id:     ${idShape}`);
  console.log(`  secret: ${secretShape}`);
  console.log("");
  console.log("Nothing was sent anywhere. Drop DOCTOR=1 to run the check.");
  process.exit(0);
}

// Fail on the shape before the SDK fails on the format.
try {
  await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: "GET",
    requestHost: HOST,
    requestPath: "/platform/v2/x402/supported",
  });
} catch (error) {
  if (String(error).includes("Invalid key format")) {
    console.error("That secret is not a CDP API key secret.");
    console.error("");
    console.error(`  What you passed: ${diagnoseSecret(apiKeySecret)}`);
    console.error("");
    console.error("A CDP API key is a PAIR from the Coinbase Developer Platform:");
    console.error("  CDP_API_KEY_ID      a UUID, like a1b2c3d4-5678-90ab-cdef-...");
    console.error("  CDP_API_KEY_SECRET  one line of base64 ending in '==',");
    console.error("                      or a multi-line -----BEGIN EC PRIVATE KEY-----");
    console.error("");
    console.error(`  The id you passed is ${/^[0-9a-f-]{36}$/i.test(apiKeyId) ? "shaped like a UUID, which is right" : "not shaped like a UUID, so it is probably wrong too"}.`);
    console.error("");
    console.error("Cloudflare will not hand the stored values back. If the pair");
    console.error("is not in your file, make a NEW key in the CDP portal — keys");
    console.error("are additive, and a new one will not disturb the one the");
    console.error("Worker uses to settle payments.");
    process.exit(2);
  }
  // Right shape, wrong content: truncated on the way through a
  // clipboard, or an id and a secret from two different keys.
  console.error("The CDP pair was rejected before any request went out.");
  console.error("");
  console.error(`  ${String(error)}`);
  console.error("");
  console.error("The shape is plausible, so the likely causes are: the secret");
  console.error("lost characters in transit, or the id and the secret come");
  console.error("from two different keys. They are issued as a pair and only");
  console.error("work as a pair. A fresh key from the portal settles both.");
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

/**
 * THE SEARCH PASS, run FIRST because it is the answer and the list is
 * the anecdote. A JWT is signed over the path without its query
 * string, which is the usual CDP convention; if a deployment wants it
 * signed with the query, SEARCH_PATHS can carry the whole thing.
 */
async function searchFor(query) {
  const hits = [];
  for (const basePath of SEARCH_PATHS) {
    const requestPath = `${basePath}?query=${encodeURIComponent(query)}`;
    let result;
    try {
      const token = await generateJwt({
        apiKeyId,
        apiKeySecret,
        requestMethod: "GET",
        requestHost: HOST,
        requestPath: basePath,
      });
      const response = await fetch(`https://${HOST}${requestPath}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      result = { status: response.status, body: await response.text() };
    } catch (error) {
      console.log(`  search ${basePath} → request failed: ${String(error)}`);
      continue;
    }
    console.log(`  search ${basePath} "${query}" → HTTP ${result.status}`);
    if (result.status !== 200) continue;
    try {
      const parsed = JSON.parse(result.body);
      if (process.env.DEBUG) {
        console.log(JSON.stringify(parsed, null, 2).slice(0, 2000));
      }
      for (const url of new Set(urlsIn(parsed))) {
        if (url.includes(NEEDLE)) hits.push(url);
      }
    } catch {
      console.log("    (200 but not JSON)");
    }
    break;
  }
  return [...new Set(hits)];
}

console.log("Asking the search endpoint, which is the one that answers:");
const searchHits = new Map();
for (const query of SEARCH_QUERIES) {
  for (const url of await searchFor(query)) {
    searchHits.set(url, query);
  }
}
console.log("");

if (searchHits.size > 0) {
  console.log(
    `SEARCH VERDICT: PRESENT — ${searchHits.size} of our resources are indexed and searchable.`,
  );
  for (const [url, query] of [...searchHits].sort()) {
    console.log(`  ${url}   (matched "${query}")`);
  }
  console.log("");
  console.log("The store is discoverable by name in CDP's own index. The");
  console.log("browsable mirrors are separate importers and their silence");
  console.log("still tests nothing.");
} else {
  console.log("SEARCH VERDICT: no match returned for any query.");
  console.log("");
  console.log("Before treating that as absence, confirm the search PATH is");
  console.log("right — a wrong path and an empty index look identical from");
  console.log("here, and this exact confusion (a filter the API silently");
  console.log("ignored) produced a false 'not listed' finding on 2026-08-02.");
  console.log("Re-run with SEARCH_PATHS=/the/right/path before concluding.");
}
console.log("");
console.log("The list pass below is context, not a verdict:");
console.log("");

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
} else if (searchHits.size > 0) {
  /**
   * NOT A FINDING, and this branch exists so it can never be read as
   * one. Search already proved we are indexed; this pass read one page
   * of a possibly-paginated list and did not happen to see us. Those
   * two facts are compatible and the loud one is the wrong one.
   */
  console.log("Not on this page of the list — which means nothing, because");
  console.log("search above already found us. This pass reads ONE page of a");
  console.log("list that may be paginated and may be ordered by recency.");
  console.log("Absence here is not evidence; the search verdict stands.");
} else {
  console.log("Not on this page of the list, AND search returned nothing.");
  console.log("");
  console.log("Still not a verdict on its own. Two innocent explanations to");
  console.log("rule out first, in this order: (1) the search path is wrong —");
  console.log("a wrong path and an empty index are indistinguishable from");
  console.log("here; (2) this list is paginated and we are on another page");
  console.log("(DEBUG=1 shows the raw payload). Only after both are excluded");
  console.log("does absence mean absence — and then it means either ingestion");
  console.log("stopped or the list is scoped to recent settlement activity and");
  console.log("we aged out, which fits our only settles being 07-22 and 07-24.");
  console.log("That case is fixed by getting a settlement through, not by");
  console.log("marketing.");
}
