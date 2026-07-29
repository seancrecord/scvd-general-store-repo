import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import HOUSE_WALLET_FILE from "@/store/house-wallets.json";

/**
 * THE MIRROR A COMPETITOR HELD UP.
 *
 * CV paid 402sentinel $0.002 on 2026-07-29 to score our own payTo
 * address. It returned `review`, 63/100: "address only 6d old", and
 * "only 2 real payers over 29 settlements — concentrated / possible
 * self-wash." Their product working exactly as advertised, and correct
 * from where it stood.
 *
 * The finding underneath: rule 13 governs what we COUNT, and the chain
 * carries no flag. Our carefulness was invisible from outside, so this
 * document publishes the addresses instead of asking to be believed.
 *
 * The tests that matter here are the ones that keep it honest: the
 * split has to be real numbers rather than a claim, the limit has to
 * be stated on the artifact itself, and it has to be signed — an
 * unsigned self-declaration about one's own wallets is worth nothing.
 */
describe("/house-ledger.json", () => {
  async function fetchLedger(): Promise<Record<string, unknown>> {
    const response = await SELF.fetch("https://scvd.store/house-ledger.json");
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  }

  it("declares every wallet the store controls", async () => {
    const body = await fetchLedger();
    const declared = (body.house_wallets as { address: string }[]).map((row) =>
      row.address.toLowerCase(),
    );
    for (const entry of HOUSE_WALLET_FILE.wallets) {
      expect(
        declared,
        `${entry.who} is in the books and not in the declaration`,
      ).toContain(entry.address.toLowerCase());
    }
  });

  it("says who each wallet is, since a bare address explains nothing", async () => {
    const body = await fetchLedger();
    for (const row of body.house_wallets as { who: string; since: string }[]) {
      expect(row.who.length).toBeGreaterThan(0);
      expect(row.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("carries the house/organic split as numbers, not as a claim", async () => {
    const body = await fetchLedger();
    const settlements = body.settlements as Record<string, number>;
    expect(typeof settlements.total).toBe("number");
    expect(typeof settlements.house).toBe("number");
    expect(typeof settlements.organic).toBe("number");
    // Pre-meter settles are attributed to NOBODY rather than counted as
    // organic, which would flatter us in exactly the direction this
    // document exists to correct.
    expect(typeof settlements.unattributed_pre_meter).toBe("number");
  });

  it("states that it is a declaration and not a proof", async () => {
    // Say what a thing is NOT. Nothing stops a store from owning a
    // wallet it doesn't list; the artifact has to admit that itself
    // rather than let a reader assume completeness.
    const body = await fetchLedger();
    expect(String(body.honest_limit)).toContain("NOT A PROOF");
    expect(String(body.honest_limit)).toContain("held against us");
  });

  it("never claims the numbers are better than they are", async () => {
    const body = await fetchLedger();
    // The store is young and unpaid by strangers. Both true, and the
    // document must not spin either one.
    expect(String(body.what_a_scorer_should_conclude)).toContain(
      "has not yet been paid by strangers",
    );
  });

  it("is signed, because an unsigned self-declaration is worth nothing", async () => {
    const body = await fetchLedger();
    const { signature, public_key, signature_covers, ...signed } = body as {
      signature: string;
      public_key: string;
      signature_covers: string;
    } & Record<string, unknown>;
    expect(signature_covers).toContain("canonical JSON");
    await expect(
      verifyMessageSignature(JSON.stringify(signed), signature, public_key),
    ).resolves.toBe(true);
  });
});
