/**
 * THE SHARED HALF OF EVERY EXAMPLE — zero dependencies, Node 18+.
 *
 * Every framework example in this directory does the same four things
 * and differs only in how the framework spells "tool":
 *
 *   1. read the door's 402 (the terms an agent is being asked to sign);
 *   2. ask the store's free preflight whether the door is well-formed,
 *      and its free dry run whether a stock client would sign it —
 *      one POST, one probe, both readings from the same bytes;
 *   3. read network, asset, recipient, amount and the named defects;
 *   4. decide, with every reason named beside the evidence for it.
 *
 * The decision is a derivation, not a score: the same inputs always
 * give the same answer, each `because` line names the check, the
 * advisory or the policy field it came from, and `does_not_establish`
 * rides on every answer so a "pay" is never read as "this merchant
 * delivers". Unknown is never a difference: a probe that could not
 * complete, or a fact the reading does not carry, is `cannot_tell`,
 * never a refusal dressed as one.
 *
 * decide.py is the same logic for the Python frameworks. Both are held
 * to examples/fixtures/expected.json by their own test runners, so the
 * two languages cannot drift apart without the build going red.
 */

export const DEFAULT_BASE = "https://scvd.store";

/** The free doors these examples call, by path. Never a paid door. */
export const DOORS = Object.freeze({
  preflight: "/api/preflight/v2",
  before_you_pay: "/api/before-you-pay/v1",
  conformance: "/api/conformance/v1",
  look: "/api/look/v1",
  verifier_mcp: "/mcp/verifier",
});

/** What no reading here can establish. On every answer, by design. */
export const DOES_NOT_ESTABLISH = Object.freeze([
  "whether the service behind the 402 delivers anything after payment — no probe can",
  "whether the door stays up: the reading was one request at one moment",
  "whether the merchant is honest, or which door you should use — this is evidence, not a recommendation",
]);

function decodeBase64Json(value) {
  const text = Buffer.from(value, "base64").toString("utf8");
  return JSON.parse(text);
}

/**
 * Step 1: GET the door yourself and decode its PAYMENT-REQUIRED
 * challenge. This is what your own x402 client sees; the store's
 * probe sees the same bytes, but reading them on your side means the
 * terms you decide on are the terms you were served.
 */
export async function readChallenge(url, { fetch: fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { method: "GET", redirect: "manual" });
  const header = response.headers.get("payment-required");
  const out = { url, status: response.status, x402_version: null, accepts: [], parse_error: null };
  if (response.status !== 402) {
    out.parse_error = `expected 402, got ${response.status}`;
    return out;
  }
  if (!header) {
    out.parse_error = "no PAYMENT-REQUIRED header";
    return out;
  }
  try {
    const challenge = decodeBase64Json(header);
    out.x402_version = challenge.x402Version ?? null;
    out.accepts = Array.isArray(challenge.accepts) ? challenge.accepts : [];
  } catch (error) {
    out.parse_error = `PAYMENT-REQUIRED did not decode: ${error.message}`;
  }
  return out;
}

async function post(base, path, body, fetchImpl) {
  const response = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    const error = new Error(`${path} answered ${response.status}: ${json.error ?? "no error text"}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

/** Step 2: the door's shape (preflight) — one probe, every check named. */
export function preflight(url, { base = DEFAULT_BASE, fetch: fetchImpl = fetch } = {}) {
  return post(base, DOORS.preflight, { url }, fetchImpl);
}

/**
 * Step 2, both halves at once: the dry run answers "will MY client
 * pay this" and carries the preflight report whole as `the_door`, so
 * the two readings can never be quoted against each other.
 */
export function beforeYouPay(url, { base = DEFAULT_BASE, fetch: fetchImpl = fetch, clientProfile } = {}) {
  const body = clientProfile ? { url, client_profile: clientProfile } : { url };
  return post(base, DOORS.before_you_pay, body, fetchImpl);
}

function termsOf(client, accepts) {
  const chosen = client && client.chosen ? client.chosen : null;
  if (chosen) {
    const accept = accepts && accepts[chosen.index] ? accepts[chosen.index] : null;
    return {
      network: chosen.network,
      asset: chosen.asset,
      pay_to: accept && typeof accept.payTo === "string" ? accept.payTo : null,
      amount_atomic: chosen.amount_atomic,
      amount_usd: chosen.amount_usd ?? null,
      signing_window_seconds: chosen.signing_window_seconds ?? null,
      from: "the accept a stock client would select",
    };
  }
  const first = accepts && accepts[0] ? accepts[0] : null;
  if (!first) return null;
  return {
    network: typeof first.network === "string" ? first.network : null,
    asset: typeof first.asset === "string" ? first.asset : null,
    pay_to: typeof first.payTo === "string" ? first.payTo : null,
    amount_atomic: typeof first.amount === "string" ? first.amount : null,
    amount_usd: null,
    signing_window_seconds: null,
    from: "the first accept in the challenge (no client selection available)",
  };
}

/**
 * Steps 3 and 4. Pure: no network, no clock.
 *
 * @param door    the preflight report (reading.the_door, or preflight()'s answer)
 * @param client  the dry run (reading.your_client), or null when you only ran the preflight
 * @param accepts the challenge's accepts as YOU read them (readChallenge), or omit
 * @param policy  { allowed_networks?: string[], allowed_recipients?: string[], max_amount_usd?: number }
 */
export function decide({ door, client = null, accepts = null, policy = {} } = {}) {
  if (!door || typeof door !== "object") throw new TypeError("decide: a preflight report is required");
  const checks = Array.isArray(door.checks) ? door.checks : [];
  const advisories = Array.isArray(door.advisories) ? door.advisories : [];
  const defects = checks.filter((check) => check && check.ok === false).map((check) => check.name);
  const worthKnowing = advisories.map((advisory) => advisory.name);
  const terms = termsOf(client, accepts);
  const because = [];
  const derivedFrom = { preflight_version: door.version ?? null, checks_run: checks.length, advisories_raised: advisories.length };

  const answer = (decision) => ({
    decision,
    because,
    terms,
    defects,
    worth_knowing: worthKnowing,
    does_not_establish: [...DOES_NOT_ESTABLISH],
    derived_from: derivedFrom,
  });

  if (door.verdict === "unreachable") {
    because.push("preflight verdict is unreachable: the probe itself could not complete, which says nothing about the door (unknown is never a defect)");
    return answer("cannot_tell");
  }
  if (door.verdict === "not_ready") {
    because.push(`preflight verdict is not_ready; failed checks: ${defects.join(", ") || "(none named)"}`);
    return answer("do_not_pay");
  }
  if (door.verdict !== "ready") {
    because.push(`preflight verdict is ${String(door.verdict)}, which this decision does not know how to read`);
    return answer("cannot_tell");
  }
  if (client && client.outcome === "would_throw") {
    because.push(`a stock x402 client would refuse on your machine before signing: ${client.throws_with ?? "(no error text)"}`);
    for (const dropped of client.dropped ?? []) {
      because.push(`accept ${dropped.index} (${dropped.network}, ${dropped.asset}) dropped at ${dropped.stage}: ${dropped.why}`);
    }
    return answer("do_not_pay");
  }
  if (client && client.outcome === "cannot_simulate") {
    because.push("the dry run could not walk the challenge's accepts, so which accept your client would sign is unknown");
    return answer("cannot_tell");
  }
  if (worthKnowing.includes("testnet-network")) {
    because.push("advisory testnet-network: the offer quotes a testnet; a mainnet wallet signing it settles nowhere real");
    return answer("do_not_pay");
  }
  if (!terms) {
    because.push("preflight is ready but no accept could be read, so there are no terms to decide on");
    return answer("cannot_tell");
  }
  if (Array.isArray(policy.allowed_networks)) {
    if (!terms.network) {
      because.push("policy allowed_networks is set and the selected accept names no network");
      return answer("cannot_tell");
    }
    if (!policy.allowed_networks.includes(terms.network)) {
      because.push(`policy allowed_networks does not include ${terms.network}`);
      return answer("do_not_pay");
    }
  }
  if (Array.isArray(policy.allowed_recipients)) {
    if (!terms.pay_to) {
      because.push("policy allowed_recipients is set and the recipient could not be read (pass the challenge's accepts to decide)");
      return answer("cannot_tell");
    }
    if (!policy.allowed_recipients.map((r) => r.toLowerCase()).includes(terms.pay_to.toLowerCase())) {
      because.push(`policy allowed_recipients does not include ${terms.pay_to}`);
      return answer("do_not_pay");
    }
  }
  if (typeof policy.max_amount_usd === "number") {
    if (terms.amount_usd === null || terms.amount_usd === undefined) {
      because.push("policy max_amount_usd is set and the amount in USD could not be resolved for this asset");
      return answer("cannot_tell");
    }
    if (terms.amount_usd > policy.max_amount_usd) {
      because.push(`amount ${terms.amount_usd} USD is above policy max_amount_usd ${policy.max_amount_usd}`);
      return answer("do_not_pay");
    }
  }
  because.push(`preflight verdict is ready (${checks.length} checks, ${defects.length} failed)`);
  if (client) because.push(`a stock client would sign accept ${client.chosen ? client.chosen.index : "?"} (${terms.network}, ${terms.amount_atomic} atomic units)`);
  if (worthKnowing.length > 0) because.push(`advisories outside the verdict, worth reading: ${worthKnowing.join(", ")}`);
  return answer("pay");
}

/**
 * The whole walk in one call, for a framework tool that wants one
 * function: GET the door, one POST to the store, decide.
 */
export async function beforeYouPayWalk(url, { base = DEFAULT_BASE, fetch: fetchImpl = fetch, clientProfile, policy = {} } = {}) {
  const challenge = await readChallenge(url, { fetch: fetchImpl });
  const reading = await beforeYouPay(url, { base, fetch: fetchImpl, clientProfile });
  const decision = decide({ door: reading.the_door, client: reading.your_client, accepts: challenge.accepts, policy });
  return { url, challenge, reading, decision };
}
