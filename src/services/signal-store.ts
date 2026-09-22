import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";

/**
 * THE SIGNAL STORE (2026-09-21) — one writer for the buyer-signals
 * maps, so a count is a count and a cap is a number on the page.
 *
 * WHAT HAPPENED. The signals (services/buyer-signals.ts) were JSON
 * maps in one KV key per kind per month, read-modify-write on every
 * page read. KV allows one write a second per key and has no
 * compare-and-swap, so the maps were floors; and to keep the JSON
 * small each map had a key cap — 400 for subjects and receipts —
 * past which every new key landed in "other" and nothing on any page
 * said so. The September read then quoted "299 hosts re-read" off a
 * map that could hold 400 of the corpus's 6,300, with the overflow
 * invisible. A cap nobody can see is a denominator nobody can check.
 *
 * WHAT THIS IS. A Durable Object with a SQLite table, one row per
 * (month, kind, entry), bumped by one statement that cannot
 * interleave (the counter ledger's own argument, services/
 * counter-ledger.ts). No cap on a map whose keys the store itself
 * bounds — a subject is a host the chain has met, a receipt is a
 * certificate that exists, a crawler is a name from the tables. One
 * cap survives, on the map whose keys a stranger can invent (the
 * referrer hosts), and it is returned with the reading so the page
 * prints it beside the number.
 *
 * NOT MIRRORED INTO KV, on purpose. The counter ledger mirrors every
 * key into `metric:<month>:…`, and the porch ledger scans that prefix
 * under a 5,000-key cap (lib/metrics.ts METRIC_KEY_CAP): six
 * thousand subject keys mirrored there would truncate the observatory
 * to make the signals exact. The readers of these maps (the admin
 * page, the weekly issue, the public histogram) read this object
 * directly, in one call per month.
 *
 * FAIL-OPEN, SAID OUT LOUD. Without the binding (the doors worker,
 * a preview upload before the migration) the writer falls back to the
 * KV maps exactly as before, caps and all, and the reading says which
 * path it came from.
 *
 * ONE OBJECT, NAMED "signals". A few thousand writes a day; the
 * serialization is the point and the volume is nowhere near a
 * single object's ceiling. Months older than KEEP_MONTHS are reaped
 * on write, matching the KV keys' expiry with the month's ledger.
 */

/** Months of signals kept; the KV maps expired with the month's ledger and these should not outlive them by much. */
export const SIGNAL_KEEP_MONTHS = 6;

export interface SignalBump {
  month: string;
  kind: string;
  entry: string;
  /** When set, a new entry past this many keys in the (month, kind) map lands in "other". */
  cap?: number;
}

export class SignalStore extends DurableObject<Env> {
  private schema(): SqlStorage {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS signals (month TEXT NOT NULL, kind TEXT NOT NULL, entry TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY (month, kind, entry))",
    );
    return sql;
  }

  /** Add one to an entry; a capped map's overflow goes to "other". Returns the entry that was bumped. */
  async bump(bump: SignalBump): Promise<string> {
    const sql = this.schema();
    let entry = bump.entry;
    if (bump.cap !== undefined && entry !== "other") {
      const exists = sql
        .exec<{ n: number }>("SELECT COUNT(*) AS n FROM signals WHERE month = ? AND kind = ? AND entry = ?", bump.month, bump.kind, entry)
        .one().n;
      if (exists === 0) {
        const keys = sql
          .exec<{ n: number }>("SELECT COUNT(*) AS n FROM signals WHERE month = ? AND kind = ? AND entry != 'other'", bump.month, bump.kind)
          .one().n;
        if (keys >= bump.cap) entry = "other";
      }
    }
    sql.exec(
      "INSERT INTO signals (month, kind, entry, value) VALUES (?, ?, ?, 1) ON CONFLICT(month, kind, entry) DO UPDATE SET value = value + 1",
      bump.month,
      bump.kind,
      entry,
    );
    return entry;
  }

  /** One kind's map for a month. */
  async readKind(month: string, kind: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const row of this.schema().exec<{ entry: string; value: number }>(
      "SELECT entry, value FROM signals WHERE month = ? AND kind = ?",
      month,
      kind,
    )) {
      out[row.entry] = row.value;
    }
    return out;
  }

  /** Every kind's map for a month, in one call: what the readers ask for. */
  async readMonth(month: string): Promise<Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, number>> = {};
    for (const row of this.schema().exec<{ kind: string; entry: string; value: number }>(
      "SELECT kind, entry, value FROM signals WHERE month = ?",
      month,
    )) {
      (out[row.kind] ??= {})[row.entry] = row.value;
    }
    return out;
  }

  /** Drop months older than the keep window. Called by the writer now and then; cheap when there is nothing to drop. */
  async reap(now: Date = new Date()): Promise<number> {
    const floor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - SIGNAL_KEEP_MONTHS, 1));
    const cutoff = `${floor.getUTCFullYear()}-${String(floor.getUTCMonth() + 1).padStart(2, "0")}`;
    const sql = this.schema();
    const before = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM signals WHERE month < ?", cutoff).one().n;
    sql.exec("DELETE FROM signals WHERE month < ?", cutoff);
    return before;
  }

  /** Forget everything. For the test pool; nothing in production calls this. */
  async reset(): Promise<void> {
    this.schema().exec("DELETE FROM signals");
  }
}

/** The one object, or undefined where the binding is absent (fail-open to KV). */
export function signalStore(env: Env): DurableObjectStub<SignalStore> | undefined {
  const ns = env.SIGNALS;
  if (!ns) return undefined;
  return ns.get(ns.idFromName("signals"));
}
