import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { ASSURANCE_LADDER } from "@/store/assurance";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE TRUST PANEL aggregates and links; it must never invent. These
 * tests pin the three properties that make it safe to serve: the
 * ladder is complete and honest about limits, the gallery publishes
 * only house purchases (a stranger's cert id is a capability URL),
 * and both dialects carry the what-this-is-not block first.
 */
describe("the assurance ladder", () => {
  it("has five levels, each saying what is NOT claimed", () => {
    expect(ASSURANCE_LADDER.map((l) => l.name)).toEqual([
      "novelty",
      "observation",
      "monitored",
      "audited",
      "witnessed",
    ]);
    for (const level of ASSURANCE_LADDER) {
      expect(level.claim.length).toBeGreaterThan(20);
      expect(level.not_claimed.length).toBeGreaterThan(20);
      expect(level.examples.length).toBeGreaterThan(0);
    }
    // The ceiling states the single-operator limit out loud.
    expect(ASSURANCE_LADDER[4]!.not_claimed).toContain("one key");
  });
});

describe("the panel and its room", () => {
  it("serves both dialects with the honesty block and the ladder", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.trustPanelCache);
    const json = await SELF.fetch(`${BASE}/trust`, {
      headers: { Accept: "application/json" },
    });
    expect(json.status).toBe(200);
    const body = (await json.json()) as {
      what_this_is_not: string;
      assurance_ladder: unknown[];
      key: { retired_keys: number };
      corrections: { total: number };
    };
    expect(body.what_this_is_not).toContain("Not an escrow");
    expect(body.assurance_ladder.length).toBe(5);
    expect(body.corrections.total).toBeGreaterThanOrEqual(1);

    const html = await SELF.fetch(`${BASE}/trust`, {
      headers: { Accept: "text/html" },
    });
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain("What this store is not");
    expect(text).toContain("assurance ladder");
    expect(text).toContain("/.well-known/scvd-signing-key");
    expect(text).toContain("/api/verify/{id}");
  });

  it("the gallery shows house purchases and never a stranger's certificate", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.trustPanelCache);
    // Seed two certificates: one bought by a house wallet, one by a
    // stranger. Cert records live under the cert prefix in PATRONS.
    const houseWallet = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
    const put = (id: string, payer: string) =>
      testEnv.PATRONS.put(
        `${KV_KEYS.certPrefix}${id}`,
        JSON.stringify({
          cert_id: id,
          item: "small_blessing",
          date: "2026-08-20T12:00:00.000Z",
          payer,
        }),
      );
    await put("scvd_house_gallery_1", houseWallet);
    await put("scvd_stranger_gallery_1", "0x1111111111111111111111111111111111111111");

    const body = (await (
      await SELF.fetch(`${BASE}/trust`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as { gallery: { items: { verify_url: string }[]; note: string } };
    const urls = body.gallery.items.map((i) => i.verify_url).join(" ");
    expect(urls).not.toContain("scvd_stranger_gallery_1");
    expect(body.gallery.note).toContain("House purchases only");
  });
});
