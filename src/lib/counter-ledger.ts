import type { CounterLedger } from "@/services/counter-ledger";
import type { Env } from "@/types";

/**
 * The counter ledger's address book (lib, because lib/metrics.ts is
 * the caller and lib does not import services). The object itself is
 * services/counter-ledger.ts; this file only says which object a key
 * belongs to and hands back its stub.
 */

/** Which object a key belongs to: month and kind for metrics, a slice of the address for payer rows. */
export function ledgerShardName(key: string): string {
  const parts = key.split(":");
  if (parts[0] === "metric" && parts.length >= 3) return `${parts[1]}/${parts[2]}`;
  if (parts[0] === "payer" && parts[1]) {
    const address = parts[1];
    return `payer/${address.startsWith("0x") ? address.slice(2, 3) : address.slice(0, 1)}`;
  }
  return "misc";
}

/** The ledger stub for a key, or null where the binding is absent (fail-open, see above). */
export function counterLedger(
  env: Env,
  key: string,
): DurableObjectStub<CounterLedger> | null {
  const namespace = env.COUNTER_LEDGER;
  if (!namespace) return null;
  return namespace.get(namespace.idFromName(ledgerShardName(key)));
}

/** Whether counters are serialized on this deployment. For the desk. */
export function countersSerialized(env: Env): boolean {
  return Boolean(env.COUNTER_LEDGER);
}
