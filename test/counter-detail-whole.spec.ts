import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env, OrderRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const KEEPER = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE WORK ORDER IS SHOWN WHOLE WHILE THE WORK IS OPEN (2026-09-04, the
 * keeper, reading his own counter after a the_collab test purchase):
 * "its truncated meaning if i read it in the admin console ill have no
 * idea what they wanted to do".
 *
 * The buyer's detail was clipped at 200 characters on every order row,
 * open or delivered, and the_collab's gate takes 600. The clip is right
 * for the delivered list, which folds away and exists to be scrolled
 * past. It is wrong for an open order, which is the one thing on that
 * page the keeper has to READ to act. So: an open order shows every
 * character the buyer paid to send, and a delivered one is still
 * clipped — both asserted from the same fixture, so a fix that lifts
 * the clip everywhere fails as loudly as one that lifts it nowhere.
 */

// Under the_collab's 600-character intake cap, over the old 200 clip,
// with paragraphs because a pitch has them and the row has to keep
// them. No apostrophes, quotes, ampersands or angle brackets: the page
// HTML-escapes the detail, and a fixture that escapes to different
// bytes would let the raw-string assertions below pass or fail for the
// wrong reason.
const PITCH = [
  "Last item on the shelf run today, funded for this specifically. Real ask, not a test:",
  "since this is the one thing that takes both of us, we should actually make something.",
  "My pitch: a short joint piece, two instruments reading one settlement, each publishing",
  "what it saw and how, and both publishing the delta. No integration, no dependency.",
  "If we agree that is a boring result that makes both more credible. If not, one of us",
  "learns something. You pick the settlement. I go second and publish my method whole.",
  "Reply here or on the issue, either is fine. Sending this now while the shelf is open.",
].join("\n");
const TAIL = "Sending this now while the shelf is open.";
const ESCAPABLE = /[&<>"']/;

function order(overrides: Partial<OrderRecord>): OrderRecord {
  return {
    order_id: "ord_test_detail",
    item_id: "the_collab",
    item_name: "The Collab",
    status: "queued",
    created_at: "2026-09-04T20:00:00.000Z",
    sla_hours: 72,
    paid_usdc: 25,
    tip_usdc: 0,
    patron_number: 9001,
    cert_id: "cert_test_detail",
    detail: PITCH,
    ...overrides,
  };
}

async function counter(): Promise<string> {
  const page = await SELF.fetch(`${BASE}/admin/counter`, { headers: KEEPER });
  expect(page.status).toBe(200);
  return page.text();
}

describe("the buyer's detail on the keeper's counter", () => {
  it("is the fixture the test relies on: longer than the old clip, at the gate's cap", () => {
    expect(PITCH.length).toBeGreaterThan(200);
    expect(PITCH.length).toBeLessThanOrEqual(600);
    expect(PITCH.endsWith(TAIL)).toBe(true);
    // The raw-string assertions below are only assertions if the page
    // renders these bytes unchanged.
    expect(ESCAPABLE.test(PITCH)).toBe(false);
  });

  it("shows an open order's detail whole, paragraphs kept", async () => {
    const open = order({ order_id: "ord_open_pitch", status: "queued" });
    await testEnv.ORDERS.put(KV_KEYS.order(open.order_id), JSON.stringify(open));

    const page = await counter();
    expect(page).toContain("ord_open_pitch");
    // The last sentence is the one the 200-character clip lost.
    expect(page).toContain(TAIL);
    // And the middle is not elided: no ellipsis follows the first 200
    // characters of this detail anywhere on the page.
    expect(page).not.toContain(`${PITCH.slice(0, 200)}…`);
    // Line breaks survive as line breaks, not as one run-on paragraph.
    expect(page).toContain("white-space:pre-wrap");
  });

  it("still clips a delivered order, which folds away", async () => {
    const done = order({
      order_id: "ord_done_pitch",
      status: "completed",
      deliverable: "Done: the joint piece is up.",
      completed_at: "2026-09-04T21:00:00.000Z",
    });
    await testEnv.ORDERS.put(KV_KEYS.order(done.order_id), JSON.stringify(done));

    const page = await counter();
    expect(page).toContain("ord_done_pitch");
    // The delivered row is inside the folded list and keeps the clip.
    const doneRow = page.slice(page.indexOf("ord_done_pitch"));
    expect(doneRow).toContain(`${PITCH.slice(0, 200)}…`);
  });
});
