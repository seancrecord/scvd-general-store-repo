#!/usr/bin/env node
/**
 * ASK BAZAAR WHY AN ITEM IS NOT INDEXED, ONE ITEM AT A TIME.
 *
 * THE OPEN QUESTION THIS ANSWERS. LEDGER_READINGS has us at 14-15 of
 * 21+ items visible in Bazaar, and the explanation on file was "Bazaar
 * only catalogs what has settled." True and INCOMPLETE — CV found the
 * gap: a route can also fail to appear because its extensions.bazaar
 * metadata is malformed, regardless of settlement. Those two causes
 * look identical from our side (an item is missing) and have opposite
 * fixes: one costs a purchase, the other costs a schema correction.
 *
 * CDP publishes a free POST /x402/validate that probes a URL live and
 * says whether it would be accepted, WITHOUT a payment. So the
 * question is answerable for nothing, and guessing at it is a choice.
 *
 * WHAT THIS SCRIPT IS NOT. It buys nothing, signs nothing, and needs
 * no wallet — it reads our own menu, asks the validator about each
 * item's buy URL, and prints a table. Rule 30 is not in play because
 * nothing is published; rule 13 is not in play because nothing is
 * purchased. It is a question, asked 21 times.
 *
 *   node scripts/bazaar-validate.mjs
 *   node scripts/bazaar-validate.mjs --json > /tmp/bazaar.json
 *
 * WHY IT LIVES HERE RATHER THAN HAVING BEEN RUN ALREADY: outbound
 * HTTPS is blocked from the build environment this was written in, so
 * it has never been executed. Treat the first run as the test.
 */
import { argv, exit } from "node:process";

const MENU_URL = "https://scvd.store/menu.json";
const VALIDATE_URL = "https://api.cdp.coinbase.com/platform/v2/x402/validate";

// Same optional key loading as bazaar-check, for the auth attempt.
import { readFileSync } from "node:fs";
try {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .dev.vars is fine; unauthenticated worked for weeks.
}
const asJson = argv.includes("--json");

function log(...args) {
  if (!asJson) console.log(...args);
}

/**
 * The endpoint is somebody else's and its response shape is theirs to
 * change. Read defensively and REPORT what came back rather than
 * asserting a schema — a validator we cannot parse is a finding about
 * the validator, not a verdict about our item.
 */
function readVerdict(payload) {
  if (payload === null || typeof payload !== "object") {
    return { state: "unreadable", detail: `response was ${typeof payload}` };
  }
  const valid =
    payload.valid ?? payload.isValid ?? payload.ok ?? payload.accepted;
  const problems =
    payload.errors ?? payload.problems ?? payload.issues ?? payload.reason;
  if (typeof valid === "boolean") {
    return {
      state: valid ? "accepted" : "rejected",
      detail: problems ? JSON.stringify(problems) : "",
    };
  }
  return {
    state: "unreadable",
    detail: `no boolean verdict field; keys were ${Object.keys(payload).join(", ")}`,
  };
}

/**
 * 2026-08-03: every item came back HTTP 400 UNIFORMLY — including
 * items that validated clean two days earlier — and the 200-char
 * detail slice cut the body exactly before CDP's errorType and
 * errorMessage, so the output showed a correlationId and nothing
 * actionable. A uniform 400 across the whole shelf is the REQUEST
 * SHAPE being refused, not 24 listings going bad at once. So:
 *
 *   - The first failing body prints IN FULL, once, before the table.
 *   - If CDP keys are around (.dev.vars / env, same as bazaar-check),
 *     a Bearer JWT rides along — a public endpoint quietly moving
 *     behind auth is the least surprising API change there is.
 *   - Two request spellings are tried ({url} then {resourceUrl}),
 *     and the summary names which one the API answered to.
 */
let firstFailureShown = false;
let workingShape = null;

async function maybeAuthHeaders(requestPath) {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  if (!apiKeyId || !apiKeySecret) return {};
  try {
    const { generateJwt } = await import("@coinbase/cdp-sdk/auth");
    const token = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: "api.cdp.coinbase.com",
      requestPath,
    });
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function validate(url) {
  const requestPath = new URL(VALIDATE_URL).pathname;
  const auth = await maybeAuthHeaders(requestPath);
  const shapes = workingShape
    ? [workingShape]
    : [
        { label: "{url}", body: { url } },
        { label: "{resourceUrl}", body: { resourceUrl: url } },
      ];
  let last = null;
  try {
    for (const shape of shapes) {
      const body = workingShape
        ? { ...shape.body, ...(shape.body.url !== undefined ? { url } : { resourceUrl: url }) }
        : shape.body;
      const response = await fetch(VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (response.ok) {
        if (!workingShape) {
          workingShape = shape;
          console.error(`(the API answered to ${shape.label}${auth.Authorization ? ", authenticated" : ""})`);
        }
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          return { state: "unreadable", detail: `not JSON: ${text.slice(0, 200)}` };
        }
        return readVerdict(payload);
      }
      last = { status: response.status, text };
    }
    if (last && !firstFailureShown) {
      firstFailureShown = true;
      console.error(`
FIRST FAILING BODY, IN FULL (HTTP ${last.status}${auth.Authorization ? ", authenticated" : ", unauthenticated"}):`);
      console.error(last.text);
      console.error("");
    }
    return {
      state: "probe_failed",
      detail: `HTTP ${last.status}: ${last.text.slice(0, 400)}`,
    };
  } catch (error) {
    return { state: "probe_failed", detail: String(error) };
  }
}

const menuResponse = await fetch(MENU_URL);
if (!menuResponse.ok) {
  console.error(`Could not read ${MENU_URL}: HTTP ${menuResponse.status}`);
  exit(1);
}
const menu = await menuResponse.json();
const items = Array.isArray(menu.items) ? menu.items : [];
if (items.length === 0) {
  console.error("menu.json carried no items; nothing to validate.");
  exit(1);
}

log(`Asking Bazaar about ${items.length} items. No payment, no wallet.\n`);

const results = [];
for (const item of items) {
  const url = `https://scvd.store/api/buy/${item.id}`;
  const verdict = await validate(url);
  results.push({ id: item.id, url, ...verdict });
  log(
    `${verdict.state.padEnd(13)} ${item.id.padEnd(26)} ${verdict.detail.slice(0, 90)}`,
  );
}

if (asJson) {
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2));
  exit(0);
}

const by = (state) => results.filter((row) => row.state === state);
log(`\n${"-".repeat(60)}`);
log(`accepted:    ${by("accepted").length}`);
log(`rejected:    ${by("rejected").length}   <- METADATA gap, fix the schema`);
log(`probe_failed:${by("probe_failed").length}`);
log(`unreadable:  ${by("unreadable").length}`);

/**
 * THE READING, stated so the output cannot be mistaken for more than
 * it is. This separates two causes; it does not prove either.
 */
log(`
HOW TO READ THIS. An item that validates ACCEPTED but is missing from
the catalog is a SETTLEMENT gap — the metadata is fine and it has not
sold. That is the six-purchase path already on file.

An item that comes back REJECTED is a METADATA gap and no amount of
buying will fix it; the extensions.bazaar block for that item needs
correcting first, and a purchase made before the fix would be spent
proving nothing.

WHAT IT STILL CANNOT TELL YOU: whether an ACCEPTED item will actually
be indexed, or when. The validator says a route would be admissible,
not that the catalog has admitted it. Confirm on the catalog itself.

PROBE_FAILED and UNREADABLE are facts about the validator or the
network, never about the item. Re-run before concluding anything.
`);
