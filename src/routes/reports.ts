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

/**
 * A report the store has stopped standing behind. Withdrawal is a
 * PUBLICATION, not a deletion: the URL keeps answering, the body and
 * its signature stay exactly as published, and the notice rides in
 * front of both. A research claim that disappears when it turns out
 * to be wrong teaches a reader to distrust the ones still up.
 */
function withdrawalOf(
  id: string,
): { at: string; reason: string; what_stands: string; next: string } | null {
  const meta = getReport(id)?.meta as
    | { withdrawn?: { at: string; reason: string; what_stands: string; next: string } }
    | undefined;
  return meta?.withdrawn ?? null;
}

function withdrawalHtml(withdrawn: {
  at: string;
  reason: string;
  what_stands: string;
  next: string;
}): string {
  return `<section>
    <h2>Withdrawn ${escapeHtml(withdrawn.at)}</h2>
    <p class="menu-desc"><strong>The store has withdrawn this report and does not stand behind its central finding.</strong> ${escapeHtml(withdrawn.reason)}</p>
    <p class="menu-meta">${escapeHtml(withdrawn.what_stands)}</p>
    <p class="menu-meta">${escapeHtml(withdrawn.next)}</p>
    <p class="menu-meta">The text below is the report exactly as published, unedited, with its original signature intact — kept up rather than deleted so the withdrawal can be checked against what was actually claimed.</p>
  </section>`;
}


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
  const withdrawn = withdrawalOf(id);
  if (wantsHtml(c.req.header("Accept"))) {
    const report = getReport(id)!;
    return c.html(
      renderSimplePage({
        title: report.meta.title,
        description:
          "A free, ed25519-signed ecosystem research report from the store's field program: every number re-derivable from committed raw evidence, the signature verifiable by anyone, forever.",
        path: `/api/report/${id}`,
        bodyHtml: `${withdrawn ? withdrawalHtml(withdrawn) : ""}${reportBodyHtml(report.body)}
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
  /**
   * WITHDRAWN RIDES FIRST, and outside the signed payload. A reader
   * that quotes one field of this document must meet the withdrawal
   * before the conclusion, so it leads the object; and it stays out
   * of signed_payload because the signature covers what was
   * published, which is exactly the thing a later retraction must not
   * be able to rewrite.
   */
  return c.json({ ...(withdrawn ? { withdrawn } : {}), ...artifact, ots }, 200, {
    "Cache-Control": "public, max-age=300",
  });
});
