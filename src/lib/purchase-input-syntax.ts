/** Shared lexical rules. Chain selection, decoded key length and availability still need runtime checks. */
export const EVM_ADDRESS_PATTERN = "^0x[0-9a-fA-F]{40}$";
export const SOLANA_ADDRESS_PATTERN = "^[1-9A-HJ-NP-Za-km-z]{32,44}$";
export const EVM_TRANSACTION_PATTERN = "^0x[0-9a-fA-F]{64}$";
export const SOLANA_SIGNATURE_PATTERN = "^[1-9A-HJ-NP-Za-km-z]{64,88}$";
export const SPOT_CHECK_HOST_PATTERN = "^[a-zA-Z0-9][a-zA-Z0-9.-]*\\.[a-zA-Z0-9-]+$";

/** Purchase inputs are trimmed before validation; document that same accepted syntax. */
export function trimmedInputPattern(...patterns: string[]): string {
  return `^\\s*(?:${patterns.map(pattern => pattern.slice(1, -1)).join("|")})\\s*$`;
}
export const SUBJECT_ADDRESS_PATTERN = trimmedInputPattern(EVM_ADDRESS_PATTERN, SOLANA_ADDRESS_PATTERN);
export const TRANSACTION_ID_PATTERN = trimmedInputPattern(EVM_TRANSACTION_PATTERN, SOLANA_SIGNATURE_PATTERN);
