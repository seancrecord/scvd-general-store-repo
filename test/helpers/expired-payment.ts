import { afterEach, beforeEach, vi } from "vitest";
import { NOW } from "./buyer-harness";

let originalFetch: typeof fetch;
export function installExpiredPaymentFixture() {
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { vi.stubGlobal("fetch", originalFetch); vi.restoreAllMocks(); vi.setSystemTime(NOW); });
}
/** Explicit verifier-policy simulation; signatures are real local fixtures. */
export function refuseSpentVerification() {
  vi.setSystemTime(new Date(+NOW + 10 * 60 * 1000));
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/x402/verify")) return Response.json({ isValid: false, invalidReason: "fixture_authorization_expired_or_spent" });
    return inner(input, init);
  });
}
