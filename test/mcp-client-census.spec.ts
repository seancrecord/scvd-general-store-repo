import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MCP_CLIENT_CAP,
  readMcpClients,
  recordMcpClient,
} from "@/services/mcp-clients";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * WHO IS ACTUALLY KNOCKING.
 *
 * The keeper's porch table (2026-08-29): 12,280 MCP handshakes and
 * 11,803 tool listings in a month, against zero purchases. The
 * obvious reading is a funnel problem. The honest answer was that
 * nobody could tell, because every MCP client announces itself in the
 * handshake — `clientInfo: {name, version}` — and this store threw
 * that field away, keeping only a User-Agent that most MCP clients
 * do not meaningfully set.
 *
 * So the store was inferring its own visitors instead of observing
 * them, which is the exact failure it sells other people the cure
 * for. A registry crawler indexing the tool list and a real agent
 * bouncing off the price are completely different problems, and the
 * evidence to tell them apart was being discarded at the door.
 *
 * BOUNDED, LIKE EVERY OTHER SURFACE KEY. A client name is a stranger's
 * string, so an unbounded key space would let anyone mint counter
 * keys at will — the risk porch-surface.ts calls out by name. This
 * keeps ONE key per month holding a capped map, with everything past
 * the cap counted honestly as "other" rather than dropped.
 *
 * NOT IDENTITY, AND WORTH SAYING SO. A client name is the software,
 * not the person: the same category as the User-Agent already kept,
 * and nothing here touches the store's no-cookies, no-IP-retention
 * stance. It cannot be used to recognise a visitor across sessions,
 * and is not meant to.
 */

const MONTH_KEY_PREFIX = "metric:";

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: MONTH_KEY_PREFIX });
  for (const key of listed.keys) {
    if (key.name.includes("mcpclient")) await testEnv.COUNTERS.delete(key.name);
  }
});

describe("the MCP client census", () => {
  it("reads empty before anyone knocks, and only before", async () => {
    /*
     * An empty read is the other unfalsifiable shape rule 46 names: a
     * reader hard-wired to return {} would pass an emptiness assertion
     * forever, and the store would have a test arguing that its census
     * works while it counted nothing. So the emptiness is bound to the
     * knock that ends it — same call, same month, one before and one
     * after — and the pair fails if either half stops being true.
     */
    expect(await readMcpClients(testEnv)).toEqual({});
    await recordMcpClient(testEnv, "first-knock", "1");
    expect(await readMcpClients(testEnv)).toEqual({ "first-knock": 1 });
  });

  it("counts each client by name", async () => {
    await recordMcpClient(testEnv, "claude-ai", "1.2.3");
    await recordMcpClient(testEnv, "claude-ai", "1.2.3");
    await recordMcpClient(testEnv, "cursor", "0.4");
    const seen = await readMcpClients(testEnv);
    expect(seen["claude-ai"]).toBe(2);
    expect(seen["cursor"]).toBe(1);
  });

  it("normalises names so one client is one row", async () => {
    // "Claude-AI", "claude-ai" and " claude-ai " are one visitor
    // wearing three spellings; counting them apart would invent
    // three clients out of one.
    await recordMcpClient(testEnv, "Claude-AI", "1");
    await recordMcpClient(testEnv, " claude-ai ", "1");
    const seen = await readMcpClients(testEnv);
    expect(seen["claude-ai"]).toBe(2);
  });

  it("refuses to let a stranger mint unlimited rows", async () => {
    /*
     * The load-bearing guard. Without a cap, a client announcing a
     * fresh random name on every handshake would grow this map
     * without limit — and the map is one KV value, so unbounded
     * growth is unbounded cost on a hot path.
     */
    for (let index = 0; index < MCP_CLIENT_CAP + 25; index += 1) {
      await recordMcpClient(testEnv, `client-${index}`, "1");
    }
    const seen = await readMcpClients(testEnv);
    expect(Object.keys(seen).length).toBeLessThanOrEqual(MCP_CLIENT_CAP + 1);
    // Nothing is silently dropped: the overflow is counted as itself.
    expect(seen["other"]).toBeGreaterThan(0);
  });

  it("keeps a nameless client as a named category, not as nothing", async () => {
    // A handshake with no clientInfo is a real observation about a
    // real client. Recording it as "unnamed" says that; dropping it
    // would quietly shrink the denominator.
    await recordMcpClient(testEnv, "", undefined);
    expect((await readMcpClients(testEnv))["unnamed"]).toBe(1);
  });

  it("never lets a hostile name become a key", async () => {
    await recordMcpClient(testEnv, "../../etc/passwd\n<script>", "1");
    const names = Object.keys(await readMcpClients(testEnv));
    // A for-loop over an empty list asserts nothing, so the census
    // has to have recorded something before the charset is checked.
    expect(names.length, "the hostile knock was not recorded at all").toBe(1);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9._-]+$/);
    }
  });
});
