import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { OPEN_FOR_BUSINESS_USDC } from "@/store/copy/open-for-business";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import { draftOpenForBusiness, renderOpenForBusinessMarkdown } from "@/services/open-for-business";
import { recordInputRefusal, recordSettleSignal } from "@/services/buyer-signals";
import { getMenuItem } from "@/store";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

beforeAll(() => {
  installFacilitatorMock();
});

async function clearShelf(): Promise<void> {
  const listed = await testEnv.ORDERS.list({ prefix: KV_KEYS.openForBusinessIssuePrefix });
  for (const key of listed.keys) await testEnv.ORDERS.delete(key.name);
}

const ISSUE = `# Open for Business — 2026-W38

_The week in agent buying, from the till at scvd.store._

## The number of the week

**3 of 41 receipt re-checks this month came more than a week after minting, from someone other than the buyer.** (verify age counters)

## Where they got hung up

Nine agents were refused before paying; six for a field they left out.

## The fix of the week

Name the required field in the 400 body, not only in the schema.
`;

async function publish(week = "2026-W38", markdown = ISSUE, teaser = ""): Promise<Response> {
  const form = new URLSearchParams({ week, markdown, teaser });
  return SELF.fetch(`${BASE}/admin/open-for-business/publish`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
}

/**
 * OPEN FOR BUSINESS, the weekly draft: assembled from readers that already
 * serve the desk, every number with its denominator, every section
 * naming what it could not see, and the fix of the week left blank
 * for the keeper. A reader that fails marks its section unread
 * rather than printing a zero (rule 52).
 */

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  for (const key of listed.keys) {
    if (key.name.includes(":signals:")) await testEnv.COUNTERS.delete(key.name);
  }
});

describe("the draft", () => {
  it("lays four sections with denominators and gaps, and leaves the fix to the keeper", async () => {
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "bad_request", input_field: "host" }, "https://x.example/api");
    await recordSettleSignal(testEnv, { door: "http", network: "eip155:8453", item: "hello", purpose: "a test", house: false });
    const draft = await draftOpenForBusiness(testEnv);
    expect(draft.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(draft.sections.map((s) => s.heading)).toEqual([
      "Where they got hung up",
      "What went well",
      "Entry points",
      "Latency and the silent turnaway",
      "Who looked at the record",
    ]);
    for (const section of draft.sections) {
      expect(section.not_seen.length, section.heading).toBeGreaterThan(0);
    }
    const hungUp = draft.sections[0]!;
    expect(hungUp.unread).toBe(false);
    expect(hungUp.numbers.find((n) => n.label === "pre-payment 400s this month")?.value).toBe(1);
    expect(hungUp.rows.some(([k]) => k === "spot_check:host:malformed")).toBe(true);
    expect(draft.fix_of_the_week).toBe("");
  });

  it("renders Markdown a keeper can paste, with the number of the week first", async () => {
    const draft = await draftOpenForBusiness(testEnv);
    const md = renderOpenForBusinessMarkdown(draft);
    expect(md.startsWith(`# Open for Business — ${draft.week}`)).toBe(true);
    expect(md.indexOf("## The number of the week")).toBeLessThan(md.indexOf("## Where they got hung up"));
    expect(md).toContain("## The fix of the week");
    expect(md).toContain("What this section did not see:");
  });

  it("is on the desk for the keeper, as a page and as Markdown, behind the gate", async () => {
    const page = await SELF.fetch(`${BASE}/admin/open-for-business`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Open for Business");
    expect(html).toContain("The issue, ready to publish");
    expect(html).toContain("<textarea");
    const md = await SELF.fetch(`${BASE}/admin/open-for-business.md`, { headers: AUTH });
    expect(md.status).toBe(200);
    expect(md.headers.get("Content-Type")).toContain("text/markdown");
    expect(await md.text()).toContain("# Open for Business");
    expect((await SELF.fetch(`${BASE}/admin/open-for-business.md`)).status).toBe(401);
    expect(html).toContain('action="/admin/open-for-business/publish"');
  });
});

describe("the shelf", () => {
  beforeEach(clearShelf);

  it("an empty shelf still answers as a page, a twin and a document, and refuses an unknown week before the gate", async () => {
    const page = await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "text/html" } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("No issue on the shelf yet");
    const twin = (await (await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "application/json" } })).json()) as Record<string, unknown>;
    expect(twin["issues"]).toEqual([]);
    expect(twin["price_usdc"]).toBe(OPEN_FOR_BUSINESS_USDC);
    for (const key of ["what_this_is", "price", "how_to_call", "errors", "security", "checkout"]) expect(twin[key], key).toBeDefined();
    const md = await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "text/markdown" } });
    expect(md.headers.get("Content-Type")).toContain("text/markdown");
    const missing = await SELF.fetch(`${BASE}/open-for-business/2026-W01`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("PAYMENT-REQUIRED")).toBeNull();
    expect((await SELF.fetch(`${BASE}/open-for-business/not-a-week`)).status).toBe(404);
  });

  it("the keeper publishes from the desk, the index lists it at the price, and a paid GET delivers the issue", async () => {
    expect((await publish()).status).toBe(302);
    const twin = (await (await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "application/json" } })).json()) as {
      issues: Array<{ week: string; title: string; teaser: string; number_of_the_week: string | null; price_usdc: number; url: string; buy_url: string }>;
    };
    expect(twin.issues.length).toBe(1);
    const issue = twin.issues[0]!;
    expect(issue.week).toBe("2026-W38");
    expect(issue.title).toBe("Open for Business — 2026-W38");
    expect(issue.number_of_the_week).toContain("3 of 41 receipt re-checks");
    expect(issue.teaser).toBe("The week in agent buying, from the till at scvd.store.");
    expect(issue.price_usdc).toBe(OPEN_FOR_BUSINESS_USDC);
    expect(issue.buy_url).toBe(issue.url);
    const page = await (await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "text/html" } })).text();
    expect(page).toContain(`$${OPEN_FOR_BUSINESS_USDC}`);
    expect(page).toContain("3 of 41 receipt re-checks");
    expect(page).toContain('"@type":"PublicationIssue"');
    expect(page).not.toContain("Name the required field in the 400 body");

    const quote = await SELF.fetch(issue.url);
    expect(quote.status).toBe(402);
    expect(quote.headers.get("Cache-Control")).toBe("no-store");
    const required = decodePaymentRequired(quote);
    const first = required.accepts[0]!;
    expect(Number(first.amount)).toBe(OPEN_FOR_BUSINESS_USDC * 1_000_000);
    const unpaid = (await quote.json()) as { price_usdc: number; checkout: { delivery_mime_type: string } };
    expect(unpaid.price_usdc).toBe(OPEN_FOR_BUSINESS_USDC);
    expect(unpaid.checkout.delivery_mime_type).toBe("text/markdown");

    const paid = await SELF.fetch(issue.url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(first) } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    expect(paid.headers.get("Content-Type")).toContain("text/markdown");
    expect(paid.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
    expect(await paid.text()).toContain("Name the required field in the 400 body");

    // Listed everywhere a buyer looks: discovery, the compact shelf, the catalog's publications.
    const manifest = (await (await SELF.fetch(`${BASE}/.well-known/x402.json`)).json()) as { resources: Array<{ resource: string; accepts: Array<{ amount: string }> }> };
    const row = manifest.resources.find((r) => r.resource === issue.url);
    expect(row, "in x402 discovery").toBeDefined();
    expect(row!.accepts[0]!.amount).toBe(first.amount);
    const compact = (await (await SELF.fetch(`${BASE}/open-for-business?view=compact`)).json()) as { issues: unknown[]; total: number };
    expect(compact.total).toBe(1);
    expect(compact.issues.length).toBe(1);
    const openapi = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as { paths: Record<string, unknown> };
    expect(openapi.paths["/open-for-business/{week}"]).toBeDefined();
  });

  it("refuses a body with no heading, replaces the same week, and takes an issue down", async () => {
    const refused = await publish("2026-W39", "just words, no heading");
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("Nothing was published");
    expect((await publish("2026-w39", "# First\n\nOne line.")).status).toBe(302);
    expect((await publish("2026-W39", "# Second\n\nAnother line.", "a chosen line")).status).toBe(302);
    const twin = (await (await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "application/json" } })).json()) as { issues: Array<{ week: string; title: string; teaser: string }> };
    expect(twin.issues).toEqual([expect.objectContaining({ week: "2026-W39", title: "Second", teaser: "a chosen line" })]);
    const removed = await SELF.fetch(`${BASE}/admin/open-for-business/remove`, {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/x-www-form-urlencoded" },
      body: "week=2026-W39",
      redirect: "manual",
    });
    expect(removed.status).toBe(302);
    expect((await SELF.fetch(`${BASE}/open-for-business/2026-W39`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/admin/open-for-business/publish`, { method: "POST", body: "week=2026-W40&markdown=%23+x%0A%0Ay" })).status).toBe(401);
  });
});
