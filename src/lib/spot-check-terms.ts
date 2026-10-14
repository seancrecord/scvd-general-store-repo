import { SPOT_CHECK_HOST_PATTERN } from "@/lib/purchase-input-syntax";

export const SPOT_UNIT_PRICE_USDC = 0.001;
export const SPOT_BATCH_MIN = 2;
export const SPOT_BATCH_MAX = 10;
export const SPOT_BATCH_PRICE_USDC = SPOT_UNIT_PRICE_USDC * SPOT_BATCH_MAX;
export const CHANGE_CHECK_PRICE_USDC = 0.005;
export const SPOT_HOSTS_INPUT_CAP = SPOT_BATCH_MAX * 260;
export const SPOT_HOSTS_DESCRIPTION = `A JSON array of ${SPOT_BATCH_MIN} to ${SPOT_BATCH_MAX} distinct bare hostnames. Fixed batch price, including smaller batches; no live probes. Unknown hosts remain named gaps.`;
export const BASELINE_CERT_PATTERN = "^cert_[a-zA-Z0-9_-]{1,64}$";
export function spotHosts(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length > SPOT_HOSTS_INPUT_CAP) throw new Error(SPOT_HOSTS_DESCRIPTION);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(SPOT_HOSTS_DESCRIPTION); }
  if (!Array.isArray(value) || value.length < SPOT_BATCH_MIN || value.length > SPOT_BATCH_MAX) throw new Error(SPOT_HOSTS_DESCRIPTION);
  const hosts: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length > 253 || !new RegExp(SPOT_CHECK_HOST_PATTERN).test(entry.trim())) throw new Error(SPOT_HOSTS_DESCRIPTION);
    const host = entry.trim().toLowerCase();
    if (hosts.includes(host)) throw new Error("Give distinct hostnames; duplicates are not extra readings.");
    hosts.push(host);
  }
  return hosts;
}
