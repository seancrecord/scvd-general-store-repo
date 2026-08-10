import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { verifyMessageSignature } from "@/lib/signing";
import { TAB_POOL_DAILY_CAP } from "@/store/tab-pool";
import type { Env } from "@/types";
import { isRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * LAYER 3's front door — the aggregation endpoint the Tab's client
 * has refused for want of since v0.2. The properties under test are
 * the spec's own: the allowlist enforced server-side (the tollbooth a
 * tampered local file cannot edit around), the signed custody
 * receipt, and the pool page whose sample sizes lead because a
 * figure built on four reports says four.
 */

async function clear(): Promise<void> {
  const rows = await testEnv.COUNTERS.list({ prefix: KV_KEYS.tabDeltaPrefix });
  for (const key of rows.keys) await testEnv.COUNTERS.delete(key.name);
  const day = new Date().toISOString().slice(0, 10);
  await testEnv.COUNTERS.delete(KV_KEYS.tabPoolDay(day));
}

beforeEach(clear);

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected a JSON object body");
  return body;
}

function postDelta(delta: unknown): Promise<Response> {
  return SELF.fetch(`${BASE}/api/tab/delta`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(delta),
  });
}

const OPENED = {
  kind: "opened",
  tool_name: "ahrefs",
  category: "seo",
  week: "2026-W32",
  signup_friction: "email_only",
};

const OUTCOME = {
  kind: "outcome",
  tool_name: "ahrefs",
  category: "seo",
  outcome: "canceled_pre_conversion",
  weeks_held: 2,
};

describe("the delta door", () => {
  it("accepts a clean delta and signs custody of it — verifiably, offline", async () => {
    const response = await postDelta(OPENED);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await json(response);
    expect(body["accepted"]).toBe(true);
    const receipt = body["receipt"] as Record<string, unknown>;
    expect(String(receipt["delta_digest"])).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt["kind"]).toBe("opened");
    expect(String(receipt["statement"])).toContain("never a claim about the tool");
    // The receipt verifies against the served bytes and key — no
    // reconstruction, which is the house's whole verification posture.
    const good = await verifyMessageSignature(
      String(body["signed_payload"]),
      String(body["signature"]),
      String(body["public_key"]),
    );
    expect(good).toBe(true);
    // And the corpus row exists, kind and category riding in the key.
    const rows = await testEnv.COUNTERS.list({
      prefix: `${KV_KEYS.tabDeltaPrefix}opened:seo:`,
    });
    expect(rows.keys.length).toBe(1);
  });

  it("accepts an outcome delta", async () => {
    const response = await postDelta(OUTCOME);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect((body["receipt"] as Record<string, unknown>)["kind"]).toBe("outcome");
  });

  it("refuses undeclared fields BY NAME — the privacy sentence enforced at the tollbooth", async () => {
    // The spec is explicit that THIS door is the enforcement point: a
    // local file is editable by whoever owns it, so a tampered client
    // sending a price must bounce here, not rely on client manners.
    const response = await postDelta({
      ...OPENED,
      price: { amount: 99 },
      builder_email: "x@y.z",
    });
    expect(response.status).toBe(400);
    const body = await json(response);
    const said = (body["problems"] as string[]).join(" ");
    expect(said).toContain('"price"');
    expect(said).toContain('"builder_email"');
    // Nothing refused is stored.
    const rows = await testEnv.COUNTERS.list({ prefix: KV_KEYS.tabDeltaPrefix });
    expect(rows.keys.length).toBe(0);
  });

  it("refuses the malformed shapes the wire contract names", async () => {
    const cases: Array<[unknown, string]> = [
      [{ ...OPENED, week: "2026-08-04" }, "ISO week"],
      [{ ...OUTCOME, outcome: "hated_it" }, "a resolution, not a feeling"],
      [{ ...OUTCOME, weeks_held: -1 }, "weeks_held"],
      [{ kind: "vibes", tool_name: "x", category: "y" }, "kind must be"],
      [{ ...OPENED, signup_friction: "annoying" }, "signup_friction"],
    ];
    for (const [delta, expected] of cases) {
      const body = await json(await postDelta(delta));
      expect(body["accepted"]).toBe(false);
      expect(JSON.stringify(body["problems"])).toContain(expected);
    }
    // A body that is not JSON at all is a 400, not a 500.
    const raw = await SELF.fetch(`${BASE}/api/tab/delta`, {
      method: "POST",
      body: "not json",
    });
    expect(raw.status).toBe(400);
  });

  it("closes the gate at the daily cap, honestly and without recording", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await testEnv.COUNTERS.put(
      KV_KEYS.tabPoolDay(day),
      String(TAB_POOL_DAILY_CAP),
    );
    const response = await postDelta(OPENED);
    expect(response.status).toBe(429);
    const body = await json(response);
    expect(String(body["error"])).toContain("daily fill");
    const rows = await testEnv.COUNTERS.list({ prefix: KV_KEYS.tabDeltaPrefix });
    expect(rows.keys.length).toBe(0);
  });
});

describe("the pool's honest face", () => {
  it("publishes sample sizes first, with the trust line and the gaming note", async () => {
    await postDelta(OPENED);
    await postDelta(OUTCOME);
    await postDelta({ ...OUTCOME, tool_name: "semrush", category: "seo" });
    const body = await json(await SELF.fetch(`${BASE}/api/tab/pool`));
    expect(String(body["trust_model"])).toContain(
      "the signature covers the arithmetic, never the truth of any single report",
    );
    expect(String(body["gaming"])).toContain("a vendor can feed its own pool");
    const sizes = body["sample_sizes"] as Record<string, unknown>;
    expect(sizes["opened_deltas"]).toBe(1);
    expect(sizes["outcome_deltas"]).toBe(2);
    expect((sizes["by_category"] as Record<string, unknown>)["seo"]).toEqual({
      opened: 1,
      outcome: 2,
    });
  });

  it("names the pooled-aggregate trust line on /attestation — the debt paid the week layer 3 ships", async () => {
    const body = await json(await SELF.fetch(`${BASE}/attestation`));
    const classes = body["artifact_classes"] as Array<Record<string, unknown>>;
    const entry = classes.find((c) => c["id"] === "tab_delta_receipt");
    expect(entry).toBeDefined();
    expect(entry!["trust_model"]).toBe("custody_only");
    expect(String(entry!["does_not_prove"])).toContain(
      "the arithmetic, never the truth of any single report",
    );
  });
});
