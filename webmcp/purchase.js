/**
 * The browser bridge transports an already-signed payment: an x402 v2 payload,
 * or (since 2026-09-18) a native MPP credential signed against the challenge
 * the same quote carried. It never opens a wallet, signs, installs a client,
 * or retries a payment by itself. Quotes and results live only in this page's
 * bounded memory. Node tests execute this file.
 */
export const MAX_QUOTES = 16;
export const MAX_QUOTE_AGE_MS = 300_000;
export const MAX_CREDENTIAL_BYTES = 16_384;

function answer(payload, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError };
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function encoded(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
}
function decoded(value) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value), char => char.charCodeAt(0))));
}
function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0))));
}
function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** The SDK's canonical JSON for a request or meta: sorted keys, no undefined. */
function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (!record(value)) return JSON.stringify(value);
  return "{" + Object.keys(value).sort().flatMap(key => value[key] === undefined ? [] : [JSON.stringify(key) + ":" + canonicalJson(value[key])]).join(",") + "}";
}
/** RFC 9110 auth-params with escaped quoted strings, the way the MPP SDK reads a `Payment` challenge. */
function authParams(input) {
  const out = {};
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /[\s,]/.test(input[i])) i++;
    if (i >= input.length) break;
    const keyStart = i;
    while (i < input.length && /[A-Za-z0-9_-]/.test(input[i])) i++;
    const key = input.slice(keyStart, i).toLowerCase();
    if (!key) throw new Error("Malformed auth-param.");
    while (i < input.length && /\s/.test(input[i])) i++;
    if (input[i] !== "=") break;
    i++;
    while (i < input.length && /\s/.test(input[i])) i++;
    let value = "";
    if (input[i] === '"') {
      i++;
      let closed = false;
      while (i < input.length) {
        const char = input[i++];
        if (char === "\\") { value += input[i++]; continue; }
        if (char === '"') { closed = true; break; }
        value += char;
      }
      if (!closed) throw new Error("Unterminated quoted-string.");
    } else {
      const start = i;
      while (i < input.length && input[i] !== ",") i++;
      value = input.slice(start, i).trim();
    }
    if (key in out) throw new Error("Duplicate parameter: " + key);
    out[key] = value;
  }
  return out;
}
/**
 * The native MPP challenges a door offers beside its x402 terms, decoded for
 * the buyer's payment client: for each, the raw `Payment` header to sign and
 * its fields. A door that takes tips offers one challenge per price tier in
 * one header (RFC 9110 §11.6.1, comma-separated), minimum first; a Payment
 * challenge's parameters carry no bare comma (its request and opaque are
 * base64url), so the scheme name is the only boundary. Empty when the header
 * carries no readable Payment scheme.
 */
export function parsePaymentChallenges(header) {
  if (typeof header !== "string") return [];
  const starts = [];
  const scheme = /(?:^|,\s*)(Payment)\s+/gi;
  let match;
  while ((match = scheme.exec(header))) starts.push(match.index + match[0].indexOf(match[1]));
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = header.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : header.length).replace(/,\s*$/, "").trim();
    const parsed = parseOneChallenge(chunk.slice("Payment".length).trim());
    if (parsed) out.push(parsed);
  }
  return out;
}
/** The first challenge, the minimum where the door takes tips; null when there is none. */
export function parsePaymentChallenge(header) {
  return parsePaymentChallenges(header)[0] ?? null;
}
function parseOneChallenge(paramsText) {
  try {
    const params = authParams(paramsText);
    if (!params.id || !params.realm || params.method !== "evm" || params.intent !== "charge" || !params.request) return null;
    const request = base64UrlDecode(params.request);
    const meta = params.opaque ? base64UrlDecode(params.opaque) : {};
    if (!record(request) || typeof request.amount !== "string" || !/^[0-9]+$/.test(request.amount) || !record(meta)) return null;
    return { header: "Payment " + paramsText, id: params.id, realm: params.realm, method: params.method, intent: params.intent, request, expires: params.expires || null, meta };
  } catch { return null; }
}
/** The credential as the Authorization header value, from the string a client emits or its {challenge, payload} object. */
function credentialHeader(value) {
  if (typeof value === "string") {
    if (!/^Payment\s+[A-Za-z0-9_-]+$/.test(value.trim())) throw new Error("A signed MPP credential is the Authorization value a payment client emits: Payment <base64url>. No payment was sent.");
    return value.trim();
  }
  if (record(value) && record(value.challenge) && record(value.payload)) {
    const { meta, opaque, request, ...challenge } = value.challenge;
    const wireOpaque = opaque !== undefined ? opaque : meta !== undefined ? base64UrlEncode(canonicalJson(meta)) : undefined;
    const wire = { challenge: { ...challenge, ...(wireOpaque !== undefined ? { opaque: wireOpaque } : {}), request: typeof request === "string" ? request : base64UrlEncode(canonicalJson(request)) }, payload: value.payload };
    return "Payment " + base64UrlEncode(JSON.stringify(wire));
  }
  throw new Error("A signed MPP credential is required: the Authorization value from the buyer's payment client, or its {challenge, payload} object. Signing belongs in that client; no payment was sent.");
}
async function bodyOf(response) {
  const text = await response.text();
  if ((response.headers.get("Content-Type") || "").includes("json")) {
    try { return JSON.parse(text); } catch { /* preserve unreadable delivery for recovery */ }
  }
  return text;
}
function aborted(signal) { if (signal) signal.throwIfAborted(); }

export function createPurchaseBridge({ origin, itemIds, fetch: request = globalThis.fetch, now = Date.now, randomId = () => crypto.randomUUID() }) {
  const quotes = new Map();
  let pendingQuotes = 0;
  const base = new URL(origin).origin;
  const buyPaths = new Set(itemIds.map(id => "/api/buy/" + id));
  function purchaseUrl(raw) {
    if (typeof raw !== "string" || raw.length > 8192) throw new Error("Invalid purchase URL.");
    const url = new URL(raw, base);
    if (url.origin !== base || url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("A store purchase needs a same-origin HTTPS URL.");
    if (!buyPaths.has(url.pathname) && !/^\/almanac\/[a-z0-9_-]+$/.test(url.pathname) && !/^\/gazette\/issue-[0-9]+$/.test(url.pathname) && !/^\/zodiac\/archive\/[a-z_]+\/week-[0-9]+$/.test(url.pathname)) throw new Error("Choose a buy_url from the catalog or a publication index.");
    url.searchParams.set("src", "webmcp");
    return url.href;
  }
  function prune() {
    for (const [id, quote] of quotes) if (!quote.busy && now() >= quote.expires) quotes.delete(id);
  }
  /**
   * The native lane: the credential a payment client signed against this
   * quote's challenge, carried as the Authorization value with the quote's
   * key. The store re-derives the challenge from the same terms and refuses a
   * credential for any other; the page refuses one for another quote before
   * anything leaves it.
   */
  async function completeNative(quote, credential, signal) {
    if (!quote.challenge) return answer({ error: "This quote offered no native MPP challenge; pay it with signed_payment (x402), or request a new quote. No payment was sent." }, true);
    let header;
    try { header = credentialHeader(credential); } catch (error) { return answer({ error: error.message }, true); }
    if (header.length > MAX_CREDENTIAL_BYTES) return answer({ error: "The credential is larger than a Payment header carries. No payment was sent." }, true);
    let wire;
    try { wire = base64UrlDecode(header.slice("Payment ".length)); } catch { return answer({ error: "The credential is not readable base64url JSON. No payment was sent." }, true); }
    if (!record(wire) || !record(wire.challenge) || !quote.challenges.some(offered => offered.id === wire.challenge.id)) return answer({ error: "The signed credential answers a different challenge than this quote's. No payment was sent." }, true);
    quote.busy = true;
    try {
      const response = await request(quote.url, { method: "GET", headers: { Accept: "application/json", Authorization: header, "Idempotency-Key": quote.key }, credentials: "omit", redirect: "error", signal });
      const body = await bodyOf(response);
      const result = answer({ status: response.status, body, payment_response: null, payment_receipt: response.headers.get("Payment-Receipt"), purchase_recovery: response.headers.get("Purchase-Recovery"), idempotency_key: quote.key, buy_url: quote.url }, !response.ok);
      if (response.ok) quote.result = result;
      return result;
    } catch {
      aborted(signal);
      return answer({ error: "The purchase response was interrupted; payment status is unknown. Retry this quote with the same signed credential and key, or recover the original request. Do not sign a new credential to recover this one.", idempotency_key: quote.key, buy_url: quote.url }, true);
    } finally { quote.busy = false; }
  }
  return {
    async quote(args, signal) {
      aborted(signal);
      prune();
      if (quotes.size + pendingQuotes >= MAX_QUOTES) return answer({ error: "This page already holds its quote limit. Finish a purchase or wait for an old quote to expire." }, true);
      let url;
      try { url = purchaseUrl(args?.buy_url); } catch (error) { return answer({ error: error.message }, true); }
      const key = randomId();
      pendingQuotes += 1;
      try {
        let response;
        // The retry key rides the free quote too: the store binds its native
        // challenge to a supplied key, so the credential and the retry agree.
        try { response = await request(url, { method: "GET", headers: { Accept: "application/json", "Idempotency-Key": key }, credentials: "omit", redirect: "error", signal }); }
        catch { aborted(signal); return answer({ error: "The free quote could not be read. No payment was sent." }, true); }
        const body = await bodyOf(response);
        if (response.status !== 402) return answer({ status: response.status, body, payment_sent: false }, !response.ok);
        let required;
        try { required = decoded(response.headers.get("PAYMENT-REQUIRED") || ""); } catch { return answer({ error: "The door did not return a readable PAYMENT-REQUIRED header. No payment was sent." }, true); }
        if (required?.x402Version !== 2 || !Array.isArray(required.accepts) || !required.accepts.length || !required.accepts.every(offer => record(offer) && offer.scheme === "exact" && typeof offer.network === "string" && typeof offer.amount === "string" && /^[0-9]+$/.test(offer.amount) && BigInt(offer.amount) > 0n && typeof offer.asset === "string" && typeof offer.payTo === "string")) return answer({ error: "The door did not return usable exact x402 v2 terms. No payment was sent." }, true);
        const id = randomId();
        // The native challenge, when the door offers one and it is bound to this
        // quote's key; a challenge keyed elsewhere is not offered, since its
        // credential could never retry under this quote.
        const challenges = parsePaymentChallenges(response.headers.get("WWW-Authenticate")).filter(offered => offered.meta.purchase_key === key);
        const challenge = challenges[0] ?? null;
        // A door that takes tips lists every tier, minimum first; signing a
        // higher tier's header tips, and the store books the excess.
        const tiers = challenges.length > 1 ? " This door offers " + challenges.length + " native price tiers in payment_challenges, minimum first; signing a higher tier's header tips, and the excess is booked as a tip on the same purchase." : "";
        const duration = Math.min(MAX_QUOTE_AGE_MS, ...required.accepts.map(offer => Number.isFinite(offer.maxTimeoutSeconds) && offer.maxTimeoutSeconds > 0 ? offer.maxTimeoutSeconds * 1000 : MAX_QUOTE_AGE_MS));
        const quote = { url, required, challenge, challenges, key, expires: now() + duration, busy: false };
        quotes.set(id, quote);
        return answer({ quote_id: id, buy_url: url, idempotency_key: key, expires_at: new Date(quote.expires).toISOString(), payment_required: required, payment_challenge: challenge, payment_challenges: challenges.length ? challenges : null, payment_sent: false,
          next: challenge
            ? "Two ways to pay, one purchase. x402: a buyer-authorized wallet or payment client signs one offered accept within the buyer's budget, and complete_store_purchase takes this quote_id and that signed x402 v2 JSON payload as signed_payment. Native MPP: a compatible payment client signs payment_challenge.header, and complete_store_purchase takes this quote_id and the resulting Payment credential as signed_credential. Send one, never both. Amounts are atomic USDC: copy them unchanged. Without a compatible signer, stop; no private keys or wallet secrets belong here." + tiers
            : "A buyer-authorized wallet or payment client signs one offered accept within the buyer's budget. complete_store_purchase takes this quote_id and that signed x402 v2 JSON payload. Amounts are atomic USDC: copy them unchanged. Without a compatible signer, stop; no private keys or wallet secrets belong here." });
      } finally { pendingQuotes -= 1; }
    },
    async complete(args, signal) {
      aborted(signal);
      prune();
      const quote = quotes.get(args?.quote_id);
      if (!quote) return answer({ error: "Quote missing or expired. For a new purchase, request a free quote. If an earlier submission may have settled, recover it using its original URL, payment and idempotency key; a new quote is a new purchase." }, true);
      if (quote.result) return quote.result;
      if (quote.busy) return answer({ error: "This purchase is already in flight. Wait for its result; no second request was sent." }, true);
      const payment = args?.signed_payment;
      const credential = args?.signed_credential;
      // One credential per call, as the store's own doors refuse: an ambiguous
      // payment never leaves the page.
      if (payment !== undefined && payment !== null && credential !== undefined && credential !== null) return answer({ error: "Send one payment credential: signed_payment (x402) or signed_credential (MPP), never both. No payment was sent." }, true);
      if (credential !== undefined && credential !== null) return completeNative(quote, credential, signal);
      if (!record(payment) || payment.x402Version !== 2 || !record(payment.accepted) || !record(payment.payload) || JSON.stringify(payment).length > 65_536) return answer({ error: "A signed x402 v2 JSON payload is required. Signing belongs in the buyer's wallet; no payment was sent." }, true);
      if (!quote.required.accepts.some(offer => JSON.stringify(canonical(offer)) === JSON.stringify(canonical(payment.accepted)))) return answer({ error: "The signed accept differs from this quote. No payment was sent." }, true);
      if (payment.resource?.url && payment.resource.url !== quote.required.resource?.url) return answer({ error: "The signed resource differs from this quote. No payment was sent." }, true);
      // Only protocol fields cross the wire. Extra tool arguments cannot become
      // headers, redirect targets, private-key fields, or a different purchase.
      const payload = { x402Version: payment.x402Version, accepted: payment.accepted, payload: payment.payload, ...(payment.resource ? { resource: payment.resource } : {}), ...(payment.extensions ? { extensions: payment.extensions } : {}) };
      quote.busy = true;
      try {
        const response = await request(quote.url, { method: "GET", headers: { Accept: "application/json", "PAYMENT-SIGNATURE": encoded(payload), "Idempotency-Key": quote.key }, credentials: "omit", redirect: "error", signal });
        const body = await bodyOf(response);
        // Publications carry their private status handle in a header, not the markdown body.
        const result = answer({ status: response.status, body, payment_response: response.headers.get("PAYMENT-RESPONSE"), payment_receipt: null, purchase_recovery: response.headers.get("Purchase-Recovery"), idempotency_key: quote.key, buy_url: quote.url }, !response.ok);
        if (response.ok) quote.result = result;
        return result;
      } catch {
        aborted(signal);
        return answer({ error: "The purchase response was interrupted; payment status is unknown. Retry this quote with the same signed payment and key, or recover the original request. Do not authorize a new purchase to recover this one.", idempotency_key: quote.key, buy_url: quote.url }, true);
      } finally { quote.busy = false; }
    },
  };
}
