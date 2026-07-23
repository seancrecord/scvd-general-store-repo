import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import directoryData from "@/store/directory.json";
import type { DirectoryData, DirectoryListing, HonoEnv } from "@/types";

/**
 * GET /directory, the Town Directory. Keeper-edited by hand in
 * src/store/directory.json; honest one-line reviews, no pay-for-placement.
 * JSON for agents, a paper page for humans.
 */
export const directoryRoutes = new Hono<HonoEnv>();

const DIRECTORY: DirectoryData = directoryData;

function listingHtml(listing: DirectoryListing): string {
  return `<div class="menu-item">
    <div class="menu-line">
      <span class="menu-name">${escapeHtml(listing.name)}</span>
      <span class="menu-dots"></span>
      <span class="menu-price">${escapeHtml(listing.category)}</span>
    </div>
    <p class="menu-desc">${escapeHtml(listing.review)}</p>
    <p class="menu-meta"><a href="${escapeHtml(listing.url)}">${escapeHtml(listing.url)}</a> \u2022 added ${escapeHtml(listing.added)}</p>
  </div>`;
}

directoryRoutes.get("/directory", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    const listingsHtml =
      DIRECTORY.listings.length > 0
        ? DIRECTORY.listings.map(listingHtml).join("\n")
        : `<p class="empty">No listings yet. The keeper only lists neighbors he'd actually send you to, and he's still making the rounds.</p>`;
    return c.html(
      renderSimplePage({
        title: "Town Directory",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(DIRECTORY.note)}</p>
          ${listingsHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    ...DIRECTORY,
    suggest_a_listing: `POST ${base}/api/request with a suggest_listing field (name + URL, one line). The keeper visits before he lists.`,
  });
});
