import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CAPABILITY_QUERY, NOVELTY_ONLY, SPEC_RETURNS } from "@/store/spec";
import { getMenuItem } from "@/store";
import {
  deriveTrainFront,
  FRONT_TRAIN_CARS,
  listApprovedTags,
  paintTag,
  readTrainFront,
  setTagStatus,
  TAG_CAP,
  tagHasUrl,
} from "@/services/train";
import type { Env, TrainTagRecord } from "@/types";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

/**
 * GRAFFITI ON A TRAIN, Batch 5.
 *
 * The thing worth testing hardest is the split: the buyer pays for
 * PERSISTENCE, not PLACEMENT. A declined tag keeps a certificate that
 * verifies exactly as well as one on the wall. If that ever stops
 * being true, the store has sold something it didn't deliver.
 */
describe("the item", () => {
  it("is on the shelf at a dollar, pay-what-it-deserves, instant", () => {
    const item = getMenuItem("graffiti_on_a_train");
    expect(item).toBeDefined();
    expect(item?.price_usdc).toBe(1);
    expect(item?.pricing).toBe("pay_what_it_deserves");
    expect(item?.fulfillment).toBe("instant");
  });

  it("says out loud that the wall is a separate question", () => {
    const item = getMenuItem("graffiti_on_a_train");
    const constraints = (item?.constraints ?? []).join(" ").toLowerCase();
    expect(constraints).toContain("no urls");
    expect(constraints).toContain("140");
    // The one thing a buyer must not learn from a decline.
    expect(constraints).toContain("waits on the keeper");
    expect(SPEC_RETURNS["graffiti_on_a_train"]?.toLowerCase()).toContain(
      "separate",
    );
  });

  it("is filed as a novelty, not sold as trust infrastructure", () => {
    // The artifact is the point and the store says so. It is NOT on
    // the trust path and must not carry a why_use pretending it is.
    expect(NOVELTY_ONLY).toContain("graffiti_on_a_train");
    expect(CAPABILITY_QUERY["graffiti_on_a_train"]).toBeTruthy();
  });
});

describe("the tag guard, before money moves", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses an empty tag unpaid", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/graffiti_on_a_train?tag=`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error("no body");
    expect(String(body.error).toLowerCase()).toContain("no tag, no charge");
  });

  it("refuses a tag longer than the side of a train", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/graffiti_on_a_train?tag=${"x".repeat(TAG_CAP + 1)}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
  });

  it("refuses link spam, which is what a permanent public wall attracts", async () => {
    for (const spam of [
      "buy now at https://example.com",
      "check out example.xyz",
      "www.example.org rules",
    ]) {
      const response = await SELF.fetch(
        `${BASE}/api/buy/graffiti_on_a_train?tag=${encodeURIComponent(spam)}`,
        { headers: buying },
      );
      expect(response.status, spam).toBe(400);
    }
    // And an ordinary tag with a dot in it is still a tag.
    expect(tagHasUrl("agent-7 wuz here. again.")).toBe(false);
  });

  it("still quotes a price to anyone who only asks, per the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/graffiti_on_a_train`);
    expect(response.status).not.toBe(400);
  });
});

describe("the wall", () => {
  it("shows nothing until the keeper has walked by", async () => {
    const painted = await paintTag(testEnv, {
      tag: "pending-spec-tag wuz here",
      certId: "cert_pendingspec",
      patronNumber: 901,
    });
    expect(painted.record.status).toBe("pending_review");
    expect(painted.record.displayed_at).toBeUndefined();

    const wall = await listApprovedTags(testEnv);
    expect(
      wall.some((tag) => tag.id === painted.record.id),
      "an unreviewed tag reached the public wall",
    ).toBe(false);
  });

  it("stamps the display date apart from the purchase date", async () => {
    const painted = await paintTag(testEnv, {
      tag: "approved-spec-tag",
      certId: "cert_approvedspec",
      patronNumber: 902,
    });
    const approved = await setTagStatus(testEnv, painted.record.id, "approved");
    expect(approved?.status).toBe("approved");
    // Two different facts: when the paint went on, when he walked by.
    expect(approved?.displayed_at).toBeTruthy();
    expect(approved?.displayed_at).not.toBe(approved?.date);
  });

  it("leaves a declined tag's certificate entirely alone", async () => {
    const painted = await paintTag(testEnv, {
      tag: "declined-spec-tag",
      certId: "cert_declinedspec",
      patronNumber: 903,
    });
    const declined = await setTagStatus(testEnv, painted.record.id, "declined");
    // They bought the persistence, not the placement. The cert id on
    // the record is untouched and no code path here revokes anything.
    expect(declined?.status).toBe("declined");
    expect(declined?.cert_id).toBe("cert_declinedspec");
    expect(declined?.displayed_at).toBeUndefined();

    const wall = await listApprovedTags(testEnv);
    expect(wall.some((tag) => tag.id === painted.record.id)).toBe(false);
  });

  it("fills front to back: oldest tag first, unlike every other list here", async () => {
    const first = await paintTag(testEnv, {
      tag: "order-spec-one",
      certId: "cert_orderone",
      patronNumber: 904,
    });
    await setTagStatus(testEnv, first.record.id, "approved");
    const second = await paintTag(testEnv, {
      tag: "order-spec-two",
      certId: "cert_ordertwo",
      patronNumber: 905,
    });
    await setTagStatus(testEnv, second.record.id, "approved");

    const wall = await listApprovedTags(testEnv);
    const firstAt = wall.findIndex((tag) => tag.id === first.record.id);
    const secondAt = wall.findIndex((tag) => tag.id === second.record.id);
    expect(firstAt).toBeGreaterThanOrEqual(0);
    expect(secondAt).toBeGreaterThan(firstAt);
  });

  it("serves the wall to agents with the display policy stated", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/train`)).json();
    if (!isRecord(body)) throw new Error("no body");
    expect(String(body.note)).toContain("Tags go up when the keeper walks by");
    expect(Array.isArray(body.tags)).toBe(true);
    expect(String(body.display_policy).toLowerCase()).toContain(
      "placement, not proof",
    );
    // The tags are somebody else's words and the page says so.
    expect(String(body.content_note).toLowerCase()).toContain(
      "exactly as it arrived",
    );
    expect(String(body.content_note).toLowerCase()).toContain(
      "never the store's own words",
    );
  });

  it("escapes a tag rather than rendering it, since tags are untrusted", async () => {
    const painted = await paintTag(testEnv, {
      tag: '<script>alert("xss")</script>',
      certId: "cert_xssspec",
      patronNumber: 906,
    });
    await setTagStatus(testEnv, painted.record.id, "approved");
    const html = await (
      await SELF.fetch(`${BASE}/train`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("is reachable from the storefront, the sitemap and llms.txt", async () => {
    const storefront = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(storefront).toContain('href="/train"');

    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(xml).toContain(`${BASE}/train</loc>`);

    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain(`${BASE}/train`);
  });
});

describe("the counter's train queue is reversible", () => {
  /**
   * 2026-08-01: the keeper pressed "Signed and held" expecting it to
   * display the buyer's note, and the tag vanished from the queue
   * with no way back — the label named a state, not an action, and
   * the decline was one-way in the UI while setTagStatus was always
   * reversible underneath. Every status now shows its way back.
   */
  it("shows a held tag with a put-it-up-after-all button, and an approved one with a take-down", async () => {
    const adminAuth = {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    };
    const painted = await paintTag(testEnv, {
      tag: "reversibility test tag",
      certId: "cert_trainrev1",
      patronNumber: 990003,
    });
    await setTagStatus(testEnv, painted.record.id, "declined");
    let html = await (
      await SELF.fetch(`${BASE}/admin/counter`, { headers: adminAuth })
    ).text();
    expect(html).toContain("Put it up after all");
    expect(html).toContain("held off the wall");

    await setTagStatus(testEnv, painted.record.id, "approved");
    html = await (
      await SELF.fetch(`${BASE}/admin/counter`, { headers: adminAuth })
    ).text();
    // The live-tag take-down sits behind a fold: two taps, never one.
    expect(html).toContain("Take it down…");
    expect(html).toContain("Yes, take it down (cert untouched)");
  });

  it("stamps the display date once and keeps it through mistaps", async () => {
    const painted = await paintTag(testEnv, {
      tag: "date preservation test",
      certId: "cert_trainrev3",
      patronNumber: 990005,
    });
    const first = await setTagStatus(testEnv, painted.record.id, "approved");
    const firstDate = first?.displayed_at;
    expect(firstDate).toBeTruthy();
    // Double-submit of approve: the up-since date must not move.
    const again = await setTagStatus(testEnv, painted.record.id, "approved");
    expect(again?.displayed_at).toBe(firstDate);
    // Accidental take-down + put-back: the TRUE first-display date
    // survives, not the date of the mistake.
    await setTagStatus(testEnv, painted.record.id, "declined");
    const restored = await setTagStatus(testEnv, painted.record.id, "approved");
    expect(restored?.displayed_at).toBe(firstDate);
    // And a declined tag never reaches the public wall regardless.
    const wall = await listApprovedTags(testEnv);
    await setTagStatus(testEnv, painted.record.id, "declined");
    const wallAfter = await listApprovedTags(testEnv);
    expect(wall.some((t) => t.id === painted.record.id)).toBe(true);
    expect(wallAfter.some((t) => t.id === painted.record.id)).toBe(false);
  });

  it("labels the pending buttons as actions on the wall, not states", async () => {
    const adminAuth = {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    };
    await paintTag(testEnv, {
      tag: "pending label test",
      certId: "cert_trainrev2",
      patronNumber: 990004,
    });
    const html = await (
      await SELF.fetch(`${BASE}/admin/counter`, { headers: adminAuth })
    ).text();
    expect(html).toContain("Put it up on the wall");
    expect(html).toContain("Keep it off the wall (cert untouched)");
    expect(html).not.toContain(">Signed and held<");
  });
});

/**
 * THE TRAIN AT THE FRONT OF THE STORE (2026-08-29, the keeper's
 * design). Two properties carry the whole thing: the top car is
 * DERIVED from what was actually paid and carries the date it won on,
 * and every car is labeled as bought. A paid placement that does not
 * say so on a store built to publish honest observations is a
 * self-inflicted corrections entry.
 */
describe("the day's top tag, derived", () => {
  const tag = (
    id: string,
    date: string,
    paid?: number,
  ): TrainTagRecord => ({
    id,
    tag: `tag ${id}`,
    status: "approved",
    date,
    cert_id: `cert-${id}`,
    patron_number: 1,
    ...(paid === undefined ? {} : { paid_usdc: paid }),
  });

  it("hands the head car to the biggest bid of the day", () => {
    const front = deriveTrainFront([
      tag("a", "2026-08-29T01:00:00.000Z", 1),
      tag("b", "2026-08-29T02:00:00.000Z", 9),
      tag("c", "2026-08-29T03:00:00.000Z", 3),
    ]);
    expect(front.top?.id).toBe("b");
    expect(front.top_day).toBe("2026-08-29");
  });

  it("gives a tie to whoever got there first — matching is not outbidding", () => {
    const front = deriveTrainFront([
      tag("first", "2026-08-29T01:00:00.000Z", 5),
      tag("second", "2026-08-29T02:00:00.000Z", 5),
    ]);
    expect(front.top?.id).toBe("first");
  });

  it("never ranks a tag whose bid was not recorded, and never loses one either", () => {
    // Tags bought before the amount was written down are not zero
    // bids. They ride the train; they do not enter the auction.
    const front = deriveTrainFront([
      tag("unrecorded", "2026-08-29T01:00:00.000Z"),
      tag("recorded", "2026-08-29T02:00:00.000Z", 1),
    ]);
    expect(front.top?.id).toBe("recorded");
    expect(front.recent.map((entry) => entry.id)).toContain("unrecorded");
  });

  it("reads one day, not a running leaderboard", () => {
    // A bigger bid from an earlier day does not hold the head car:
    // the top tag is a dated observation about one day (rule 43).
    const front = deriveTrainFront([
      tag("old-whale", "2026-08-20T01:00:00.000Z", 100),
      tag("today", "2026-08-29T01:00:00.000Z", 2),
    ]);
    expect(front.top?.id).toBe("today");
    expect(front.top_day).toBe("2026-08-29");
  });

  it("says nothing at all when nobody bid", () => {
    const front = deriveTrainFront([]);
    expect(front.top).toBeUndefined();
    expect(front.recent).toEqual([]);
  });

  it("carries the last few cars, not the whole wall", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      tag(`t${index}`, `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const front = deriveTrainFront(many);
    expect(front.recent).toHaveLength(FRONT_TRAIN_CARS);
    // Oldest first, like the wall out back: the train fills front to back.
    expect(front.recent[0]?.id).toBe("t7");
    expect(front.recent.at(-1)?.id).toBe("t11");
  });
});

describe("the front card, derived where the keeper's hand falls", () => {
  it("is written when a tag is approved and read back as one key", async () => {
    const painted = await paintTag(testEnv, {
      tag: "one for the front page",
      certId: "cert-front-card",
      patronNumber: 41,
      paidUsdc: 7,
    });
    expect(painted.record.paid_usdc).toBe(7);
    await setTagStatus(testEnv, painted.record.id, "approved");
    const front = await readTrainFront(testEnv);
    expect(front).not.toBeNull();
    expect(
      front!.recent.some((entry) => entry.id === painted.record.id),
    ).toBe(true);
  });
});

describe("the front page prints it as bought", () => {
  it("labels the placement, dates the top car, and escapes the tag", async () => {
    const painted = await paintTag(testEnv, {
      tag: '<script>alert(1)</script> BIG MIKE',
      certId: "cert-storefront-train",
      patronNumber: 42,
      paidUsdc: 25,
    });
    await setTagStatus(testEnv, painted.record.id, "approved");
    const html = await (await SELF.fetch(`${BASE}/`)).text();
    // Bought, and saying so.
    expect(html).toContain("Paid placement");
    expect(html).toContain("TOP TAG");
    // A dated observation, never a standing title (rule 43).
    expect(html).toContain(painted.record.date.slice(0, 10));
    // Agent-authored untrusted text, escaped like everywhere else.
    expect(html).toContain("BIG MIKE");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
