import { checkProbeTarget, parseProbeTarget } from "./probe-target";
import { validateAgentCard, validateTask, validateMessage, validateSendMessageRequest, A2A_PROTOCOL_VERSION } from "./a2a-validation.js";

export const A2A_BATTERY = "scvd-a2a-jsonrpc-0.3-v1";
export const A2A_SPEC = "https://a2a-protocol.org/v0.3.0/specification/";
export const A2A_AUTH_PATH = "/.well-known/scvd-a2a-audit.json";
export const A2A_READ_LIMIT = 16 * 1024;
export const A2A_FIXTURE_LIMIT = 4096;
export const A2A_TIMEOUT_MS = 4000;
export const A2A_WATCH_DAYS = 7;
export const A2A_RECHECK_DAYS = 30;
export const A2A_FREE_REQUESTS_PER_MINUTE = 30;
export const A2A_GAPS = [
  "Only A2A 0.3.0 JSON-RPC is supported. No other version or transport is certified.",
  "Streaming, push notifications, authentication, file transfer, extended cards, long-running tasks and application correctness are not tested.",
  "One operator-supplied public test task is exercised. A Message response legitimately has no retrievable Task; lifecycle checks then remain not applicable.",
  "Requests and responses are untrusted third-party data. No instructions in them are followed. Only public test data belongs in the authorization file.",
  "URL checks reject private address literals and internal names; DNS pinning is not provided. Redirects are never followed. Platform egress remains part of the boundary.",
  "A timeout or truncated read is an observation gap, never a conformance pass. Every result is dated and covers only the checks listed.",
] as const;
export type CheckState = "pass" | "fail" | "not_observed" | "not_applicable";
export interface A2ACheck { id: string; state: CheckState; detail: string; evidence: string[]; spec: string }
export interface Exchange { id: string; url: string; method: "GET" | "POST"; request: string | null; status: number | null; content_type: string | null; response: string | null; gap: string | null }
export interface A2AEntitlement { kit_id: string; started_at: string; ends_at: string; recheck_until: string }
export interface A2AReading { entitlement?: A2AEntitlement; association?: { kit_id: string; role: "recheck" | "watch"; baseline_hash: string; slot?: number; scheduled_for?: string }; battery: string; protocol_version: string | null; observed_at: string; card_url: string; endpoint: string | null; mode: "card" | "runtime"; checks: A2ACheck[]; exchanges: Exchange[]; counts: Record<CheckState, number>; gaps: readonly string[] }
export interface Authorization { endpoint: string; expires_at: string; message: Record<string, unknown> }
export function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function target(raw: unknown, ownHost = ""): string {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("target_refused");
  const url = parseProbeTarget(raw);
  if (!checkProbeTarget(url, ownHost).ok || url.search || url.hash) throw new Error("target_refused");
  return url.href;
}
export async function boundedText(response: Response, limit = A2A_READ_LIMIT): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("body_limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export async function exchange(id: string, url: string, request: string | null, fetchImpl: typeof fetch = fetch): Promise<Exchange> {
  target(url);
  const method = request === null ? "GET" : "POST";
  const result: Exchange = { id, url, method, request, status: null, content_type: null, response: null, gap: null };
  // This deadline covers the body too; a slow stream must not keep a paid audit open forever.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { method, redirect: "manual", signal: controller.signal,
          headers: { Accept: "application/json", "User-Agent": `SCVD-A2A/${A2A_BATTERY}`, ...(request === null ? {} : { "Content-Type": "application/json" }) },
          ...(request === null ? {} : { body: request }) });
        result.status = response.status; result.content_type = response.headers.get("content-type");
        result.response = await boundedText(response);
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, A2A_TIMEOUT_MS); }),
    ]);
  } catch (error) {
    controller.abort(); result.response = null;
    result.gap = error instanceof Error && ["body_limit", "timeout"].includes(error.message) ? error.message : "fetch_failed";
  } finally { if (timer !== undefined) clearTimeout(timer); }
  // A fetch implementation that ignores abort may finish later. It cannot
  // mutate the evidence after the deadline has handed it to the signer.
  return { ...result };
}
function json(ex: Exchange): unknown { try { return JSON.parse(ex.response ?? ""); } catch { return null; } }
function jsonMediaType(ex: Exchange): boolean { return ex.content_type?.split(";")[0]?.trim().toLowerCase() === "application/json"; }
function jsonResponse(ex: Exchange): boolean { return ex.status !== null && ex.status >= 200 && ex.status < 300 && jsonMediaType(ex); }
function check(reading: A2AReading, id: string, state: CheckState, detail: string, evidence: string[], section: string): void {
  reading.checks.push({ id, state, detail, evidence, spec: A2A_SPEC + section }); reading.counts[state]++;
}
export async function readCard(url: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<A2AReading> {
  url = target(url);
  const ex = await exchange("card", url, null, fetchImpl);
  const card = json(ex);
  const version = record(card) && typeof card.protocolVersion === "string" ? card.protocolVersion : null;
  let endpoint: string | null = null;
  if (record(card) && typeof card.url === "string") { try { endpoint = target(card.url); } catch { /* A rejected endpoint is never dialled. */ } }
  const reading: A2AReading = { battery: A2A_BATTERY, protocol_version: version, observed_at: new Date(now).toISOString(), card_url: url, endpoint, mode: "card", checks: [], exchanges: [ex], counts: { pass: 0, fail: 0, not_observed: 0, not_applicable: 0 }, gaps: A2A_GAPS };
  check(reading, "card-http", ex.gap ? "not_observed" : jsonResponse(ex) ? "pass" : "fail", "The card answers with successful HTTP and an application/json content type.", ["card"], "#5-agent-discovery-the-agent-card");
  check(reading, "supported-version", ex.gap ? "not_observed" : version === A2A_PROTOCOL_VERSION ? "pass" : "not_observed", "This instrument evaluates only protocolVersion 0.3.0; other or missing versions remain unassessed.", ["card"], "#55-agentcard-object-structure");
  check(reading, "card-schema", ex.gap || version !== A2A_PROTOCOL_VERSION ? "not_observed" : validateAgentCard(card) ? "pass" : "fail", "The card satisfies the pinned official 0.3.0 AgentCard schema; format annotations are not evaluated.", ["card"], "#55-agentcard-object-structure");
  check(reading, "endpoint-url", ex.gap ? "not_observed" : endpoint ? "pass" : "fail", "The advertised endpoint is a public HTTPS URL without credentials, query, fragment or a nondefault port. This is the instrument access policy.", ["card"], "#56-transport-declaration-and-url-relationships");
  return reading;
}
export async function authorize(reading: A2AReading, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<{ authorization: Authorization; exchange: Exchange }> {
  if (reading.protocol_version !== A2A_PROTOCOL_VERSION) throw new Error("unsupported_version");
  const origin = new URL(reading.card_url).origin;
  if (!reading.endpoint || new URL(reading.endpoint).origin !== origin) throw new Error("endpoint_refused");
  const card = json(reading.exchanges[0]!);
  if (!record(card) || (card.preferredTransport !== undefined && card.preferredTransport !== "JSONRPC")) throw new Error("unsupported_transport");
  const ex = await exchange("authorization", origin + A2A_AUTH_PATH, null, fetchImpl);
  const body = json(ex);
  if (!jsonResponse(ex) || !record(body) || body.allow_scvd_audit !== true || body.allow_negative_tests !== true || body.safe_to_repeat !== true || body.endpoint !== reading.endpoint || body.card_url !== reading.card_url || typeof body.expires_at !== "string" || Date.parse(body.expires_at) <= now || !Number.isFinite(Date.parse(body.expires_at)) || Date.parse(body.expires_at) > now + A2A_RECHECK_DAYS * 86400000 || !record(body.message)) throw new Error("authorization_required");
  const message: Record<string, unknown> = { ...body.message, messageId: crypto.randomUUID() };
  // No continuation of an existing task, callback registration or credentials supplied by a buyer.
  if (new TextEncoder().encode(JSON.stringify(message)).byteLength > A2A_FIXTURE_LIMIT || message.taskId !== undefined || message.contextId !== undefined || message.role !== "user" || !validateSendMessageRequest({ jsonrpc: "2.0", id: "fixture", method: "message/send", params: { message } })) throw new Error("invalid_fixture");
  return { authorization: { endpoint: reading.endpoint, expires_at: body.expires_at, message }, exchange: ex };
}
function rpcBody(id: string, method: string, params: unknown): string { return JSON.stringify({ jsonrpc: "2.0", id, method, params }); }
function rpcResult(ex: Exchange): unknown { const body = json(ex); return record(body) ? body.result : null; }
function rpcEnvelope(ex: Exchange, id: string): boolean { const body = json(ex); return jsonResponse(ex) && record(body) && body.jsonrpc === "2.0" && body.id === id && (("result" in body) !== ("error" in body)); }
function rpcError(ex: Exchange, id: string | null, code: number): boolean {
  const body = json(ex);
  return ex.status !== null && ex.status < 500 && jsonMediaType(ex) && record(body) && body.jsonrpc === "2.0" && body.id === id && !("result" in body) && record(body.error) && body.error.code === code && typeof body.error.message === "string";
}
export async function runRuntime(reading: A2AReading, authorized: Awaited<ReturnType<typeof authorize>>, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): Promise<A2AReading> {
  reading.mode = "runtime"; reading.exchanges.push(authorized.exchange);
  const endpoint = authorized.authorization.endpoint;
  if (Date.parse(authorized.authorization.expires_at) <= now()) throw new Error("authorization_expired");
  const runtimeExchange = (id: string, request: string): Promise<Exchange> => Date.parse(authorized.authorization.expires_at) <= now()
    ? Promise.resolve({ id, url: endpoint, method: "POST", request, status: null, content_type: null, response: null, gap: "authorization_expired" })
    : exchange(id, endpoint, request, fetchImpl);
  const send = await runtimeExchange("send", rpcBody("send", "message/send", { message: authorized.authorization.message, configuration: { blocking: true, historyLength: 0 } }));
  reading.exchanges.push(send);
  const result = rpcResult(send);
  const envelope = json(send);
  const applicationError = rpcEnvelope(send, "send") && record(envelope) && record(envelope.error) && Number.isInteger(envelope.error.code) && typeof envelope.error.message === "string";
  const valid = record(result) && ((result.kind === "task" && validateTask(result)) || (result.kind === "message" && validateMessage(result)));
  check(reading, "send-schema", send.gap || applicationError ? "not_observed" : rpcEnvelope(send, "send") && valid ? "pass" : "fail", "The authorized fixture returns a valid 0.3 Task or Message in its matching JSON-RPC envelope. An application error leaves successful execution unproven.", ["send"], "#71-messagesend");
  const isTask = record(result) && result.kind === "task" && typeof result.id === "string";
  if (isTask) {
    const get = await runtimeExchange("get", rpcBody("get", "tasks/get", { id: result.id, historyLength: 0 })); reading.exchanges.push(get);
    const got = rpcResult(get);
    check(reading, "task-get", get.gap ? "not_observed" : rpcEnvelope(get, "get") && validateTask(got) && record(got) && got.id === result.id && got.contextId === result.contextId ? "pass" : "fail", "The returned task can immediately be retrieved with the same task and context IDs.", ["send", "get"], "#73-tasksget");
    const terminal = record(result.status) && ["completed", "failed", "canceled", "rejected"].includes(String(result.status.state));
    if (terminal) {
      const cancel = await runtimeExchange("cancel", rpcBody("cancel", "tasks/cancel", { id: result.id })); reading.exchanges.push(cancel);
      check(reading, "terminal-cancel", cancel.gap ? "not_observed" : rpcError(cancel, "cancel", -32002) ? "pass" : "fail", "A terminal task refuses cancellation with TaskNotCancelableError, distinct from an unknown task.", ["send", "cancel"], "#74-taskscancel");
    } else check(reading, "terminal-cancel", "not_observed", "The task did not finish during this bounded request. No active task was canceled and no terminal behavior was inferred.", ["send"], "#74-taskscancel");
  } else {
    const state = valid ? "not_applicable" : "not_observed";
    for (const id of ["task-get", "terminal-cancel"]) check(reading, id, state, "No usable Task was returned, so this lifecycle behavior was not exercised.", ["send"], "#61-task-object");
  }
  const message = authorized.authorization.message;
  const bad: [string, string, string | null, number][] = [
    ["parse-error", "{", null, -32700],
    ["null-part", rpcBody("null-part", "message/send", { message: { ...message, messageId: crypto.randomUUID(), parts: [null] } }), "null-part", -32602],
    ["trailing-part", rpcBody("trailing-part", "message/send", { message: { ...message, messageId: crypto.randomUUID(), parts: [...(message.parts as unknown[]), null] } }), "trailing-part", -32602],
    ["unknown-task", rpcBody("unknown-task", "tasks/get", { id: `scvd-absent-${crypto.randomUUID()}` }), "unknown-task", -32001],
  ];
  for (const [id, body, responseId, code] of bad) {
    if (Date.parse(authorized.authorization.expires_at) <= now()) { check(reading, id, "not_observed", "Authorization expired before this probe.", [], "#8-error-handling"); continue; }
    const ex = await exchange(id, endpoint, body, fetchImpl); reading.exchanges.push(ex);
    check(reading, id, ex.gap ? "not_observed" : rpcError(ex, responseId, code) ? "pass" : "fail", `Expected JSON-RPC error ${code}, with the matching id and no HTTP 5xx.`, [id], "#8-error-handling");
  }
  return reading;
}
