import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { BECOMING_CSS } from "@/pages/becoming-css";
import {
  BECOMING_DATED,
  BECOMING_LIMIT,
  BECOMING_STANDFIRST,
  GRADUATED,
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
    watched_then_built: GRADUATED,
    available_today: `${c.env.STORE_BASE_URL}/what`,
  };
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }

  const ordinal = ["One", "Two", "Three", "Four", "Five", "Six"];
  const theses = THESES.map(
    (entry, index) => `<div class="thesis">
      <span class="thesis-n">${escapeHtml(ordinal[index] ?? String(index + 1))}</span>
      <p class="thesis-claim">${escapeHtml(entry.claim)}</p>
      <p class="thesis-false"><strong>Shown false by</strong>${escapeHtml(entry.falsified_by)}</p>
    </div>`,
  ).join("\n");

  const settled = SETTLED.map(
    (entry) => `<div class="settled">
      <p class="settled-q">${escapeHtml(entry.question)}</p>
      <p class="settled-a">${escapeHtml(entry.answer)}</p>
      <p class="settled-why">${escapeHtml(entry.because)}</p>
    </div>`,
  ).join("\n");

  const watched = WATCHED.map(
    (entry) => `<tr>
      <td>${escapeHtml(entry.item)}</td>
      <td data-label="What would change it"><small>${escapeHtml(entry.trigger)}</small></td>
      <td data-label="What exists today"><small>${escapeHtml(entry.today)}</small></td>
    </tr>`,
  ).join("\n");

  const graduated = GRADUATED.map(
    (entry) => `<tr>
      <td>${escapeHtml(entry.item)}</td>
      <td data-label="The trigger as written"><small>${escapeHtml(entry.trigger)}</small></td>
      <td data-label="What actually opened the door"><small>${escapeHtml(entry.fired)}</small></td>
      <td data-label="What exists now"><small>${escapeHtml(entry.built)}</small></td>
    </tr>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "What this is trying to prove",
      description:
        "The part of this x402 store that is not built: four claims it is trying to prove and how each could be shown false, the strategic questions already settled, and the triggers it is watching for. Nothing on this page is available to buy.",
      path: "/becoming",
      bodyClass: "becoming",
      extraCss: BECOMING_CSS,
      bodyHtml: `<section>
        <p class="lede">${escapeHtml(BECOMING_STANDFIRST)}</p>
        <p class="not-for-sale">${escapeHtml(BECOMING_LIMIT)}</p>
      </section>
      <section>
        <h2>What it is trying to prove</h2>
        ${theses}
      </section>
      <section>
        <h2>Already decided</h2>
        ${settled}
      </section>
      <section>
        <h2>Watching for &mdash; the trigger, not a date</h2>
        <p class="menu-desc">A date is a promise about a calendar. A trigger is a fact about the world, and somebody who does not work here can check whether it has happened.</p>
        <div class="ledger-wrap">
        <table>
          <tr><th>not built</th><th>what would change it</th><th>what exists today</th></tr>
          ${watched}
        </table>
        </div>
      </section>
      <section>
        <h2>Watched, then built</h2>
        <p class="menu-desc">A watch list that deletes its hits reads as a list that never hits, so an item that gets built moves here whole, original trigger included &mdash; and the row says plainly whether the gate that opened was the one this page named. These are the one kind of entry on this page that IS running now; like everything running, they are listed at <a href="/what"><code>/what</code></a>.</p>
        <div class="ledger-wrap">
        <table>
          <tr><th>built</th><th>the trigger as written</th><th>what actually opened the door</th><th>what exists now</th></tr>
          ${graduated}
        </table>
        </div>
      </section>
      <section>
        <p class="menu-meta">Written down ${escapeHtml(BECOMING_DATED)}. What is actually running is at <a href="/what"><code>/what</code></a>; the shelf is at <a href="/menu.json"><code>/menu.json</code></a>; what this store has not built is listed at <a href="/attestation"><code>/attestation</code></a>.</p>
      </section>`,
    }),
  );
});
