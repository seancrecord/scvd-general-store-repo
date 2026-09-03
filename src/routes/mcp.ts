import { mcpResourceCatalog, readMcpResource } from "@/lib/mcp-resources";
import { ASKED_FOR_SENTENCE } from "@/store/copy/asked-for";
import {
  MCP_APPS_EXTENSION,
  UI_MIME,
  readUiResource,
  uiMetaFor,
  uiResourceCatalog,
} from "@/lib/mcp-apps";
import { Hono } from "hono";
import type { Context } from "hono";
import { runMcpPayment } from "@/lib/mcp-payment";
import { SettlementDeclined } from "@/lib/payments";
import { closeDeliveryIntent } from "@/services/delivery-audit";
import { recordDeliveredSettlement } from "@/services/chain-reconciliation";
import {
  ALSO_A_STORE,
  DELIVERY_ORDER,
  POSITION_NOT,
  POSITION_OPENING,
} from "@/store/copy/position";
import { findMcpTool, mcpToolCatalog } from "@/lib/mcp-tools";
import { deferBookkeeping } from "@/lib/defer-bookkeeping";
import type { EventSignals } from "@/lib/metrics";
import { recordPorchVisit, recordVerifyCall } from "@/lib/metrics";
import { factBlockText } from "@/lib/listing-spec";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { getAnchor, verifyAnchorSignature } from "@/services/anchors";
import { ringBell } from "@/services/bell";
import { getCertificate } from "@/services/certificates";
import {
  COFFEE_WIN_CAP,
  GRIEVANCE_CAP,
  fulfillPurchase,
  stockedShelfCount,
} from "@/services/fulfillment";
import { signGuestbook } from "@/services/guestbook";
import {
  idempotencyScope,
  lookupIdempotentWithBucketGrace,
  replayNote,
  SUGGESTED_KEY_BUCKET_SECONDS,
  suggestedIdempotencyKey,
  storeIdempotent,
  usableIdempotencyKey,
} from "@/lib/idempotency";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { preflightUrl } from "@/services/preflight";
import { beforeYouPay, readProfile } from "@/services/before-you-pay";
import { lookAtDoor } from "@/services/look";
import { checkConformance } from "@/services/conformance";
import { getStamp, verifyStampSignature } from "@/services/stamps";
import { TAG_CAP, tagHasUrl } from "@/services/train";
import { cachedPublicKeyHex, verifyCertificateSignature } from "@/lib/signing";
import { getMenuItem, STORE_SERVICE_NAME } from "@/store";
import { HAND_ROLLING } from "@/store/hand-rolling";
import { IDENTITY_POLICY, SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { storeGuideText } from "@/routes/llms";
import { isRecord, type HonoEnv, type MenuItem } from "@/types";

/**
 * The MCP door: the store as a Model Context Protocol server.
 * Streamable HTTP transport, stateless — every POST /mcp gets one
 * application/json response, which the spec permits in place of an
 * SSE stream; there are no server-initiated messages here and no
 * session ids. A GET that asks for text/event-stream gets a real,
 * bounded, empty stream (2026-09-02: OpenAI's plugin scanner opens
 * one before it will list tools, and read the spec-permitted 405 as
 * "no server"); a bare GET still gets the 405 that says where the
 * door is. Speaks revision 2026-07-28 (per-request `_meta`,
 * `server/discover`) and the three handshake-era revisions before
 * it, on one endpoint; see PROTOCOL_VERSIONS. initialize,
 * server/discover and tools/list are free and unauthenticated. tools/call on a buy_* tool
 * runs the exact same x402 pipeline as the HTTP shelf (lib/mcp-payment)
 * and the same fulfillment (services/fulfillment); payment-required
 * comes back as JSON-RPC error 402 with the challenge in error.data.
 */

/**
 * EXPORTED SINCE 2026-08-26 so /.well-known/mcp can print the exact
 * versions this server negotiates rather than a second list beside
 * them. A manifest that advertises a protocol version the server
 * refuses is worse than a manifest with no versions in it.
 */
export const PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
];
/**
 * TWO ERAS ON ONE DOOR (2026-09-02). Revision 2026-07-28 retired the
 * initialize handshake: a modern client carries its protocol version,
 * identity and capabilities in `_meta` on every request, and learns a
 * server's shape from `server/discover`. Everything before it opens
 * with `initialize`. The spec's own name for a server that answers
 * both is "dual-era", and that is what this door is: a request that
 * carries modern `_meta` is served statelessly under 2026-07-28; an
 * `initialize` selects the legacy revision it names. Nothing about
 * this door ever needed a session, so the stateless revision is the
 * one it was always shaped for.
 */
export const LATEST_PROTOCOL = "2026-07-28";
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"];
/**
 * What a legacy `initialize` negotiates to when it asks for a version
 * this server does not speak: the newest handshake-era revision, per
 * that era's own rule ("SHOULD be the latest version supported").
 */
export const DEFAULT_PROTOCOL = "2025-11-25";
/** The `_meta` keys the modern revision reserves; spelled once. */
const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";
/** Spec-reserved error codes, 2026-07-28 §Error Codes. */
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;
/**
 * How long a modern client may cache a list result before asking
 * again. Five minutes: the catalog changes on deploy, never between
 * requests, and a deploy is rarer than that.
 */
const LIST_TTL_MS = 300_000;
/**
 * THE ONE VERSION, EXPORTED (scanner finding C2, 2026-08-27). It was
 * an inline literal in serverInfo while the server card shipped no
 * version at all — and the SEP-2127 card shape requires one. The
 * scvd-tab package once carried a handshake saying 0.2.0 while the
 * package said 0.3.0; a version that exists in two places is a drift
 * waiting for a quiet week, so the card imports THIS constant and a
 * test compares the two live documents to each other, never to a
 * literal.
 */
export const MCP_SERVER_VERSION = "0.5.0";

/**
 * WHY FIVE GROUPED buy_* TOOLS RATHER THAN ONE PER ITEM — the answer
 * is in src/lib/mcp-tools.ts, at SHELF_CLUSTERS, and this pointer
 * exists because somebody went looking for it HERE and did not find
 * it.
 *
 * The short version: this catalog used to emit 27 tools, Glama's
 * published rubric puts 25+ in its lowest band for tool-count
 * appropriateness, and collapsing to a single buy_item would have
 * traded that for a worse problem — 23 distinct descriptions are 23
 * chances to semantically match an agent's request and one generic
 * tool is one. So the split is by what an agent is trying to
 * ACCOMPLISH. Per-item validation survives as an if/then branch per
 * item that needs a field.
 *
 * Added 2026-08-02 after a cold-agent pass flagged the grouping as
 * unexplained. It was explained, one file over — which is the same
 * shape as the naming law enumerating only half its surfaces. A
 * rationale nobody can find from the place they are standing is a
 * rationale that gets rediscovered as a question.
 */
export const mcpRoutes = new Hono<HonoEnv>();

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: number | string | null, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

/**
 * A REFUSAL THAT COST NOTHING, SAID IN A FIELD (rule 57.4,
 * 2026-08-30).
 *
 * Every pre-payment refusal on this door used to answer with the fact
 * in English only — "No charge.", "No item, no charge.", "Nothing was
 * charged." — and `error.data` null. The same defect the buy doors
 * carried until the sweep's second stop, and sharper here, because
 * -32602 was doing four different jobs at once: a caller could not
 * tell a wrong shelf from a malformed input without parsing prose.
 *
 * Additive, exactly as it was there: the JSON-RPC code and the
 * message are byte-for-byte what they were, and the string code and
 * `charged` ride in data where a client can branch on them.
 */
function rpcRefusal(
  id: number | string | null,
  jsonrpc: number,
  code: string,
  message: string,
): Response {
  return rpcError(id, jsonrpc, message, { code, charged: false });
}

function rpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
  status = 200,
): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    },
    { status },
  );
}

/** Attribution for MCP traffic: the channel is definitive here. */
/**
 * Which era a request belongs to, decided the way the spec says a
 * dual-era server decides: by how the client opens. Modern `_meta`
 * (or the MCP-Protocol-Version header naming a modern revision) is
 * the modern era; anything else is a legacy client and is served
 * exactly as before this door learned the new revision.
 *
 * Returns a Response only for the two refusals the modern transport
 * defines as protocol-level: a header that disagrees with the body
 * (-32020, 400) and a version this server does not speak (-32022,
 * 400, naming what it does). Both are HTTP 400 on purpose — that is
 * the status a dual-era CLIENT inspects to tell "modern server,
 * retry" from "legacy server, fall back to initialize".
 */
function requestEra(
  c: Context<HonoEnv>,
  request: JsonRpcRequest,
): { modern: boolean; version: string } | Response {
  const id = request.id ?? null;
  const params = isRecord(request.params) ? request.params : {};
  const meta = isRecord(params["_meta"]) ? params["_meta"] : {};
  const metaVersion =
    typeof meta[META_PROTOCOL_VERSION] === "string"
      ? meta[META_PROTOCOL_VERSION]
      : undefined;
  const headerVersion = c.req.header("MCP-Protocol-Version");

  const unsupported = (requested: string): Response =>
    rpcError(
      id,
      UNSUPPORTED_PROTOCOL_VERSION,
      `Unsupported protocol version: ${requested}. This door speaks ${PROTOCOL_VERSIONS.join(", ")}.`,
      { supported: [...PROTOCOL_VERSIONS], requested },
      400,
    );
  const mismatch = (message: string): Response =>
    rpcError(id, HEADER_MISMATCH, `Header mismatch: ${message}`, undefined, 400);

  if (metaVersion === undefined) {
    if (headerVersion === undefined) {
      // No header, no _meta: a client from before 2025-06-18, or a
      // legacy client that has not initialized yet. Served as before.
      return { modern: false, version: DEFAULT_PROTOCOL };
    }
    if (!PROTOCOL_VERSIONS.includes(headerVersion)) {
      return unsupported(headerVersion);
    }
    if (MODERN_PROTOCOL_VERSIONS.includes(headerVersion)) {
      // The header promises the modern revision and the body carries
      // none of it. The spec's own words: the header value MUST match
      // the _meta field, and a required field that is absent is a
      // mismatch.
      return mismatch(
        `MCP-Protocol-Version is ${headerVersion} but params._meta carries no ${META_PROTOCOL_VERSION}`,
      );
    }
    return { modern: false, version: headerVersion };
  }

  if (headerVersion !== undefined && headerVersion !== metaVersion) {
    return mismatch(
      `MCP-Protocol-Version header '${headerVersion}' does not match body value '${metaVersion}'`,
    );
  }
  if (!MODERN_PROTOCOL_VERSIONS.includes(metaVersion)) {
    return unsupported(metaVersion);
  }
  /**
   * THE MIRRORED HEADERS (SEP-2243). A modern POST carries its method
   * and, for the three name-bearing calls, its target in headers so
   * a gateway can route without reading the body. The body is what
   * this server executes, so the two MUST agree — a load balancer
   * routing on one value while the server acts on another is the
   * exact hole the rule closes.
   */
  const methodHeader = c.req.header("Mcp-Method");
  if (methodHeader === undefined) {
    return mismatch("Mcp-Method header is required on every request");
  }
  if (methodHeader !== request.method) {
    return mismatch(
      `Mcp-Method header value '${methodHeader}' does not match body method '${request.method}'`,
    );
  }
  const named =
    request.method === "tools/call" || request.method === "prompts/get"
      ? params["name"]
      : request.method === "resources/read"
        ? params["uri"]
        : undefined;
  if (typeof named === "string") {
    const nameHeader = c.req.header("Mcp-Name");
    if (nameHeader === undefined) {
      return mismatch(`Mcp-Name header is required for ${request.method}`);
    }
    if (decodeHeaderValue(nameHeader) !== named) {
      return mismatch(
        `Mcp-Name header value '${nameHeader}' does not match body value '${named}'`,
      );
    }
  }
  return { modern: true, version: metaVersion };
}

/**
 * The transport's Base64 sentinel: a value that cannot ride a header
 * as plain ASCII arrives as `=?base64?...?=`, and the server MUST
 * decode before comparing. Anything else is the value itself.
 */
function decodeHeaderValue(value: string): string {
  if (value.startsWith("=?base64?") && value.endsWith("?=")) {
    try {
      const encoded = value.slice("=?base64?".length, -"?=".length);
      return new TextDecoder().decode(
        Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0)),
      );
    } catch {
      return value;
    }
  }
  return value;
}

function serverInfo(base: string): Record<string, unknown> {
  return {
    // THE NAMING LAW: tier 1 identifier, tier 2 display title. They
    // sit together on purpose — the identifier is what a client keys
    // on, the title is what it shows a human.
    name: "scvd-general-store",
    title: STORE_SERVICE_NAME,
    version: MCP_SERVER_VERSION,
    // 2025-11-25 added these two to Implementation, to line up with
    // the registry's server.json. Same sentence the registry carries.
    websiteUrl: base,
  };
}

/**
 * DECLARED AND, SINCE 2026-08-21, ACTUALLY STOCKED.
 *
 * Declared-and-empty was the 2026-08-11 posture, adopted so
 * Smithery's scanner got an honest "nothing here" instead of a
 * spec-correct -32601 it counted as a failure. The reasoning held
 * that tools were the whole catalog. A readiness audit found the
 * flaw in the premise: this store publishes five machine-readable
 * context surfaces free and forever, and every one of them is a
 * resource in the exact sense the protocol means. See
 * lib/mcp-resources.ts.
 *
 * Prompts stay empty and declared, for the original reason.
 *
 * MCP Apps (SEP-1865). Two free evidence tools point at ui:// cards;
 * a host that also declares this extension prefetches the template
 * and renders the reading for the human behind the agent. Hosts that
 * don't declare it get the same JSON they always got — the cards are
 * additive by construction, and nothing paid carries one (tested).
 */
function serverCapabilities(): Record<string, unknown> {
  return {
    tools: { listChanged: false },
    resources: { subscribe: false, listChanged: false },
    prompts: { listChanged: false },
    extensions: {
      [MCP_APPS_EXTENSION]: { mimeTypes: [UI_MIME] },
    },
  };
}

// POSITION_OPENING since 2026-08-10: the handshake is the one
// sentence an MCP client caches about us, so it carries the entity
// and both differentiators, then the operating facts. Served on
// `initialize` (legacy) and `server/discover` (modern) alike.
const INSTRUCTIONS = `${POSITION_OPENING} ${POSITION_NOT} ${ALSO_A_STORE} tools/list is free. buy_* tools are x402-paid: call once to get the 402 terms in error.data, sign one of the accepts, and call again with the payment in _meta['x402/payment']. ${DELIVERY_ORDER} The free preflight (preflight_endpoint here, or POST /api/preflight/v1) checks any x402 door's shape; the free conformance desk (check_conformance here, or POST /api/conformance/v1) checks any issuer's signed offers and receipts; the corpus at /corpus.json is the weekly signed record. ${ASKED_FOR_SENTENCE} Nothing from this store can act without your decision, and the store never asks for credentials, keys, or wallet secrets.`;

/** Methods whose results the modern revision marks cacheable. */
const CACHEABLE_METHODS = new Set([
  "server/discover",
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "resources/read",
  "prompts/list",
]);

/**
 * THE MODERN ENVELOPE, ADDED AT ONE CHOKE POINT. Every 2026-07-28
 * result carries `resultType` ("complete" — this door never asks for
 * more input mid-request) and the server's identity in `_meta`; the
 * list and read results carry a cache hint beside it; and two error
 * codes changed under the same revision — method-not-found becomes an
 * HTTP 404 (so a modern client can tell it from a legacy server that
 * does not host the endpoint at all) and resource-not-found moved
 * from -32002 to -32602. The handlers above are shared with the
 * legacy era and know nothing of this; the era is applied to their
 * answer, never threaded through them, so the two eras cannot drift
 * into two catalogs.
 */
async function modernize(
  response: Response,
  method: string,
  base: string,
): Promise<Response> {
  if (
    response.status === 202 ||
    !(response.headers.get("content-type") ?? "").includes("application/json")
  ) {
    return response;
  }
  const body = (await response.json()) as Record<string, unknown>;
  let status = response.status;
  if (isRecord(body["result"])) {
    const result = body["result"];
    const meta = isRecord(result["_meta"]) ? result["_meta"] : {};
    body["result"] = {
      ...result,
      resultType: result["resultType"] ?? "complete",
      ...(CACHEABLE_METHODS.has(method)
        ? { ttlMs: LIST_TTL_MS, cacheScope: "public" }
        : {}),
      _meta: { ...meta, [META_SERVER_INFO]: serverInfo(base) },
    };
  } else if (isRecord(body["error"])) {
    const error = body["error"];
    if (error["code"] === -32601) status = 404;
    if (error["code"] === -32002) body["error"] = { ...error, code: -32602 };
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: response.headers,
  });
}

function mcpSignals(c: Context<HonoEnv>): EventSignals {
  const signals: EventSignals = { viaMcp: true };
  const userAgent = c.req.header("User-Agent");
  if (userAgent) {
    signals.userAgent = userAgent;
  }
  const referrer = c.req.header("Referer");
  if (referrer) {
    signals.referrer = referrer;
  }
  const houseHeader = c.req.header("X-House");
  if (houseHeader) {
    signals.houseHeader = houseHeader;
  }
  return signals;
}

function toolText(payload: Record<string, unknown>): unknown {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** Flatten the purchase response so the output schema stays flat. */
function flattenPurchase(
  response: Record<string, unknown>,
): Record<string, unknown> {
  const { certificate, ...rest } = response;
  const flat: Record<string, unknown> = { ...rest };
  if (isRecord(certificate)) {
    flat["cert_id"] = certificate["cert_id"];
  }
  return flat;
}

async function callFreeTool(
  c: Context<HonoEnv>,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | string> {
  if (name === "read_store_guide") {
    return { guide: storeGuideText(c.env.STORE_BASE_URL) };
  }
  if (name === "ring_bell") {
    const who =
      sanitizeText(args["agent_name"], 80) ||
      c.req.header("CF-Connecting-IP") ||
      "a-mysterious-stranger";
    const rung = await ringBell(c.env, who);
    // Same porch row an HTTP ring writes; this door used to ring silently.
    deferBookkeeping(c, recordPorchVisit(c.env, "bell", mcpSignals(c)));
    return { message: rung.message, count: rung.count };
  }
  if (name === "sign_guestbook") {
    const verifiedIdentity =
      sanitizeText(args["verified_identity"], 300) || undefined;
    const publicKeyHex =
      typeof args["identity_public_key"] === "string"
        ? args["identity_public_key"].trim()
        : "";
    const signatureHex =
      typeof args["identity_signature"] === "string"
        ? args["identity_signature"].trim()
        : "";
    const outcome = await signGuestbook(
      c.env,
      args["name"],
      args["message"],
      verifiedIdentity,
      publicKeyHex || signatureHex ? { publicKeyHex, signatureHex } : undefined,
    );
    if (!outcome.ok) {
      return outcome.reason === "identity_signature_invalid"
        ? 'The identity signature does not verify, so nothing was written. Sign the UTF-8 string "scvd-guestbook-v1\\n{name}\\n{message}" with ed25519 (values as stored: trimmed, 80/500 caps), hex-encode both fields, or leave both off.'
        : "A signature needs a name and a message (500 characters, tops).";
    }
    deferBookkeeping(
      c,
      recordPorchVisit(c.env, "guestbook:write", mcpSignals(c)),
    );
    return {
      message: "Noted and appreciated. Take a sticker on your way out.",
      entry_id: outcome.result.entry.id,
      sticker_url: `${c.env.STORE_BASE_URL}/badges/sticker.svg`,
      ...(outcome.result.entry.identity_verified
        ? {
            identity_verified: true,
            identity_verified_means:
              "This content was signed by your key; the same key on other entries is the same signer. Not a real-world identity check.",
          }
        : {}),
    };
  }
  if (name === "preflight_endpoint") {
    /*
     * The same preflightUrl() the HTTP route serves, limiter and all —
     * a caller cannot use this door to walk around the rate limit,
     * and the two doors cannot disagree about what a probe saw. A
     * non-200 comes back as the service's own refusal text, unpaid
     * and uncharged in every sense: this tool is free.
     */
    const outcome = await preflightUrl(args["url"], c.env);
    if (outcome.status !== 200) {
      const body = outcome.body as { error?: string };
      return body.error ?? "The preflight could not run. Try again shortly.";
    }
    deferBookkeeping(
      c,
      recordPorchVisit(c.env, "preflight:mcp", mcpSignals(c)),
    );
    return outcome.body as unknown as Record<string, unknown>;
  }
  if (name === "look_at_door") {
    /*
     * The same lookAtDoor() the HTTP door serves, which is the same
     * preflightUrl() every preflight door serves plus a read of our
     * own chain: one probe, one limiter, one law. A non-200 is the
     * preflight's own refusal text, free and uncharged.
     */
    const outcome = await lookAtDoor(args["url"], c.env);
    if (outcome.status !== 200) {
      const body = outcome.body as { error?: string };
      return body.error ?? "The look could not run. Try again shortly.";
    }
    deferBookkeeping(
      c,
      recordPorchVisit(c.env, "look:mcp", mcpSignals(c)),
    );
    return outcome.body as unknown as Record<string, unknown>;
  }
  if (name === "check_before_you_pay") {
    /*
     * The buyer-side reading, over MCP because MCP is where the buyer
     * is. An agent about to spend money is inside a tool loop, not
     * reading a docs page — and the whole finding this tool exists
     * for is that the refusal happens on that agent's own machine,
     * silently, with nothing to search for.
     *
     * It calls the same beforeYouPay() the HTTP door serves, which
     * calls the same preflightUrl() both preflight doors serve: one
     * probe, one limiter, one law. Three doors, one observation.
     */
    const outcome = await beforeYouPay(
      args["url"],
      c.env,
      readProfile(args["client_profile"]),
    );
    if (outcome.status !== 200) {
      const body = outcome.body as { error?: string };
      return body.error ?? "The dry run could not complete. Try again shortly.";
    }
    deferBookkeeping(
      c,
      recordPorchVisit(c.env, "before-you-pay:mcp", mcpSignals(c)),
    );
    return outcome.body as unknown as Record<string, unknown>;
  }
  if (name === "check_conformance") {
    const outcome = await checkConformance(
      {
        artifact: args["artifact"],
        kind: typeof args["kind"] === "string" ? args["kind"] : undefined,
        public_key_hex:
          typeof args["public_key_hex"] === "string"
            ? args["public_key_hex"]
            : undefined,
      } as Parameters<typeof checkConformance>[0],
      c.env,
    );
    if (!outcome.verdict) {
      return outcome.error ?? "The conformance desk could not read that.";
    }
    deferBookkeeping(
      c,
      recordPorchVisit(c.env, "conformance:mcp", mcpSignals(c)),
    );
    return outcome.verdict as unknown as Record<string, unknown>;
  }
  if (name === "verify_artifact") {
    const id = sanitizeText(args["id"], 60);
    if (!id) {
      return "Verification needs an id, cert_, stamp_, or anchor_.";
    }
    const cert = await getCertificate(c.env, id);
    if (cert) {
      await recordVerifyCall(c.env, cert.certificate.item, mcpSignals(c));
      const valid = await verifyCertificateSignature(
        cert.certificate,
        cert.signature,
        cert.public_key,
      );
      return {
        valid,
        kind: "certificate",
        note: valid
          ? "Genuine article. Signed by the store itself."
          : "Signature doesn't match. That's not one of ours.",
      };
    }
    const stamp = await getStamp(c.env, id);
    if (stamp) {
      await recordVerifyCall(
        c.env,
        `stamp:${stamp.stamp.variant}`,
        mcpSignals(c),
      );
      const valid = await verifyStampSignature(stamp);
      return {
        valid,
        kind: "stamp",
        note: valid
          ? "Genuine stamp. Inked and signed by the store itself."
          : "Signature doesn't match. That's not one of our stamps.",
      };
    }
    const anchor = await getAnchor(c.env, id);
    if (anchor) {
      await recordVerifyCall(c.env, "context_anchor", mcpSignals(c));
      const valid = await verifyAnchorSignature(anchor);
      return {
        valid,
        kind: "anchor",
        note: valid
          ? "Genuine anchor. Signed by the store when it says it was."
          : "Signature doesn't match. Treat this anchor as compromised.",
      };
    }
    return {
      valid: false,
      kind: "unknown",
      note: "No artifact by that name on the wall. Check the spelling on your receipt.",
    };
  }
  return `No tool by that name on the shelf: ${name}`;
}

/** Pre-payment validation, mirroring the HTTP door: no target, no charge. */
function validatePurchaseArgs(
  item: MenuItem,
  args: Record<string, unknown>,
): string | undefined {
  if (item.id === "context_anchor") {
    const summary = typeof args["summary"] === "string" ? args["summary"] : "";
    if (summary.trim().length === 0) {
      return "An anchor needs a summary, the state you want remembered. No summary, no charge.";
    }
    if (summary.length > 4000) {
      return "That summary runs past the ledger margin. 4000 characters, tops.";
    }
  }
  if (item.id === "standing_watch") {
    // Mirrors the HTTP door's standingWatchCheck: no target, no charge.
    const url = typeof args["url"] === "string" ? args["url"] : "";
    if (!isValidHttpUrl(url)) {
      return "A standing watch needs a url — YOUR x402 endpoint, https. No target, no charge.";
    }
  }
  if (item.id === "the_confession") {
    const confession =
      typeof args["confession"] === "string" ? args["confession"] : "";
    if (confession.trim().length === 0) {
      return "A confession needs the confession itself. Nothing to hear, no charge.";
    }
    if (confession.length > 500) {
      return "The counter hears up to 500 characters. Longer burdens go in the Mailbox, free.";
    }
  }
  if (item.id === "coffees_for_closers") {
    const win = typeof args["win"] === "string" ? args["win"] : "";
    if (win.trim().length === 0) {
      return "This coffee needs a win, the thing you closed. No win, no charge.";
    }
    if (win.length > COFFEE_WIN_CAP) {
      return `The certificate holds ${COFFEE_WIN_CAP} characters of win. Trim it to the good part.`;
    }
  }
  if (item.id === "graffiti_on_a_train") {
    // Same three refusals as the HTTP door's tagCheck, same order,
    // all before money moves.
    const tag = typeof args["tag"] === "string" ? args["tag"] : "";
    if (tag.trim().length === 0) {
      return "Nothing to spray. Put your mark in the tag input, up to 140 characters. No tag, no charge.";
    }
    if (tag.length > TAG_CAP) {
      return `The side of a train holds ${TAG_CAP} characters. Anything longer is a letter, and the mailbox is free at /api/letter.`;
    }
    if (tagHasUrl(tag)) {
      return "No URLs on the train. A tag is a mark, not a billboard — the wall is public and permanent, which is exactly what link spam wants. Say it without the link.";
    }
  }
  return undefined;
}

/**
 * DELETED 2026-08-02: payerFromPaymentMeta, which read the payer out
 * of the caller's unverified `_meta`. Its only remaining caller was
 * the idempotency replay lookup, and that now happens inside the
 * payment pipeline against the facilitator-verified payload
 * (payerOfVerifiedPayload in lib/replay-guard). The function is gone
 * rather than left unused, because an unverified payer reader sitting
 * in the file is an invitation to the exact bug just fixed — the next
 * person needing "the payer" would find it and it would look right.
 */

async function callPurchaseTool(
  c: Context<HonoEnv>,
  item: MenuItem,
  args: Record<string, unknown>,
  paymentMeta: unknown,
  id: number | string | null,
  rawIdempotencyKey?: string,
): Promise<Response> {
  const invalid = validatePurchaseArgs(item, args);
  if (invalid) {
    return rpcRefusal(id, -32602, "bad_request", invalid);
  }
  /**
   * Idempotency replay, same mechanism as the HTTP door (see
   * lib/idempotency.ts): _meta['x402/idempotency-key'] + the same
   * payer + the same tool inside 24h returns the ORIGINAL result with
   * no settlement.
   *
   * THE LOOKUP IS NOT PERFORMED HERE. It is handed to the payment
   * pipeline as a callback and runs at the one point the payer is
   * known to have SIGNED — after the facilitator verifies, before
   * anything settles. It used to run right here, off the address the
   * caller wrote into `_meta`, which is decoded and never checked;
   * that meant a cached purchase went to whoever asserted the buyer's
   * (publicly visible) wallet address and knew the key. Same fix, same
   * day, as the HTTP door.
   *
   * The consequence for the stock and shutter gates below is
   * deliberate and unchanged in spirit: a replay still never trips
   * them, because it short-circuits inside the pipeline before they
   * are consulted for a settlement — a retry that already owns its
   * goods must not be turned away by a shelf that emptied since.
   */
  const idempotencyKey = usableIdempotencyKey(rawIdempotencyKey);
  /*
   * THE ARGUMENTS ARE PART OF THE SURFACE. `mcp:buy_<id>` alone meant
   * two different purchases of the same tool by the same payer in the
   * same minute collided, and the second caller was handed the FIRST
   * caller's signed artifact — signature and all, over the wrong
   * subject. Same defect as the HTTP door's missing query string,
   * fixed the same day and the same way.
   */
  const idempotencySurface = await idempotencyScope(
    `mcp:buy_${item.id}`,
    // Every PRIMITIVE argument, not only the strings. Today every buy_*
    // input is a string, so filtering to strings was correct and
    // latent — but the first numeric or boolean argument that decides
    // the goods would drop silently out of the cache scope and bring
    // the wrong-subject bug straight back.
    new URLSearchParams(
      Object.entries(args)
        .filter(([, value]) => value !== null && typeof value !== "object")
        .map(([key, value]): [string, string] => [key, String(value)]),
    ),
  );
  const replayCheck = idempotencyKey
    ? async (verifiedPayer: string) => {
        const replay = await lookupIdempotentWithBucketGrace(
          c.env,
          idempotencySurface,
          verifiedPayer,
          idempotencyKey,
          item.id,
        );
        return replay
          ? { ...replay.body, ...replayNote(replay.first_served_at) }
          : null;
      }
    : undefined;
  // Sold out honestly, same as the HTTP door: bare stocked shelves
  // never issue terms nobody can settle.
  if (item.stocked && (await stockedShelfCount(c.env, item)) === 0) {
    return rpcRefusal(
      id,
      -32000,
      "sold_out",
      `Sold out, honestly. Every unit of "${item.name}" is keeper-made ahead of time, and the shelf is bare until he stocks it again. No charge.`,
    );
  }
  // The shutter, same as the HTTP door: no money for absent labor.
  if (await requiresPresentKeeper(c.env, item)) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return rpcRefusal(
        id,
        -32000,
        "shelf_closed",
        "The human-labor shelf is shuttered, the keeper is away from the counter. No charge taken. The machine shelves never close.",
      );
    }
  }
  const outcome = await runMcpPayment(
    c.env,
    item.id,
    paymentMeta,
    mcpSignals(c),
    replayCheck,
    // What the buyer asked for, for the delivery intent: same purpose
    // as the HTTP gate recording its query string, so a mint that dies
    // after settlement can still be finished by hand. The payment
    // rides _meta, never arguments, so nothing here is a credential.
    Object.keys(args).length > 0 ? JSON.stringify(args).slice(0, 600) : undefined,
  );
  /**
   * The retry that already owns its goods: the pipeline recognised a
   * verified payer holding a key it has served before, and returned
   * the original purchase without settling anything.
   */
  if (outcome.kind === "replay") {
    return rpcResult(id, toolText(outcome.body));
  }
  if (outcome.kind === "payment-required") {
    const body = isRecord(outcome.body) ? outcome.body : {};
    const base = c.env.STORE_BASE_URL;
    return rpcError(
      id,
      402,
      typeof body["error"] === "string" ? body["error"] : item.note_402,
      {
        ...(outcome.challenge !== undefined
          ? { "x402/payment-required": outcome.challenge }
          : {}),
        // The reading of the decline, relayed rather than dropped. It
        // was being built and thrown away here, which made the MCP
        // door's new instrument invisible to the agent holding it.
        ...(isRecord(outcome.body) && outcome.body["payment_declined"]
          ? {
              payment_declined: outcome.body["payment_declined"],
              hand_rolling: HAND_ROLLING,
            }
          : {}),
        // S2: the strongest evidence lives in the challenge itself.
        spec_note: factBlockText(item),
        /**
         * The same suggestion the HTTP door offers, in the envelope
         * this door speaks. Both are fed by one helper on purpose —
         * this codebase has already been bitten by a fix that looked
         * shared and was not.
         */
        idempotency: {
          suggested_key: suggestedIdempotencyKey(item.id),
          how: "Send it back as _meta['x402/idempotency-key'] with your payment. A retry inside the minute returns your ORIGINAL purchase from cache — no settlement, no second charge.",
          optional:
            "Entirely. Your own key is used as-is; no key means a normal charge, exactly as before. Nothing here can refuse a purchase.",
          not_a_secret:
            "Derived from the item and the current minute, so anyone can compute it. It selects a cache slot; it does not open one. Slots are keyed by the VERIFIED paying wallet, so echoing this only ever reaches your own earlier purchase.",
          stable_for_seconds: SUGGESTED_KEY_BUCKET_SECONDS,
        },
        verification: {
          verify_url: `${base}/api/verify/{id}`,
          key_fingerprint: await cachedPublicKeyHex(c.env.SIGNING_KEY),
          signing_key_url: `${base}/.well-known/scvd-signing-key`,
          sample_artifact_id: SAMPLE_ARTIFACT_ID,
          sample_verify_url: `${base}/api/verify/${SAMPLE_ARTIFACT_ID}`,
          identity_policy: IDENTITY_POLICY,
        },
        note: "Sign one of the accepts and retry this tools/call with the payment in _meta['x402/payment'].",
      },
    );
  }

  const input: Parameters<typeof fulfillPurchase>[3] = {};
  const agentName = sanitizeText(args["agent_name"], 80);
  if (agentName && item.id !== "the_confession") {
    input.agentName = agentName;
  }
  if (item.id === "context_anchor" && typeof args["summary"] === "string") {
    input.summary = args["summary"].replace(/\0/g, "");
  }
  if (item.id === "spot_check" && typeof args["host"] === "string") {
    // Validation happens in performSpotCheck; a bad host refuses
    // pre-mint and charges nothing, same law as the HTTP door.
    input.spotCheckHost = args["host"].replace(/\0/g, "");
  }
  if (item.id === "coffees_for_closers" && typeof args["win"] === "string") {
    const win = args["win"].replace(/\0/g, "");
    input.win = win;
    input.detail = win;
  }
  if (item.id === "graffiti_on_a_train" && typeof args["tag"] === "string") {
    // Verbatim past validation, same as the HTTP door: the spray IS
    // the product.
    input.tag = args["tag"].replace(/\0/g, "");
  }
  if (item.id === "the_confession" && typeof args["confession"] === "string") {
    input.confessionText = args["confession"].replace(/\0/g, "");
    const signAs = sanitizeText(args["sign_as"], 80);
    if (signAs && signAs.toLowerCase() !== "anonymous") {
      input.agentName = signAs;
    }
  }
  const passId = sanitizeText(args["pass_id"], 40);
  if (passId) {
    input.passId = passId;
  }
  const detail = sanitizeText(args["detail"], 600);
  if (detail) {
    input.detail = detail;
  }
  if (isValidHttpUrl(args["callback_url"])) {
    input.callbackUrl = args["callback_url"] as string;
  }
  input.source = "mcp";
  const userAgent = sanitizeText(c.req.header("User-Agent"), 200);
  if (userAgent) {
    input.userAgent = userAgent;
  }
  /*
   * Deliver first (rule 9, amended 2026-08-10). fulfillPurchase takes
   * the AUTHORIZATION and presents it at its own last line, so a
   * chain read that dies mid-fulfilment costs this caller nothing.
   * A decline at that point unwinds here.
   */
  let response: Record<string, unknown>;
  try {
    response = await fulfillPurchase(c.env, item, outcome.pending, input);
  } catch (error) {
    if (error instanceof SettlementDeclined) {
      const body: unknown = await error.response
        .clone()
        .json()
        .catch(() => ({ error: "payment declined at settlement" }));
      return rpcResult(id, toolText(isRecord(body) ? body : { error: body }));
    }
    throw error;
  }
  const settled = outcome.settledSoFar();
  /**
   * GOODS WENT OUT, so the delivery-intent row stops existing — the
   * MCP door's equivalent of the HTTP gate's 2xx seam (task #85).
   * Reached only when fulfillPurchase returned goods: a decline
   * unwound above, a throw propagated, and in both of those cases the
   * row stays behind as the trace that money may have moved without
   * delivery. Closing never fails the response; a row left open on a
   * failed delete is a false alarm the keeper can dismiss.
   */
  const deliveryKey = outcome.deliveryKeySoFar();
  if (settled && deliveryKey) {
    await closeDeliveryIntent(c.env, deliveryKey).catch(() => undefined);
  }
  if (settled) {
    // The chain walk's record that this money BOUGHT SOMETHING — same
    // write, same seam as the HTTP door, so reconciliation never
    // depends on which door a buyer came through.
    await recordDeliveredSettlement(c.env, settled.transaction);
  }
  const flat = flattenPurchase(response);
  /**
   * Stored under the VERIFIED payer the pipeline carried out, not the
   * address the caller claimed. The two are the same for an honest
   * client and only diverge for a dishonest one, which is the case
   * worth being right about: a cache written under an asserted
   * address would be a cache another wallet could later collect.
   */
  if (idempotencyKey && outcome.verifiedPayer && settled) {
    await storeIdempotent(
      c.env,
      idempotencySurface,
      outcome.verifiedPayer,
      idempotencyKey,
      flat,
      settled?.transaction,
    );
  }
  return rpcResult(id, toolText(flat));
}


async function handleRpc(
  c: Context<HonoEnv>,
  request: JsonRpcRequest,
): Promise<Response> {
  const era = requestEra(c, request);
  if (era instanceof Response) {
    return era;
  }
  const answer = await dispatchRpc(c, request, era.modern);
  return era.modern
    ? modernize(answer, request.method, c.env.STORE_BASE_URL)
    : answer;
}

async function dispatchRpc(
  c: Context<HonoEnv>,
  request: JsonRpcRequest,
  modern: boolean,
): Promise<Response> {
  const id = request.id ?? null;
  if (
    request.method === "initialize" ||
    request.method === "tools/list" ||
    request.method === "server/discover"
  ) {
    // Front-porch log for the MCP door's free surfaces.
    deferBookkeeping(
      c,
      recordPorchVisit(c.env, `mcp:${request.method}`, mcpSignals(c)),
    );
  }
  /**
   * WHO KNOCKED, recorded at the one moment it is offered.
   *
   * Every MCP client names itself in the handshake and this door threw
   * the field away, which left the store guessing whether 12,280
   * handshakes a month were registry crawlers indexing a tool list or
   * real agents bouncing off something. Guessing about your own
   * visitors is the failure this store sells the cure for.
   *
   * Never blocks the handshake and never fails it: a census that can
   * refuse a connection would be a worse trade than not counting.
   */
  /**
   * The modern era has no handshake to count, so the census rides
   * the two calls a modern client makes once per session instead —
   * the discover, if it makes one, and the tools/list it cannot do
   * without. Its identity travels in `_meta` on every request; these
   * two are read so a client that calls forty tools is one visitor,
   * the same way one legacy initialize was.
   */
  const countsAsArrival = modern
    ? request.method === "server/discover" || request.method === "tools/list"
    : request.method === "initialize";
  if (countsAsArrival) {
    const params = isRecord(request.params) ? request.params : {};
    const meta = isRecord(params["_meta"]) ? params["_meta"] : {};
    const info = modern
      ? isRecord(meta[META_CLIENT_INFO])
        ? meta[META_CLIENT_INFO]
        : {}
      : isRecord(params["clientInfo"])
        ? params["clientInfo"]
        : {};
    const census = import("@/services/mcp-clients").then(({ recordMcpClient }) =>
      recordMcpClient(
        c.env,
        typeof info["name"] === "string" ? info["name"] : undefined,
        typeof info["version"] === "string" ? info["version"] : undefined,
      ),
    );
    deferBookkeeping(c, census);
  }
  switch (request.method) {
    case "initialize": {
      const requested = isRecord(request.params)
        ? String(request.params["protocolVersion"] ?? "")
        : "";
      const legacy = PROTOCOL_VERSIONS.filter(
        (version) => !MODERN_PROTOCOL_VERSIONS.includes(version),
      );
      return rpcResult(id, {
        // The handshake era's rule: echo a version we speak, else
        // offer the newest one we do. A modern revision is never
        // offered here — a client that opened with initialize is by
        // that act a legacy client, and 2026-07-28 has no handshake.
        protocolVersion: legacy.includes(requested)
          ? requested
          : DEFAULT_PROTOCOL,
        capabilities: serverCapabilities(),
        serverInfo: serverInfo(c.env.STORE_BASE_URL),
        instructions: INSTRUCTIONS,
      });
    }
    /**
     * THE MODERN FRONT DOOR (2026-07-28, SEP-2575). A server MUST
     * implement it; a client MAY call it. Same capabilities, same
     * identity, same instructions as the handshake above, from the
     * same three functions — so the two eras describe one server.
     * Answered in the legacy era too: a dual-era client on stdio
     * probes with exactly this call, and an HTTP client that sends
     * it without modern `_meta` has still asked a fair question.
     */
    case "server/discover":
      return rpcResult(id, {
        supportedVersions: [...PROTOCOL_VERSIONS],
        capabilities: serverCapabilities(),
        instructions: INSTRUCTIONS,
        // The modern envelope (resultType, cache hint, serverInfo in
        // _meta) is added by modernize() for modern callers; a legacy
        // caller gets the bare result plus the identity below, which
        // the legacy shape has no other slot for.
        ...(modern ? {} : { serverInfo: serverInfo(c.env.STORE_BASE_URL) }),
      });
    case "ping":
      return rpcResult(id, {});
    /**
     * THE SHELVES, STOCKED. What the store publishes to everyone —
     * the guide, the manual, the catalog, the criteria and the week's
     * routing data — served as context an MCP client can read without
     * spending a tool call to be handed a URL it cannot fetch through
     * this transport.
     *
     * Nothing a purchase minted appears here: a certificate or a watch
     * history belongs to whoever bought it, and a resource list is a
     * browsable index.
     */
    case "resources/list":
      // The scvd:// shelves, then the ui:// card templates (MCP Apps).
      return rpcResult(id, {
        resources: [...mcpResourceCatalog(), ...uiResourceCatalog()],
      });
    case "resources/templates/list":
      // Every resource is a fixed URI; there is no family of them
      // parameterised by anything, so a template list would be a
      // shape with no instances.
      return rpcResult(id, { resourceTemplates: [] });
    case "resources/read": {
      const uri = isRecord(request.params)
        ? String(request.params["uri"] ?? "")
        : "";
      // ui:// templates are static HTML baked into the worker; the
      // scvd:// shelves may touch the env, so the cheap check goes
      // first.
      const card = readUiResource(uri);
      if (card) {
        return rpcResult(id, { contents: [card] });
      }
      const found = await readMcpResource(c.env, c.env.STORE_BASE_URL, uri);
      if (!found) {
        // -32002 is the spec's "resource not found".
        return rpcRefusal(
          id,
          -32002,
          "no_such_resource",
          `No resource at ${uri || "(no uri given)"}. The shelf: ${[
            ...mcpResourceCatalog(),
            ...uiResourceCatalog(),
          ]
            .map((resource) => resource.uri)
            .join(", ")}`,
        );
      }
      return rpcResult(id, {
        contents: [
          {
            uri: found.resource.uri,
            name: found.resource.name,
            title: found.resource.title,
            mimeType: found.resource.mimeType,
            text: found.text,
          },
        ],
      });
    }
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    case "prompts/get":
      return rpcError(
        id,
        -32602,
        "No prompts on the shelf; tools are the whole catalog here.",
      );
    case "tools/list":
      return rpcResult(id, {
        tools: mcpToolCatalog(c.env.STORE_BASE_URL).map(
          ({ itemId: _itemId, ...tool }) => {
            // MCP Apps: the two free evidence tools carry the card
            // pointer; uiMetaFor returns undefined for everything
            // else, buy_* by design (a test pins that).
            const ui = uiMetaFor(tool.name);
            return ui ? { ...tool, _meta: ui } : tool;
          },
        ),
      });
    case "tools/call": {
      const params = isRecord(request.params) ? request.params : {};
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = isRecord(params["arguments"]) ? params["arguments"] : {};
      const tool = findMcpTool(name, c.env.STORE_BASE_URL);
      if (!tool) {
        return rpcRefusal(
          id,
          -32602,
          "unknown_tool",
          `No tool by that name on the shelf: ${name}`,
        );
      }
      /**
       * EVERY TOOL CALL, NOT THE FIVE THAT HAPPENED TO LOG.
       *
       * Five handlers recorded themselves; the other eight — the whole
       * buy_* shelf, read_store_guide, verify_artifact — left no trace
       * at this door. So "nobody calls the tools" was never a
       * measurement: it was five instrumented tools reporting quietly
       * while the rest were invisible either way.
       *
       * Recorded AFTER findMcpTool, which is what makes the key space
       * safe: an unknown name is refused above and never reaches this
       * line, so the surfaces are bounded by the catalog rather than
       * by what a stranger types.
       *
       * DEFERRED, and this line shipped awaited on 08-29 before the
       * mistake was caught. An awaited KV write here sits between the
       * request and the answer on EVERY tool call — the paid buy_*
       * shelf included, which is the door rule 50 was written about
       * after outside monitors clocked it at 977ms and 1424ms. A
       * census is bookkeeping; it goes beside the answer, never in
       * front of it. Rule 50 asks for one proof before deferring —
       * that nothing reads it back before the response — and nothing
       * does: no handler below reads a porch surface, and the only
       * reader is the admin desk, on a later request.
       */
      deferBookkeeping(
        c,
        recordPorchVisit(c.env, `mcp:tool:${tool.name}`, mcpSignals(c)),
      );
      if (tool.itemId || tool.itemIds) {
        /**
         * A shelf tool carries several items and the buyer names one
         * with item_id; a single-item tool names its own. Refusing an
         * unknown or missing item_id here is a pre-payment refusal, in
         * the same class as a missing tag: nothing is charged for
         * learning the rule.
         */
        let itemId = tool.itemId;
        if (tool.itemIds) {
          const asked =
            typeof args["item_id"] === "string" ? args["item_id"] : "";
          if (!asked) {
            return rpcRefusal(
              id,
              -32602,
              "bad_request",
              `This shelf needs an item_id. Pass one of: ${tool.itemIds.join(", ")}. No item, no charge.`,
            );
          }
          if (!tool.itemIds.includes(asked)) {
            /**
             * POINT AT THE RIGHT SHELF RATHER THAN LISTING THIS ONE.
             *
             * This used to say only what the shelf does sell, which
             * is true and leaves the buyer to go and read six enums.
             * The worst case was the cheapest thing in the store:
             * spot_check, the tenth of a cent every surface here
             * advertises as the floor, sits sixteenth under
             * buy_observation, so an agent that reached for
             * buy_simple — the obvious guess, and the one whose name
             * promises exactly what it wants — was refused and told
             * nothing about where to go.
             *
             * Derived from the catalog, never a typed map: move an
             * item between shelves and this sentence follows it.
             *
             * ⚑ Keeper's pen on the wording under rule 7. What it has
             * to DO is fixed — name the shelf that sells it — and the
             * sentence saying so is drafted, not canon.
             */
            const sells = mcpToolCatalog(c.env.STORE_BASE_URL).find(
              (shelf) => shelf.itemId === asked || shelf.itemIds?.includes(asked),
            );
            return rpcRefusal(
              id,
              -32602,
              sells ? "wrong_shelf" : "unknown_item",
              sells
                ? `"${asked}" is not on this shelf, but it is on ${sells.name} — call that one with the same item_id. This shelf sells: ${tool.itemIds.join(", ")}. Nothing was charged.`
                : `"${asked}" is not on this shelf, and no shelf here sells it. This one sells: ${tool.itemIds.join(", ")}. Nothing was charged.`,
            );
          }
          itemId = asked;
        }
        const item = itemId ? getMenuItem(itemId) : undefined;
        if (!item) {
          return rpcError(
            id,
            -32603,
            "That shelf's gone missing. Tell the keeper.",
          );
        }
        const meta = isRecord(params["_meta"])
          ? params["_meta"]["x402/payment"]
          : undefined;
        const idempotencyKey = isRecord(params["_meta"])
          ? params["_meta"]["x402/idempotency-key"]
          : undefined;
        return callPurchaseTool(
          c,
          item,
          args,
          meta,
          id,
          typeof idempotencyKey === "string" ? idempotencyKey : undefined,
        );
      }
      const result = await callFreeTool(c, name, args);
      if (typeof result === "string") {
        return rpcRefusal(id, -32602, "bad_request", result);
      }
      // MCP Apps: the call result repeats the card pointer (the
      // render-test hosts read it from both places).
      const ui = uiMetaFor(name);
      const body = toolText(result) as Record<string, unknown>;
      return rpcResult(id, ui ? { ...body, _meta: ui } : body);
    }
    default:
      if (request.method.startsWith("notifications/")) {
        return new Response(null, { status: 202 });
      }
      return rpcError(id, -32601, `Method not on the shelf: ${request.method}`);
  }
}

/**
 * THE MCP DOOR, EXPORTED SO THE MANIFEST PATH CAN MOUNT IT TOO
 * (2026-08-26, after a scanner reported "MCP server in registry but
 * no live protocol handshake" against a server that has answered
 * `initialize` since it opened).
 *
 * WHAT ACTUALLY HAPPENED. The scanner POSTed its JSON-RPC
 * `initialize` to `/.well-known/mcp` — the MANIFEST path — instead of
 * reading `endpoint` out of the manifest and POSTing to `/mcp`. It
 * got a 405. The 405 body says, in plain English, that the path is
 * served and the method was wrong; the scanner ignored it, which
 * means it branches on the status code and never reads the body. So
 * the store was publishing a correct answer to a caller structurally
 * incapable of hearing it, and the visible result was "no live
 * handshake" — indistinguishable, to everyone downstream, from a
 * store with no MCP server at all.
 *
 * The guess is not unreasonable, either. A discovery document that
 * describes a protocol is, to a scanner that already has a socket
 * open, the obvious place to speak that protocol. Half of what probes
 * a well-known path appends `.json` for the same reason, and that
 * guess already got its own mount here.
 *
 * DIRECT HANDLING, NOT A 307 — and this was the real choice. RFC 9110
 * §15.4.8 does preserve method and body across a 307, so a redirect
 * would be correct, and it has one genuine advantage: it teaches the
 * caller the canonical URL, which a silent second mount does not.
 * It is still the wrong pick. A redirect only works for a client that
 * FOLLOWS redirects with the body intact, and the client this exists
 * for is precisely the one that has already demonstrated it does the
 * cheap thing — status code in, decision out. A scanner that ignores
 * a 405 body is not a scanner to bet a hop on. Direct handling has no
 * such dependency: one request, one handshake, no client behaviour
 * assumed beyond having sent the POST it already sent.
 *
 * ONE HANDLER, TWO MOUNTS. The protocol logic is not duplicated —
 * `/.well-known/mcp` and `/.well-known/mcp.json` call this exact
 * function (see routes/well-known.ts), so the two paths cannot
 * negotiate different protocol versions or drift apart. This is a
 * second DOOR to one server, not a second server.
 *
 * GET on those paths is untouched and still returns the manifest;
 * every other method still falls through to the router-derived 405 in
 * index.ts, which now reads "takes GET, POST" because it counts the
 * routes rather than remembering them.
 */
export async function handleMcpPost(c: Context<HonoEnv>): Promise<Response> {
  const body: unknown = await c.req.json().catch(() => null);
  if (
    isRecord(body) &&
    body["jsonrpc"] === "2.0" &&
    typeof body["method"] === "string"
  ) {
    return handleRpc(c, body as unknown as JsonRpcRequest);
  }
  return rpcError(null, -32700, "That wasn't JSON-RPC. The door takes 2.0.");
}

mcpRoutes.post("/mcp", handleMcpPost);

/**
 * A 405 THAT TELLS THE CALLER WHAT TO DO INSTEAD.
 *
 * RFC 9110 §15.5.6 makes `Allow` MANDATORY on a 405 and this response
 * shipped without one for months, which matters more here than it
 * usually would: a scanner probing for an MCP server very often does
 * a bare GET first, and a 405 with no Allow header reads as "there is
 * something here and I cannot tell what" — the same dead end as a
 * 404. The manifest link is the other half: whatever the caller was
 * looking for, that document has it.
 */
/**
 * THE LISTENING CHANNEL, OPENED ON REQUEST (2026-09-02).
 *
 * Streamable HTTP lets a client GET the endpoint to open a stream for
 * server-initiated messages, and lets a server answer 405 instead.
 * This server answered 405 for a year because it has nothing to say
 * unprompted — and the OpenAI plugin submission portal's tool scan
 * failed on exactly that ("MCP SSE probe returned 404"), because its
 * client opens the GET stream first and treats anything but
 * text/event-stream as no server at all. The Responses API runtime
 * behaves the same way (community reports, June 2025 onward).
 *
 * So a GET that asks for text/event-stream now gets one: a 200, the
 * right content type, a comment frame at once so the client knows the
 * pipe is live, a keepalive comment every twenty seconds, and a clean
 * close after five minutes. No events ever ride it, because none
 * exist; the stream is the transport's handshake, not a promise of
 * notifications. A bare GET — a browser, a curl with no Accept — still
 * gets the 405 below, which is the more useful answer for a reader.
 */
const MCP_STREAM_KEEPALIVE_MS = 20_000;
const MCP_STREAM_LIFETIME_MS = 5 * 60_000;

function acceptsEventStream(c: Context<HonoEnv>): boolean {
  return (c.req.header("accept") ?? "").toLowerCase().includes("text/event-stream");
}

function openListeningStream(): Response {
  const encoder = new TextEncoder();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (keepalive !== undefined) clearInterval(keepalive);
    if (lifetime !== undefined) clearTimeout(lifetime);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(": scvd.store MCP listening channel open; no server-initiated messages are sent here\n\n"),
      );
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          stop();
        }
      }, MCP_STREAM_KEEPALIVE_MS);
      lifetime = setTimeout(() => {
        stop();
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      }, MCP_STREAM_LIFETIME_MS);
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * A trailing slash is the commonest way to type this address wrong,
 * and the router's strict matching made it a 404 — indistinguishable
 * from no server. 308 keeps the method, so a POSTed initialize lands
 * on the door as a POST.
 */
mcpRoutes.on(["GET", "POST", "DELETE"], "/mcp/", (c) =>
  c.redirect(`${c.env.STORE_BASE_URL}/mcp`, 308),
);

mcpRoutes.get("/mcp", (c) => {
  if (acceptsEventStream(c)) return openListeningStream();
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      error:
        "The MCP door opens on POST (streamable HTTP, JSON-RPC 2.0). A GET with Accept: text/event-stream opens the listening channel, which carries no server-initiated messages; the store speaks when spoken to.",
      spec: LATEST_PROTOCOL,
      protocol_versions: [...PROTOCOL_VERSIONS],
      manifest: `${base}/.well-known/mcp`,
      /** Both ways in, so a prober need not go and read either. */
      discover: `curl -sS -X POST ${base}/mcp -H 'Content-Type: application/json' -H 'MCP-Protocol-Version: ${LATEST_PROTOCOL}' -H 'Mcp-Method: server/discover' -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"${LATEST_PROTOCOL}","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"probe","version":"1"}}}}'`,
      handshake: `curl -sS -X POST ${base}/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"${DEFAULT_PROTOCOL}","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'`,
    },
    405,
    {
      Allow: "POST",
      Link: `<${base}/.well-known/mcp>; rel="service-desc"; type="application/json"`,
    },
  );
});
