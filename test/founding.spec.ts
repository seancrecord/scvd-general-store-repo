import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

/**
 * The founding press: Issue No. 1 prints once, free, signed, frozen
 * with the ledger's numbers of its day. The tenure clock is
 * cryptographic from the first issue.
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
};

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("the founding edition", () => {
  it("tells the truth before press: no paper yet", async () => {
    const page = await SELF.fetch(`${BASE}/gazette/founding`);
    expect(page.status).toBe(404);
    expect(String((await json(page))["error"])).toContain(
      "hasn't gone to press",
    );
  });

  it("prints once, signed, with the numbers of its day", async () => {
    const press = await SELF.fetch(`${BASE}/admin/gazette/founding/print`, {
      method: "POST",
      headers: adminAuth,
      redirect: "manual",
    });
    expect([200, 302]).toContain(press.status);

    const page = await SELF.fetch(`${BASE}/gazette/founding`);
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Type")).toContain("text/markdown");
    expect(page.headers.get("X-Signature-Ed25519")).toMatch(/^[0-9a-f]+$/);
    const paper = await page.text();
    expect(paper).toContain("Issue No. 1");
    expect(paper).toContain("Oak City, where you're never late");
    expect(paper).toContain("THE BOOKS");
    expect(paper).toContain("Organic customers: zero.");
    expect(paper).toContain("hold us to it");
    // The stale-proof clause: numbers come from the ledger, not a hand.
    expect(paper).toMatch(/Settled purchases to date: (zero|two|\d+)\./);
    // The generalized bell line: no clawdbot attribution the ledger can't back.
    expect(paper).toContain("Somebody did ring the bell early, unprompted");
    expect(paper).not.toContain("clawdbot");

    // Signed and verifiable: the masthead claim is true.
    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/gazette_founding`),
    );
    expect(verified["valid"]).toBe(true);
    expect(String(verified["note"])).toContain("went to press");

    // It prints once.
    const again = await SELF.fetch(`${BASE}/admin/gazette/founding/print`, {
      method: "POST",
      headers: adminAuth,
      redirect: "manual",
    });
    expect(again.status).toBe(409);
    expect(await again.text()).toContain("already went to press");

    // Humans get a reading copy; the signed original stays markdown.
    const html = await SELF.fetch(`${BASE}/gazette/founding`, {
      headers: { Accept: "text/html" },
    });
    expect(html.headers.get("Content-Type")).toContain("text/html");
    const readingCopy = await html.text();
    expect(readingCopy).toContain("<strong>THE BOOKS</strong>");
    expect(readingCopy).toContain("gazette_founding");

    // The rack lists it, free, on both faces, as the shop's paper.
    const rack = await json(await SELF.fetch(`${BASE}/gazette`));
    expect(String(rack["gazette"])).toContain("shop's paper of record");
    const founding = rack["founding_edition"] as Record<string, unknown>;
    expect(founding["price_usdc"]).toBe(0);
    expect(founding["url"]).toBe(`${BASE}/gazette/founding`);

    // The storefront points at it.
    const storefront = await (await SELF.fetch(`${BASE}/`)).text();
    expect(storefront).toContain("/gazette/founding");

    // Rack numbering starts after Issue No. 1.
    const counter = await testEnv.COUNTERS.get("gazette_issue_count");
    expect(parseInt(counter ?? "0", 10)).toBeGreaterThanOrEqual(1);
  });

  it("signs dispatches at press and verifies them by number", async () => {
    // Publish a dispatch through the admin lever with a real approved tip.
    const tip = await json(
      await SELF.fetch(`${BASE}/api/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "The founding edition is free. Take one.",
          contributor_name: "a helpful agent",
        }),
      }),
    );
    const tipId = String(tip["tip_id"]);
    await SELF.fetch(`${BASE}/admin/tips/${tipId}/approve`, {
      method: "POST",
      headers: adminAuth,
      redirect: "manual",
    });
    const published = await SELF.fetch(`${BASE}/admin/gazette/publish`, {
      method: "POST",
      headers: {
        ...adminAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        title: "Signed at press",
        tip_ids: tipId,
      }).toString(),
      redirect: "manual",
    });
    expect([200, 302]).toContain(published.status);

    const rack = await json(await SELF.fetch(`${BASE}/gazette`));
    const issues = rack["issues"] as Array<Record<string, unknown>>;
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issueNumber = issues[0]?.["issue_number"];

    const verified = await json(
      await SELF.fetch(`${BASE}/api/verify/gazette_${issueNumber}`),
    );
    expect(verified["valid"]).toBe(true);
    expect(verified["kind"]).toBe("gazette_issue");
  });
});
