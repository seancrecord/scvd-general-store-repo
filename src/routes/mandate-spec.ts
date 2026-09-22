import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown, MARKDOWN_MEDIA_TYPE } from "@/lib/accept";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  MANDATE_SPEC_DESCRIPTION,
  MANDATE_SPEC_SECTIONS,
  MANDATE_SPEC_TITLE,
  mandateSchema,
  mandateSpecMarkdown,
} from "@/store/copy/mandate-spec";
import type { HonoEnv } from "@/types";

/**
 * GET /mandate-spec — the mandate record as a pattern another issuer
 * can implement; GET /schemas/scvd-mandate-v1.json — its schema.
 * Both derived from one source (store/copy/mandate-spec.ts).
 */
export const mandateSpecRoutes = new Hono<HonoEnv>();

mandateSpecRoutes.get("/schemas/scvd-mandate-v1.json", (c) =>
  c.json(mandateSchema(c.env.STORE_BASE_URL), 200, { "Cache-Control": "public, max-age=3600" }),
);

mandateSpecRoutes.get("/mandate-spec", (c) => {
  const base = c.env.STORE_BASE_URL;
  const markdown = mandateSpecMarkdown(base);
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return new Response(markdown, { headers: { "Content-Type": MARKDOWN_MEDIA_TYPE, Vary: "Accept, User-Agent" } });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ title: MANDATE_SPEC_TITLE, description: MANDATE_SPEC_DESCRIPTION, schema: `${base}/schemas/scvd-mandate-v1.json`, sections: MANDATE_SPEC_SECTIONS, markdown });
  }
  const sections = MANDATE_SPEC_SECTIONS.map(
    (section) =>
      `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((p) => `<p class="menu-desc">${escapeHtml(p)}</p>`).join("")}${section.code ? `<pre><code>${escapeHtml(section.code)}</code></pre>` : ""}</section>`,
  ).join("\n");
  return c.html(
    renderSimplePage({
      title: MANDATE_SPEC_TITLE,
      description: MANDATE_SPEC_DESCRIPTION,
      path: "/mandate-spec",
      bodyHtml: `<section><p class="menu-desc">${escapeHtml(MANDATE_SPEC_DESCRIPTION)}</p><p class="menu-meta">The record's JSON schema: <a href="/schemas/scvd-mandate-v1.json"><code>/schemas/scvd-mandate-v1.json</code></a>. This page as markdown: <code>Accept: text/markdown</code>.</p></section>${sections}`,
    }),
  );
});
