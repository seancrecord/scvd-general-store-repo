import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { DoorsOpenDraft } from "@/services/doors-open";

/**
 * THE DRAFT, ON THE DESK. The instruments lay the tables; the keeper
 * reads, cuts, writes the fix of the week and presses publish
 * himself. The Markdown block at the bottom is the whole issue, ready
 * to paste. Nothing on this page publishes anything.
 */

export interface DoorsOpenPageData {
  draft: DoorsOpenDraft;
  markdown: string;
}

export function renderDoorsOpenPage(data: DoorsOpenPageData): string {
  const d = data.draft;
  const sections = d.sections.map((s) => `<section>
    <h2>${escapeHtml(s.heading)}</h2>
    ${s.unread ? "<p><em>Not read this week: the instrument behind this section did not answer.</em></p>" : `<p>${escapeHtml(s.lead)}</p>
    <ul>${s.numbers.map((n) => `<li>${escapeHtml(n.label)}: <strong>${n.value}</strong>${n.of !== undefined ? ` of ${n.of}` : ""}${n.note ? ` <small>(${escapeHtml(n.note)})</small>` : ""}</li>`).join("")}</ul>
    ${s.rows.length > 0 ? `<details><summary>Rows</summary><table border="1" cellpadding="4"><tr><th>row</th><th>count</th></tr>${s.rows.map(([k, n]) => `<tr><td><code>${escapeHtml(k)}</code></td><td>${n}</td></tr>`).join("")}</table></details>` : ""}
    <p><small>Did not see: ${s.not_seen.map(escapeHtml).join(" ")}</small></p>`}
  </section>`).join("");
  const body = `<section>
    <h2>Doors Open, ${escapeHtml(d.week)} <small>(draft)</small></h2>
    <p><small>The weekly issue for sellers, drafted by the instruments from the same readers the desk uses; nothing here is typed and nothing here publishes. Read it, cut what the week does not support, write the fix of the week, and press publish yourself.
    ${d.unread.length > 0 ? `<strong>Readers that did not answer:</strong> ${d.unread.map(escapeHtml).join(", ")}.` : "Every reader answered."}</small></p>
    <p><strong>The number of the week:</strong> ${d.number_of_the_week ? `${escapeHtml(d.number_of_the_week.sentence)} <small>(${escapeHtml(d.number_of_the_week.source)})</small>` : "<em>the instruments did not produce one; yours to pick</em>"}</p>
  </section>
  ${sections}
  <section>
    <h2>The fix of the week</h2>
    <p><em>Keeper's pen. One change a seller can make on Monday, with our own before and after. The signals page's refusal table is the usual place to find it.</em></p>
  </section>
  <section>
    <h2>The issue as Markdown</h2>
    <p><small>Paste, edit, sign. The free preview is the first two headings; the paid issue is the rest, if and when the door goes up.</small></p>
    <textarea readonly rows="40" style="width:100%;font-family:monospace;font-size:0.8rem">${escapeHtml(data.markdown)}</textarea>
  </section>`;
  return renderAdminShell("doors-open", body);
}
