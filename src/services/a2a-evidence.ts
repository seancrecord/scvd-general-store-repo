import { checkConformance, type ConformanceRequest } from "@/services/conformance";
import { heldHalfOf } from "@/services/look";
import { PREFLIGHT_VERSION_NEXT, preflightUrl } from "@/services/preflight";
import { LATEST_PROTOCOL } from "@/routes/mcp";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import { POSITION_LINE, POSITION_NOT } from "@/store/copy/position";
import { OPERATOR } from "@/store/trust-signals";
import type { Env } from "@/types";

/**
 * THE EVIDENCE AGENT (2026-09-03, roadmap A2, the keeper's memo).
 *
 * A specialist another agent hands work to, not a storefront another
 * agent must interpret. Three read-only tasks, each run on a service
 * that already exists, each answered with one bounded artifact and
 * nothing else: what was observed, when, what "valid" or "ready"
 * means here, what the result does NOT establish, and where to
 * reproduce it. No conversation. Nothing paid. Nothing that says
 * whether to pay, which door to use, or whether a merchant can be
 * trusted — a planner asks for evidence and gets evidence.
 *
 * THE WIRE is A2A's JSON-RPC: `message/send` with one data part
 * carrying `{ task, ...input }`, answered with a Task in the
 * `completed` state whose single artifact is the bounded result. The
 * agent keeps no task state, so `tasks/get` answers that plainly
 * rather than pretending; streaming and push are declared off on the
 * card. The card at /.well-known/agent-card.json names the tasks by
 * their plain nouns — x402 endpoint preflight, x402 receipt
 * verification, x402 endpoint-readiness dataset — never house names.
 */

export const A2A_PROTOCOL_VERSION = "0.3.0";
export const A2A_AGENT_VERSION = "1.0.0";

export type EvidenceTask = "preflight_endpoint" | "verify_receipt" | "get_endpoint_readiness";
export const EVIDENCE_TASKS: readonly EvidenceTask[] = ["preflight_endpoint", "verify_receipt", "get_endpoint_readiness"];

export interface EvidenceArtifact {
  task: EvidenceTask;
  observed_at: string;
  /** The task's own vocabulary; never a score. */
  result: string;
  /** What the result means here, in one sentence, with what it was checked against. */
  scope: string;
  /** Always stated. */
  does_not_establish: string[];
  /** The free door that reproduces this check. */
  verification_url: string;
  /** A signed, dated artifact at its own URL when one exists for a free task; else null and the rung that sells one. */
  artifact_url: string | null;
  /** Where the key the check rests on is published, when a key was involved. */
  key_url: string | null;
  /** The underlying report, whole, so nothing here is a paraphrase. */
  evidence: Record<string, unknown>;
  never_a_ranking: string;
}

const DOES_NOT_ESTABLISH: Record<EvidenceTask, string[]> = {
  preflight_endpoint: [
    "whether the door delivers after payment",
    "uptime, or anything about any moment but this one",
    "whether your own client will sign what the door serves (that is the before-you-pay dry run)",
    "whether to pay",
  ],
  verify_receipt: ["merchant identity beyond the key the receipt was checked against", "payment settlement on any chain", "delivery of the purchased service"],
  get_endpoint_readiness: [
    "whether the door answers now (that is the preflight task)",
    "whether the door delivers after payment",
    "anything about a host the chain never met, beyond that it never met it",
    "whether to pay",
  ],
};

function ownDidDocumentUrl(kid: unknown): string | null {
  if (typeof kid !== "string" || !kid.startsWith("did:web:")) return null;
  const withoutMethod = kid.slice("did:web:".length).split("#")[0] ?? "";
  const segments = withoutMethod.split(":").map((segment) => decodeURIComponent(segment));
  const host = (segments[0] ?? "").replace(/%3A/gi, ":");
  const path = segments.slice(1);
  if (!host) return null;
  return path.length > 0 ? `https://${host}/${path.join("/")}/did.json` : `https://${host}/.well-known/did.json`;
}

/** The kid in a compact JWS header, read without trusting anything else in it. */
function kidOf(jws: unknown): string | null {
  if (typeof jws !== "string") return null;
  const segment = jws.split(".")[0] ?? "";
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    const header = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof header["kid"] === "string" ? header["kid"] : null;
  } catch {
    return null;
  }
}

function artifact(task: EvidenceTask, fields: Omit<EvidenceArtifact, "task" | "does_not_establish" | "never_a_ranking">): EvidenceArtifact {
  return { task, ...fields, does_not_establish: [...DOES_NOT_ESTABLISH[task]], never_a_ranking: NEVER_A_RANKING_SENTENCE };
}

export interface TaskOutcome {
  /** HTTP-ish status the underlying service answered with; 200 when the artifact is a reading, 4xx when the input was refused. */
  status: number;
  artifact: EvidenceArtifact;
}

export async function runEvidenceTask(env: Env, task: EvidenceTask, input: Record<string, unknown>, now: Date = new Date()): Promise<TaskOutcome> {
  const base = env.STORE_BASE_URL;
  const observedAt = now.toISOString();
  if (task === "preflight_endpoint") {
    const probe = await preflightUrl(input["url"], env, PREFLIGHT_VERSION_NEXT);
    const body = probe.body as Record<string, unknown>;
    const refused = probe.status !== 200 || !("verdict" in body);
    return {
      status: probe.status,
      artifact: artifact(task, {
        observed_at: observedAt,
        result: refused ? `refused: ${String(body["code"] ?? "input")}` : String(body["verdict"]),
        scope: refused
          ? `Nothing was probed: ${String(body["error"] ?? "the input was refused")}`
          : `One unpaid GET at ${observedAt} under battery ${PREFLIGHT_VERSION_NEXT}: whether the URL served a well-formed x402 v2 challenge a stock client could sign, with every check named in evidence.checks. A shape check at one moment.`,
        verification_url: `${base}/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
        artifact_url: null,
        key_url: null,
        evidence: body,
      }),
    };
  }
  if (task === "verify_receipt") {
    const request: ConformanceRequest = {
      artifact: input["receipt"] ?? input["artifact"],
      kind: input["kind"] ?? "receipt",
      ...(typeof input["public_key_hex"] === "string" ? { public_key_hex: input["public_key_hex"] } : {}),
    };
    const checked = await checkConformance(request, env, now);
    if (checked.status !== 200 || !checked.verdict) {
      return {
        status: checked.status,
        artifact: artifact(task, {
          observed_at: observedAt,
          result: "refused: input",
          scope: `Nothing was checked: ${checked.error ?? "the input was refused"}`,
          verification_url: `${base}/api/conformance/v1`,
          artifact_url: null,
          key_url: null,
          evidence: { error: checked.error ?? null },
        }),
      };
    }
    const verdict = checked.verdict as unknown as Record<string, unknown>;
    const state = String(verdict["verdict"]);
    const result = state === "conforms" ? "valid" : state === "does_not_conform" ? "invalid" : "unverified";
    const kid = kidOf(request.artifact);
    const keyResolution = String(verdict["key_resolution"] ?? "not_attempted");
    const checkedAgainst =
      keyResolution === "offline"
        ? "the key supplied with the request"
        : keyResolution === "did:web"
          ? "the issuer's key resolved from its did:web document"
          : "no key (the signature could not be checked)";
    return {
      status: 200,
      artifact: artifact(task, {
        observed_at: observedAt,
        result,
        scope:
          result === "valid"
            ? `Signature valid over the artifact's bytes against ${checkedAgainst}; the fields conform to the offer-receipt schema; every check named in evidence.checks.`
            : result === "invalid"
              ? `The artifact fails at least one named check against ${checkedAgainst}; see evidence.checks.`
              : `The check could not complete against ${checkedAgainst}; see evidence.checks and evidence.key_resolution.`,
        verification_url: `${base}/api/conformance/v1`,
        artifact_url: typeof verdict["verify_url"] === "string" ? (verdict["verify_url"] as string) : null,
        key_url: ownDidDocumentUrl(kid),
        evidence: verdict,
      }),
    };
  }
  // get_endpoint_readiness
  const raw = input["host"] ?? input["url"];
  let host = "";
  if (typeof raw === "string" && raw.trim()) {
    try {
      host = (raw.includes("://") ? new URL(raw).host : new URL(`https://${raw}`).host).toLowerCase();
    } catch {
      host = "";
    }
  }
  if (!host) {
    return {
      status: 400,
      artifact: artifact(task, {
        observed_at: observedAt,
        result: "refused: host_missing",
        scope: 'Nothing was read: send { "host": "door.example" } or a URL.',
        verification_url: `${base}/corpus/host/{host}.json`,
        artifact_url: null,
        key_url: null,
        evidence: {},
      }),
    };
  }
  const held = await heldHalfOf(env, host, now);
  const result = held.never_met
    ? "never_met"
    : held.passport.verdict
      ? `last_signed_round: ${held.passport.verdict}`
      : "met, no verdict on file";
  return {
    status: 200,
    artifact: artifact(task, {
      observed_at: observedAt,
      result,
      scope: held.never_met
        ? `The signed chain has no round that met ${host}. A fact about this store's coverage, not about the door.`
        : `Read from the signed chain, not a live probe: ${held.rounds_probed} rounds probed of ${held.rounds_since_first_sighting} since first sighting (${held.first_observed ?? "unknown"}), last observed ${held.last_observed ?? "unknown"}; the tier with its fraction and the last probed round's failed checks are in evidence.`,
      verification_url: held.rows_url,
      artifact_url: held.passport.url,
      key_url: `${base}/.well-known/scvd-signing-key`,
      evidence: held as unknown as Record<string, unknown>,
    }),
  };
}

// ---------- the card ----------

export function evidenceAgentCard(base: string): Record<string, unknown> {
  const skill = (id: EvidenceTask, name: string, description: string, tags: string[], example: Record<string, unknown>) => ({
    id,
    name,
    description,
    tags,
    examples: [JSON.stringify({ task: id, ...example })],
    inputModes: ["application/json"],
    outputModes: ["application/json"],
  });
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: "SCVD Evidence Agent",
    description: `${POSITION_LINE} This agent is the observatory's delegated face: it independently checks x402 endpoints, signed offers and receipts, and signed readiness history, and returns dated, bounded, machine-verifiable evidence. Three read-only tasks, free, no account, no conversation. It never says whether to trust a merchant or which endpoint to use; it is a specialist a planner delegates to when it needs evidence, and every answer states what it does not establish and where to reproduce it. ${POSITION_NOT}`,
    url: `${base}/a2a`,
    /**
     * BOTH DIALECTS ON ONE CARD (scanner finding C5, 2026-08-27,
     * kept through the A2 rewrite). The 0.3 fields — preferredTransport
     * and additionalInterfaces — stay for older readers; v1.0's
     * supportedInterfaces rides beside them, first entry preferred.
     *
     * Until 2026-09-03 the card led with "MCP" because the store did
     * not speak the A2A message protocol and a canonical binding would
     * have been a false claim in machine form. It speaks it now:
     * message/send at /a2a is answered, so "JSONRPC" is the truth, and
     * it is the only canonical binding claimed — GRPC and HTTP+JSON are
     * not served and are not named. The other doors are named by their
     * protocols' URIs (§5.8), each with that protocol's own version.
     */
    preferredTransport: "JSONRPC",
    additionalInterfaces: [
      { url: `${base}/a2a`, transport: "JSONRPC" },
      { url: `${base}/mcp`, transport: "MCP" },
      { url: `${base}/llms.txt`, transport: "HTTP+x402" },
    ],
    supportedInterfaces: [
      { url: `${base}/a2a`, protocolBinding: "JSONRPC", protocolVersion: A2A_PROTOCOL_VERSION },
      { url: `${base}/mcp`, protocolBinding: "https://modelcontextprotocol.io", protocolVersion: LATEST_PROTOCOL },
      { url: `${base}/llms.txt`, protocolBinding: "https://www.x402.org", protocolVersion: "2" },
    ],
    provider: { organization: OPERATOR.legal_entity, url: base },
    version: A2A_AGENT_VERSION,
    documentationUrl: `${base}/a2a`,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false, extendedAgentCard: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      skill(
        "preflight_endpoint",
        "x402 endpoint preflight",
        "Preflight an x402 endpoint: one unpaid probe answering whether the URL serves a well-formed x402 v2 challenge a stock client could sign, with every check named and defined defects by name. A shape check at one moment; never an uptime or delivery claim.",
        ["x402", "preflight", "endpoint", "free"],
        { url: "https://example.com/api/paid-answer" },
      ),
      skill(
        "verify_receipt",
        "x402 receipt verification",
        "Verify an x402 signed offer or receipt: structure, signature against the issuer's key (supplied or resolved from its did:web), liveness; a verdict with every check named. Establishes the bytes and the key, never settlement or delivery.",
        ["x402", "receipt", "offer", "signature", "ed25519", "free"],
        { receipt: "eyJ…", public_key_hex: "…optional…" },
      ),
      skill(
        "get_endpoint_readiness",
        "x402 endpoint-readiness dataset",
        "Read what the signed weekly corpus holds about one host: rounds probed of rounds since first sighting, the last signed verdict, the tier with its fraction, the gaps counted against the observer. From the chain, not a live probe; a host never met comes back as never met.",
        ["x402", "readiness", "corpus", "history", "free"],
        { host: "example.com" },
      ),
    ],
    supportsAuthenticatedExtendedCard: false,
    security: [],
    securitySchemes: {},
    x_scvd_note: `Read-only and free. The paid instruments (signed audits, watches, settlement attestations) are x402 doors listed at ${base}/menu.json and are not A2A tasks. ${NEVER_A_RANKING_SENTENCE}`,
  };
}

// ---------- the wire ----------

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function dataPartOf(message: unknown): Record<string, unknown> | null {
  const parts = (message as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const p = part as Record<string, unknown>;
    if ((p["kind"] === "data" || p["type"] === "data") && p["data"] && typeof p["data"] === "object") return p["data"] as Record<string, unknown>;
  }
  for (const part of parts) {
    const p = part as Record<string, unknown>;
    if ((p["kind"] === "text" || p["type"] === "text") && typeof p["text"] === "string") {
      try {
        const parsed = JSON.parse(p["text"]);
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      } catch {
        // A text part that is not JSON is not a task for this agent.
      }
    }
  }
  return null;
}

function taskId(): string {
  return `task_${crypto.randomUUID()}`;
}

/** One JSON-RPC request in, one response out. Never throws on input; the errors are JSON-RPC's. */
export async function handleA2aRequest(env: Env, body: unknown, now: Date = new Date()): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = env.STORE_BASE_URL;
  const request = (typeof body === "object" && body !== null ? body : {}) as JsonRpcRequest;
  const id = request.id ?? null;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return { status: 400, body: rpcError(id, -32600, 'Invalid request: send JSON-RPC 2.0 with a method; this agent answers "message/send".') };
  }
  if (request.method === "tasks/get" || request.method === "tasks/cancel" || request.method === "tasks/resubscribe") {
    return {
      status: 200,
      body: rpcError(id, -32001, "Task not found: this agent keeps no task state. Every message/send completes in the same response, and the artifact it returns is the whole record."),
    };
  }
  if (request.method !== "message/send") {
    return { status: 200, body: rpcError(id, -32601, `Method not found: ${request.method}. This agent answers message/send; streaming and push are off on its card at ${base}/.well-known/agent-card.json.`) };
  }
  const params = (typeof request.params === "object" && request.params !== null ? request.params : {}) as Record<string, unknown>;
  const data = dataPartOf(params["message"]);
  if (!data) {
    return {
      status: 200,
      body: rpcError(id, -32602, 'Invalid params: message.parts must carry one data part { "task": "…", …input } (or a text part holding that JSON).', { tasks: EVIDENCE_TASKS }),
    };
  }
  const task = data["task"];
  if (typeof task !== "string" || !(EVIDENCE_TASKS as readonly string[]).includes(task)) {
    return { status: 200, body: rpcError(id, -32602, `Unknown task ${JSON.stringify(task)}.`, { tasks: EVIDENCE_TASKS }) };
  }
  const outcome = await runEvidenceTask(env, task as EvidenceTask, data, now);
  const contextId = typeof params["contextId"] === "string" ? (params["contextId"] as string) : (typeof (params["message"] as Record<string, unknown> | undefined)?.["contextId"] === "string" ? String((params["message"] as Record<string, unknown>)["contextId"]) : undefined);
  const stamp = now.toISOString();
  const taskRecord = {
    id: taskId(),
    ...(contextId ? { contextId } : {}),
    status: { state: outcome.status === 200 ? "completed" : "failed", timestamp: stamp },
    artifacts: [
      {
        artifactId: `artifact_${crypto.randomUUID()}`,
        name: outcome.artifact.task,
        parts: [{ kind: "data", data: outcome.artifact }],
      },
    ],
    history: [],
    kind: "task",
  };
  return { status: 200, body: { jsonrpc: "2.0", id, result: taskRecord } };
}

/** The door's own document, rule 57's shape for a JSON-RPC door. */
export function a2aDoc(base: string): Record<string, unknown> {
  return {
    title: "The evidence agent — an A2A specialist another agent hands work to",
    version: A2A_AGENT_VERSION,
    card: `${base}/.well-known/agent-card.json`,
    summary:
      "POST JSON-RPC 2.0 here: method message/send, one data part carrying { task, ...input }. Three read-only tasks, each answered with one bounded artifact: what was observed, when, what the result means and against what, what it does not establish, and where to reproduce it. Free, no account, no conversation, nothing paid.",
    tasks: {
      preflight_endpoint: { input: { url: "REQUIRED. The https x402 door a buyer would GET." }, reproduces: `${base}/api/preflight/${PREFLIGHT_VERSION_NEXT}` },
      verify_receipt: { input: { receipt: "REQUIRED. The compact JWS.", public_key_hex: "OPTIONAL. Check offline against this key; else the issuer's did:web is resolved.", kind: 'OPTIONAL. "receipt" (default) or "offer".' }, reproduces: `${base}/api/conformance/v1` },
      get_endpoint_readiness: { input: { host: "REQUIRED. A hostname, or a URL whose host is read." }, reproduces: `${base}/corpus/host/{host}.json` },
    },
    example: {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: { message: { role: "user", messageId: "m-1", parts: [{ kind: "data", data: { task: "preflight_endpoint", url: "https://example.com/api/paid-answer" } }] } },
    },
    what_it_cannot_tell_you: [
      "Whether to pay, or which door to use. The reader draws that line; this agent does not.",
      "Whether a merchant can be trusted. It returns evidence about bytes, a probe and a chain, never a judgment about a person or a company.",
      "Anything a free read cannot: settlement and delivery are paid instruments on the shelf, sold as x402 doors, not as tasks here.",
    ],
    state: "This agent keeps no task state: tasks/get answers 'not found' by design, and the artifact returned by message/send is the whole record.",
    never_a_ranking: NEVER_A_RANKING_SENTENCE,
  };
}
