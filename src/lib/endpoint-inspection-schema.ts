import { INSPECTION_VERSION, INSPECTION_TERM_LIMIT } from "../../x402-preflight/inspection.js";

/** One discoverable contract for HTTP and the tool catalogue; this adds no battery. */
export const ENDPOINT_INSPECTION_SCHEMA = {
  type: "object",
  description: "One unpaid response, with observed protocols, unverified advertised term summaries, existing structural findings and coverage gaps. The x402 verdict retains its meaning. No artifact signature verification, payment signing, payment submission, settlement or delivery check.",
  properties: {
    version: { type: "string", enum: [INSPECTION_VERSION] },
    subject_url: { type: "string" },
    observed_at: { type: "string", format: "date-time" },
    reachability: { type: "object", properties: {
      state: { type: "string", enum: ["responded", "unreachable", "method_unresolved"] },
      http_status: { type: ["integer", "null"] }, method: { type: ["string", "null"] },
    } },
    protocols: { type: "object", properties: {
      state: { type: "string", enum: ["read", "partial", "unobserved"] },
      observed: { type: "array", uniqueItems: true, items: { type: "string", enum: ["x402", "mpp"] } },
      scope: { type: "string" },
    } },
    terms: { type: "object", description: `Unverified summaries, at most ${INSPECTION_TERM_LIMIT} entries per protocol, each with state, entries, total and omitted. Not complete payment instructions.` },
    structure: { type: "object", description: "Existing x402, frozen MPP and MPP core batteries, checked counts and failed check names. MPP core also names unmeasured checks; no global readiness verdict." },
    coverage: { type: "object", description: "Body read / over_limit / unobserved and MPP core read / absent / unmeasured." },
    signatures: { type: "object", properties: { state: { type: "string", enum: ["not_checked"] }, reason: { type: "string" } } },
    unperformed: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
  },
};
