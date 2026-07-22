import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { listRetiredWords } from "@/services/retired-words";
import type { HonoEnv, RetiredWordEntry } from "@/types";

/**
 * GET /retired-words — the public registry of words the keeper has
 * retired from his vocabulary. Free to read; adding one costs $15
 * (the retired_word item) and costs the keeper considerably more.
 */
export const retiredWordsRoutes = new Hono<HonoEnv>();

function entryHtml(entry: RetiredWordEntry): string {
  const patron =
    entry.patron_number !== undefined
      ? ` \u2022 retired at the request of patron no. ${entry.patron_number}`
      : "";
  return `<div class="menu-item">
    <div class="menu-line">
      <span class="menu-name">\u201C${escapeHtml(entry.word)}\u201D</span>
      <span class="menu-dots"></span>
      <span class="menu-price">${escapeHtml(entry.retired_at.slice(0, 10))}</span>
    </div>
    <p class="menu-desc">${escapeHtml(entry.epitaph)}</p>
    <p class="menu-meta">gone from the keeper's vocabulary${patron}</p>
  </div>`;
}

retiredWordsRoutes.get("/retired-words", async (c) => {
  const entries = await listRetiredWords(c.env);
  if (wantsHtml(c.req.header("Accept"))) {
    const entriesHtml =
      entries.length > 0
        ? entries.map(entryHtml).join("\n")
        : `<p class="empty">Every word the keeper knows is still on active duty. The first retirement will be recorded here, with honors.</p>`;
    return c.html(
      renderSimplePage({
        title: "Registry of Retired Words",
        bodyHtml: `<section>
          <p class="menu-desc">Words the keeper has retired from his vocabulary, permanently, at a patron's request. Each entry is final. He reads this page sometimes and misses them.</p>
          ${entriesHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    registry:
      "Words the keeper has retired from his vocabulary, permanently, at a patron's request. Retirement is final.",
    retire_one: `${c.env.STORE_BASE_URL}/api/buy/retired_word`,
    retired_words: entries,
  });
});
