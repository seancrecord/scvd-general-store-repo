import { DurableObject } from "cloudflare:workers";
import { kvPut } from "@/lib/kv-retry";
import type { Env, PayerRecord } from "@/types";

/**
 * THE COUNTER LEDGER (2026-09-11) — one writer per counter, because a
 * tally that can lose a count is not a tally.
 *
 * WHAT HAPPENED. One wallet bought 66 times in an afternoon, ten
 * seconds apart. Every counter on the shelf was read, add one, write
 * against Workers KV — and KV caches a read at the edge for up to a
 * minute, allows one write per second per key, and has no
 * compare-and-swap. So the settle tally read stale values and dropped
 * writes, and the storefront said 83 organic settles beside 94
 * certificates. The books check called it "a floor". The keeper
 * called it what it is: the public number was wrong, and the next
 * wallet could be a thousand.
 *
 * WHAT THIS IS. A Durable Object handles one call at a time, so
 * add-one is one indivisible step by construction — the same
 * instrument the bounty locks and the trade nonces already use, for
 * the same reason. The TRUTH of every counter lives in this object's
 * storage. KV keeps a MIRROR of it, written through at most once a
 * second per key and flushed by alarm when writes come faster, so a
 * burst of a thousand sales lands as a thousand and never trips KV's
 * write limit. Every reader on the shelf keeps reading KV exactly as
 * before: each mirrored value is an absolute, so KV converges to the
 * truth within the flush and the propagation window, never below it.
 *
 * SHARDED BY MONTH AND KIND — metric:<month>:<kind>:… goes to the
 * object named <month>/<kind> — so a run on the settle counters
 * never queues behind the porch, and no single object carries the
 * whole store. Payer rows shard by the first character after 0x.
 *
 * SYNCHRONOUS SQL, NOT THE ASYNC STORAGE API. The first cut used
 * storage.get / storage.put and lost counts in its own test: two calls
 * in flight interleave at the await between the read and the write.
 * A single SQL statement (UPDATE … SET value = value + ?) has no await
 * inside it, so it cannot be interleaved. That is the whole guarantee
 * and it is tested with sixty concurrent adds.
 *
 * SEEDED ONCE FROM THE TALLY. The first time a key comes through, its
 * KV value is the starting point — it may already be short, and this
 * object cannot know by how much. The raise (counter-raise.ts) can:
 * it walks the per-settle records, which are one key per settlement
 * and cannot lose one, and lifts every short counter to what they
 * say, through this object, on the hourly round.
 *
 * FAIL-OPEN, SAID OUT LOUD. Without the binding (a preview upload
 * before the migration, an environment that never needed it) bumps
 * fall back to the old KV read-add-write, which is the exact
 * weakness this closes. The desk's box says which path is live.
 */

/** KV takes one write per second per key; the mirror respects it. */
const FLUSH_MS = 1000;

export class CounterLedger extends DurableObject<Env> {
  private lastMirror = new Map<string, number>();
  /** Keys with a KV write in flight: a second writer would race it to last-write-wins. */
  private inflight = new Set<string>();
  /**
   * Idempotent on every call rather than cached: a storage wipe (the
   * suite does one per test) would leave a cached "ready" flag lying
   * about tables that are gone, and three IF NOT EXISTS statements
   * cost nothing next to the KV write that follows.
   */
  private schema(): SqlStorage {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS rows (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS dirty (key TEXT PRIMARY KEY)");
    return sql;
  }

  /** Add to a counter and return the new value. One statement; cannot interleave. */
  async add(key: string, amount: number): Promise<number> {
    await this.seedCounter(key);
    const row = this.schema()
      .exec<{ value: number }>("UPDATE counters SET value = value + ? WHERE key = ? RETURNING value", amount, key)
      .one();
    await this.mirror(key, String(row.value));
    return row.value;
  }

  /** Lift a counter to at least `floor`; never lowers. Returns the value. */
  async raiseTo(key: string, floor: number): Promise<number> {
    await this.seedCounter(key);
    const row = this.schema()
      .exec<{ value: number }>("UPDATE counters SET value = MAX(value, ?) WHERE key = ? RETURNING value", floor, key)
      .one();
    await this.mirror(key, String(row.value));
    return row.value;
  }

  /** The counter as this object holds it (seeded from KV if unseen). */
  async read(key: string): Promise<number> {
    await this.seedCounter(key);
    return this.counterValue(key) ?? 0;
  }

  /**
   * One purchase seen from a wallet: the payer row's read-add-write,
   * serialized — the select and the write are synchronous, so nothing
   * runs between them. `legacy` is a row found under a pre-canonical
   * key, folded in exactly as recordPayerSeen always did.
   */
  async touchPayer(
    key: string,
    address: string,
    now: string,
    legacy: PayerRecord | null,
  ): Promise<PayerRecord> {
    await this.seedRow(key);
    let row = this.rowValue(key);
    if (legacy) {
      row = row
        ? {
            ...row,
            purchases: row.purchases + legacy.purchases,
            first_seen: legacy.first_seen < row.first_seen ? legacy.first_seen : row.first_seen,
          }
        : legacy;
    }
    const next: PayerRecord = row
      ? { ...row, address, last_seen: now, purchases: row.purchases + 1 }
      : { address, first_seen: now, last_seen: now, purchases: 1 };
    this.writeRow(key, next);
    await this.mirror(key, JSON.stringify(next));
    return next;
  }

  /** The payer row as this object holds it (seeded from KV if unseen). */
  async readPayerRow(key: string): Promise<PayerRecord | null> {
    await this.seedRow(key);
    return this.rowValue(key);
  }

  /** Lift a payer row's purchases to at least `floor`; never lowers. */
  async raisePayerRow(
    key: string,
    address: string,
    floor: number,
    firstSeen: string,
  ): Promise<PayerRecord | null> {
    await this.seedRow(key);
    const row = this.rowValue(key);
    if (row && row.purchases >= floor) return row;
    const next: PayerRecord = row
      ? { ...row, purchases: floor }
      : { address, first_seen: firstSeen, last_seen: firstSeen, purchases: floor };
    this.writeRow(key, next);
    await this.mirror(key, JSON.stringify(next));
    return next;
  }

  /** Flush every mirror write the throttle held back. */
  async alarm(): Promise<void> {
    const sql = this.schema();
    const dirty = sql.exec<{ key: string }>("SELECT key FROM dirty").toArray().map((r) => r.key);
    let retry = false;
    for (const key of dirty) {
      if (this.inflight.has(key)) {
        retry = true;
        continue;
      }
      // Read again right before the write: the value is whatever the
      // object holds now, not what it held when the key went dirty.
      const counter = this.counterValue(key);
      const row = counter === null ? this.rowValue(key) : null;
      const text = counter !== null ? String(counter) : row ? JSON.stringify(row) : null;
      if (text === null) {
        sql.exec("DELETE FROM dirty WHERE key = ?", key);
        continue;
      }
      this.inflight.add(key);
      try {
        await kvPut(this.env.COUNTERS, key, text);
        this.lastMirror.set(key, Date.now());
        this.schema().exec("DELETE FROM dirty WHERE key = ?", key);
      } catch {
        retry = true;
      } finally {
        this.inflight.delete(key);
      }
    }
    if (retry) await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
  }

  private counterValue(key: string): number | null {
    const rows = this.schema().exec<{ value: number }>("SELECT value FROM counters WHERE key = ?", key).toArray();
    return rows.length > 0 ? Number(rows[0]!.value) : null;
  }

  private rowValue(key: string): PayerRecord | null {
    const rows = this.schema().exec<{ value: string }>("SELECT value FROM rows WHERE key = ?", key).toArray();
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0]!.value) as PayerRecord;
    } catch {
      return null;
    }
  }

  private writeRow(key: string, row: PayerRecord): void {
    this.schema().exec(
      "INSERT INTO rows (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(row),
    );
  }

  /**
   * THE SEED IS THE ONE STEP THAT LEAVES THE OBJECT. Reading the KV
   * tally is an await, so it runs under blockConcurrencyWhile and
   * inserts with OR IGNORE: whichever call seeds first wins, every
   * later call finds the row and adds to it.
   */
  private async seedCounter(key: string): Promise<void> {
    if (this.counterValue(key) !== null) return;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.counterValue(key) !== null) return;
      const raw = await this.env.COUNTERS.get(key);
      const parsed = raw ? parseInt(raw, 10) : 0;
      const seeded = Number.isFinite(parsed) ? parsed : 0;
      this.schema().exec("INSERT OR IGNORE INTO counters (key, value) VALUES (?, ?)", key, seeded);
    });
  }

  private async seedRow(key: string): Promise<void> {
    if (this.rowValue(key) !== null) return;
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.rowValue(key) !== null) return;
      const raw = await this.env.COUNTERS.get(key);
      if (!raw) return;
      try {
        JSON.parse(raw);
      } catch {
        return;
      }
      this.schema().exec("INSERT OR IGNORE INTO rows (key, value) VALUES (?, ?)", key, raw);
    });
  }

  /**
   * WRITE THROUGH, COALESCED. Every value goes to KV as soon as the
   * previous write for that key has landed: nothing in flight means
   * write now, something in flight means mark it dirty and the
   * in-flight writer carries the newest value on its way out. A burst
   * of a thousand bumps becomes a handful of writes, each an absolute
   * that ends on the latest, and a quiet key is on KV before the
   * bump returns — which is what every reader (and every test) of
   * these keys has always assumed. A write that fails after kvPut's
   * own retries is left dirty for the alarm rather than lost.
   */
  private async mirror(key: string, text: string): Promise<void> {
    if (this.inflight.has(key)) {
      this.schema().exec("INSERT OR IGNORE INTO dirty (key) VALUES (?)", key);
      return;
    }
    this.inflight.add(key);
    try {
      let next: string | null = text;
      while (next !== null) {
        await kvPut(this.env.COUNTERS, key, next);
        this.lastMirror.set(key, Date.now());
        next = this.takeDirty(key);
      }
    } catch {
      this.schema().exec("INSERT OR IGNORE INTO dirty (key) VALUES (?)", key);
      if ((await this.ctx.storage.getAlarm()) === null) {
        await this.ctx.storage.setAlarm(Date.now() + FLUSH_MS);
      }
    } finally {
      this.inflight.delete(key);
    }
  }

  /** If the key went dirty while a write was out, clear it and hand back the newest value. */
  private takeDirty(key: string): string | null {
    const sql = this.schema();
    const dirty = sql.exec<{ key: string }>("SELECT key FROM dirty WHERE key = ?", key).toArray();
    if (dirty.length === 0) return null;
    sql.exec("DELETE FROM dirty WHERE key = ?", key);
    const counter = this.counterValue(key);
    if (counter !== null) return String(counter);
    const row = this.rowValue(key);
    return row ? JSON.stringify(row) : null;
  }

}
