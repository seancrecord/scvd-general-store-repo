/** Pure wire format shared by the payout gate and isolated observation reader. */
export const SANCTIONS_ORACLE_BASE =
  "0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B";
export const IS_SANCTIONED_SELECTOR = "0xdf592f7d";
const BOOL_TRUE = `0x${"0".repeat(63)}1`;
const BOOL_FALSE = `0x${"0".repeat(64)}`;

export function oracleCalldata(address: string): string | null {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
    ? IS_SANCTIONED_SELECTOR + address.slice(2).toLowerCase().padStart(64, "0")
    : null;
}

export function decodeOracleBoolean(raw: unknown): boolean | null {
  if (raw === BOOL_TRUE) return true;
  if (raw === BOOL_FALSE) return false;
  return null;
}
