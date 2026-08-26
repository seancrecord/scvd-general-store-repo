import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, negotiate, VARY_ACCEPT } from "@/lib/accept";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript } from "@/lib/jsonld";
import { renderSimplePage } from "@/pages/simple-page";
import {
  API_VERSIONS,
  LIFECYCLE_POLICY,
  SUNSET_NOTICE_DAYS,
  isRetiring,
} from "@/store/api-lifecycle";
import { STORE_SERVICE_NAME } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * /deprecation — the versioning and deprecation policy, as a page.
 *
 * WHY A ROOM AND NOT A PARAGRAPH IN THE SPEC. The promise itself is
 * older than this file: the OpenAPI document has carried
 * `x-versioning` since 2026-08-21, saying what happens when a version
 * retires and which headers announce it. A readiness audit read that
 * spec, correctly identified the URL versioning, and reported "no
 * deprecation or sunset policy detected" — because a vendor extension
 * buried in a 900KB JSON document is not something a reader deciding
 * whether to integrate can be SHOWN.
 *
 * So this is the showing. Every word of it is imported from
 * store/api-lifecycle.ts, which is also what `x-versioning` prints and
 * what the versioned routes read when they decide whether to emit RFC
 * 8594 headers. One source, three surfaces: the page cannot promise a
 * notice window the headers do not honour.
 *
 * THE TABLE IS LIVE, NOT ILLUSTRATIVE. Every version currently served
 * is listed with its status and its sunset date, and the sunset column
 * reads "none announced" today because none is — an invented date here
 * would be an invented `Sunset` header tomorrow.
 */
export const deprecationRoutes = new Hono<HonoEnv>();

const DESCRIPTION =
  "The versioning and deprecation policy for the scvd.store API: how breaking changes arrive, the RFC 8594 Sunset and Deprecation headers a retiring version carries, the minimum notice window, and a live table of every version currently served with its status.";

function sunsetLabel(sunset: string | null): string {
  return sunset ?? "none announced";
}

function payload(base: string) {
  return {
    policy: LIFECYCLE_POLICY,
    minimum_notice_days: SUNSET_NOTICE_DAYS,
    /**
     * The one figure a reader most wants and the one most likely to
     * be quietly wrong: whether anything is on the way out RIGHT NOW.
     * Derived from the same rows the headers read.
     */
    currently_deprecated: API_VERSIONS.filter(isRetiring).map(
      (row) => row.path,
    ),
    versions: API_VERSIONS.map((row) => ({
      ...row,
      url: `${base}${row.path}`,
      successor_url: row.successor ? `${base}${row.successor}` : null,
    })),
    contract: `${base}/openapi.json`,
    developer_documentation: `${base}/developers`,
  };
}

function markdown(base: string): string {
  const rows = API_VERSIONS.map(
    (row) =>
      `| \`${row.path}\` | ${row.status} | ${row.since} | ${sunsetLabel(row.sunset)} | ${row.successor ?? "—"} |`,
  ).join("\n");
  return `# ${STORE_SERVICE_NAME} — API versioning and deprecation policy

${LIFECYCLE_POLICY.summary}

${LIFECYCLE_POLICY.notice}

${LIFECYCLE_POLICY.overlap}

## The headers a retiring version carries

${LIFECYCLE_POLICY.headers.map((line) => `- ${line}`).join("\n")}

## What is not promised

${LIFECYCLE_POLICY.what_is_not_promised}

## Every version currently served

| Path | Status | Since | Sunset | Successor |
| --- | --- | --- | --- | --- |
${rows}

The machine-readable form of this table is this page as JSON
(\`Accept: application/json\`) and the \`x-versioning\` block of
${base}/openapi.json. Both are printed from the same rows.
`;
}

deprecationRoutes.get("/deprecation", (c) => {
  const base = c.env.STORE_BASE_URL;
  c.header("Vary", VARY_ACCEPT);
  /**
   * HTML FIRST, and for the same reason /developers now leads with
   * HTML: a client that stated no preference and landed on a POLICY
   * page wants the policy, and `*​/*` is what most of them send.
   */
  const representation = negotiate(c.req.header("Accept"), [
    "text/html",
    "application/json",
    "text/markdown",
  ]);
  if (representation === "text/markdown") {
    return c.text(markdown(base), 200, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
    });
  }
  if (representation === "application/json") {
    return c.json(payload(base));
  }

  const rows = API_VERSIONS.map(
    (row) => `<div class="menu-item">
      <div class="menu-line"><span class="menu-name"><code>${escapeHtml(row.path)}</code></span><span class="menu-price">${escapeHtml(row.status)}</span></div>
      <p class="menu-desc">${escapeHtml(row.note)}</p>
      <p class="menu-meta">Serving since ${escapeHtml(row.since)} · Sunset: ${escapeHtml(sunsetLabel(row.sunset))}${row.successor ? ` · Successor: <code>${escapeHtml(row.successor)}</code>` : ""}</p>
    </div>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "API versioning and deprecation policy",
      description: DESCRIPTION,
      path: "/deprecation",
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(LIFECYCLE_POLICY.summary)}</p>
        <p class="menu-desc"><strong>${escapeHtml(LIFECYCLE_POLICY.notice)}</strong></p>
        <p class="menu-meta">${escapeHtml(LIFECYCLE_POLICY.overlap)}</p>
      </section>
      <section>
        <h2>The headers a retiring version carries</h2>
        <ul>${LIFECYCLE_POLICY.headers.map((line) => `<li><code>${escapeHtml(line)}</code></li>`).join("")}</ul>
        <p class="menu-meta">Nothing is deprecated today, so nothing sends them today. The routes read the same table this page prints, so the headers appear the day a row below gains a date — there is no second place to remember to edit.</p>
      </section>
      <section>
        <h2>Every version currently served</h2>
        ${rows}
      </section>
      <section>
        <h2>What is not promised</h2>
        <p class="menu-meta">${escapeHtml(LIFECYCLE_POLICY.what_is_not_promised)}</p>
        <p class="menu-meta">The contract is at <a href="/openapi.json"><code>/openapi.json</code></a>; the rest of the developer documentation is at <a href="/developers">/developers</a>. This page also serves JSON and markdown by <code>Accept</code>.</p>
      </section>
      ${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "TechArticle",
        name: `${STORE_SERVICE_NAME} — API versioning and deprecation policy`,
        headline: "API versioning and deprecation policy",
        description: DESCRIPTION,
        url: `${base}/deprecation`,
        author: { "@type": "Organization", name: STORE_SERVICE_NAME, url: base },
      })}`,
    }),
  );
});
