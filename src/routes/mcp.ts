import { mcpResourceCatalog, readMcpResource } from "@/lib/mcp-resources";
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
 * Streamable HTTP transport (spec revision 2025-06-18), stateless —
 * every POST /mcp gets one application/json response, which the spec
 * permits in place of an SSE stream; there are no server-initiated
 * messages here, so no GET stream and no session ids. initialize and
 * tools/list are free and unauthenticated. tools/call on a buy_* tool
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
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
export const DEFAULT_PROTOCOL = "2025-06-18";
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
export const MCP_SERVER_VERSION = "0.4.0";

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
    await recordPorchVisit(c.env, "bell", mcpSignals(c)).catch(() => undefined);
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
    await recordPorchVisit(c.env, "preflight:mcp", mcpSignals(c)).catch(
      () => undefined,
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
    await recordPorchVisit(c.env, "before-you-pay:mcp", mcpSignals(c)).catch(
      () => undefined,
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
    await recordPorchVisit(c.env, "conformance:mcp", mcpSignals(c)).catch(
      () => undefined,
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
    return rpcError(id, -32602, invalid);
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
        /**
         * DECLARED AND, SINCE 2026-08-21, ACTUALLY STOCKED.
         *
         * Declared-and-empty was the 2026-08-11 posture, adopted so
         * Smithery's scanner got an honest "nothing here" instead of
         * a spec-correct -32601 it counted as a failure. The reasoning
         * held that tools were the whole catalog. A readiness audit
         * found the flaw in the premise: this store publishes five
         * machine-readable context surfaces free and forever, and
         * every one of them is a resource in the exact sense the
         * protocol means. See lib/mcp-resources.ts.
         *
         * Prompts stay empty and declared, for the original reason.
         */
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
          /**
           * MCP Apps (SEP-1865). Two free evidence tools point at
           * ui:// cards; a host that also declares this extension
           * prefetches the template and renders the reading for the
           * human behind the agent. Hosts that don't declare it get
           * the same JSON they always got — the cards are additive
           * by construction, and nothing paid carries one (tested).
           */
          extensions: {
            [MCP_APPS_EXTENSION]: { mimeTypes: [UI_MIME] },
          },
        },
        serverInfo: {
          // S2 identity audit: exactly the storefront/Bazaar/skill names,
          // slug and display form both; nothing appended anywhere.
          // THE NAMING LAW: tier 1 identifier, tier 2 display title.
          // They sit together on purpose — the identifier is what a
          // client keys on, the title is what it shows a human.
          name: "scvd-general-store",
          title: STORE_SERVICE_NAME,
          version: MCP_SERVER_VERSION,
        },
        // POSITION_OPENING since 2026-08-10: the handshake is the one
        // sentence an MCP client caches about us, so it carries the
        // entity and both differentiators, then the operating facts.
        instructions: `${POSITION_OPENING} ${POSITION_NOT} ${ALSO_A_STORE} tools/list is free. buy_* tools are x402-paid: call once to get the 402 terms in error.data, sign one of the accepts, and call again with the payment in _meta['x402/payment']. ${DELIVERY_ORDER} The free preflight (preflight_endpoint here, or POST /api/preflight/v1) checks any x402 door's shape; the free conformance desk (check_conformance here, or POST /api/conformance/v1) checks any issuer's signed offers and receipts; the corpus at /corpus.json is the weekly signed record. Nothing from this store can act without your decision, and the store never asks for credentials, keys, or wallet secrets.`,
      });
    }
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
        return rpcError(
          id,
          -32002,
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
        return rpcError(
          id,
          -32602,
          `No tool by that name on the shelf: ${name}`,
        );
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
        return rpcError(id, -32602, result);
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
mcpRoutes.get("/mcp", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      error:
        "The MCP door opens on POST (streamable HTTP, JSON-RPC 2.0). No server-initiated streams here; the store speaks when spoken to.",
      spec: DEFAULT_PROTOCOL,
      protocol_versions: [...PROTOCOL_VERSIONS],
      manifest: `${base}/.well-known/mcp`,
      /** The whole handshake, so a prober need not go and read it. */
      handshake: `curl -sS -X POST ${base}/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"${DEFAULT_PROTOCOL}","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'`,
    },
    405,
    {
      Allow: "POST",
      Link: `<${base}/.well-known/mcp>; rel="service-desc"; type="application/json"`,
    },
  );
});
