import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { reportAnchorForArtifact } from "@/services/report-anchors";
import { getReport, reportIds, signedReport } from "@/services/reports";
import type { HonoEnv } from "@/types";

/**
 * GET /api/report/{id} — ecosystem research reports as signed
 * artifacts, free. JSON artifact for machines; the same URL renders
 * the report as a readable page for a person, the store's standard
 * content negotiation. The signature verifies at /api/verify/{id}
 * like every other artifact class.
 */
export const reportRoutes = new Hono<HonoEnv>();

/** The plainest markdown-to-HTML a report needs: headings, tables,
 * lists, paragraphs. Deliberately tiny — a rendering bug should be
 * visible, not swallowed by a library. Bodies are store-authored. */
function reportBodyHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inTable = false;
  for (const line of lines) {
    const safe = escapeHtml(line);
    if (line.startsWith("|")) {
      if (/^\|[\s-|]+\|$/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((cell) => escapeHtml(cell.trim()));
      if (!inTable) {
        out.push('<table class="menu-desc"><tr>' + cells.map((c) => `<th>${c}</th>`).join("") + "</tr>");
        inTable = true;
      } else {
        out.push("<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>");
      }
      continue;
    }
    if (inTable) {
      out.push("</table>");
      inTable = false;
    }
    if (line.startsWith("# ")) out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith("- ")) out.push(`<p class="menu-desc">• ${escapeHtml(line.slice(2))}</p>`);
    else if (line.trim().length > 0) out.push(`<p class="menu-desc">${safe}</p>`);
  }
  if (inTable) out.push("</table>");
  return out.join("\n");
}

reportRoutes.get("/api/report/:report_id", async (c) => {
  const id = c.req.param("report_id");
  const artifact = await signedReport(c.env, id);
  if (!artifact) {
    return c.json(
      {
        error: "No report by that id.",
        reports: reportIds().map((rid) => `${c.env.STORE_BASE_URL}/api/report/${rid}`),
      },
      404,
    );
  }
  if (wantsHtml(c.req.header("Accept"))) {
    const report = getReport(id)!;
    return c.html(
      renderSimplePage({
        title: report.meta.title,
        description:
          "A free, ed25519-signed ecosystem research report from the store's field program: every number re-derivable from committed raw evidence, the signature verifiable by anyone, forever.",
        path: `/api/report/${id}`,
        bodyHtml: `${reportBodyHtml(report.body)}
          <section>
            <p class="menu-meta">This report is a signed artifact: the machine copy at this same URL carries the exact signed bytes, the sha256 of this body, and the store's public key. Check it at <a href="/api/verify/${escapeHtml(id)}">/api/verify/${escapeHtml(id)}</a> — free, no account, forever. Method: <a href="https://github.com/seancrecord/scvd-general-store-repo/blob/main/WALKABOUT.md">WALKABOUT.md</a>. Raw evidence: <a href="https://github.com/seancrecord/scvd-general-store-repo/tree/main/research/field-run-2026-08-18">research/field-run-2026-08-18</a>.</p>
          </section>`,
      }),
    );
  }
  // The live OTS state rides beside the signature, never inside it:
  // the signed payload binds body_sha256, and body_sha256 is what the
  // proof anchors, so the two agree without either containing the
  // other's weather.
  const ots = await reportAnchorForArtifact(c.env, id);
  return c.json({ ...artifact, ots }, 200, {
    "Cache-Control": "public, max-age=300",
  });
});
