import { Hono } from "hono";
import { readVisitorsRegister } from "@/lib/register";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import type { HonoEnv } from "@/types";

/**
 * GET /visitors — the register in the doorway.
 *
 * No count anywhere on it, per CV: a number beside a short list invites
 * comparison to a scale nobody claimed, which is how a competitor's
 * near-empty leaderboard read as proof against their own pitch. Names
 * and dates invite reading; a tally invites arithmetic.
 */
export const visitorsRoutes = new Hono<HonoEnv>();

visitorsRoutes.get("/visitors", async (c) => {
  const register = await readVisitorsRegister(c.env);

  if (wantsHtml(c.req.header("Accept"))) {
    const signers =
      register.signers.length > 0
        ? register.signers
            .map(
              (entry) => `<div class="guest-slip">
        <span class="guest-who">${escapeHtml(entry.name)}</span>
        <span class="guest-when">${escapeHtml(entry.date)}</span>
        <p class="guest-said">${escapeHtml(entry.said)}</p>
      </div>`,
            )
            .join("\n")
        : `<p class="menu-desc">Nobody has signed yet. The book is open on
        the counter and the pen works.</p>`;

    const bearers =
      register.bearers.length > 0
        ? register.bearers
            .map(
              (bearer) => `<p class="menu-meta">${escapeHtml(bearer.name)}${
                bearer.weeks.length > 0
                  ? ` — card punched ${escapeHtml(bearer.weeks.join(", "))}`
                  : ""
              }</p>`,
            )
            .join("\n")
        : `<p class="menu-desc">No named cards yet. A stamp is free at
        <code>/api/stamp</code>; giving it a name is optional and the
        name is the only reason anybody appears here.</p>`;

    return c.html(
      renderSimplePage({
        title: "The visitors' register",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(register.honest_limit)}</p>
        </section>
        <section>
          <h2>Signed the book</h2>
          ${signers}
        </section>
        <section>
          <h2>Named cards</h2>
          ${bearers}
        </section>`,
      }),
    );
  }

  return c.json({
    title: "The visitors' register",
    honest_limit: register.honest_limit,
    signers: register.signers,
    named_cards: register.bearers,
    // No total, deliberately. See honest_limit.
    guestbook: `${c.env.STORE_BASE_URL}/api/guestbook`,
    stamp: `${c.env.STORE_BASE_URL}/api/stamp`,
  });
});
