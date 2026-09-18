import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { OpenForBusinessDraft } from "@/services/open-for-business";
import type { OpenForBusinessIssue } from "@/services/open-for-business-store";
import { OPEN_FOR_BUSINESS_USDC } from "@/store/copy/open-for-business";

/**
 * THE DRAFT, ON THE DESK. The instruments lay the tables and derive
 * the fix of the week from the week's merged pull requests. The
 * Markdown block at the bottom is the whole issue, editable in
 * place; the button under it puts it on the shelf early. Left alone,
 * the hourly press publishes the closed week on its own (the keeper's
 * ruling, 2026-09-18), and this page says when.
 */

export interface OpenForBusinessPageData {
  draft: OpenForBusinessDraft;
  markdown: string;
  /** Issues already on the shelf, newest first; null when the shelf could not be read. */
  published: OpenForBusinessIssue[] | null;
  notice?: string;
  /** The week the hourly press puts up next, and when. */
  nextAutomatic: { week: string; at: string };
}

export function renderOpenForBusinessPage(data: OpenForBusinessPageData): string {
  const d = data.draft;
  const sections = d.sections.map((s) => `<section>
    <h2>${escapeHtml(s.heading)}</h2>
    ${s.unread ? "<p><em>Not read this week: the instrument behind this section did not answer.</em></p>" : `<p>${escapeHtml(s.lead)}</p>
    <ul>${s.numbers.map((n) => `<li>${escapeHtml(n.label)}: <strong>${n.value}</strong>${n.of !== undefined ? ` of ${n.of}` : ""}${n.note ? ` <small>(${escapeHtml(n.note)})</small>` : ""}</li>`).join("")}</ul>
    ${s.rows.length > 0 ? `<details><summary>Rows</summary><table border="1" cellpadding="4"><tr><th>row</th><th>count</th></tr>${s.rows.map(([k, n]) => `<tr><td><code>${escapeHtml(k)}</code></td><td>${n}</td></tr>`).join("")}</table></details>` : ""}
    <p><small>Did not see: ${s.not_seen.map(escapeHtml).join(" ")}</small></p>`}
  </section>`).join("");
  const shelf = data.published === null
    ? "<p><small>The shelf could not be read.</small></p>"
    : data.published.length === 0
      ? "<p><small>No issue on the shelf yet.</small></p>"
      : `<table border="1" cellpadding="4"><tr><th>week</th><th>title</th><th>published</th><th>number of the week</th><th></th></tr>
        ${data.published.map((issue) => `<tr><td><a href="/open-for-business/${escapeHtml(issue.week)}"><code>${escapeHtml(issue.week)}</code></a></td><td>${escapeHtml(issue.title)}</td><td>${escapeHtml(issue.date)}</td><td>${escapeHtml(issue.number_of_the_week || "—")}</td>
          <td><form method="POST" action="/admin/open-for-business/remove" style="display:inline"><input type="hidden" name="week" value="${escapeHtml(issue.week)}"><button type="submit">Take it down</button></form></td></tr>`).join("")}
      </table>`;
  const body = `<section>
    <h2>Open for Business, ${escapeHtml(d.week)} <small>(draft)</small></h2>
    ${data.notice ? `<p><strong>${escapeHtml(data.notice)}</strong></p>` : ""}
    <p><small>The weekly issue for sellers, drafted by the instruments from the same readers the desk uses. <strong>It goes on the shelf on its own</strong> on the first hourly firing after the week closes (${escapeHtml(data.nextAutomatic.week)}, about ${escapeHtml(data.nextAutomatic.at.slice(0, 16).replace("T", " "))} UTC), as it stands then. Publish it early from the box below and the press leaves your version alone; take any issue down from the shelf list.
    ${d.unread.length > 0 ? `<strong>Readers that did not answer:</strong> ${d.unread.map(escapeHtml).join(", ")}.` : "Every reader answered."}</small></p>
    <p><strong>The number of the week:</strong> ${d.number_of_the_week ? `${escapeHtml(d.number_of_the_week.sentence)} <small>(${escapeHtml(d.number_of_the_week.source)})</small>` : "<em>the instruments did not produce one; yours to pick</em>"}</p>
  </section>
  ${sections}
  <section>
    <h2>The fix of the week</h2>
    <p><small>Derived, by your ruling of 2026-09-18: the week's merged pull requests, titles as written, dated. What we changed at our own door is the list a seller can copy on Monday. Edit it in the box below if the week deserves other words.</small></p>
    ${d.changes.read
      ? d.changes.rows.length === 0
        ? "<p><small>Nothing merged this week yet.</small></p>"
        : `<ul>${d.changes.rows.map((row) => `<li>${escapeHtml(row.merged_on)} — ${escapeHtml(row.title)} <a href="${escapeHtml(row.url)}">#${row.number}</a></li>`).join("")}</ul>${d.changes.truncated ? "<p><small>The newest twenty are listed; more merged.</small></p>" : ""}`
      : "<p><strong>Not read:</strong> <small>GitHub did not answer when this draft was laid. Reload to try again; the Monday press tries again on its own.</small></p>"}
  </section>
  <section>
    <h2>The issue, ready to publish</h2>
    <p><small>Edit in place. What a stranger sees free is the title, the number of the week (the bold sentence under that heading) and the first line of prose; the rest is the issue, $${OPEN_FOR_BUSINESS_USDC} over x402 at <code>/open-for-business/${escapeHtml(d.week)}</code>. The same week again replaces the issue; a buyer who already paid keeps what was prepared for their payment.</small></p>
    <form method="POST" action="/admin/open-for-business/publish">
      <p><label>Week (ISO, the week the issue is ABOUT)<br><input type="text" name="week" value="${escapeHtml(d.week)}" maxlength="8" required></label></p>
      <p><label>The one free line on the index (blank = the first line of prose)<br><input type="text" name="teaser" maxlength="240" style="width:100%"></label></p>
      <textarea name="markdown" rows="40" style="width:100%;font-family:monospace;font-size:0.8rem" required>${escapeHtml(data.markdown)}</textarea>
      <p><button type="submit">Put it on the shelf</button></p>
    </form>
  </section>
  <section>
    <h2>On the shelf</h2>
    ${shelf}
    <p><small>The free index is <a href="/open-for-business">/open-for-business</a>; every issue there is $${OPEN_FOR_BUSINESS_USDC}, paid once, no subscription.</small></p>
  </section>`;
  return renderAdminShell("open-for-business", body);
}
