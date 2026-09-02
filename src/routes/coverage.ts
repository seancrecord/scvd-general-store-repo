import { Hono } from "hono";
import { publicCoverageDocument } from "@/evidence";
import { COVERAGE_DEPTHS, DEPTH_MEANS, coverageMatrix } from "@/evidence/coverage";
import { KNOWN_CHAINS } from "@/evidence/subject";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import type { CoverageDepth } from "@/evidence/types";
import type { HonoEnv } from "@/types";

/**
 * GET /coverage.json and GET /.well-known/coverage.json — the
 * derived class × chain × depth matrix (M1). Same bytes both
 * doors: an indexer that learned well-known and an agent that
 * followed a menu pointer should not get two stories.
 *
 * AND GET /coverage, ADDED 2026-09-01 — the room a person can read.
 *
 * The matrix answers the question the 2026-08-31 outside read put
 * last: "what SCVD now observes, and what it still does not." It has
 * answered it since M1 shipped, in JSON, at a .json URL, linked from
 * llms.txt. No human-readable surface rendered it, so the store's own
 * boldest discipline — absence is STATED, never implied; `none` is a
 * value, not a missing key — was legible to indexers and invisible to
 * the operator deciding whether to trust us.
 *
 * This room states no coverage fact of its own. Every cell, every
 * chain, every depth word is the same `coverageMatrix()` the JSON
 * serves, so the page cannot claim a reach the instrument does not.
 */
export const coverageRoutes = new Hono<HonoEnv>();

coverageRoutes.get("/coverage.json", (c) => {
  return c.json(publicCoverageDocument(c.env.STORE_BASE_URL));
});

coverageRoutes.get("/.well-known/coverage.json", (c) => {
  return c.json(publicCoverageDocument(c.env.STORE_BASE_URL));
});

/** Depth as a word plus what it MEANS, because "challenge" and "read"
 * are the difference between watching a door and paying at one. */
function depthCell(depth: CoverageDepth): string {
  const dim = depth === "none" ? ' class="depth-none"' : "";
  return `<td${dim}><code>${escapeHtml(depth)}</code></td>`;
}

const COVERAGE_CSS = `
.depth-none { color: var(--night-faded); }
table.coverage td:first-child { white-space: nowrap; }
.limits { border: 1px dashed var(--line); padding: 0.75rem 1rem; margin: 1rem 0; }
.limits h3 { margin-top: 0; }
`;

coverageRoutes.get("/coverage", (c) => {
  const base = c.env.STORE_BASE_URL;
  const doc = publicCoverageDocument(base);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json(doc);

  const chains = [...KNOWN_CHAINS];
  const rows = coverageMatrix()
    .map(
      (row) => `<tr>
      <td><code>${escapeHtml(row.class_id)}</code><br>
      <span class="menu-meta">${escapeHtml(row.does)}</span></td>
      ${chains.map((chain) => depthCell(row.chains[chain] ?? "none")).join("")}
    </tr>`,
    )
    .join("");

  const legend = COVERAGE_DEPTHS.map(
    (depth) =>
      `<tr><td><code>${escapeHtml(depth)}</code></td><td>${escapeHtml(DEPTH_MEANS[depth])}</td></tr>`,
  ).join("");

  const bodyHtml = `<section>
    <p class="menu-desc">This is where our looking stops. Every row is an
    observation class, every column a chain we know about, and every cell
    the DEPTH we actually reach there — from <code>none</code> through
    reading a 402, reading chain state, taking payment, to paying somebody
    else's door from the field wallet.</p>
    <p class="menu-desc"><strong>Absence is stated, never implied.</strong>
    <code>none</code> is a value in this table, not a missing key: "we
    observe three chains" is true of one class and a lie about the rest, and
    a matrix with the misses left out reads as continuous coverage. The
    table derives from the modules that already know the chain ids — it is
    not a brochure somebody typed, and a class registered tomorrow appears
    tomorrow.</p>
  </section>
  <section><h2>What each depth means</h2>
  <table><thead><tr><th>depth</th><th>what we actually do</th></tr></thead>
  <tbody>${legend}</tbody></table></section>
  <section><h2>Class × chain × depth</h2>
  <table class="coverage"><thead><tr><th>class</th>${chains
    .map((chain) => `<th><code>${escapeHtml(chain)}</code></th>`)
    .join("")}</tr></thead>
  <tbody>${rows}</tbody></table>
  <p class="menu-meta">${escapeHtml(String(doc["sandbox_note"]))}
  Sandbox chain: <code>${escapeHtml(String(doc["sandbox_chain"]))}</code>.</p>
  </section>
  <section class="limits">
    <h3>What this does not prove</h3>
    <p class="menu-desc">${escapeHtml(String(doc["does_not_prove"]))}</p>
    <p class="menu-desc">This document is evidence about the OBSERVER — where
    our own looking stops — which makes the hop to
    <a href="/corrections">the corrections record</a> more load-bearing here
    than on a dataset, not less: a reader standing on our stated coverage is
    exactly the reader who needs to know what we later found we had stated
    wrong.</p>
  </section>
  <section><p class="menu-desc">The same matrix as JSON, byte for byte:
  <a href="/coverage.json"><code>${escapeHtml(base)}/coverage.json</code></a>
  (also at <code>/.well-known/coverage.json</code>).</p></section>`;

  return c.html(
    renderSimplePage({
      title: "What we observe, and what we do not",
      description:
        "The derived coverage matrix: every observation class against every chain we know, with the depth we actually reach — and `none` stated rather than left out.",
      path: "/coverage",
      extraCss: COVERAGE_CSS,
      bodyHtml,
    }),
  );
});
