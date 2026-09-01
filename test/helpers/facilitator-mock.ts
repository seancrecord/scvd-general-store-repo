import { vi } from "vitest";

/**
 * Mocks outbound fetch: the CDP facilitator endpoints (supported / verify /
 * settle) and the order-completion webhook target. Everything else fails
 * loudly so tests never leak onto the real network.
 */

export const TEST_PAYER = "0x2222222222222222222222222222222222222222";
export const TEST_TRANSACTION = `0x${"ab".repeat(32)}`;
const WEBHOOK_HOST = "https://webhook.example.com";

export interface WebhookCall {
  url: string;
  body: unknown;
}

export interface FacilitatorMockState {
  settleShouldFail: boolean;
  verifyShouldFail: boolean;
  /** The facilitator's own words for a failed verify; the default is the funds case. */
  verifyInvalidReason?: string;
  /**
   * Consecutive settle calls that die the way the real facilitator
   * died on 2026-08-07: a bare HTTP 502 with Cloudflare's plain-text
   * body, no JSON, no verdict. Each such call decrements the counter,
   * so `1` models a blip (retry saves the sale) and `2` an outage
   * (retry burns too, decline books). Distinct from settleShouldFail,
   * which is the facilitator ANSWERING no — that shape must never
   * trigger a retry.
   */
  settleTransient502s: number;
  /**
   * Consecutive settle calls answered with the V1 DUPLICATE shape,
   * byte-for-byte what CV's run recorded against the real CDP
   * facilitator on 2026-08-25: HTTP 400, success:false,
   * errorReason "invalid_payload" (overloaded — the same code means
   * "malformed"), errorMessage "authorization nonce already
   * submitted; transaction already on-chain", and — the load-bearing
   * field — the ORIGINAL transaction hash, populated on the FAILED
   * response. This is the answer a settle retry gets when the first
   * attempt landed but its response was lost.
   */
  settleDuplicateAnswers: number;
  /** Every settle call, verdicts and 502s alike — the retry counter. */
  settleCalls: number;
  /**
   * A successful settle that comes back with no payer address. Not
   * hypothetical: the store's `nopayer` counter exists because real
   * settles have arrived this way, and the house flag is decided by
   * wallet, so this is the shape that can turn a house buy into the
   * store's first "organic" sale.
   */
  settleOmitsPayer: boolean;
  webhookCalls: WebhookCall[];
  /**
   * EIP-3009 nonces this mock has already settled. The chain enforces
   * nonce-once (TransferWithAuthorization reverts on reuse); a mock
   * that settles the same authorization twice is LOOSER than reality,
   * and the store's KV replay guard alone can race (read-modify-write,
   * two isolates both pass before either records). The A.2.b
   * concurrent same-key test was flaky for exactly that reason.
   */
  settledNonces: Set<string>;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function requestBodyJson(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<unknown> {
  try {
    if (typeof init?.body === "string") {
      return JSON.parse(init.body) as unknown;
    }
    if (input instanceof Request) {
      return (await input.clone().json()) as unknown;
    }
  } catch {
    // Not JSON, or unreadable — the caller treats null as "no nonce".
  }
  return null;
}

/**
 * The settle body's wrapping belongs to @coinbase/x402 and has shifted
 * between versions; the nonce's POSITION is not our contract, its
 * PRESENCE is. Deep-search instead of coupling to the wrapper.
 */
function findNonce(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findNonce(entry);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["nonce"] === "string" && record["nonce"].length > 0) {
    return record["nonce"];
  }
  for (const entry of Object.values(record)) {
    const found = findNonce(entry);
    if (found) {
      return found;
    }
  }
  return null;
}

export function installFacilitatorMock(): FacilitatorMockState {
  const state: FacilitatorMockState = {
    settleShouldFail: false,
    verifyShouldFail: false,
    settleTransient502s: 0,
    settleDuplicateAnswers: 0,
    settleCalls: 0,
    settleOmitsPayer: false,
    webhookCalls: [],
    settledNonces: new Set(),
  };

  const mockFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = requestUrl(input);

    if (url.endsWith("/x402/supported")) {
      // Mirrors the REAL facilitator's list (npm run supported:kinds,
      // verified 2026-08-04): both rails, v2 exact. The day this fell
      // behind reality, every payment test failed on route
      // construction — the SDK validates offered networks against
      // this response, so a mock that under-declares breaks routes
      // the real facilitator accepts.
      return Response.json({
        kinds: [
          { x402Version: 2, scheme: "exact", network: "eip155:8453" },
          {
            x402Version: 2,
            scheme: "exact",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            // The real kind carries the facilitator's fee-payer
            // address; the mock's is just a well-formed pubkey.
            extra: { feePayer: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE" },
          },
        ],
        extensions: [],
        signers: {},
      });
    }
    if (url.endsWith("/x402/verify")) {
      if (state.verifyShouldFail) {
        return Response.json({
          isValid: false,
          invalidReason: state.verifyInvalidReason ?? "insufficient_funds",
          payer: TEST_PAYER,
        });
      }
      return Response.json({ isValid: true, payer: TEST_PAYER });
    }
    if (url.endsWith("/x402/settle")) {
      state.settleCalls += 1;
      if (state.settleTransient502s > 0) {
        state.settleTransient502s -= 1;
        // Byte-for-byte the live shape: Cloudflare's canned error body,
        // not JSON, which is what makes @x402/core throw the
        // "Facilitator settle failed (502): ..." string the retry keys on.
        return new Response("error code: 502", { status: 502 });
      }
      if (state.settleDuplicateAnswers > 0) {
        state.settleDuplicateAnswers -= 1;
        // The V1 shape, verbatim fields (see the knob's comment). The
        // 400 status matters: the SDK throws SettleError for a non-OK
        // body carrying `success`, and processSettlement rebuilds the
        // failure WITH the body's transaction field — the wire this
        // knob exists to test.
        return Response.json(
          {
            success: false,
            errorReason: "invalid_payload",
            errorMessage:
              "authorization nonce already submitted; transaction already on-chain",
            transaction: TEST_TRANSACTION,
            network: "eip155:8453",
            payer: TEST_PAYER,
          },
          { status: 400 },
        );
      }
      if (state.settleShouldFail) {
        return Response.json({
          success: false,
          errorReason: "insufficient_funds",
          transaction: "",
          network: "eip155:8453",
          payer: TEST_PAYER,
        });
      }
      // Nonce-once, like the chain: TransferWithAuthorization reverts
      // when an authorization's nonce was already used. Without this
      // the mock settles a replayed signature twice — a success no
      // real facilitator can produce.
      const nonce = findNonce(await requestBodyJson(input, init));
      if (nonce) {
        if (state.settledNonces.has(nonce)) {
          return Response.json({
            success: false,
            errorReason: "nonce_already_used",
            transaction: "",
            network: "eip155:8453",
            payer: TEST_PAYER,
          });
        }
        state.settledNonces.add(nonce);
      }
      // The CDP facilitator reports extension outcomes (e.g. Bazaar
      // discovery) in this header; the store's observer captures it.
      const extensionResponses = btoa(
        JSON.stringify({ bazaar: { status: "accepted" } }),
      );
      return Response.json(
        {
          success: true,
          transaction: TEST_TRANSACTION,
          network: "eip155:8453",
          ...(state.settleOmitsPayer ? {} : { payer: TEST_PAYER }),
        },
        { headers: { "EXTENSION-RESPONSES": extensionResponses } },
      );
    }
    if (url.startsWith(WEBHOOK_HOST)) {
      const rawBody = typeof init?.body === "string" ? init.body : null;
      state.webhookCalls.push({
        url,
        body: rawBody ? (JSON.parse(rawBody) as unknown) : null,
      });
      return new Response("ok");
    }
    throw new Error(`Unexpected outbound fetch in tests: ${url}`);
  };

  vi.stubGlobal("fetch", mockFetch);
  return state;
}

export const TEST_WEBHOOK_URL = `${WEBHOOK_HOST}/hook`;
