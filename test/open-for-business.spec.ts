import { SELF, env } from "cloudflare:test";
import { signalStore } from "@/services/signal-store";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { OPEN_FOR_BUSINESS_USDC } from "@/store/copy/open-for-business";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import { countedWindow, draftOpenForBusiness, publishClosedWeek, renderOpenForBusinessMarkdown, weekCloseInstant } from "@/services/open-for-business";
import { readWeekChanges, renderWeekChangesMarkdown, weekChanges, type PullsFetcher } from "@/services/week-changes";
import { recordInputRefusal, recordPageRead, recordSettleSignal } from "@/services/buyer-signals";
import { metricsMonth } from "@/lib/metrics";
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

/** A GitHub pulls answer with the given merged rows; the fetcher never touches the network. */
function pullsOf(rows: Array<{ number: number; title: string; merged_at: string | null; login?: string; type?: string }>): PullsFetcher {
  return async () =>
    rows.map((row) => ({
      number: row.number,
      title: row.title,
      merged_at: row.merged_at,
      html_url: `https://github.com/seancrecord/scvd-general-store-repo/pull/${row.number}`,
      user: { login: row.login ?? "seancrecord", type: row.type ?? "User" },
    }));
}

async function clearWeekChanges(): Promise<void> {
  const listed = await testEnv.COUNTERS.list({ prefix: "week_changes:" });
  for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
}

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
 * Noon on the 15th of the wall clock's month: the recorders write to
 * metricsMonth() of the real clock, and a week holding the 15th has
 * its Thursday in the same month, so the draft's counted window and
 * the recorders' month agree on every day of the year. A draft laid
 * at the real "now" would read a different month on a Friday-to-Sunday
 * after a month boundary and the verdict would move with the clock.
 */
function midMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12));
}

/**
 * OPEN FOR BUSINESS, the weekly draft: assembled from readers that already
 * serve the desk, every number with its denominator, every section
 * naming what it could not see, and the fix of the week left blank
 * for the keeper. A reader that fails marks its section unread
 * rather than printing a zero (rule 52).
 */

beforeEach(async () => {
  await signalStore(testEnv)?.reset();
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  for (const key of listed.keys) {
    if (key.name.includes(":signals:")) await testEnv.COUNTERS.delete(key.name);
  }
});

describe("the draft", () => {
  it("lays four sections with denominators and gaps, and leaves the fix to the keeper", async () => {
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "bad_request", input_field: "host" }, "https://x.example/api");
    await recordSettleSignal(testEnv, { door: "http", network: "eip155:8453", item: "hello", purpose: "a test", house: false });
    const draft = await draftOpenForBusiness(testEnv, midMonth());
    expect(draft.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(draft.window.month).toBe(metricsMonth());
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
    expect(hungUp.numbers.find((n) => n.label.startsWith("pre-payment 400s, "))?.value).toBe(1);
    expect(hungUp.rows.some(([k]) => k === "spot_check:host:malformed")).toBe(true);
    // No fetcher and the facilitator mock refuses outbound fetches: the week's changes are NOT READ, never empty.
    expect(draft.changes.read).toBe(false);
    expect(draft.fix_of_the_week).toContain("were not read");
    expect(draft.unread).toContain("the week's changes");
  });

  it("renders Markdown a keeper can paste, with the number of the week first", async () => {
    const draft = await draftOpenForBusiness(testEnv, new Date(), pullsOf([]));
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

describe("the fix of the week, derived from the week's merged pull requests", () => {
  beforeEach(clearWeekChanges);

  it("keeps the week's merges, dated and titled, and leaves out bots and other weeks", async () => {
    const pulls = pullsOf([
      { number: 808, title: "Open for Business: the seller's weekly on the shelf at $25", merged_at: "2026-09-18T17:30:00Z" },
      { number: 806, title: "Doors Open: the weekly issue for sellers", merged_at: "2026-09-18T16:11:00Z" },
      { number: 799, title: "chore(deps): bump vitest", merged_at: "2026-09-16T09:00:00Z", login: "dependabot[bot]", type: "Bot" },
      { number: 790, title: "Last week's change", merged_at: "2026-09-13T12:00:00Z" },
      { number: 812, title: "Closed without merging", merged_at: null },
    ]);
    const read = await readWeekChanges(testEnv, "2026-W38", pulls);
    expect(read?.read).toBe(true);
    expect(read?.rows.map((row) => row.number)).toEqual([808, 806]);
    expect(read?.rows[0]?.merged_on).toBe("2026-09-18");
    const md = renderWeekChangesMarkdown(read!);
    expect(md).toContain("- 2026-09-18 — Open for Business: the seller's weekly on the shelf at $25 ([#808](https://github.com/seancrecord/scvd-general-store-repo/pull/808))");
    expect(md).toContain("a seller can copy on Monday");
    expect(renderWeekChangesMarkdown({ week: "2026-W38", read: true, read_at: "", rows: [], truncated: false })).toContain("Nothing changed at our own door this week");
  });

  it("says not read when GitHub does not answer, and never keeps that as the week's answer", async () => {
    const silent: PullsFetcher = async () => null;
    const first = await weekChanges(testEnv, "2026-W38", new Date("2026-09-18T18:00:00Z"), silent);
    expect(first.read).toBe(false);
    expect(renderWeekChangesMarkdown(first)).toContain("were not read");
    const later = await weekChanges(testEnv, "2026-W38", new Date("2026-09-18T18:01:00Z"), pullsOf([{ number: 1, title: "A change", merged_at: "2026-09-17T10:00:00Z" }]));
    expect(later.read).toBe(true);
    expect(later.rows.length).toBe(1);
    // A closed week's successful read is kept: the next asker gets it without a fetch.
    let asked = 0;
    const counting: PullsFetcher = async () => { asked += 1; return []; };
    const held = await weekChanges(testEnv, "2026-W38", new Date("2026-09-22T00:30:00Z"), counting);
    expect(held.rows.length).toBe(1);
    expect(asked).toBe(0);
  });

  it("the draft carries the list under the fix of the week", async () => {
    const draft = await draftOpenForBusiness(testEnv, new Date("2026-09-18T18:00:00Z"), pullsOf([{ number: 808, title: "A change at our door", merged_at: "2026-09-18T17:30:00Z" }]));
    expect(draft.changes.read).toBe(true);
    const md = renderOpenForBusinessMarkdown(draft);
    expect(md.indexOf("## The fix of the week")).toBeGreaterThan(0);
    expect(md).toContain("- 2026-09-18 — A change at our door ([#808]");
    expect(draft.unread).not.toContain("the week's changes");
  });
});

describe("the Monday press", () => {
  beforeEach(async () => {
    await clearShelf();
    await clearWeekChanges();
  });

  it("puts the closed week on the shelf once, never over the keeper's own, and skips weeks before the shelf opened", async () => {
    const pulls = pullsOf([{ number: 808, title: "A change at our door", merged_at: "2026-09-18T17:30:00Z" }]);
    // Monday 2026-09-21 00:30Z: W38 has just closed.
    const monday = new Date("2026-09-21T00:30:00Z");
    const first = await publishClosedWeek(testEnv, monday, pulls);
    expect(first.outcome).toBe("published");
    expect(first.issue?.week).toBe("2026-W38");
    expect(first.issue?.date).toBe("2026-09-21");
    expect(first.issue?.markdown).toContain("- 2026-09-18 — A change at our door");
    const index = (await (await SELF.fetch(`${BASE}/open-for-business`, { headers: { Accept: "application/json" } })).json()) as { issues: Array<{ week: string }> };
    expect(index.issues.map((issue) => issue.week)).toEqual(["2026-W38"]);
    // The next hourly firing finds it there and leaves it alone.
    const again = await publishClosedWeek(testEnv, new Date("2026-09-21T01:30:00Z"), pulls);
    expect(again.outcome).toBe("already_on_shelf");
    // The keeper's own version of a week stands: the press never overwrites it.
    expect((await publish("2026-W39", "# The keeper's own W39\n\nHis words.")).status).toBe(302);
    const keeperWins = await publishClosedWeek(testEnv, new Date("2026-09-28T00:30:00Z"), pulls);
    expect(keeperWins.outcome).toBe("already_on_shelf");
    expect(keeperWins.issue?.title).toBe("The keeper's own W39");
    // A week that closed before the shelf opened is never sold.
    const early = await publishClosedWeek(testEnv, new Date("2026-09-14T00:30:00Z"), pulls);
    expect(early.outcome).toBe("before_opening");
    expect((await SELF.fetch(`${BASE}/open-for-business/2026-W37`)).status).toBe(404);
  });

  it("the desk says when the press fires next and shows the week's changes", async () => {
    const page = await (await SELF.fetch(`${BASE}/admin/open-for-business`, { headers: AUTH })).text();
    expect(page).toContain("It goes on the shelf on its own");
    expect(page).toContain("The fix of the week");
    expect(page).toContain("Not read:");
  });
});

/**
 * THE COUNTED WINDOW AND THE HONEST LEADS (2026-09-28). Every reader
 * is month-keyed, so a weekly reads a month to date and must say
 * which days; the press reads the month that holds most of the week,
 * never the month of the instant it fired. And four sentences that
 * claimed more than their counters: the sweep printed as repeat
 * readers, the age printed as a who, the "other" refusals left
 * unnamed, machinery counted beside clients at the MCP door.
 */
describe("the counted window and the honest leads", () => {
  const METRIC_PREFIXES = ["metric:2026-10:", "metric:2026-11:"];
  async function clearMetrics(): Promise<void> {
    const month = metricsMonth(midMonth());
    for (const prefix of [...METRIC_PREFIXES, `metric:${month}:mcpclient:`, `metric:${month}:src:`, `metric:${month}:src402:`, `metric:${month}:verifyage:`]) {
      const listed = await testEnv.COUNTERS.list({ prefix });
      for (const key of listed.keys) await testEnv.COUNTERS.delete(key.name);
    }
  }
  beforeEach(async () => {
    await clearShelf();
    await clearWeekChanges();
    await clearMetrics();
  });

  it("names the days it counted: the month that holds most of the week, or the month under way when that one has not begun", () => {
    // W40 is 2026-09-28 to 2026-10-04. On the desk on the 28th, October has not begun: September to date.
    expect(countedWindow("2026-W40", new Date("2026-09-28T12:00:00Z"))).toEqual({ month: "2026-09", from: "2026-09-01", to: "2026-09-28", days: 28, reason: "week_month_not_begun" });
    // Pressed at the week's close, the same issue reads October, which holds four of its seven days.
    expect(countedWindow("2026-W40", weekCloseInstant("2026-W40"))).toEqual({ month: "2026-10", from: "2026-10-01", to: "2026-10-04", days: 4, reason: "holds_most_of_the_week" });
    // W44 is 2026-10-26 to 2026-11-01: the press fires in November and reads all of October.
    expect(countedWindow("2026-W44", weekCloseInstant("2026-W44"))).toEqual({ month: "2026-10", from: "2026-10-01", to: "2026-10-31", days: 31, reason: "holds_most_of_the_week" });
    // A week inside one month is that month to its last day.
    expect(countedWindow("2026-W38", weekCloseInstant("2026-W38"))).toEqual({ month: "2026-09", from: "2026-09-01", to: "2026-09-20", days: 20, reason: "holds_most_of_the_week" });
  });

  it("the press reads the month that holds most of the week, and the issue says which days", async () => {
    await testEnv.COUNTERS.put(KV_KEYS.metric("2026-10", "mcpclient", "census"), JSON.stringify({ "claude-code": 3 }));
    await testEnv.COUNTERS.put(KV_KEYS.metric("2026-11", "mcpclient", "census"), JSON.stringify({ "claude-code": 1 }));
    // Monday 2026-11-02 00:30Z: W44 has just closed, one day into November.
    const pressed = await publishClosedWeek(testEnv, new Date("2026-11-02T00:30:00Z"), pullsOf([]));
    expect(pressed.outcome).toBe("published");
    expect(pressed.issue?.week).toBe("2026-W44");
    const md = pressed.issue?.markdown ?? "";
    expect(md).toContain("2026-10-01 to 2026-10-31, 31 days");
    expect(md).toContain("- …claude-code: **3** of 3");
    expect(md).not.toContain("this month");
    // The standing line is a quote now, so the free line is a fact of the week, not the same sentence every week.
    expect(pressed.issue?.teaser).not.toContain("The week in agent buying");
    expect(md).toContain("> _The week in agent buying");
  });

  it("calls a walk a walk: every host read twice by an unnamed agent is an index, not a repeat reader", async () => {
    for (let i = 0; i < 25; i += 1) {
      for (let read = 0; read < 2; read += 1) {
        await recordPageRead(testEnv, { page: "corpus_host", format: "json", subject: `host${i}.example`, userAgent: "python-httpx/0.27", accept: "application/json", referrer: undefined, ownHost: "scvd.store", house: false });
      }
    }
    const draft = await draftOpenForBusiness(testEnv, midMonth(), pullsOf([]));
    const who = draft.sections.find((s) => s.heading === "Who looked at the record")!;
    expect(who.lead).toContain("none of them referred from the door itself");
    expect(who.lead).toContain("an index walking, not a seller reading");
    expect(who.lead).not.toContain("operators checking their own listing");
    expect(who.numbers.find((n) => n.label === "hosts read five or more times")).toEqual({ label: "hosts read five or more times", value: 0, of: 25 });
    expect(who.numbers.find((n) => n.label === "reads per host, mean")?.value).toBe(2);
    expect(who.numbers.some((n) => n.label.includes("read more than once"))).toBe(false);
  });

  it("the number of the week stops at the age, and the went-well lead says age is when, not who", async () => {
    const month = metricsMonth(midMonth());
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "verifyage", "over_1w"), "12");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "verifyage", "under_1h"), "10");
    const draft = await draftOpenForBusiness(testEnv, midMonth(), pullsOf([]));
    expect(draft.number_of_the_week?.sentence).toBe(`12 of 22 receipt re-checks between ${draft.window.from} and ${draft.window.to} came more than a week after minting.`);
    expect(draft.number_of_the_week?.sentence).not.toContain("someone other than the buyer");
    const well = draft.sections.find((s) => s.heading === "What went well")!;
    expect(well.lead).toContain("Age says when, not who");
    expect(well.lead).not.toContain("somebody the buyer showed the artifact to, checking it without us");
  });

  it("names the code behind the other refusals and derives the disclosure line from its counter", async () => {
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "unsupported_network" }, undefined, { userAgent: "python-httpx/0.27" });
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "unsupported_network" }, undefined, { userAgent: "python-httpx/0.27" });
    await recordInputRefusal(testEnv, getMenuItem("spot_check"), "spot_check", { code: "bad_request", input_field: "host" }, undefined, { userAgent: "python-httpx/0.27" });
    const draft = await draftOpenForBusiness(testEnv, midMonth(), pullsOf([]));
    const hungUp = draft.sections[0]!;
    expect(hungUp.lead).toContain("1 for a field they left out");
    expect(hungUp.lead).toContain("2 for something other than a field's shape, most often `unsupported_network` (2)");
    expect(hungUp.rows.some(([k]) => k === "spot_check:unsupported_network:other")).toBe(true);
    expect(hungUp.not_seen.some((gap) => gap.includes("left blank"))).toBe(false);
    expect(hungUp.not_seen.some((gap) => /\d+ of \d+ buyers filled it/.test(gap))).toBe(true);
  });

  it("keeps machinery off the client side of the MCP census and puts the till against the door", async () => {
    const month = metricsMonth(midMonth());
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "mcpclient", "census"), JSON.stringify({ "claude-code": 5, "glimind-probe": 4, other: 2 }));
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "src402", "direct"), "400");
    await testEnv.COUNTERS.put(KV_KEYS.metric(month, "src", "direct"), "2");
    const draft = await draftOpenForBusiness(testEnv, midMonth(), pullsOf([]));
    const entry = draft.sections.find((s) => s.heading === "Entry points")!;
    const byLabel = (label: string) => entry.numbers.find((n) => n.label === label);
    expect(byLabel("MCP handshakes from clients not in the machinery table")?.value).toBe(5);
    expect(byLabel("…claude-code")).toEqual({ label: "…claude-code", value: 5, of: 5 });
    expect(byLabel("MCP handshakes from self-identified machinery")?.value).toBe(4);
    expect(byLabel("…glimind-probe")).toEqual({ label: "…glimind-probe", value: 4, of: 4 });
    expect(entry.numbers.find((n) => n.label.startsWith("MCP handshakes from names past the census cap"))?.value).toBe(2);
    expect(byLabel("…that ended in an organic settle")).toEqual({ label: "…that ended in an organic settle", value: 2, of: 400 });
    expect(byLabel("…on the direct channel: settles of 402s")).toEqual({ label: "…on the direct channel: settles of 402s", value: 2, of: 400 });
    expect(entry.lead).toContain("one settle for every 200 challenges, and a 402 is a quote, not an attempt");
  });
});
