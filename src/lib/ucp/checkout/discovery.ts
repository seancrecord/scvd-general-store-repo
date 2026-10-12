import { CHECKOUT_STATUSES } from "./state";
import { UCP_VERSION } from "../version";

export const CHECKOUT_CANCELLATION =
  "POST /ucp/v1/checkout-sessions/{id}/cancel withdraws an unfinished checkout without a request body. It returns canceled; repeating cancellation returns the same state. It refuses complete_in_progress and completed with HTTP 409: money may be moving or the purchase already has an order. Read GET /ucp/v1/checkout-sessions/{id} for its current state. This is a state boundary, not a timed refund window. Paid refunds follow /rights#refund-policy; withdrawing a checkout does not reverse a payment.";

const envelope = {
  type: "object",
  required: ["version", "payment_handlers"],
  properties: {
    version: { type: "string", const: UCP_VERSION },
    status: { type: "string", enum: ["success", "error"] },
    payment_handlers: { type: "object", additionalProperties: { type: "array", items: { type: "object" } } },
  },
};
const messages = {
  type: "array", items: {
    type: "object", properties: {
      type: { type: "string" }, code: { type: "string" },
      severity: { type: "string" }, content: { type: "string" },
    },
  },
};

// A response floor for recovery clients. The pinned UCP contract linked
// by the profile describes the full checkout, including its payment handler.
export const UCP_RECOVERY_SCHEMAS = {
  UcpCheckout: {
    type: "object",
    required: ["ucp", "id", "status", "currency", "expires_at", "line_items", "totals", "links"],
    properties: {
      ucp: envelope,
      id: { type: "string" },
      status: { type: "string", enum: [...CHECKOUT_STATUSES] },
      currency: { type: "string", enum: ["USD"] },
      expires_at: { type: "string", format: "date-time", description: "Deadline for accepting Complete, not a refund deadline." },
      line_items: { type: "array", items: { type: "object" } },
      totals: { type: "array", items: { type: "object" } },
      links: { type: "array", items: { type: "object", required: ["type", "url"], properties: { type: { type: "string" }, url: { type: "string", format: "uri" } } } },
      messages,
    },
  },
  UcpRecoveryError: { type: "object", required: ["ucp", "messages"], properties: { ucp: envelope, messages } },
};

const parameters = [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "The checkout id returned when creating the session." }];
function response(description: string, schema: keyof typeof UCP_RECOVERY_SCHEMAS = "UcpCheckout") {
  return { description, content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } };
}
const notFound = response("No such checkout. UCP error envelope.", "UcpRecoveryError");

export function ucpRecoveryPaths(base: string, edgeResponses: Record<string, unknown>) {
  return {
    "/ucp/v1/checkout-sessions/{id}": {
      get: {
        security: [],
        summary: "Read a UCP checkout",
        description: "Read current checkout state, including an in-flight completion. Poll here instead of submitting payment again. The UCP profile at /.well-known/ucp links the full shopping contract.",
        parameters,
        responses: { ...edgeResponses, "200": response("Current checkout."), "404": notFound },
      },
    },
    "/ucp/v1/checkout-sessions/{id}/cancel": {
      post: {
        security: [],
        summary: "Cancel an unfinished UCP checkout",
        description: CHECKOUT_CANCELLATION,
        parameters,
        externalDocs: { url: `${base}/rights#checkout-cancellation`, description: "Cancellation and refund boundaries" },
        responses: {
          ...edgeResponses,
          "200": response("Checkout canceled, including a repeated cancellation."),
          "404": notFound,
          "409": response("Checkout completed or completion in progress; unchanged checkout with an error message."),
        },
      },
    },
  };
}
