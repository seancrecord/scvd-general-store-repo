import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  BECOMING_DATED,
  BECOMING_LIMIT,
  BECOMING_STANDFIRST,
  SETTLED,
  THESES,
  WATCHED,
} from "@/store/becoming";
import type { HonoEnv } from "@/types";

/**
 * /becoming — the roadmap, quarantined on purpose.
 *
 * /what ends its inventory with "all of that is running now; none of
 * it is a roadmap." That sentence is only true while the roadmap has
 * somewhere else to live, clearly enough marked that an answer engine
 * lifting a line from one page cannot mistake it for the other.
 */
export const becomingRoutes = new Hono<HonoEnv>();

becomingRoutes.get("/becoming", (c) => {
  const payload = {
    standfirst: BECOMING_STANDFIRST,
    nothing_here_is_available: BECOMING_LIMIT,
    dated: BECOMING_DATED,
    theses: THESES,
    settled: SETTLED,
    watching_for: WATCHED,
    available_today: `${c.env.STORE_BASE_URL}/what`,
  };
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }

  const theses = THESES.map(
    (entry) => `<div class="menu-item">
      <div class="menu-line"><span class="menu-name">${escapeHtml(entry.claim)}</span></div>
      <p class="menu-desc"><strong>Shown false by:</strong> ${escapeHtml(entry.falsified_by)}</p>
    </div>`,
  ).join("\n");

  const settled = SETTLED.map(
    (entry) => `<tr>
      <td><strong>${escapeHtml(entry.question)}</strong></td>
      <td>${escapeHtml(entry.answer)}</td>
      <td><small>${escapeHtml(entry.because)}</small></td>
    </tr>`,
  ).join("\n");

  const watched = WATCHED.map(
    (entry) => `<tr>
      <td><strong>${escapeHtml(entry.item)}</strong></td>
      <td><small>${escapeHtml(entry.trigger)}</small></td>
      <td><small>${escapeHtml(entry.today)}</small></td>
    </tr>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "What this is trying to prove",
      description:
        "The part of this x402 store that is not built: four claims it is trying to prove and how each could be shown false, the strategic questions already settled, and the triggers it is watching for. Nothing on this page is available to buy.",
      path: "/becoming",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(BECOMING_STANDFIRST)}</p>
        <p class="menu-meta"><strong>${escapeHtml(BECOMING_LIMIT)}</strong></p>
      </section>
      <section>
        <h2>What it is trying to prove</h2>
        ${theses}
      </section>
      <section>
        <h2>Already decided</h2>
        <table border="1" cellpadding="6">
          <tr><th>question</th><th>answer</th><th>why</th></tr>
          ${settled}
        </table>
      </section>
      <section>
        <h2>Watching for, with the trigger rather than a date</h2>
        <p class="menu-desc">A date is a promise about a calendar. A trigger is a fact about the world, and somebody who does not work here can check whether it has happened.</p>
        <table border="1" cellpadding="6">
          <tr><th>not built</th><th>what would change it</th><th>what exists today</th></tr>
          ${watched}
        </table>
      </section>
      <section>
        <p class="menu-meta">Written down ${escapeHtml(BECOMING_DATED)}. What is actually running is at <a href="/what"><code>/what</code></a>; the shelf is at <a href="/menu.json"><code>/menu.json</code></a>; what this store has not built is listed at <a href="/attestation"><code>/attestation</code></a>.</p>
      </section>`,
    }),
  );
});
