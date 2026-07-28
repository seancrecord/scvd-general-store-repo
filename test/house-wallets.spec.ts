import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isHouseWallet } from "@/lib/channel";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * WHO COUNTS AS FAMILY.
 *
 * Rule 13: the house never trades with itself for the books. Every
 * wallet the house controls has to be flagged BEFORE it spends, because
 * an unflagged house buy would be recorded as the store's first organic
 * settlement — the single number this whole build is waiting on — and
 * it would be false.
 *
 * The list is one file, read by the store at runtime and by the
 * shopping run before it spends, so the two cannot disagree.
 */
describe("the house wallet list", () => {
  it("flags every listed wallet as house, however it is cased", () => {
    for (const entry of HOUSE_WALLET_FILE.wallets) {
      expect(isHouseWallet(testEnv, entry.address), entry.who).toBe(true);
      expect(isHouseWallet(testEnv, entry.address.toLowerCase())).toBe(true);
      expect(isHouseWallet(testEnv, entry.address.toUpperCase())).toBe(true);
    }
  });

  it("keeps the founding burner and CV on it", () => {
    // Named explicitly: a wallet silently dropped from the file is a
    // house buy quietly promoted to a first sale.
    expect(isHouseWallet(testEnv, "0x137ae5e3c7ed176744226f67223de50ca3a19e5a")).toBe(
      true,
    );
    expect(isHouseWallet(testEnv, "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7")).toBe(
      true,
    );
  });

  it("says who each wallet is and when, because a bare address explains nothing later", () => {
    for (const entry of HOUSE_WALLET_FILE.wallets) {
      expect(entry.who.length).toBeGreaterThan(0);
      expect(entry.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A real 20-byte address, not a truncated paste.
      expect(entry.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("leaves a stranger's wallet organic, which is the whole point", () => {
    expect(
      isHouseWallet(testEnv, "0x0000000000000000000000000000000000000001"),
    ).toBe(false);
  });
});
