import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach } from "vitest";
import { counterLedger } from "@/lib/counter-ledger";
import type { Env } from "@/types";

/**
 * AN EMPTY LEDGER FOR EVERY TEST. KV is isolated per test by the pool;
 * Durable Object storage is not, and the counter ledger holds the
 * truth of every counter. Every test in the suite that bumps a counter
 * and reads KV back expects to start from nothing, so the one ledger
 * object the pool routes everything to (COUNTER_LEDGER_SINGLE_SHARD)
 * is wiped before each test.
 */
beforeEach(async () => {
  const stub = counterLedger(env as unknown as Env, "metric:setup:reset:x");
  if (!stub) return;
  await runInDurableObject(stub as never, async (_instance: unknown, state: DurableObjectState) => {
    await state.storage.deleteAll();
  });
});
