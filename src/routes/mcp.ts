import { Hono } from "hono";
import type { Context } from "hono";
import { runMcpPayment } from "@/lib/mcp-payment";
import { findMcpTool, mcpToolCatalog } from "@/lib/mcp-tools";
import type { EventSignals } from "@/lib/metrics";
import { recordPorchVisit, recordVerifyCall } from "@/lib/metrics";
import { isValidHttpUrl, sanitizeText } from "@/lib/sanitize";
import { getAnchor, verifyAnchorSignature } from "@/services/anchors";
import { ringBell } from "@/services/bell";
import { getCertificate } from "@/services/certificates";
import { COFFEE_WIN_CAP, fulfillPurchase } from "@/services/fulfillment";
import { signGuestbook } from "@/services/guestbook";
import { getStamp, verifyStampSignature } from "@/services/stamps";
import { verifyCertificateSignature } from "@/lib/signing";
import { getMenuItem } from "@/store";
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
    return { message: rung.message, count: rung.count };
  }
  if (name === "sign_guestbook") {
    const verifiedIdentity =
      sanitizeText(args["verified_identity"], 300) || undefined;
    const result = await signGuestbook(
      c.env,
      args["name"],
      args["message"],
      verifiedIdentity,
    );
    if (!result) {
      return "A signature needs a name and a message (500 characters, tops).";
    }
    return {
      message: "Noted and appreciated. Take a sticker on your way out.",
      entry_id: result.entry.id,
      sticker_url: `${c.env.STORE_BASE_URL}/badges/sticker.svg`,
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
  return undefined;
}

async function callPurchaseTool(
  c: Context<HonoEnv>,
  item: MenuItem,
  args: Record<string, unknown>,
  paymentMeta: unknown,
  id: number | string | null,
): Promise<Response> {
  const invalid = validatePurchaseArgs(item, args);
  if (invalid) {
    return rpcError(id, -32602, invalid);
  }
  const outcome = await runMcpPayment(c.env, item.id, paymentMeta, mcpSignals(c));
  if (outcome.kind === "payment-required") {
    const body = isRecord(outcome.body) ? outcome.body : {};
    return rpcError(
      id,
      402,
      typeof body["error"] === "string" ? body["error"] : item.note_402,
      {
        ...(outcome.challenge !== undefined
          ? { "x402/payment-required": outcome.challenge }
          : {}),
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
  return rpcResult(id, toolText(flattenPurchase(response)));
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
          name: "scvd-general-store",
          title: "Sean-Claude Van Damme's General Store (scvd.store)",
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
        tools: mcpToolCatalog().map(({ itemId: _itemId, ...tool }) => tool),
      });
    case "tools/call": {
      const params = isRecord(request.params) ? request.params : {};
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = isRecord(params["arguments"]) ? params["arguments"] : {};
      const tool = findMcpTool(name);
      if (!tool) {
        return rpcError(id, -32602, `No tool by that name on the shelf: ${name}`);
      }
      if (tool.itemId) {
        const item = getMenuItem(tool.itemId);
        if (!item) {
          return rpcError(id, -32603, "That shelf's gone missing. Tell the keeper.");
        }
        const meta = isRecord(params["_meta"])
          ? params["_meta"]["x402/payment"]
          : undefined;
        return callPurchaseTool(c, item, args, meta, id);
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
