import type { HTTPAdapter, HTTPRequestContext } from "@x402/core/server";
import { sendAlert } from "@/lib/alerts";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
import {
  bookedReason,
  decodePaymentHeader,
  diagnoseDecline,
  payerFromPaymentHeader,
  preflightBlockers,
  preflightRefusalBody,
} from "@/lib/decline-diagnosis";
import type { EventSignals } from "@/lib/metrics";
import {
  recordChallengeIssued,
  recordPaymentDecline,
  recordSettlement,
} from "@/lib/metrics";
import {
  DECLINE_SLOT_KEY,
  SOLANA_NETWORK,
  recordSolanaSettle,
  takeDeclineReason,
} from "@/lib/payments";
import type { DeclineSlot } from "@/lib/payments";
import {
  atomicToUsdc,
  getPaymentStack,
  minimumUsdcForPath,
  tipFromPaid,
} from "@/lib/payments";
import type { SettledPayment } from "@/lib/payments";
import {
  extractPaymentNonce,
  isNonceSpent,
  payerOfVerifiedPayload,
  recordSpentNonce,
} from "@/lib/replay-guard";
import { isRecord } from "@/types";
import type { Env } from "@/types";

/**
 * The MCP door to the same till. A tools/call for a paid item is
 * translated into the exact HTTP payment pipeline the buy routes use —
 * same x402 stack, same replay guard, same settle-before-mint order —
 * via a synthetic adapter for GET /api/buy/<item>. Nothing here can
 * fulfill without a verified settle; only the envelope differs.
 *
 * Payment rides tools/call params._meta["x402/payment"], the x402-MCP
 * convention: either the base64 PAYMENT-SIGNATURE string or the raw
 * payload object (we encode it). Payment-required comes back as JSON-RPC
 * error 402 with the challenge in error.data.
 */

class McpBuyAdapter implements HTTPAdapter {
  constructor(
    private readonly url: string,
    private readonly path: string,
    private readonly paymentHeader: string | undefined,
    private readonly userAgent: string,
  ) {}
  getHeader(name: string): string | undefined {
    return name.toLowerCase() === "payment-signature"
      ? this.paymentHeader
      : undefined;
  }
  getMethod(): string {
    return "GET";
  }
  getPath(): string {
    return this.path;
  }
  getUrl(): string {
    return this.url;
  }
  getAcceptHeader(): string {
    return "application/json";
  }
  getUserAgent(): string {
    return this.userAgent;
  }
}

export type McpPaymentOutcome =
  | { kind: "payment-required"; status: number; body: unknown; challenge?: unknown }
  /**
   * `verifiedPayer` is the account the facilitator confirmed SIGNED,
   * carried out so callers scoping per-buyer storage never have to
   * re-derive it from the caller's own unverified meta. It is present
   * even when the facilitator's settle response omits a payer.
   */
  | { kind: "settled"; payment: SettledPayment; verifiedPayer?: string }
  /**
   * A cached purchase, returned instead of settling. Reached only from
   * the verified seam below, never from the caller's raw meta.
   */
  | { kind: "replay"; body: Record<string, unknown> };

/**
 * Asked once, at the ONE moment the payer is known to be real: after
 * the facilitator verified the signature and before any money moves.
 * Returning a body short-circuits into a replay.
 *
 * A callback rather than a return value because the answer has to be
 * acted on INSIDE the pipeline — the caller cannot be trusted to check
 * afterwards, since "afterwards" is already past settlement.
 */
export type VerifiedPayerCheck = (
  payer: string,
) => Promise<Record<string, unknown> | null>;

function encodePaymentMeta(meta: unknown): string | undefined {
  if (typeof meta === "string" && meta.length > 0) {
    return meta;
  }
  if (meta && typeof meta === "object") {
    return btoa(JSON.stringify(meta));
  }
  return undefined;
}

function decodeChallengeHeader(headers: Record<string, string>): unknown {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "payment-required") {
      try {
        return JSON.parse(atob(value)) as unknown;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Run the full payment pipeline for one MCP purchase. Returns either
 * the 402 challenge to relay or a settled payment ready to fulfill.
 */
export async function runMcpPayment(
  env: Env,
  itemId: string,
  paymentMeta: unknown,
  signals: EventSignals,
  onVerifiedPayer?: VerifiedPayerCheck,
): Promise<McpPaymentOutcome> {
  const path = `/api/buy/${itemId}`;
  const stack = getPaymentStack(env);
  const adapter = new McpBuyAdapter(
    `${env.STORE_BASE_URL}${path}`,
    path,
    encodePaymentMeta(paymentMeta),
    signals.userAgent ?? "mcp-client",
  );
  const paymentHeader = encodePaymentMeta(paymentMeta);

  // THE PRE-FLIGHT, same as the HTTP door. Added 2026-07-29: this door
  // had its own copy of the pipeline and therefore none of the
  // diagnosis, which is exactly the shape of bug CV asked about — a
  // fix that looks shared and isn't.
  const preflight = preflightBlockers(paymentHeader);
  const refused = preflightRefusalBody(preflight);
  if (refused) {
    await recordChallengeIssued(env, path, signals);
    await recordPaymentDecline(env, path, refused.reason, signals).catch(
      () => undefined,
    );
    return {
      kind: "payment-required",
      status: 402,
      body: {
        error:
          "The payment payload is malformed against the x402 v2 schema, so nothing was charged and the facilitator was never called.",
        payment_declined: refused,
      },
    };
  }

  // The decline slot rides the context exactly as it does on the HTTP
  // side; the SDK shallow-copies it through to the verify hooks.
  const declineSlot: DeclineSlot = {};
  const context: HTTPRequestContext = {
    adapter,
    path,
    method: "GET",
    [DECLINE_SLOT_KEY]: declineSlot,
  } as HTTPRequestContext;
  await stack.initialized;

  let result: Awaited<ReturnType<typeof stack.httpServer.processHTTPRequest>>;
  try {
    result = await stack.httpServer.processHTTPRequest(context);
  } catch (error) {
    await sendAlert(env, {
      condition: "settlement_failure",
      detail: `MCP processHTTPRequest threw for ${itemId}: ${String(error)}`,
    });
    throw error;
  }

  if (result.type === "no-payment-required") {
    // Every buy path is gated; treat an ungated result as a hard stop.
    throw new Error(`MCP purchase path unexpectedly ungated: ${path}`);
  }
  if (result.type === "payment-error") {
    if (result.response.status === 402) {
      await recordChallengeIssued(env, path, signals);
    }
    let body = result.response.body;
    // BOOK IT. Until 2026-07-29 this door recorded no declines at all,
    // so an agent bouncing off MCP was invisible in the one instrument
    // built to catch a buyer bouncing. The HTTP door alarmed; this one
    // shrugged.
    if (paymentHeader && result.response.status === 402) {
      const nonceForJoin = extractPaymentNonce(
        decodePaymentHeader(paymentHeader),
      );
      const known =
        declineSlot.reason ??
        (nonceForJoin ? takeDeclineReason(nonceForJoin) : undefined);
      const diagnosis = diagnoseDecline(
        result.response.headers,
        paymentHeader,
        known,
      );
      await recordPaymentDecline(
        env,
        path,
        bookedReason(
          diagnosis.decline?.reason ?? "unspecified:reason_not_captured",
          diagnosis.payloadProblems,
        ),
        signals,
      ).catch(() => undefined);
      if (diagnosis.decline) {
        body = {
          ...(isRecord(body) ? body : {}),
          payment_declined: {
            reason: diagnosis.decline.reason,
            ...(diagnosis.decline.message
              ? { message: diagnosis.decline.message }
              : {}),
            note: "The signed payment was not accepted; no money moved and nothing left the shelf.",
            ...(diagnosis.mismatch
              ? { requirement_mismatch: diagnosis.mismatch }
              : {}),
            ...(diagnosis.payloadProblems.length > 0
              ? { payload_problems: diagnosis.payloadProblems }
              : {}),
          },
        };
      }
    }
    const outcome: McpPaymentOutcome = {
      kind: "payment-required",
      status: result.response.status,
      body,
    };
    const challenge = decodeChallengeHeader(result.response.headers);
    if (challenge !== undefined) {
      outcome.challenge = challenge;
    }
    return outcome;
  }

  /**
   * THE IDEMPOTENCY REPLAY, asked here and nowhere earlier, for the
   * same reason as the HTTP door: until this line the payer is only an
   * address the CALLER wrote into `_meta`, decoded and never checked.
   * Serving a cached purchase off that would hand a buyer's goods to
   * anyone who asserted their (publicly visible) wallet address and
   * knew the key. `result.paymentPayload` has been through the
   * facilitator, so this payer actually signed.
   */
  if (onVerifiedPayer) {
    const verifiedPayer = payerOfVerifiedPayload(result.paymentPayload);
    if (verifiedPayer) {
      const cached = await onVerifiedPayer(verifiedPayer);
      if (cached) {
        return { kind: "replay", body: cached };
      }
    }
  }

  // Verified. Same replay guard as the HTTP door.
  const nonce = extractPaymentNonce(result.paymentPayload);
  if (nonce && (await isNonceSpent(env, nonce))) {
    return {
      kind: "payment-required",
      status: 402,
      body: {
        error:
          "That payment authorization has been through this till once already. Sign a fresh one, the register remembers.",
      },
    };
  }

  let settlement: Awaited<ReturnType<typeof stack.httpServer.processSettlement>>;
  try {
    settlement = await stack.httpServer.processSettlement(
      result.paymentPayload,
      result.paymentRequirements,
      result.declaredExtensions,
      { request: context },
    );
  } catch (error) {
    await sendAlert(env, {
      condition: "settlement_failure",
      detail: `MCP processSettlement threw for ${itemId}: ${String(error)}`,
    });
    throw error;
  }
  await persistBazaarObservations(env, path);
  if (!settlement.success) {
    await recordPaymentDecline(
      env,
      path,
      `settle:${settlement.errorReason}`,
      signals,
    ).catch(() => undefined);
    return {
      kind: "payment-required",
      status: 402,
      body: settlement.response.body,
    };
  }
  if (nonce) {
    await recordSpentNonce(env, nonce, path);
  }

  const minimumUsdc = minimumUsdcForPath(path);
  const paidUsdc = atomicToUsdc(result.paymentRequirements.amount);
  const settlementSignals: Parameters<typeof recordSettlement>[2] = {
    ...signals,
    paidUsdc,
    minimumUsdc,
  };
  // Same fallback as the HTTP door: a settle with no payer would book
  // as organic, and the house flag is decided by wallet.
  const payer = settlement.payer ?? payerFromPaymentHeader(paymentHeader);
  if (payer) {
    settlementSignals.payer = payer;
  }
  await recordSettlement(env, path, settlementSignals);

  const payment: SettledPayment = {
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, minimumUsdc),
    transaction: settlement.transaction,
    settleHeaders: settlement.headers,
  };
  if (settlement.network) {
    payment.network = settlement.network;
  }
  if (settlement.payer) {
    payment.payer = settlement.payer;
  }
  if (payment.network === SOLANA_NETWORK) {
    // Same unreconciled-cap meter as the HTTP gate; the MCP door is
    // not a way around the bound.
    await recordSolanaSettle(env, paidUsdc).catch(() => undefined);
  }
  const verifiedPayer = payerOfVerifiedPayload(result.paymentPayload);
  return {
    kind: "settled",
    payment,
    ...(verifiedPayer ? { verifiedPayer } : {}),
  };
}
