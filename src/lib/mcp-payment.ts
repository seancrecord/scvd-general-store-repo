import type { HTTPAdapter, HTTPRequestContext } from "@x402/core/server";
import { sendAlert } from "@/lib/alerts";
import { persistBazaarObservations } from "@/lib/bazaar-observer";
import type { EventSignals } from "@/lib/metrics";
import { recordChallengeIssued, recordSettlement } from "@/lib/metrics";
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
  recordSpentNonce,
} from "@/lib/replay-guard";
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
  | { kind: "settled"; payment: SettledPayment };

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
): Promise<McpPaymentOutcome> {
  const path = `/api/buy/${itemId}`;
  const stack = getPaymentStack(env);
  const adapter = new McpBuyAdapter(
    `${env.STORE_BASE_URL}${path}`,
    path,
    encodePaymentMeta(paymentMeta),
    signals.userAgent ?? "mcp-client",
  );
  const context: HTTPRequestContext = {
    adapter,
    path,
    method: "GET",
  };
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
    const outcome: McpPaymentOutcome = {
      kind: "payment-required",
      status: result.response.status,
      body: result.response.body,
    };
    const challenge = decodeChallengeHeader(result.response.headers);
    if (challenge !== undefined) {
      outcome.challenge = challenge;
    }
    return outcome;
  }

  // Verified. Same replay guard as the HTTP door.
  const nonce = extractPaymentNonce(result.paymentPayload);
  if (nonce && (await isNonceSpent(env, nonce))) {
    return {
      kind: "payment-required",
      status: 402,
      body: {
        error:
          "That payment authorization has been through this till once already. Sign a fresh one — the register remembers.",
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
  if (settlement.payer) {
    settlementSignals.payer = settlement.payer;
  }
  await recordSettlement(env, path, settlementSignals);

  const payment: SettledPayment = {
    paidUsdc,
    tipUsdc: tipFromPaid(paidUsdc, minimumUsdc),
    transaction: settlement.transaction,
    settleHeaders: settlement.headers,
  };
  if (settlement.payer) {
    payment.payer = settlement.payer;
  }
  return { kind: "settled", payment };
}
