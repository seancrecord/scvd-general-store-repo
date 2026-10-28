import {formatUnits} from "viem";
import {canonicalAddress} from "@/lib/addresses";
import {CREDIT_IDLE_EXPIRY_DAYS} from "@/lib/credit-terms";
import {KV_KEYS} from "@/lib/kv-keys";
import {listKeys} from "@/lib/kv-list";
import {bulkGetJson} from "@/lib/kv-bulk";
import {USDC_DECIMALS} from "@/lib/payments";
import {isRecord, type Env} from "@/types";

export const CREDIT_INVENTORY_SCAN_CAP = 100;

/** Read stored balances directly: getCredit would expire them and write on a desk visit. */
export async function readCreditInventory(env: Env, now = Date.now()) {
  const gaps = new Set<string>();
  let recordsRead = 0, validRecords = 0, truncated = false, claimMarkers = 0;
  let retained = 0n, idle = 0n;
  try {
    const keys = await listKeys(env.COUNTERS, {prefix: KV_KEYS.creditPrefix, cap: CREDIT_INVENTORY_SCAN_CAP});
    recordsRead = keys.names.length;
    truncated = keys.truncated;
    if (truncated) gaps.add("credit_truncated");
    const rows = await bulkGetJson<unknown>(env.COUNTERS, keys.names);
    for (const key of keys.names) {
      const row = rows.get(key);
      if (row === null || row === undefined) {gaps.add("credit_record_unavailable"); continue;}
      if (!isRecord(row) || typeof row.wallet !== "string" || !row.wallet.trim() ||
          KV_KEYS.credit(canonicalAddress(row.wallet)) !== key ||
          typeof row.balance_atomic !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(row.balance_atomic) ||
          typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at)) || Date.parse(row.updated_at) > now ||
          row.claimed_by !== undefined && (typeof row.claimed_by !== "string" || !row.claimed_by)) {
        gaps.add("credit_record_invalid"); continue;
      }
      validRecords++;
      const amount = BigInt(row.balance_atomic);
      retained += amount;
      if (now - Date.parse(row.updated_at) >= CREDIT_IDLE_EXPIRY_DAYS * 86400000) idle += amount;
      if (row.claimed_by) claimMarkers++;
    }
  } catch {gaps.add("credit_unavailable");}
  const complete = gaps.size === 0;
  return {
    read_at: new Date(now).toISOString(), scan_complete: complete,
    coverage: {records_read: recordsRead, valid_records: validRecords, truncated, cap: CREDIT_INVENTORY_SCAN_CAP},
    gaps: [...gaps],
    observed: {
      retained_balance_atomic: retained.toString(), retained_balance_usdc: formatUnits(retained, USDC_DECIMALS),
      idle_expiry_due_subset_atomic: idle.toString(), idle_expiry_due_subset_usdc: formatUnits(idle, USDC_DECIMALS),
      claim_marker_records: claimMarkers,
    },
    retained_balance_atomic: complete ? retained.toString() : null,
    retained_balance_usdc: complete ? formatUnits(retained, USDC_DECIMALS) : null,
    limits: `A bounded, non-atomic read of stored credit balances; recent KV writes may be absent. Idle-expiry-due balances (${CREDIT_IDLE_EXPIRY_DAYS} days) remain in the retained total: this page does not expire credit. Claim markers can remain after signing and do not prove a pending or completed payment. A claimed balance may already be zero while its cash-out authorization remains outstanding. Credit accrual is not reserved in the shared wallet ledger; cash-out holds are a separate view. Do not add these readings to wallet holds or infer spendable funds, complete debt coverage or permission to raise caps.`,
  };
}
