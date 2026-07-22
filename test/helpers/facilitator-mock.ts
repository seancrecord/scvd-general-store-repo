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
  webhookCalls: WebhookCall[];
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

export function installFacilitatorMock(): FacilitatorMockState {
  const state: FacilitatorMockState = {
    settleShouldFail: false,
    verifyShouldFail: false,
    webhookCalls: [],
  };

  const mockFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = requestUrl(input);

    if (url.endsWith("/x402/supported")) {
      return Response.json({
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
        extensions: [],
        signers: {},
      });
    }
    if (url.endsWith("/x402/verify")) {
      if (state.verifyShouldFail) {
        return Response.json({
          isValid: false,
          invalidReason: "insufficient_funds",
          payer: TEST_PAYER,
        });
      }
      return Response.json({ isValid: true, payer: TEST_PAYER });
    }
    if (url.endsWith("/x402/settle")) {
      if (state.settleShouldFail) {
        return Response.json({
          success: false,
          errorReason: "insufficient_funds",
          transaction: "",
          network: "eip155:8453",
          payer: TEST_PAYER,
        });
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
          payer: TEST_PAYER,
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
