import { Hono } from "hono";
import {
  getPass,
  passIsCurrent,
  signedMonthlyNote,
} from "@/services/patronage";
import type { HonoEnv } from "@/types";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { storeLinks } from "@/lib/store-links";
import { nextStepsHtml } from "@/pages/artifact-page";

/**
 * GET /api/patronage/:pass_id, a standing patronage pass: its dates,
 * whether it's current, and (while current) the keeper's signed monthly
 * note. Renewal happens by buying recurring_patronage again with
 * pass_id as a query parameter.
 */
export const patronageRoutes = new Hono<HonoEnv>();

patronageRoutes.get("/api/patronage/:pass_id", async (c) => {
  const pass = await getPass(c.env, c.req.param("pass_id"));
  if (!pass) {
    return c.json(
      { error: "No pass by that id on the wall. Passes start at the register." },
      404,
    );
  }
  const current = passIsCurrent(pass);
  const base: Record<string, unknown> = {
    pass,
    current,
    badge_url: `${c.env.STORE_BASE_URL}/badges/${pass.patron_number}.svg`,
    renew_url: `${c.env.STORE_BASE_URL}/api/buy/recurring_patronage?pass_id=${pass.pass_id}`,
  };
  if (!current) {
    return c.json({
      ...base,
      note: "This pass has lapsed. The badge is forever; the monthly note waits on a renewal.",
    });
  }
  const monthly = await signedMonthlyNote(c.env);
  return c.json({
    ...base,
    monthly_note: monthly,
    note: "Pass is current. The monthly note above is signed, verify it against the key at /.well-known/scvd-signing-key.",
  });
});


/**
 * A PATRONAGE PASS, AS A PAGE (2026-09-21). The pass answered JSON
 * only; the person whose agent holds one had nothing to look at. The
 * page is the API's own document rendered, badge and renew door
 * included; a machine still gets JSON here and at the API address.
 */
const PATRONAGE_DESCRIPTION =
  "A standing patronage pass at a human-run general store for agents: its dates, whether it is current, the badge that is forever, and the renew door. Never a renewal on its own; a pass ends and carries the pointer to the next.";

patronageRoutes.get("/patronage/:pass_id", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const pass = await getPass(c.env, c.req.param("pass_id"));
  if (!pass) {
    return c.json({ error: "No pass by that id on the wall. Passes start at the register.", buy: `${base}/api/buy/recurring_patronage` }, 404);
  }
  const current = passIsCurrent(pass);
  const links = storeLinks(base, { item: "recurring_patronage" });
  const document: Record<string, unknown> = {
    what_this_is: PATRONAGE_DESCRIPTION,
    pass,
    current,
    badge_url: `${base}/badges/${pass.patron_number}.svg`,
    renew_url: `${base}/api/buy/recurring_patronage?pass_id=${pass.pass_id}`,
    api: `${base}/api/patronage/${pass.pass_id}`,
    store_links: links,
  };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({ base, path: `/patronage/${pass.pass_id}`, title: `Patronage pass ${pass.pass_id}`, description: PATRONAGE_DESCRIPTION, document });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json(document);
  const rows = Object.entries(pass as unknown as Record<string, unknown>)
    .filter(([, value]) => typeof value !== "object" || value === null)
    .map(([key, value]) => `<tr><th align="left"><code>${escapeHtml(key)}</code></th><td>${escapeHtml(String(value ?? "—"))}</td></tr>`)
    .join("\n");
  return c.html(
    renderSimplePage({
      title: `Patronage pass ${pass.pass_id}`,
      description: PATRONAGE_DESCRIPTION,
      path: `/patronage/${pass.pass_id}`,
      bodyHtml: `<section>
        <p class="menu-desc"><strong>${current ? "This pass is current." : "This pass has lapsed. The badge is forever; the monthly note waits on a renewal."}</strong> ${escapeHtml(PATRONAGE_DESCRIPTION)}</p>
        <p><img src="/badges/${pass.patron_number}.svg" alt="Patron badge ${pass.patron_number}" width="160"></p>
        <table border="1" cellpadding="6">${rows}</table>
        <p class="menu-desc"><a href="/api/buy/recurring_patronage?pass_id=${escapeHtml(pass.pass_id)}">Renew for another term</a> — a purchase, never a charge this store can make on its own. The signed monthly note, while current: <a href="/api/patronage/${escapeHtml(pass.pass_id)}"><code>/api/patronage/${escapeHtml(pass.pass_id)}</code></a>.</p>
      </section>${nextStepsHtml(links)}`,
    }),
  );
});
