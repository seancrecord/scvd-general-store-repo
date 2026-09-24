import type { Env } from "@/types";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvGetJson, kvList, kvPut } from "@/lib/kv-retry";
import { jwkThumbprint, type Ed25519Jwk } from "@/lib/web-bot-auth";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
export const CALLING_CARD_TERM_SECONDS = 30 * 86400;
export const CALLING_CARD_REPORT_SECONDS = 7 * 86400;
export const CALLING_CARD_BODY_LIMIT = 8192;
export const CALLING_CARD_PATHS = { keys: "/bot-auth/keys", observe: "/bot-auth/observe", reports: "/bot-auth/reports" } as const;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (row: Record<string, unknown>, keys: string[]) => Object.keys(row).every(key => keys.includes(key));
const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
function publicKey(value: unknown): Ed25519Jwk {
    if (!isRecord(value) || !exact(value, ["kty", "crv", "x"]) || value.kty !== "OKP" || value.crv !== "Ed25519" || typeof value.x !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.x))
        throw new Error("public_key_required");
    const raw = Uint8Array.from(atob(value.x.replaceAll("-", "+").replaceAll("_", "/") + "="), c => c.charCodeAt(0));
    if (btoa(String.fromCharCode(...raw)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") !== value.x)
        throw new Error("public_key_required");
    return { kty: "OKP", crv: "Ed25519", x: value.x };
}
const keyHex = (key: Ed25519Jwk) => hex(Uint8Array.from(atob(key.x.replaceAll("-", "+").replaceAll("_", "/") + "="), c => c.charCodeAt(0)));
export interface CallingCardDirectory {
    key: Ed25519Jwk;
    expires: number;
    signature_input: string;
    signature: string;
}
/** Only the finite profile this client emits is reconstructed. No generic RFC parser is claimed. */
function parameters(input: string, component: string, tag: string, lifetime: number, now: number) {
    const prefix = `card=(${component});created=`;
    if (!input.startsWith(prefix))
        throw new Error("unsupported_signature");
    const match = /^(\d+);expires=(\d+);keyid="([A-Za-z0-9_-]{43})";alg="ed25519";nonce="([A-Za-z0-9_-]{1,80})";tag="([a-z-]+)"$/.exec(input.slice(prefix.length));
    if (!match || match[5] !== tag)
        throw new Error("unsupported_signature");
    const created = Number(match[1]), expires = Number(match[2]);
    if (!Number.isSafeInteger(created) || !Number.isSafeInteger(expires) || created > now + 5 || expires <= now || expires <= created || expires - created > lifetime)
        throw new Error("expired_signature");
    return { params: input.slice(5), kid: match[3]!, expires };
}
async function verifyHeader(base: string, signature: string, key: Ed25519Jwk) {
    const value = /^card=:([A-Za-z0-9+/]{86}==):$/.exec(signature)?.[1];
    return !!value && verifyMessageSignature(base, hex(Uint8Array.from(atob(value), c => c.charCodeAt(0))), keyHex(key));
}
export async function callingCardEnvelope(value: unknown, audience: string, action: "keys" | "report", now = Date.now()) {
    if (!isRecord(value) || !exact(value, ["payload", "signature"]) || !isRecord(value.payload) || typeof value.signature !== "string" || !/^[a-f0-9]{128}$/.test(value.signature))
        throw new Error("invalid_envelope");
    const payload = value.payload;
    const fields = action === "keys" ? ["schema", "action", "audience", "created", "public_key", "directory"] : ["schema", "action", "audience", "created", "public_key", "consent", "report"];
    if (!exact(payload, fields) || payload.schema !== "scvd-calling-card-action/1" || payload.audience !== audience || typeof payload.created !== "number" || !Number.isSafeInteger(payload.created) || Math.abs(now / 1000 - payload.created) > 120)
        throw new Error("invalid_envelope");
    if (action === "keys" ? !["publish", "revoke"].includes(String(payload.action)) : payload.action !== "report")
        throw new Error("invalid_action");
    const key = publicKey(payload.public_key);
    if (!await verifyMessageSignature(JSON.stringify(payload), value.signature, keyHex(key)))
        throw new Error("invalid_signature");
    return { payload, key, kid: await jwkThumbprint(key) };
}
export async function changeCallingCardKey(env: Env, value: unknown, now = Date.now()) {
    const audience = new URL(env.STORE_BASE_URL).origin;
    const { payload, key, kid } = await callingCardEnvelope(value, audience, "keys", now);
    const revoked = KV_KEYS.callingCardRevoked(kid);
    if (payload.action === "revoke") {
        if (payload.directory !== undefined)
            throw new Error("invalid_envelope");
        // A separate tombstone cannot be overwritten by an in-flight publication.
        // KV propagation still applies; this is not an instantaneous global revoke.
        await kvPut(env.COUNTERS, revoked, "1", { expirationTtl: CALLING_CARD_TERM_SECONDS + 86400 });
        return { revoked: true, key_id: kid, propagation: "eventual", expires_in_seconds: CALLING_CARD_TERM_SECONDS + 86400 };
    }
    if (await kvGet(env.COUNTERS, revoked))
        throw new Error("key_revoked");
    if (!isRecord(payload.directory) || !exact(payload.directory, ["signature_input", "signature"]) || typeof payload.directory.signature_input !== "string" || typeof payload.directory.signature !== "string")
        throw new Error("directory_proof_required");
    const proof = parameters(payload.directory.signature_input, '"@authority";req', "http-message-signatures-directory", CALLING_CARD_TERM_SECONDS, Math.floor(now / 1000));
    if (proof.kid !== kid || !await verifyHeader(`"@authority";req: ${new URL(audience).host}\n"@signature-params": ${proof.params}`, payload.directory.signature, key))
        throw new Error("invalid_directory_proof");
    const row: CallingCardDirectory = { key, expires: proof.expires, signature_input: payload.directory.signature_input, signature: payload.directory.signature };
    await kvPut(env.COUNTERS, KV_KEYS.callingCardKey(kid), JSON.stringify(row), { expirationTtl: Math.max(60, proof.expires - Math.floor(now / 1000)) });
    return { key_id: kid, directory_url: `${audience}${CALLING_CARD_PATHS.keys}/${kid}`, expires_at: new Date(proof.expires * 1000).toISOString(), propagation: "eventual" };
}
export async function readCallingCardKey(env: Env, kid: string, now = Date.now()) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(kid) || await kvGet(env.COUNTERS, KV_KEYS.callingCardRevoked(kid)))
        return null;
    const row = await kvGetJson<CallingCardDirectory>(env.COUNTERS, KV_KEYS.callingCardKey(kid));
    return row && row.expires > now / 1000 ? row : null;
}
export async function observeCallingCard(env: Env, request: Request, now = Date.now()) {
    const input = request.headers.get("Signature-Input") ?? "";
    const proof = parameters(input, '"@authority" "signature-agent"', "web-bot-auth", 60, Math.floor(now / 1000));
    const origin = new URL(env.STORE_BASE_URL).origin;
    const agent = JSON.stringify(`${origin}${CALLING_CARD_PATHS.keys}/${proof.kid}`);
    if (request.headers.get("Signature-Agent") !== agent)
        throw new Error("unrecognized_directory");
    const row = await readCallingCardKey(env, proof.kid, now);
    if (!row || !await verifyHeader(`"@authority": ${new URL(request.url).host}\n"signature-agent": ${agent}\n"@signature-params": ${proof.params}`, request.headers.get("Signature") ?? "", row.key))
        throw new Error("signature_not_verified");
    const observation = { schema: "scvd-calling-card-observation/1", observed_at: new Date(now).toISOString(), observer: origin, identity: "signature_verified", key_id: proof.kid, directory: JSON.parse(agent) as string, payment: "not_observed", scope: "This receiver verified the signature over authority and directory reference. No operator identity, delegated authority, body integrity, unique request, other-site acceptance or payment is established. Replays within the signature window are not deduplicated." };
    const signed = await signMessage(JSON.stringify(observation), env.SIGNING_KEY);
    return { observation, signature: signed.signature, public_key: signed.publicKey, signature_covers: "UTF-8 JSON.stringify(observation), fields in served order" };
}
const REPORT_FIELDS = ["event_id", "origin", "outcome", "http_status", "introduction", "identity_acceptance", "payment", "payment_diagnosis", "next_action"];
const vocabulary: Record<string, readonly string[]> = {
    outcome: ["signing_failed", "network_error", "payment_required", "access_refused", "rate_limited", "redirect_requires_decision", "response_received", "endpoint_error"],
    introduction: ["not_sent", "delivery_unknown", "signed", "declared"],
    identity_acceptance: ["not_observed", "receiver_reported_verified"],
    payment: ["not_attempted", "unknown", "challenge_received", "not_observed"],
    next_action: ["reconcile_before_retry", "existing_payment_client", "read_response", "inspect_before_retry"],
    payment_diagnosis: ["challenge_body_not_read", "challenge_header_too_large", "unsupported_payment_version", "malformed_challenge", "wallet_networks_unknown", "declared_network_offered", "no_declared_network_offered"],
};
export async function receiveCallingCardReport(env: Env, value: unknown, now = Date.now()) {
    const { payload, kid } = await callingCardEnvelope(value, new URL(env.STORE_BASE_URL).origin, "report", now);
    const report = payload.report;
    if (payload.consent !== true || !isRecord(report) || !exact(report, REPORT_FIELDS) || typeof report.event_id !== "string" || !/^[a-f0-9-]{36}$/.test(report.event_id) || typeof report.origin !== "string" || report.origin.length > 256)
        throw new Error("invalid_report");
    const origin = new URL(report.origin);
    if (origin.protocol !== "https:" || origin.origin !== report.origin)
        throw new Error("invalid_report");
    for (const [field, allowed] of Object.entries(vocabulary)) {
        if (["next_action", "payment_diagnosis"].includes(field) && report[field] === undefined)
            continue;
        if (typeof report[field] !== "string" || !allowed.includes(report[field] as string))
            throw new Error("invalid_report");
    }
    if (report.http_status !== undefined && (!Number.isInteger(report.http_status) || Number(report.http_status) < 100 || Number(report.http_status) > 599))
        throw new Error("invalid_report");
    if (!await readCallingCardKey(env, kid, now))
        throw new Error("unknown_key");
    // Namespace by signer to keep one reporter from overwriting another's event.
    // Authentication information is not copied into the retained diagnostic row.
    const event = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${kid}:${report.event_id}`));
    const storage = KV_KEYS.callingCardReport(hex(new Uint8Array(event)));
    if (await kvGet(env.ORDERS, storage))
        return { accepted: true, duplicate: true };
    await kvPut(env.ORDERS, storage, JSON.stringify({ received_at: new Date(now).toISOString(), evidence: "client_report_unverified", ...report }), { expirationTtl: CALLING_CARD_REPORT_SECONDS });
    return { accepted: true, duplicate: false };
}
export async function listCallingCardReports(env: Env, cursor?: string) {
    const page = await kvList(env.ORDERS, { prefix: KV_KEYS.callingCardReportPrefix, limit: 50, ...(cursor ? { cursor } : {}) });
    const rows = await Promise.all(page.keys.map(key => kvGetJson<Record<string, unknown>>(env.ORDERS, key.name)));
    return { evidence: "client_report_unverified", retention_seconds: CALLING_CARD_REPORT_SECONDS, rows: rows.filter(Boolean), unreadable: rows.filter(row => !row).length, complete: page.list_complete, cursor: page.list_complete ? null : page.cursor, limits: "Opt-in sample; neither unique agents nor all traffic. Event deduplication and revocation have KV propagation limits. No success rate or ranking is inferred." };
}
