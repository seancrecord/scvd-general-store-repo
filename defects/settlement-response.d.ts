export const SETTLEMENT_RESPONSE_BATTERY: "settlement-response-v1";
export const SETTLEMENT_RESPONSE_CHECKS: readonly [
  "json",
  "success-boolean",
  "transaction-string",
  "network-caip2",
  "error-reason-string",
  "error-reason-on-success",
  "pending-names-transaction",
  "payer-string",
  "amount-atomic",
];
export type SettlementResponseCheck = (typeof SETTLEMENT_RESPONSE_CHECKS)[number];
export const SETTLEMENT_OUTCOMES: readonly ["settled", "failed", "unresolved"];
export type SettlementOutcome = (typeof SETTLEMENT_OUTCOMES)[number];
export interface SettlementCheckResult {
  check: SettlementResponseCheck;
  /** true passed, false failed, null not reached. */
  ok: boolean | null;
  detail: string;
}
export interface SettlementReading {
  battery: "settlement-response-v1";
  outcome: SettlementOutcome;
  reading: string;
  decoded: Record<string, unknown> | null;
  checks: SettlementCheckResult[];
  failed: SettlementResponseCheck[];
}
export function decodeSettlementResponse(raw: unknown): Record<string, unknown> | null;
export function readSettlementResponse(raw: unknown): SettlementReading;
