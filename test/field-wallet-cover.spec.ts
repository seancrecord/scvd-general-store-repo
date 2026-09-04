import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALERT_CONDITIONS, listAlerts } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { accrueCredit } from "@/services/store-credit";
import { sweepFieldWallet } from "@/services/field-wallet";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};
const KEY = `0x${"01".repeat(32)}`;

/**
 * THE COVER CHECK (2026-09-04): the keeper asked where "money short"
 * would show, and whether it could be a constant check rather than a
 * page he has to open. It rides the hourly press now. These hold the
 * three answers — short, thin, unread — and that a read-only
 * deployment says nothing.
 */

function balanceOf(usdc: number): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        result: `0x${Math.round(usdc * 1e6).toString(16).padStart(64, "0")}`,
      }),
      { status: 200 },
    )) as typeof fetch;
}

async function detailsFor(key: "short" | "thin" | "unread"): Promise<string[]> {
  const alerts = await listAlerts(testEnv, 40);
  return alerts
    .filter((alert) => alert.condition === "field_wallet_short")
    .map((alert) => alert.detail)
    .filter((detail) =>
      key === "short"
        ? detail.startsWith("OURS, money promised")
        : key === "thin"
          ? detail.startsWith("THIN")
          : detail.startsWith("UNCLEAR"),
    );
}

describe("the paying wallet is checked against its promises every hour", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is one of the conditions the store pages on", () => {
    expect(ALERT_CONDITIONS).toContain("field_wallet_short");
  });

  it("says nothing on a deployment with no paying wallet", async () => {
    const sweep = await sweepFieldWallet({ ...testEnv, FIELD_WALLET_KEY: undefined } as Env);
    expect(sweep.wallet.provisioned).toBe(false);
    expect(sweep.findings).toEqual([]);
  });

  it("pages SHORT when credit owed exceeds what the wallet holds", async () => {
    // A regular is owed more than the wallet has.
    await accrueCredit(testEnv, `0x${"ab".repeat(20)}`, 40); // 5% of $40 = $2
    vi.stubGlobal("fetch", balanceOf(1));
    const sweep = await sweepFieldWallet({ ...testEnv, FIELD_WALLET_KEY: KEY } as Env);
    expect(sweep.wallet.usdc).toBe(1);
    expect(sweep.promised_usd).toBeGreaterThan(1);
    expect(sweep.findings.some((f) => f.startsWith("short:"))).toBe(true);
    const details = await detailsFor("short");
    expect(details.length).toBeGreaterThan(0);
    expect(details[0]).toContain("Top the wallet up by at least");
    expect(details[0]).toContain("/admin/bounties");
  });

  it("reports an unread balance as a blind spot, never as short", async () => {
    vi.stubGlobal(
      "fetch",
      (async () => new Response("no", { status: 503 })) as typeof fetch,
    );
    const sweep = await sweepFieldWallet({ ...testEnv, FIELD_WALLET_KEY: KEY } as Env);
    expect(sweep.wallet.usdc).toBeNull();
    expect(sweep.findings.some((f) => f.startsWith("unread:"))).toBe(true);
    expect(sweep.findings.some((f) => f.startsWith("short:"))).toBe(false);
    expect((await detailsFor("unread")).length).toBeGreaterThan(0);
  });

  it("stays quiet when the wallet covers everything and the board is empty", async () => {
    // Zero the credit liability so the promises are nil for this case.
    await testEnv.COUNTERS.put(KV_KEYS.creditOutstanding, "0");
    vi.stubGlobal("fetch", balanceOf(50));
    const sweep = await sweepFieldWallet({ ...testEnv, FIELD_WALLET_KEY: KEY } as Env);
    expect(sweep.wallet.usdc).toBe(50);
    expect(sweep.findings).toEqual([]);
  });
});

describe("who is owed store credit, on the bounty page", () => {
  it("lists the wallet and its balance", async () => {
    const wallet = `0x${"cd".repeat(20)}`;
    await accrueCredit(testEnv, wallet, 10); // $0.50
    const page = await SELF.fetch(`${BASE}/admin/bounties`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Store credit, by wallet");
    expect(html.toLowerCase()).toContain(wallet.toLowerCase());
    expect(html).toContain("not a purchase");
  });
});
