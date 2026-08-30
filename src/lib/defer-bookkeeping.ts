import type { Context } from "hono";
import type { HonoEnv } from "@/types";

/**
 * BOOKKEEPING GOES BESIDE THE ANSWER, NEVER IN FRONT OF IT (rule 50).
 *
 * The agent on the other side of a paid door is spending its own
 * budget waiting for us to finish our paperwork, so a counter that
 * cannot change the reply must not be able to delay it either. The
 * rule was written after outside monitors clocked the paid doors at
 * 977ms and 1424ms, with /api/buy/hello answering in 1.14s while
 * /openapi.json — eighty times the payload — answered in 0.19s.
 *
 * The work is already IN FLIGHT when this is called: the promise is
 * built by the caller, so the only thing waitUntil adds is the
 * runtime's guarantee to keep the isolate alive until it finishes.
 * Where there is no executionCtx (test and internal invocations) the
 * write still goes, unguaranteed. That is the honest description, and
 * it is the right trade for a COUNTER.
 *
 * IT IS THE WRONG TRADE FOR A MONEY RECORD, and the difference is the
 * whole reason this has a doc comment rather than being inlined.
 * Nothing whose loss would leave money unaccounted for, a replay
 * window open, or an unanswered question unrecorded comes through
 * here — the settle ledger, the spent-nonce guard and the
 * ambiguous-settle note all stay awaited on purpose. Rule 50 does not
 * override money failing closed, and it says so itself.
 */
export function deferBookkeeping(
  c: Context<HonoEnv>,
  work: Promise<unknown>,
): void {
  const quiet = work.catch(() => undefined);
  try {
    c.executionCtx.waitUntil(quiet);
  } catch {
    void quiet;
  }
}
