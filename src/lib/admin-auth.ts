import { basicAuth } from "hono/basic-auth";
import type { MiddlewareHandler } from "hono";
import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { kvGet, kvPut } from "@/lib/kv-retry";
import type { HonoEnv } from "@/types";

export const ADMIN_USERNAME = "keeper";

/**
 * ADMIN AUTH, AND WHAT WATCHES IT (2026-08-04, a scanner's "not
 * enough around the passcode").
 *
 * The rock that IS worth pushing: hono's basicAuth already compares
 * with timingSafeEqual, so the timing side-channel is closed — that
 * is the usual finding, and it is already handled.
 *
 * The real gap it named without naming: a brute-force attempt was
 * INVISIBLE. The store's answer is never a hard lockout — a
 * single-user panel that any stranger can lock is a denial-of-service
 * foothold, not a defense — but the store's whole discipline is
 * "page the keeper," and a run of failed admin logins is exactly the
 * event worth a page. Counted in a window, alerted once past a
 * threshold, keyed so a standing attack pages once rather than
 * hourly. A correct login clears the count.
 *
 * WHAT WATCHING ALONE DID NOT DO (2026-08-10, six real failures from
 * somebody who was not the keeper). Seeing a guesser is not slowing
 * one. The page told the keeper it was happening and then offered him
 * the only lever it had — rotate the password — which is reflexive
 * advice: six failures are proof they did NOT get in, and rotating a
 * password nobody guessed does not make it harder to guess.
 *
 * "NO LOCKOUT" AND "NO THROTTLE" ARE DIFFERENT CHOICES and we had
 * taken both while only meaning to take the first. The property worth
 * protecting is that a stranger must never be able to bar the keeper
 * from his own store. A GLOBAL lockout breaks that. A PER-ADDRESS
 * throttle does not: a guesser slows only themselves down, and the
 * keeper on any other connection is untouched — as is the keeper on
 * the SAME connection, thirty seconds later.
 *
 * WHAT IT STILL DOES NOT STOP, said plainly rather than left to be
 * assumed: an attacker with many addresses. Per-address throttling
 * raises the cost of guessing from one machine and does nothing about
 * a botnet. The real defence against that is the entropy of
 * ADMIN_PASSWORD, which no code here can check on the keeper's
 * behalf. The throttle buys time and noise; it is not a substitute
 * for a long password.
 */
const ADMIN_FAIL_WINDOW_SECONDS = 15 * 60;
export const ADMIN_FAIL_ALERT_AT = 6;

/**
 * Failures from one address before that address starts waiting.
 *
 * DELIBERATELY ABOVE ADMIN_FAIL_ALERT_AT, and a test caught why. At
 * five, the throttle engaged BEFORE the sixth failure that raises the
 * page — and a throttled request never reaches the counter, so a
 * single-address run could be slowed and never reported. That is the
 * wrong order: the keeper hearing about it is worth more than the
 * attacker being slowed, and there is no reason not to have both.
 */
export const ADMIN_THROTTLE_AT = 8;
/** How long that address waits. Short: it is a speed bump, not a wall. */
const ADMIN_THROTTLE_SECONDS = 60;
/**
 * Ceiling on the wait, however long the run.
 *
 * FIVE MINUTES, NOT FIFTEEN, and the reason is the keeper rather than
 * the attacker. Twelve guesses an hour from one address already makes
 * guessing pointless; a quarter of an hour locked out of your own
 * store while you are trying to resolve an undelivered sale is a real
 * cost paid by the only person who ever legitimately fails.
 */
const ADMIN_THROTTLE_MAX_SECONDS = 5 * 60;

/**
 * The caller's address as Cloudflare saw it. Set at the edge, so a
 * client cannot forge it; absent only off-platform, where the
 * throttle degrades to the shared bucket rather than failing open.
 */
function callerIp(c: Parameters<MiddlewareHandler<HonoEnv>>[0]): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * How long this address must wait, in seconds. Doubles with each
 * failure past the threshold and stops at the ceiling — enough to
 * make guessing pointless, never enough to lock anybody out for long.
 */
function throttleSeconds(fails: number): number {
  if (fails < ADMIN_THROTTLE_AT) return 0;
  const doublings = fails - ADMIN_THROTTLE_AT;
  return Math.min(
    ADMIN_THROTTLE_MAX_SECONDS,
    ADMIN_THROTTLE_SECONDS * 2 ** Math.min(doublings, 10),
  );
}

async function noteAdminAuthFailure(
  env: HonoEnv["Bindings"],
  ip: string,
): Promise<void> {
  // Per-address, for the throttle. Doubling wait, capped.
  const ipKey = KV_KEYS.adminFailByIp(ip);
  const ipFails = Number((await kvGet(env.COUNTERS, ipKey)) ?? "0") + 1;
  await kvPut(env.COUNTERS, ipKey, String(ipFails), {
    expirationTtl: ADMIN_THROTTLE_MAX_SECONDS,
  });

  const key = "admin_auth_fails";
  const count = Number((await kvGet(env.COUNTERS, key)) ?? "0") + 1;
  await kvPut(env.COUNTERS, key, String(count), {
    expirationTtl: ADMIN_FAIL_WINDOW_SECONDS,
  });
  if (count >= ADMIN_FAIL_ALERT_AT) {
    /**
     * NAME THE ADDRESSES WHILE THEY ARE STILL KNOWABLE (2026-08-11).
     * The page said "somebody is guessing" and the keeper's first
     * question — was that a scanner, or somebody I know poking a door
     * they have no key to? — was unanswerable: the per-address rows
     * expire minutes after the run stops, so by the time the page was
     * read the evidence was gone. The rows are on the books at the
     * moment the alert fires, so the alert quotes them. Addresses
     * appear FIRST in the text because sendAlert truncates the detail
     * at 1000 characters, and the list is capped so the fixed prose
     * behind it can never be pushed off. A failed listing degrades to
     * naming only the current caller — the page still goes out.
     */
    const listed = await listKeys(env.COUNTERS, {
      prefix: KV_KEYS.adminFailIpPrefix,
      cap: 8,
    }).catch(() => ({
      names: [KV_KEYS.adminFailByIp(ip)],
      truncated: false,
    }));
    const addresses = listed.names.map((name) =>
      name.slice(KV_KEYS.adminFailIpPrefix.length),
    );
    const roster =
      addresses.join(", ") + (listed.truncated ? ", and more" : "");
    await sendAlert(env, {
      condition: "worker_health",
      detail: `${count} failed /admin logins in the last ${ADMIN_FAIL_WINDOW_SECONDS / 60} minutes, from ${addresses.length === 1 ? "ONE address" : `${addresses.length} addresses`}: ${roster} — most recent ${ip}, now being made to wait between tries. One address is one guesser; several is a spray. (An address falls off the books ${ADMIN_THROTTLE_MAX_SECONDS / 60} minutes after its last failure — this names what the moment still held.) Still not a lockout — the throttle is PER ADDRESS, so a guesser slows only themselves and can never bar you from your own store. If this was not you: rotating ADMIN_PASSWORD is only worth doing if it is short, guessable, or used anywhere else, because a run of FAILURES is evidence nobody got in. What the throttle cannot slow is an attacker with many addresses, and the only defence against that is a long password.`,
      key: "admin-auth-bruteforce",
    }).catch(() => undefined);
  }
}

export const adminGate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ip = callerIp(c);
  /*
   * THE WAIT COMES BEFORE THE COMPARE. Checking the password first and
   * then deciding whether to answer would still let a guesser learn
   * one bit per request at full speed; the point is to make the
   * REQUEST cost something, not the answer.
   */
  const fails = Number(
    (await kvGet(c.env.COUNTERS, KV_KEYS.adminFailByIp(ip))) ?? "0",
  );
  const wait = throttleSeconds(fails);
  if (wait > 0) {
    return c.json(
      {
        error: `Too many failed logins from this address. Try again in ${wait} seconds — or from any other connection, right now. This is a per-address pause, not a lockout: it slows whoever is guessing, and a stranger can never use it to bar the keeper from his own store.`,
      },
      429,
      { "Retry-After": String(wait) },
    );
  }

  const gate = basicAuth({
    username: ADMIN_USERNAME,
    password: c.env.ADMIN_PASSWORD,
  });
  try {
    const result = await gate(c, next);
    // A clean pass clears both counters: the alarm is for RUNS of
    // failure, not a single mistyped character on the way in, and the
    // keeper who finally types it right should not still be waiting.
    await Promise.all([
      c.env.COUNTERS.delete("admin_auth_fails").catch(() => undefined),
      c.env.COUNTERS.delete(KV_KEYS.adminFailByIp(ip)).catch(() => undefined),
    ]);
    return result;
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401) {
      await noteAdminAuthFailure(c.env, ip).catch(() => undefined);
    }
    throw error;
  }
};

