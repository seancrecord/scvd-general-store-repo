/**
 * The browser bridge transports an already-signed x402 payment. It never opens
 * a wallet, signs, installs a client, or retries a payment by itself. Quotes and
 * results live only in this page's bounded memory. Node tests execute this file.
 */
export const MAX_QUOTES = 16;
export const MAX_QUOTE_AGE_MS = 300_000;

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
  return {
    async quote(args, signal) {
      aborted(signal);
      prune();
      if (quotes.size + pendingQuotes >= MAX_QUOTES) return answer({ error: "This page already holds its quote limit. Finish a purchase or wait for an old quote to expire." }, true);
      let url;
      try { url = purchaseUrl(args?.buy_url); } catch (error) { return answer({ error: error.message }, true); }
      pendingQuotes += 1;
      try {
        let response;
        try { response = await request(url, { method: "GET", headers: { Accept: "application/json" }, credentials: "omit", redirect: "error", signal }); }
        catch { aborted(signal); return answer({ error: "The free quote could not be read. No payment was sent." }, true); }
        const body = await bodyOf(response);
        if (response.status !== 402) return answer({ status: response.status, body, payment_sent: false }, !response.ok);
        let required;
        try { required = decoded(response.headers.get("PAYMENT-REQUIRED") || ""); } catch { return answer({ error: "The door did not return a readable PAYMENT-REQUIRED header. No payment was sent." }, true); }
        if (required?.x402Version !== 2 || !Array.isArray(required.accepts) || !required.accepts.length || !required.accepts.every(offer => record(offer) && offer.scheme === "exact" && typeof offer.network === "string" && typeof offer.amount === "string" && /^[0-9]+$/.test(offer.amount) && BigInt(offer.amount) > 0n && typeof offer.asset === "string" && typeof offer.payTo === "string")) return answer({ error: "The door did not return usable exact x402 v2 terms. No payment was sent." }, true);
        const id = randomId();
        const key = randomId();
        const duration = Math.min(MAX_QUOTE_AGE_MS, ...required.accepts.map(offer => Number.isFinite(offer.maxTimeoutSeconds) && offer.maxTimeoutSeconds > 0 ? offer.maxTimeoutSeconds * 1000 : MAX_QUOTE_AGE_MS));
        const quote = { url, required, key, expires: now() + duration, busy: false };
        quotes.set(id, quote);
        return answer({ quote_id: id, buy_url: url, idempotency_key: key, expires_at: new Date(quote.expires).toISOString(), payment_required: required, payment_sent: false, next: "A buyer-authorized wallet or payment client signs one offered accept within the buyer's budget. complete_store_purchase takes this quote_id and that signed x402 v2 JSON payload. Amounts are atomic USDC: copy them unchanged. Without a compatible signer, stop; no private keys or wallet secrets belong here." });
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
        const result = answer({ status: response.status, body, payment_response: response.headers.get("PAYMENT-RESPONSE"), idempotency_key: quote.key, buy_url: quote.url }, !response.ok);
        if (response.ok) quote.result = result;
        return result;
      } catch {
        aborted(signal);
        return answer({ error: "The purchase response was interrupted; payment status is unknown. Retry this quote with the same signed payment and key, or recover the original request. Do not authorize a new purchase to recover this one.", idempotency_key: quote.key, buy_url: quote.url }, true);
      } finally { quote.busy = false; }
    },
  };
}
