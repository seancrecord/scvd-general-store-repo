import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CAPABILITY_QUERY, NOVELTY_ONLY, SPEC_RETURNS } from "@/store/spec";
import { getMenuItem } from "@/store";
import {
  listApprovedTags,
  paintTag,
  setTagStatus,
  TAG_CAP,
  tagHasUrl,
} from "@/services/train";
import type { Env } from "@/types";
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
