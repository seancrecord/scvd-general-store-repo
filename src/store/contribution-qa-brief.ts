export const QA_CASE_PATHS = [
  "/api/bounties/contributions", "/api/bounties/contributions/qa-read-only-missing-case",
  "/api/bounties", "/bounties", "/api/field-study", "/field-study", "/what",
  "/llms.txt", "/menu.json", "/.well-known/x402.json", "/openapi.json", "/api/buy/hello",
] as const;
export function contributionQaBrief(base: string, now: number) {
  return {kind: "docs", title: "Check free work discovery, public contracts and payment-route instructions", target: `${base}/api/bounties/contributions`,
    reward_usd: 6, slots: 1, review_days: 3, payment_days: 3,
    expires_at: new Date(now + 7 * 86400000).toISOString().slice(0,16),
    brief: `Attempt these ${QA_CASE_PATHS.length} agreed cases using GET only, in order: ${QA_CASE_PATHS.map(p => base + p).join(", ")}. For each, compare the published contract with the response, including documented errors, empty availability, prices, payment networks and redemption prerequisites. The missing-case path is a documented missing-record check; if a real task exists there, report that and do not interact with it. The buy path is an unsigned 402 inspection only: never attach a payment signature or follow a paid flow. At most one initial request and one retry per case, serially; stop after 45 minutes. Record timestamps, exact redacted requests/results, expected versus observed behavior and limits. No load tests, security probes, purchases, enrollment or third-party endpoint calls. Reservation and final private submission are outside the observation cases.`,
    acceptance: `A private reproducible report covering each of the ${QA_CASE_PATHS.length} cases as attempted or blocked, with the exact point reached, cited expectations, actual observations and limitations. Correct behavior, empty boards and honest blocks qualify. A safety or time-limit stop qualifies when recorded with unattempted cases named. No defect, praise, public post or further purchase required. Reward is a signed Base USDC authorization after review and keeper approval, not a direct transfer. Worker arranges redemption and gas; SCVD sponsors no gas.`,
  };
}
