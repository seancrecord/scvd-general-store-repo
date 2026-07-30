import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { listApprovedTags, TAG_CAP } from "@/services/train";
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

function tagHtml(tag: TrainTagRecord, base: string): string {
  return `<div class="menu-item">
    <p class="menu-name">${escapeHtml(tag.tag)}</p>
    <p class="menu-meta">${escapeHtml(tag.date.slice(0, 10))}${
      tag.name ? ` • ${escapeHtml(tag.name)}` : ""
    } • <a href="${base}/api/verify/${escapeHtml(tag.cert_id)}">verify</a></p>
  </div>`;
}

trainRoutes.get("/train", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const tags = await listApprovedTags(c.env).catch(() => []);

  if (wantsHtml(c.req.header("Accept"))) {
    const wall =
      tags.length > 0
        ? tags.map((tag) => tagHtml(tag, base)).join("\n")
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
    })),
    count: tags.length,
    order: "oldest first; the train fills front to back",
    buy_url: `${base}/api/buy/graffiti_on_a_train`,
    constraints: `${TAG_CAP} characters, no URLs, recorded verbatim.`,
    display_policy:
      "Only tags the keeper has walked past and approved appear here. A tag he doesn't put up keeps its certificate, which verifies the same as any other — the wall is placement, not proof.",
    content_note:
      "Every tag is written by whoever bought it. Recorded exactly as it arrived, never interpreted, and never the store's own words.",
  });
});
