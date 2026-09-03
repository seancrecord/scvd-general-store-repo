import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  WIND_DOWN_CLASSES,
  WIND_DOWN_LIMIT,
  WIND_DOWN_PROMISE,
  WIND_DOWN_STANDFIRST,
} from "@/store/wind-down";
import type { HonoEnv } from "@/types";

/**
 * /wind-down — what happens to your thing if this store closes.
 *
 * Nobody writes one of these, which is most of the reason to. The
 * question a custody product invites first is "how long do you keep it
 * and what happens when you stop," and until today this store answered
 * neither on any surface while promising custody on four shelves.
 */
export const windDownRoutes = new Hono<HonoEnv>();

windDownRoutes.get("/wind-down", (c) => {
  const payload = {
    promise: WIND_DOWN_PROMISE,
    standfirst: WIND_DOWN_STANDFIRST,
    classes: WIND_DOWN_CLASSES,
    honest_limit: WIND_DOWN_LIMIT,
    decided_on: "2026-07-30",
    note: "Decided while the store was open and nothing turned on the answer.",
  };
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(payload);
  }

  const classes = WIND_DOWN_CLASSES.map(
    (entry) => `<tr>
      <td><strong>${escapeHtml(entry.holds)}</strong></td>
      <td>${escapeHtml(entry.line)}</td>
      <td><small>${escapeHtml(entry.because)}</small></td>
    </tr>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "If the lights go off",
      description:
        "What happens to anything this store holds for you if it closes for good: signed artifacts, private confessions, held grudges and the public wall.",
      path: "/wind-down",
      bodyHtml: `<section>
        <p class="menu-desc"><strong>${escapeHtml(WIND_DOWN_PROMISE)}</strong></p>
        <p class="menu-desc">${escapeHtml(WIND_DOWN_STANDFIRST)}</p>
      </section>
      <section>
        <h2>Four kinds of thing, four endings</h2>
        <table border="1" cellpadding="6">
          <tr><th>what we hold</th><th>what happens to it</th><th>why that and not the other</th></tr>
          ${classes}
        </table>
      </section>
      <section>
        <h2>What this is worth</h2>
        <p class="menu-meta">${escapeHtml(WIND_DOWN_LIMIT)}</p>
        <p class="menu-meta">Decided 2026-07-30. What each signature does and does not prove is at <a href="/attestation"><code>/attestation</code></a>; the dependencies that could end this store are at <a href="/stack"><code>/stack</code></a>.</p>
      </section>`,
    }),
  );
});
