import { describe, expect, it } from "vitest";
import { renderCounterPage, type CounterPageData } from "@/pages/admin/counter-page";
import type { CommissionRequest, OrderRecord } from "@/types";

const now = new Date("2026-10-10T12:00:00Z");
const brief = (id: string, extra: Partial<CommissionRequest> = {}): CommissionRequest => ({
  id, description: `Brief ${id}`, contact: "buyer@example.test", offer_usdc: 100,
  date: "2026-10-09T12:00:00Z", ...extra,
});
const order = (id: string, extra: Partial<OrderRecord> = {}): OrderRecord => ({
  order_id: id, item_id: "commission_100", item_name: "Commission", status: "queued",
  created_at: "2026-10-09T12:00:00Z", sla_hours: 48, paid_usdc: 100,
  tip_usdc: 0, patron_number: 1, cert_id: "cert_test", ...extra,
});
const data = (extra: Partial<CounterPageData> = {}): CounterPageData => ({
  weekNote: "", alerts: [], orders: [], closers: [], stockShelves: {}, grudges: [],
  letters: [], standingReply: "", confessions: [], trainTags: [], tips: [], refunds: [],
  commissions: [], waitlist: [], failedItems: {}, guestbook: [], loadNotes: [], ...extra,
});
const attention = (html: string) => html.match(/<section id="needs-attention">([\s\S]*?)<\/section>/)?.[1] ?? "";

describe("the counter's revenue work at a glance", () => {
  it("surfaces an unanswered brief before reference material and links the existing controls", () => {
    const html = renderCounterPage(data({ commissions: [brief("req_new")] }), now);
    expect(html).not.toContain("Nothing needs your hands.");
    expect(html).toContain("1 brief or quote to review");
    expect(attention(html)).toContain("New briefs (1)");
    expect(attention(html)).toContain('href="#request-req_new"');
    expect(html).toContain('id="request-req_new"');
    const main = html.slice(html.indexOf('<main id="admin-content"'));
    expect(main.indexOf('id="needs-attention"')).toBeLessThan(main.indexOf("This week's note"));
    expect(html).toContain("Proposed budget: 100 USDC");
    expect(html).toContain('action="/admin/commission/req_new/quote"');
  });

  it("separates expired, expiring and waiting quotes using the same injected clock", () => {
    const quoted = (id: string, expiry: string) => brief(id, { status: "quoted", quote_usdc: 50, quote_expires_at: expiry });
    const html = renderCounterPage(data({ commissions: [
      quoted("expired", "2026-10-10T11:59:59Z"),
      quoted("soon", "2026-10-12T12:00:00Z"),
      quoted("waiting", "2026-10-12T12:00:01Z"),
    ] }), now);
    expect(attention(html)).toContain("Expired quotes (1)");
    expect(attention(html)).toContain("Expiring within 48 hours (1)");
    expect(attention(html)).toContain("Waiting on buyer (1)");
    expect(html).toContain("2 briefs or quotes to review");
    expect(html).toContain("[quote expired]");
  });

  it("counts paid work once, drops completed work, and calls out missing order evidence", () => {
    const html = renderCounterPage(data({
      commissions: [brief("paid", { status: "accepted", order_id: "ord_open" }),
        brief("done", { status: "accepted", order_id: "ord_done" }),
        brief("missing", { status: "accepted", order_id: "ord_missing" })],
      orders: [order("ord_open"), order("ord_done", { status: "completed" })],
    }), now);
    expect(html).toContain("2 things need your hands:");
    expect(attention(html)).toContain("Paid work to deliver (1)");
    expect(attention(html)).toContain('href="#order-ord_open"');
    expect(html).toContain('id="order-ord_open"');
    expect(attention(html)).not.toContain("Brief done");
    expect(attention(html)).toContain("Accepted request: check order (1)");
    expect(attention(html)).toContain("Order not in this reading; check its record before acting.");
  });

  it("keeps directory suggestions and declined briefs out of the sales queue", () => {
    const html = renderCounterPage(data({ commissions: [brief("directory", { suggest_listing: "Example https://example.test" }),
      brief("declined", { status: "declined", decline_reply: "Outside scope" })] }), now);
    expect(attention(html)).not.toContain("Brief directory");
    expect(attention(html)).not.toContain("Brief declined");
    expect(html).toContain("Directory suggestions (1)");
    expect(html).toContain("Closed commission requests (1)");
  });

  it("never claims a quiet desk when a source failed or the request scan is incomplete", () => {
    for (const extra of [{ loadNotes: ["orders unavailable"] }, { commissionsIncomplete: true }]) {
      const html = renderCounterPage(data(extra), now);
      expect(html).not.toContain("Nothing needs your hands.");
      expect(html).toContain("Partial reading");
    }
  });

  it("escapes stored text and treats a quote with no readable expiry as needing review", () => {
    const html = renderCounterPage(data({ commissions: [brief('bad"id', { status: "quoted", description: "<script>bad()</script>" })] }), now);
    expect(attention(html)).toContain("Quote date needs review (1)");
    expect(html).not.toContain("<script>bad()</script>");
    expect(attention(html)).toContain("&lt;script&gt;");
    expect(html).toContain("1 brief or quote to review");
  });

  it("keeps waiting quotes visible without asking for hands and caps previews without hiding the ledger", () => {
    const commissions = Array.from({ length: 7 }, (_, index) => brief(`waiting_${index}`, {
      status: "quoted", quote_usdc: 100, quote_expires_at: `2026-10-${15 + index}T12:00:00Z`,
    }));
    const html = renderCounterPage(data({ commissions }), now);
    expect(html).toContain("Nothing needs your hands.");
    expect(attention(html)).toContain("Waiting on buyer (7)");
    expect(attention(html)).toContain("See all 7; first 5 shown above");
    expect(attention(html)).not.toContain("Brief waiting_6");
    expect(html).toContain('id="request-waiting_6"');
  });
});
