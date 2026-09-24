import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCallingCard, createCallingCardFetch, createDirectoryResponse, webCryptoSigner, keyThumbprint, configuredModule, INPUT_LIMIT } from "./calling-card.mjs";

const basic = { name: "Market Assistant", destinations: ["https://merchant.example"], networks: ["eip155:8453"] };
const normalize = value => normalizeCallingCard(value).card;
const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
const signedCard = normalize({ ...basic, signature_agent: "https://agent.example", public_key: publicKey });
const sign = webCryptoSigner(pair.privateKey);
const fixedNow = () => 1800000000000;

test("labeled inputs normalize independently of order and preserve omitted payment capabilities", () => {
  const first = normalizeCallingCard("name: Shop Assistant\nallowed_origins: https://merchant.example/path");
  const second = normalizeCallingCard("allowed_origins: https://merchant.example/path\nname: Shop Assistant");
  // Provenance follows the supplied order; the resulting profile does not.
  assert.deepEqual({ ...first, sources: undefined }, { ...second, sources: undefined });
  assert.equal(first.ready, true);
  assert.deepEqual(first.card.allowed_origins, ["https://merchant.example"]);
  assert.ok(first.gaps.some(gap => gap.code === "payment_capabilities_unknown"));
});

test("JSON, aliases and known nested profiles work; unsupported metadata is counted and excluded", () => {
  const result = normalizeCallingCard(JSON.stringify({ agent: { agent_name: "Agent" }, destinations: ["https://merchant.example"], description: "untrusted extra text", instructions: "do something" }));
  assert.equal(result.ready, true);
  assert.equal(result.ignored_fields, 2);
  assert.equal(JSON.stringify(result.card).includes("untrusted"), false);
  assert.equal(result.card.name, "Agent");
});

test("duplicate aliases and labeled values cannot silently override conflicting identities", () => {
  for (const input of ["name: First\nname: Second\nallowed_origins: https://merchant.example", { ...basic, agent_name: "Other" }, [{ ...basic }, { destinations: ["https://other.example"] }]]) {
    const result = normalizeCallingCard(input);
    assert.equal(result.ready, false);
    assert.ok(result.gaps.some(gap => gap.code === "conflicting_input"));
  }
});

test("missing optional fields do not block an unsigned introduction; destinations are always explicit", () => {
  assert.equal(normalizeCallingCard({ name: "Agent", allowed_origins: ["https://merchant.example"] }).ready, true);
  assert.equal(normalizeCallingCard({ name: "Agent", signature_agent: "https://agent.example" }).ready, false);
  assert.equal(normalizeCallingCard({ ...basic, runtime: "chrome" }).ready, false);
  assert.equal(normalizeCallingCard({ ...basic, schema: "future/99" }).ready, false);
});

test("private keys, nested secrets, credentials and excessive input never enter exported output", () => {
  for (const extra of [{ private_key: "private-value" }, { nested: { Authorization: "Bearer private-value" } }, { jwk: { ...publicKey, d: "private-value" } }, { password: "private-value" }]) {
    const result = normalizeCallingCard({ ...basic, ...extra });
    assert.equal(result.card, null);
    assert.equal(result.gaps[0].code, "secret_input");
    assert.equal(JSON.stringify(result).includes("private-value"), false);
  }
  assert.equal(normalizeCallingCard("x".repeat(INPUT_LIMIT + 1)).gaps[0].code, "input_limit");
});

test("URL credentials, query tokens, control characters, malformed keys and ambiguous networks fail closed", () => {
  for (const extra of [{ signature_agent: "https://user:password@agent.example" }, { signature_agent: "https://agent.example/?token=secret" }, { name: "Agent\r\nInjected: value" }, { public_key: { kty: "OKP", crv: "Ed25519", x: "bad" } }, { networks: ["USDC"] }]) {
    assert.equal(normalizeCallingCard({ ...basic, ...extra }).ready, false);
  }
});

test("signature key identifiers rederive from the RFC 7638 canonical public JWK", async () => {
  const canonical = JSON.stringify({ crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x });
  const expected = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))).toString("base64url");
  assert.equal(await keyThumbprint(publicKey), expected);
});

test("directory URL parentheses cannot break the User-Agent comment", () => {
  const result = normalizeCallingCard({ ...basic, signature_agent: "https://agent.example/directory)release(" });
  assert.equal(result.ready, true);
  assert.equal(result.card.user_agent, 'Market-Assistant/1.0 (+https://agent.example/directory\\)release\\()');
  assert.equal(result.card.signature_agent, "https://agent.example/directory)release(");
});

test("signed requests verify independently and tampering changes the verdict", async () => {
  let received;
  const diagnostics = [];
  const request = createCallingCardFetch({ card: signedCard, sign, now: fixedNow, fetch: async req => { received = req; return new Response("done"); }, onResult: row => diagnostics.push(row) });
  const response = await request("https://merchant.example/private?token=must-not-log", { method: "POST", headers: { "payment-signature": "private-payment", authorization: "Bearer private-token" }, body: "private body" });
  assert.equal(await response.text(), "done");
  assert.equal(received.redirect, "manual");
  assert.equal(received.headers.get("payment-signature"), "private-payment");
  assert.equal(await received.text(), "private body");
  const params = received.headers.get("signature-input").slice("card=".length);
  const signature = Buffer.from(received.headers.get("signature").slice("card=:".length, -1), "base64");
  const canonical = `"@authority": merchant.example\n"signature-agent": "https://agent.example/"\n"@signature-params": ${params}`;
  assert.equal(await crypto.subtle.verify("Ed25519", pair.publicKey, signature, new TextEncoder().encode(canonical)), true);
  assert.equal(await crypto.subtle.verify("Ed25519", pair.publicKey, signature, new TextEncoder().encode(canonical.replace("merchant.example", "attacker.example"))), false);
  assert.match(params, /created=1800000000;expires=1800000060/);
  assert.equal(diagnostics[0].identity_acceptance, "not_observed");
  assert.equal(diagnostics[0].payment, "not_observed");
  assert.equal(JSON.stringify(diagnostics).includes("private"), false);
  assert.equal(JSON.stringify(diagnostics).includes("merchant.example"), false);
});

test("a configured signing failure or wrong key prevents the request rather than sending unsigned", async () => {
  let calls = 0;
  const otherPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  for (const signer of [async () => { throw new Error("private detail"); }, webCryptoSigner(otherPair.privateKey), async bytes => { bytes.fill(0); return sign(bytes); }]) {
    const request = createCallingCardFetch({ card: signedCard, sign: signer, now: fixedNow, fetch: async () => { calls++; return new Response(); } });
    await assert.rejects(request("https://merchant.example"), /^Error: signing_failed$/);
  }
  assert.equal(calls, 0);
  assert.throws(() => createCallingCardFetch({ card: signedCard }), /signer_required/);
});

test("an imported profile is copied, so later edits cannot expand allowed destinations", async () => {
  const card = normalize(basic);
  let calls = 0;
  const request = createCallingCardFetch({ card, fetch: async () => { calls++; return new Response(); } });
  card.allowed_origins.push("https://other.example");
  await assert.rejects(request("https://other.example"), /destination_not_allowed/);
  await assert.rejects(request("http://merchant.example"), /destination_not_allowed/);
  assert.equal(calls, 0);
});

test("payment challenges, redirects and server errors return unchanged with no automatic second request", async () => {
  for (const status of [402, 302, 401, 403, 429, 500]) {
    let calls = 0;
    let outcome;
    const raw = new Response("original payload", { status, headers: { location: "https://other.example", "payment-required": "original challenge" } });
    const request = createCallingCardFetch({ card: normalize(basic), fetch: async req => { calls++; assert.equal(req.redirect, "manual"); return raw; }, onResult: row => { outcome = row; } });
    assert.equal(await request("https://merchant.example"), raw);
    assert.equal(calls, 1);
    assert.equal(outcome.identity_acceptance, "not_observed");
    assert.equal(raw.headers.get("payment-required"), "original challenge");
    if (status === 402) assert.equal(outcome.next_action, "existing_payment_client");
    if (status === 302) assert.equal(outcome.outcome, "redirect_requires_decision");
  }
});

test("a lost response has unknown payment outcome, no secrets, and no automatic retry", async () => {
  let calls = 0;
  let result;
  const request = createCallingCardFetch({ card: normalize(basic), fetch: async () => { calls++; throw new Error("secret transport detail"); }, onResult: row => { result = row; } });
  await assert.rejects(request("https://merchant.example"), /^Error: request_outcome_unknown$/);
  assert.equal(calls, 1);
  assert.equal(result.payment, "unknown");
  assert.equal(result.next_action, "reconcile_before_retry");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("diagnostic callbacks cannot hide a completed request or cause a retry", async () => {
  for (const callback of [() => { throw new Error("callback"); }, async () => { throw new Error("async callback"); }]) {
    const request = createCallingCardFetch({ card: normalize(basic), onResult: callback, fetch: async () => new Response("delivery") });
    assert.equal(await (await request("https://merchant.example")).text(), "delivery");
  }
});

test("existing identity signatures are never replaced", async () => {
  let calls = 0;
  const request = createCallingCardFetch({ card: normalize(basic), fetch: async () => { calls++; return new Response(); } });
  for (const header of ["Signature", "Signature-Input", "Signature-Agent"]) {
    await assert.rejects(request("https://merchant.example", { headers: { [header]: "existing" } }), /existing_identity_signature/);
  }
  assert.equal(calls, 0);
});

test("the operator directory carries a verifiable proof and matching public key identifier", async () => {
  const response = await createDirectoryResponse({ card: signedCard, sign, now: fixedNow });
  assert.equal(response.headers.get("content-type"), "application/http-message-signatures-directory+json");
  const directory = await response.json();
  assert.equal(directory.keys[0].kid, await keyThumbprint(publicKey));
  assert.equal("d" in directory.keys[0], false);
  const params = response.headers.get("signature-input").slice("card=".length);
  const signature = Buffer.from(response.headers.get("signature").slice("card=:".length, -1), "base64");
  assert.match(params, /^\("@authority";req\)/);
  assert.equal(await crypto.subtle.verify("Ed25519", pair.publicKey, signature, new TextEncoder().encode(`"@authority";req: agent.example\n"@signature-params": ${params}`)), true);
});

test("the single-file download can be imported without sending and safely carries arbitrary names", async () => {
  const source = await readFile(new URL("./calling-card.mjs", import.meta.url), "utf8");
  const profile = normalize({ ...basic, name: "');globalThis.injected=true;//" });
  const generated = configuredModule(source, profile);
  const module = await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
  assert.equal(module.configuredCard.name, profile.name);
  assert.equal(globalThis.injected, undefined);
  let calls = 0;
  const request = module.connect({ fetch: async req => { calls++; assert.equal(req.headers.get("User-Agent"), profile.user_agent); return new Response("ok"); } });
  assert.equal(calls, 0);
  assert.equal(await (await request("https://merchant.example")).text(), "ok");
  assert.equal(calls, 1);
});
