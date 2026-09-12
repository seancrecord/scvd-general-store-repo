import { handPress } from "@/services/cards";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

/**
 * THE WINDOW, FOR A TEST THAT WALKS EVERY SHELF. The shop window
 * refuses a pick before payment terms while it is empty and refuses
 * the same wallet twice inside twelve hours; both are the Paywall's
 * own rules, held by test/cards.spec.ts. A generic buyer walking the
 * whole menu is not testing those rules, so it finds the window set
 * out the way the keeper's hand would, and its lock lifted.
 */
export async function setOutTheWindow(env: Env, count = 3, now = new Date()): Promise<void> {
  for (let n = 0; n < count; n += 1) await handPress(env, "based", { window: true }, now);
  let cursor: string | undefined;
  do {
    const page = await env.COUNTERS.list({ prefix: KV_KEYS.paywallWindowLock(""), cursor });
    await Promise.all(page.keys.map((key) => env.COUNTERS.delete(key.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
