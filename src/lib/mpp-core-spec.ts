/** Frozen source identity and core facts; importing metadata brings in no runtime reader. */
export const MPP_CORE_BATTERY = "mpp-core-v1";
export const MPP_CORE_SPEC = {
  draft: "draft-01",
  url: "https://github.com/tempoxyz/mpp-specs/blob/2e3de24c07a9218456bd8814d6746a0dad941d06/specs/core/draft-httpauth-payment-01.md",
  sha256: "30dd795d27e3b0df832daffdcf2441975d10099a01a6e8f74aece19d9500d54c",
} as const;

export const MPP_CORE_HEADER_LIMIT = 16_384;

export const MPP_CORE_PROBLEM_PREFIX = "https://paymentauth.org/problems/";
export const MPP_CORE_PROBLEMS: Readonly<Record<string, number>> = {
  "payment-required": 402, "payment-insufficient": 402, "payment-expired": 402,
  "verification-failed": 402, "method-unsupported": 400, "malformed-credential": 402,
  "invalid-challenge": 402, "bad-request": 400, "invalid-payload": 402,
  "internal-payment-error": 500, "payment-action-required": 402,
};
