import { readerClass } from "@/lib/channel";
import { porchSurface, porchSurfaceKind } from "@/lib/porch-surface";

/** A request step, never an invented visitor or a claim of settlement. */
export function agentJourneyStep(request: Request, status: number) {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/admin")) return undefined;
  const surface = porchSurface(path, request.method);
  const kind = surface ? porchSurfaceKind(surface) : undefined;
  const paid = path.startsWith("/api/buy/");
  const stage = paid ? "paid_door"
    : path.startsWith("/api/verify/") ? "artifact_verification"
    : path.startsWith("/mcp") ? "mcp_exchange"
    : kind === "instrument" ? "free_instrument"
    : kind === "evidence" ? "evidence_read"
    : kind === "storefront" ? "discovery"
    : "other";
  // Explicit researcher-supplied experiment IDs can join controlled runs.
  // Ordinary traceparent, UAs, IPs and wallets never become session keys.
  const study = request.headers.get("X-SCVD-Study");
  const enrolled = request.headers.get("X-SCVD-Study-Consent") === "record"
    && study !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(study);
  return {
    version: 1,
    stage,
    surface: surface ?? (paid ? "paid_door" : "unclassified"),
    reader: readerClass(request.headers.get("User-Agent") ?? undefined, request.headers.get("Accept") ?? undefined),
    model: "unknown",
    outcome: status === 402 ? "payment_required"
      : status === 429 ? "rate_limited"
      : status >= 500 ? "server_error"
      : status >= 400 ? "request_refused"
      : status >= 300 ? "redirect_or_cache"
      : "http_success",
    join: enrolled ? "declared_study" : "unlinked",
    ...(enrolled ? { study_id: study.toLowerCase(), study_verified: false } : {}),
  };
}
