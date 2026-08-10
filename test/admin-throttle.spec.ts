import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { ADMIN_FAIL_ALERT_AT, ADMIN_THROTTLE_AT } from "@/routes/admin";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const IP = "203.0.113.9";

/**
 * SLOWING A GUESSER WITHOUT EVER LOCKING THE KEEPER OUT.
 *
 * The store had deliberately refused a lockout — a single-user panel
 * any stranger can bar is a denial-of-service foothold, not a defence
 * — and then, without meaning to, also had no throttle. So a run of
 * failed logins was VISIBLE and not SLOWED, and the page's only
 * advice was to rotate the password, which is reflexive: a run of
 * failures is evidence nobody got in.
 *
 * Per-address is what reconciles the two. A guesser slows only
 * themselves; the keeper on any other connection is untouched, and on
 * the same connection is waiting a minute, not locked out.
 */

async function clearFails(ip = IP): Promise<void> {
  await testEnv.COUNTERS.delete(KV_KEYS.adminFailByIp(ip));
  await testEnv.COUNTERS.delete("admin_auth_fails");
}

function knock(password: string, ip = IP): Promise<Response> {
  return SELF.fetch(`${BASE}/admin`, {
    headers: {
      "CF-Connecting-IP": ip,
      Authorization: `Basic ${btoa(`keeper:${password}`)}`,
    },
  });
}

beforeEach(() => clearFails());

describe("the throttle", () => {
  it("lets a few mistakes through at full speed, then starts making them wait", async () => {
    // Fat-fingering your own password must not cost you a minute.
    // Derived from the constant so the two cannot drift apart.
    for (let attempt = 0; attempt < ADMIN_THROTTLE_AT; attempt += 1) {
      expect((await knock("wrong")).status).toBe(401);
    }
    const throttled = await knock("wrong");
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
  });

  it("says it is a pause and not a lockout, because that distinction is the design", async () => {
    for (let attempt = 0; attempt < ADMIN_THROTTLE_AT; attempt += 1) {
      await knock("wrong");
    }
    const body = (await (await knock("wrong")).json()) as { error: string };
    expect(body.error).toContain("per-address pause, not a lockout");
  });

  it("NEVER bars a different address, which is the whole reason it is per-address", async () => {
    /*
     * The property the store refused to trade away: a stranger must
     * not be able to shut the keeper out of his own store. Guess from
     * one address until it is throttled; another address is untouched.
     */
    for (let attempt = 0; attempt < ADMIN_THROTTLE_AT; attempt += 1) {
      await knock("wrong");
    }
    expect((await knock("wrong")).status).toBe(429);

    await clearFails("198.51.100.4");
    const keeperElsewhere = await knock("also-wrong", "198.51.100.4");
    // 401, not 429: turned away for the wrong password, not made to wait.
    expect(keeperElsewhere.status).toBe(401);
  });

  it("waits longer the harder somebody leans on it", async () => {
    for (let attempt = 0; attempt < ADMIN_THROTTLE_AT; attempt += 1) {
      await knock("wrong");
    }
    const first = Number((await knock("wrong")).headers.get("Retry-After"));
    // Each further failure doubles the wait, so a run gets expensive.
    await testEnv.COUNTERS.put(
      KV_KEYS.adminFailByIp(IP),
      String(ADMIN_THROTTLE_AT + 4),
    );
    const later = Number((await knock("wrong")).headers.get("Retry-After"));
    expect(later).toBeGreaterThan(first);
  });

  it("stops waiting the moment the right password arrives", async () => {
    // The keeper who finally types it correctly is not still serving
    // out somebody else's sentence.
    await testEnv.COUNTERS.put(
      KV_KEYS.adminFailByIp(IP),
      String(ADMIN_THROTTLE_AT - 1),
    );
    const ok = await knock(testEnv.ADMIN_PASSWORD);
    expect(ok.status).toBe(200);
    expect(await testEnv.COUNTERS.get(KV_KEYS.adminFailByIp(IP))).toBeNull();
  });

  it("does not throttle a first-time visitor", async () => {
    expect((await knock("wrong", "192.0.2.77")).status).toBe(401);
    await clearFails("192.0.2.77");
  });
});

describe("the order of operations", () => {
  it("PAGES BEFORE IT THROTTLES, so a single-address run always reports", async () => {
    /*
     * A bug caught by a test rather than by a keeper wondering why he
     * stopped hearing about break-in attempts. The throttle first
     * engaged at five, below the alert threshold of six — and a
     * throttled request never reaches the failure counter, so a run
     * from ONE address would have been quietly slowed and never
     * reported. Slowing an attacker is worth less than telling the
     * keeper, and there is no reason not to have both.
     */
    expect(ADMIN_THROTTLE_AT).toBeGreaterThan(ADMIN_FAIL_ALERT_AT);
  });
});
