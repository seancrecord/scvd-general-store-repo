import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { ASSURANCE_LADDER } from "@/store/assurance";
import {
  EXTERNAL_RECORDS,
  RECORDS_NOT_LISTED,
} from "@/store/trust-signals";
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

/**
 * THE INDEPENDENT RECORDS SECTION exists because the footprint was
 * invisible to the readers it was written for: `sameAs` and a
 * well-known JSON file are not surfaces a retrieval crawler fetches.
 * These tests pin the two properties that keep it a trust document
 * rather than a logo wall — it is DERIVED from EXTERNAL_RECORDS so it
 * cannot drift from the machine twin, and it carries every row's
 * stated edge plus the list's own omissions.
 */
describe("the independent records on the panel", () => {
  it("renders every record from the constant, with its date and its edge", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.trustPanelCache);
    const text = await (
      await SELF.fetch(`${BASE}/trust`, { headers: { Accept: "text/html" } })
    ).text();

    expect(text).toContain("Who else has a record of us");
    // Derived, not retyped: every confirmed record reaches the page.
    for (const record of EXTERNAL_RECORDS) {
      expect(text).toContain(record.url);
    }
    // And the edge travels with the row — the line that stops this
    // being a wall of logos.
    expect(text).toContain("Not an endorsement");
    // The list states its own omissions.
    expect(text).toContain("What is deliberately not on this list");
    expect(text).toContain("none publishes a per-service page");
  });

  it("restates no third-party grade or score", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.trustPanelCache);
    const text = await (
      await SELF.fetch(`${BASE}/trust`, { headers: { Accept: "text/html" } })
    ).text();
    // House rule: the reading is theirs and lives behind the link.
    // The page may say a score EXISTS; it may never carry the number.
    const sectionStart = text.indexOf("Who else has a record of us");
    const sectionEnd = text.indexOf("The record, kept where you can check it");
    expect(sectionStart).toBeGreaterThan(-1);
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const section = text.slice(sectionStart, sectionEnd);
    expect(section).toContain("none of those numbers");
    // No AggregateRating anywhere on the room, ever.
    expect(text).not.toContain("aggregateRating");
    expect(text).not.toContain("AggregateRating");
  });

  it("serves the same records in the JSON dialect", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.trustPanelCache);
    const body = (await (
      await SELF.fetch(`${BASE}/trust`, {
        headers: { Accept: "application/json" },
      })
    ).json()) as {
      independent_records: {
        count: number;
        records: { url: string }[];
        not_listed: string;
      };
    };
    expect(body.independent_records.count).toBe(EXTERNAL_RECORDS.length);
    expect(body.independent_records.records.map((r) => r.url)).toEqual(
      EXTERNAL_RECORDS.map((r) => r.url),
    );
    expect(body.independent_records.not_listed).toBe(RECORDS_NOT_LISTED);
  });
});
