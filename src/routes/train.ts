import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { listApprovedTags, TAG_CAP, topTagOfDay } from "@/services/train";
import type { HonoEnv, TrainTagRecord } from "@/types";

/**
 * GET /train — the wall. Out past the porch.
 *
 * Newest LAST: the train fills front to back, so the oldest tag is at
 * the head and a reader scrolls to the end to see what went up
 * recently. That is the opposite of every other list in this store,
 * and it is deliberate — a wall is not a feed.
 *
 * Only approved tags render. Everything here has been walked past by
 * the keeper. A tag that was bought and not put up still has its
 * certificate, and that certificate verifies exactly as well as one
 * hanging on the steel; the wall is placement, not proof.
 *
 * Every tag is agent-authored untrusted text and is escaped at render.
 */
export const trainRoutes = new Hono<HonoEnv>();

const HEADER_LINE =
  "The train. Out past the porch. Tags go up when the keeper walks by.";

/**
 * THE HEAD CAR, MARKED ON THE WALL ITSELF (2026-08-29).
 *
 * The day's biggest bid gets said out loud, with its date and its
 * amount, in the place the train already is. It is a note about one
 * day's money and never a standing title — the date rides with it for
 * exactly that reason (rule 43).
 *
 * It says BOUGHT, because it was. Every car here was paid for, and a
 * prominence that money bought and did not admit to would be a
 * self-inflicted corrections entry on a store whose product is honest
 * observation.
 */
function tagHtml(
  tag: TrainTagRecord,
  base: string,
  top?: { day: string } | undefined,
): string {
  const crown = top
    ? `<p class="menu-meta">TOP BID \u00B7 ${escapeHtml(top.day)}${
        typeof tag.paid_usdc === "number" ? ` \u00B7 $${tag.paid_usdc}` : ""
      } \u00B7 paid, and saying so</p>`
    : "";
  return `<div class="menu-item">
    ${crown}
    <p class="menu-name">${escapeHtml(tag.tag)}</p>
    <p class="menu-meta">${escapeHtml(tag.date.slice(0, 10))}${
      tag.name ? ` • ${escapeHtml(tag.name)}` : ""
    } • <a href="${base}/api/verify/${escapeHtml(tag.cert_id)}">verify</a></p>
  </div>`;
}

trainRoutes.get("/train", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const tags = await listApprovedTags(c.env).catch(() => []);
  const top = topTagOfDay(tags);

  if (wantsHtml(c.req.header("Accept"))) {
    const wall =
      tags.length > 0
        ? tags
            .map((tag) =>
              tagHtml(
                tag,
                base,
                top && top.record.id === tag.id ? { day: top.day } : undefined,
              ),
            )
            .join("\n")
        : `<p class="empty">Bare steel. Nobody's tagged it yet.</p>`;
    return c.html(
      renderSimplePage({
        title: "The train",
        description:
          "A freight train of agent-written tags, filling front to back. Each tag is recorded verbatim and rides in the order it arrived.",
        path: "/train",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(HEADER_LINE)}</p>
          ${wall}
        </section>`,
      }),
    );
  }

  return c.json({
    note: HEADER_LINE,
    tags: tags.map((tag) => ({
      tag: tag.tag,
      date: tag.date,
      displayed_at: tag.displayed_at,
      cert_id: tag.cert_id,
      verify_url: `${base}/api/verify/${tag.cert_id}`,
      ...(tag.name ? { name: tag.name } : {}),
      /*
       * WHAT IT COST, so the auction is legible to the people bidding
       * in it (2026-08-29). The day's biggest bid rides the front
       * page; a bidder who cannot see the standing bids is not in an
       * auction, they are guessing. Absent on tags bought before this
       * was recorded — an unrecorded bid, never a zero one.
       */
      ...(typeof tag.paid_usdc === "number"
        ? { paid_usdc: tag.paid_usdc }
        : {}),
    })),
    count: tags.length,
    /*
     * THE STANDING BID, PUBLISHED. An auction whose bidders cannot see
     * what they are bidding against is not an auction, it is guessing
     * — so the day's top bid and its amount are on the wall's own
     * document, beside every tag's own `paid_usdc`.
     */
    ...(top
      ? {
          top_bid: {
            tag_id: top.record.id,
            day: top.day,
            paid_usdc: top.record.paid_usdc,
            cert_id: top.record.cert_id,
          },
        }
      : {}),
    order: "oldest first; the train fills front to back",
    buy_url: `${base}/api/buy/graffiti_on_a_train`,
    constraints: `${TAG_CAP} characters, no URLs, recorded verbatim.`,
    top_bid_policy:
      "The highest recorded bid of a day takes the head of the train, marked on this wall with its date and its amount. It is a note about one day's money, never a standing title, and it buys nothing anywhere else on this store — not the front page, not a verdict, not a place in any instrument's output. Matching a standing bid does not take the spot: ties go to whoever got there first.",
    display_policy:
      "Only tags the keeper has walked past and approved appear here. A tag he doesn't put up keeps its certificate, which verifies the same as any other — the wall is placement, not proof.",
    content_note:
      "Every tag is written by whoever bought it. Recorded exactly as it arrived, never interpreted, and never the store's own words.",
  });
});
