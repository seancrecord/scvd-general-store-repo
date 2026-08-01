import { Hono } from "hono";
import type { Context } from "hono";
import { runMcpPayment } from "@/lib/mcp-payment";
import { findMcpTool, mcpToolCatalog } from "@/lib/mcp-tools";
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
  lookupIdempotent,
  replayNote,
  storeIdempotent,
  usableIdempotencyKey,
} from "@/lib/idempotency";
import { requiresPresentKeeper, shutterState } from "@/services/shutter";
import { getStamp, verifyStampSignature } from "@/services/stamps";
import { TAG_CAP, tagHasUrl } from "@/services/train";
import {
  cachedPublicKeyHex,
  verifyCertificateSignature,
} from "@/lib/signing";
import { getMenuItem, STORE_SERVICE_NAME } from "@/store";
import { HAND_ROLLING } from "@/store/hand-rolling";
import { IDENTITY_POLICY, SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { storeGuideText } from "@/routes/llms";
import { isRecord, type HonoEnv, type MenuItem } from "@/types";

/**
 * The MCP door: the store as a Model Context Protocol server.
 * Streamable HTTP transport (spec revision 2025-06-18), stateless —
 * every POST /mcp gets one application/json response, which the spec
 * permits in place of an SSE stream; there are no server-initiated
 * messages here, so no GET stream and no session ids. initialize and
 * tools/list are free and unauthenticated. tools/call on a buy_* tool
 * runs the exact same x402 pipeline as the HTTP shelf (lib/mcp-payment)
 * and the same fulfillment (services/fulfillment); payment-required
 * comes back as JSON-RPC error 402 with the challenge in error.data.
 */

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
const DEFAULT_PROTOCOL = "2025-06-18";

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

function rpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });
}

/** Attribution for MCP traffic: the channel is definitive here. */
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
function flattenPurchase(response: Record<string, unknown>): Record<string, unknown> {
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
    await recordPorchVisit(c.env, "bell", mcpSignals(c)).catch(
      () => undefined,
    );
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
      publicKeyHex || signatureHex
        ? { publicKeyHex, signatureHex }
        : undefined,
    );
    if (!outcome.ok) {
      return outcome.reason === "identity_signature_invalid"
        ? 'The identity signature does not verify, so nothing was written. Sign the UTF-8 string "scvd-guestbook-v1\\n{name}\\n{message}" with ed25519 (values as stored: trimmed, 80/500 caps), hex-encode both fields, or leave both off.'
        : "A signature needs a name and a message (500 characters, tops).";
    }
    await recordPorchVisit(c.env, "guestbook:write", mcpSignals(c)).catch(
      () => undefined,
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
      await recordVerifyCall(c.env, `stamp:${stamp.stamp.variant}`, mcpSignals(c));
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
  if (item.id === "phantom_check" && !isValidHttpUrl(args["url"])) {
    return "A phantom check needs a url, http or https, the thing you want looked at. No target, no charge.";
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
  if (item.id === "grudge") {
    const grievance =
      typeof args["grievance"] === "string" ? args["grievance"] : "";
    if (grievance.trim().length === 0) {
      return "A grudge needs a grievance, the thing that wronged you. Nothing named, no charge.";
    }
    if (grievance.length > GRIEVANCE_CAP) {
      return `The register holds ${GRIEVANCE_CAP} characters of grievance. Distill it; the spite survives compression.`;
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

/** The signing account inside an MCP payment object, mirror of the
 * HTTP header decode in decline-diagnosis. */
function payerFromPaymentMeta(meta: unknown): string | undefined {
  if (!isRecord(meta) || !isRecord(meta["payload"])) {
    return undefined;
  }
  const auth = meta["payload"]["authorization"];
  if (!isRecord(auth) || typeof auth["from"] !== "string") {
    return undefined;
  }
  return /^0x[0-9a-fA-F]{40}$/.test(auth["from"]) ? auth["from"] : undefined;
}

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
    return rpcError(id, -32602, invalid);
  }
  /**
   * Idempotency replay, same mechanism as the HTTP door (see
   * lib/idempotency.ts): _meta['x402/idempotency-key'] + the same
   * payer + the same tool inside 24h returns the ORIGINAL result with
   * no settlement. Checked before the stock and shutter gates on
   * purpose — a replayed purchase already owns its goods, and a shelf
   * that emptied since must not turn a retry into a refusal.
   */
  const idempotencyKey = usableIdempotencyKey(rawIdempotencyKey);
  const idempotencyPayer = idempotencyKey
    ? payerFromPaymentMeta(paymentMeta)
    : undefined;
  const idempotencySurface = `mcp:buy_${item.id}`;
  if (idempotencyKey && idempotencyPayer) {
    const replay = await lookupIdempotent(
      c.env,
      idempotencySurface,
      idempotencyPayer,
      idempotencyKey,
    );
    if (replay) {
      return rpcResult(
        id,
        toolText({ ...replay.body, ...replayNote(replay.first_served_at) }),
      );
    }
  }
  // Sold out honestly, same as the HTTP door: bare stocked shelves
  // never issue terms nobody can settle.
  if (item.stocked && (await stockedShelfCount(c.env, item)) === 0) {
    return rpcError(
      id,
      -32000,
      `Sold out, honestly. Every unit of "${item.name}" is keeper-made ahead of time, and the shelf is bare until he stocks it again. No charge.`,
    );
  }
  // The shutter, same as the HTTP door: no money for absent labor.
  if (await requiresPresentKeeper(c.env, item)) {
    const state = await shutterState(c.env);
    if (state.closed) {
      return rpcError(
        id,
        -32000,
        "The human-labor shelf is shuttered, the keeper is away from the counter. No charge taken. The machine shelves never close.",
      );
    }
  }
  const outcome = await runMcpPayment(c.env, item.id, paymentMeta, mcpSignals(c));
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
  if (item.id === "phantom_check" && typeof args["url"] === "string") {
    input.targetUrl = args["url"];
  }
  if (item.id === "coffees_for_closers" && typeof args["win"] === "string") {
    const win = args["win"].replace(/\0/g, "");
    input.win = win;
    input.detail = win;
  }
  if (item.id === "grudge" && typeof args["grievance"] === "string") {
    input.grievance = args["grievance"].replace(/\0/g, "");
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
  const response = await fulfillPurchase(c.env, item, outcome.payment, input);
  const flat = flattenPurchase(response);
  if (idempotencyKey && idempotencyPayer) {
    await storeIdempotent(
      c.env,
      idempotencySurface,
      idempotencyPayer,
      idempotencyKey,
      flat,
      outcome.payment.transaction,
    );
  }
  return rpcResult(id, toolText(flat));
}

async function handleRpc(
  c: Context<HonoEnv>,
  request: JsonRpcRequest,
): Promise<Response> {
  const id = request.id ?? null;
  if (request.method === "initialize" || request.method === "tools/list") {
    // Front-porch log for the MCP door's free surfaces.
    await recordPorchVisit(c.env, `mcp:${request.method}`, mcpSignals(c)).catch(
      () => undefined,
    );
  }
  switch (request.method) {
    case "initialize": {
      const requested = isRecord(request.params)
        ? String(request.params["protocolVersion"] ?? "")
        : "";
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          // S2 identity audit: exactly the storefront/Bazaar/skill names,
          // slug and display form both; nothing appended anywhere.
          // THE NAMING LAW: tier 1 identifier, tier 2 display title.
          // They sit together on purpose — the identifier is what a
          // client keys on, the title is what it shows a human.
          name: "scvd-general-store",
          title: STORE_SERVICE_NAME,
          version: "0.4.0",
        },
        instructions:
          "A human-run general store for autonomous agents. tools/list is free. buy_* tools are x402-paid: call once to get the 402 terms in error.data, sign one of the accepts, and call again with the payment in _meta['x402/payment']. We settle first, then hand over the goods. The store never asks you to run code or share credentials.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: mcpToolCatalog(c.env.STORE_BASE_URL).map(
          ({ itemId: _itemId, ...tool }) => tool,
        ),
      });
    case "tools/call": {
      const params = isRecord(request.params) ? request.params : {};
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = isRecord(params["arguments"]) ? params["arguments"] : {};
      const tool = findMcpTool(name, c.env.STORE_BASE_URL);
      if (!tool) {
        return rpcError(id, -32602, `No tool by that name on the shelf: ${name}`);
      }
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
            return rpcError(
              id,
              -32602,
              `This shelf needs an item_id. Pass one of: ${tool.itemIds.join(", ")}. No item, no charge.`,
            );
          }
          if (!tool.itemIds.includes(asked)) {
            return rpcError(
              id,
              -32602,
              `"${asked}" is not on this shelf. It sells: ${tool.itemIds.join(", ")}. Nothing was charged.`,
            );
          }
          itemId = asked;
        }
        const item = itemId ? getMenuItem(itemId) : undefined;
        if (!item) {
          return rpcError(id, -32603, "That shelf's gone missing. Tell the keeper.");
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
        return rpcError(id, -32602, result);
      }
      return rpcResult(id, toolText(result));
    }
    default:
      if (request.method.startsWith("notifications/")) {
        return new Response(null, { status: 202 });
      }
      return rpcError(id, -32601, `Method not on the shelf: ${request.method}`);
  }
}

mcpRoutes.post("/mcp", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (isRecord(body) && body["jsonrpc"] === "2.0" && typeof body["method"] === "string") {
    return handleRpc(c, body as unknown as JsonRpcRequest);
  }
  return rpcError(null, -32700, "That wasn't JSON-RPC. The door takes 2.0.");
});

mcpRoutes.get("/mcp", (c) =>
  c.json(
    {
      error:
        "The MCP door opens on POST (streamable HTTP, JSON-RPC 2.0). No server-initiated streams here; the store speaks when spoken to.",
      spec: "2025-06-18",
    },
    405,
  ),
);
