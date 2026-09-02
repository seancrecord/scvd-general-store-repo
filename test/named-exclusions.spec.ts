import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import { HOUSE_AGENTS, INFRASTRUCTURE_UA_HINTS } from "@/lib/channel";
import { EXCLUSION_CHANGES, namedExclusions } from "@/store/exclusions";
import { isRecord } from "@/types";

/**
 * NAMED EXCLUSIONS ON THE DEMAND NUMBERS (roadmap S9, 2026-09-02).
 * The list of what the organic numbers subtract is published by name,
 * and a change to it cannot land without a dated row: the newest row
 * pins the sizes of both tables.
 */

const BASE = "https://scvd.store";

describe("the exclusions are published by name", () => {
  it("wallet-facts.json carries every house wallet, the house agents and the crawler table", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/corpus/wallet-facts.json`)).json();
    if (!isRecord(body) || !isRecord(body.exclusions)) throw new Error("no exclusions block");
    const exclusions = body.exclusions;
    const wallets = exclusions.house_wallets as Array<Record<string, string>>;
    // By who, since and why — never the address: the wallet-facts page
    // names no address (G2, T1); the house's own are at the ledger.
    expect(wallets.map((w) => w.who)).toEqual(HOUSE_WALLET_FILE.wallets.map((w) => w.who));
    expect(JSON.stringify(exclusions)).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(String(exclusions.house_wallet_addresses_at)).toContain(BASE);
    for (const wallet of wallets) {
      expect(String(wallet.who).length).toBeGreaterThan(0);
      expect(wallet.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(wallet.why).length).toBeGreaterThan(0);
    }
    expect(exclusions.house_agents).toEqual([...HOUSE_AGENTS]);
    expect(exclusions.crawler_names).toEqual([...INFRASTRUCTURE_UA_HINTS]);
    expect(String(exclusions.rule)).toContain("listed before its first purchase");
  });

  it("every change is dated and says which published number moved", () => {
    let previous = "";
    for (const change of EXCLUSION_CHANGES) {
      expect(change.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(change.date >= previous, "changes are newest last").toBe(true);
      previous = change.date;
      expect(change.what_changed.length).toBeGreaterThan(20);
      expect(change.effect.length).toBeGreaterThan(10);
    }
  });

  it("the newest row pins both table sizes, so a change cannot land without its row", () => {
    const latest = EXCLUSION_CHANGES[EXCLUSION_CHANGES.length - 1]!;
    expect(
      HOUSE_WALLET_FILE.wallets.length,
      "a house wallet was added or removed without a dated row in src/store/exclusions.ts",
    ).toBe(latest.house_wallets);
    expect(
      INFRASTRUCTURE_UA_HINTS.length,
      "the crawler table changed without a dated row in src/store/exclusions.ts",
    ).toBe(latest.crawler_names);
    expect(namedExclusions(BASE).changes).toEqual(EXCLUSION_CHANGES);
  });
});
