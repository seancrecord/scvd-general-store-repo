import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sendAlert } from "@/lib/alerts";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};
const BROWSER = { ...AUTH, Accept: "text/html" };

/**
 * THE CHAIN ORPHAN'S WHOLE LOOP, pinned end to end (live case,
 * 2026-08-05): the bank walk pages about money it found on-chain, the
 * books check shows that row as open with a lever on it, and the
 * keeper's hand closes it — all against the wording the walk actually
 * writes ("in transaction <sig>"), which the page's stamp parser
 * missed for two days while $52.09 of the keeper's own money read as
 * two open mysteries. The stamp, the form, and the resolution are one
 * story; this spec refuses to let them drift apart again.
 */
describe("a chain orphan is open on the page until the keeper's hand closes it", () => {
  it("shows [STILL OPEN] with a resolve form, then names the outcome after the POST", async () => {
    const sig = "4bUdvPage" + Math.random().toString(36).slice(2, 8);
    await sendAlert(testEnv, {
      condition: "undelivered_sale",
      detail: `27.300538 USDC arrived on Solana from EPUHjseDexVault111111111111111111111111111 in transaction ${sig} (block 437235011) and NO certificate names it. The chain says we were paid; our own records do not. Check whether an artifact was minted under a different hash, then fulfil or refund by hand.`,
      key: sig,
    });

    // The alarm-trail row is one <li>; the page's legend also says
    // "[STILL OPEN]" in prose, so the assertion must stay inside it.
    const rowFor = (html: string): string => {
      const at = html.indexOf(sig);
      expect(at, "the trail must show the alert at all").toBeGreaterThan(-1);
      const start = html.lastIndexOf("<li>", at);
      const end = html.indexOf("</li>", at);
      return html.slice(start, end);
    };

    const before = await SELF.fetch(`${BASE}/admin/reconciliation`, {
      headers: BROWSER,
    });
    expect(before.status).toBe(200);
    const row = rowFor(await before.text());
    expect(row).toContain("[STILL OPEN]");
    // The lever rides the row: a form naming this very tx.
    expect(row).toContain(`value="${sig}"`);
    expect(row).toContain("house money, absorbed");

    const resolve = await SELF.fetch(`${BASE}/admin/delivery/resolve`, {
      method: "POST",
      headers: {
        ...AUTH,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        transaction: sig,
        outcome: "house_absorbed",
      }).toString(),
    });
    expect(resolve.status).toBe(200);

    const after = await SELF.fetch(`${BASE}/admin/reconciliation`, {
      headers: BROWSER,
    });
    const afterRow = rowFor(await after.text());
    /*
     * NAMES THE OUTCOME, not merely the fact of one. The stamp read
     * "[RESOLVED BY HAND]" for all three choices until 2026-08-10, so
     * the page said THAT a row was resolved and never WHICH — and the
     * keeper, having refunded one and clicked something on the page,
     * could not check which he had recorded, because the page was not
     * showing it. Refunded, fulfilled and absorbed are opposite claims
     * about where the money went.
     */
    expect(afterRow).toContain("[RESOLVED: HOUSE ABSORBED]");
    expect(afterRow).not.toContain("[STILL OPEN]");
  });
});
