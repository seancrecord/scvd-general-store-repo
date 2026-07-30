import type { ItemEventHistory } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * ONE ITEM'S WHOLE HISTORY, so a question does not depend on timing.
 *
 * Built 2026-07-30 after the keeper went looking for the settle row of
 * the first organic sale and found it had been pushed out of the desk's
 * fifteen-row window by a health-check bot fourteen minutes later. The
 * row was there. The page could not reach it, and re-pulling until it
 * surfaced would have been a lottery rather than a lookup.
 *
 * NOT FOUND AND NOT REACHED ARE DIFFERENT ANSWERS and this page never
 * confuses them: it reports how many rows it walked and how far back it
 * got, so an empty result is a fact about the item or a fact about the
 * scan, and which one is stated rather than left to the reader.
 */
export function renderItemEventsPage(history: ItemEventHistory): string {
  const rows =
    history.events.length === 0
      ? '<tr><td colspan="6">Nothing for this item in the rows scanned.</td></tr>'
      : history.events
          .map((event) => {
            const bucket = event.house
              ? "house"
              : event.channel === "infrastructure"
                ? "infra"
                : "organic";
            const kind =
              event.kind === "settle"
                ? '<strong style="color:#1b6b2f">settled</strong>'
                : event.kind === "decline"
                  ? '<strong style="color:#8c2f1b">declined</strong>'
                  : escapeHtml(event.kind);
            return `<tr><td>${escapeHtml(event.at.slice(0, 19).replace("T", " "))}</td>
              <td>${kind}</td>
              <td>${escapeHtml(event.channel)} <small>(${bucket})</small></td>
              <td><small>${escapeHtml(event.user_agent ?? "(no user-agent)")}</small></td>
              <td><small>${escapeHtml(event.referrer ?? "none")}</small></td>
              <td><small>${escapeHtml(event.declared_source ?? "none")}</small></td></tr>`;
          })
          .join("\n");

  const reach = history.capped
    ? `<p style="color:#8c2f1b"><strong>The scan hit its cap.</strong> It walked
       ${history.rows_scanned} rows back to
       ${escapeHtml(history.oldest_row_seen?.slice(0, 19).replace("T", " ") ?? "unknown")} UTC
       and stopped with rows still unread. An empty result above means NOT REACHED,
       not "never happened".</p>`
    : `<p>Walked ${history.rows_scanned} rows, the whole log,
       ${history.oldest_row_seen ? `back to ${escapeHtml(history.oldest_row_seen.slice(0, 19).replace("T", " "))} UTC` : "and found none"}.
       Nothing is hidden behind a cap: an empty result above means this item has no
       priced events on record, and rows expire after ninety days by design.</p>`;

  const body = `
  <section>
    <h2>${escapeHtml(history.item)}</h2>
    <p>Every 402, settle and decline on record for this one item, oldest included.
    The desk shows the newest fifteen across all items, which is a glance; this is a
    lookup, and it does not depend on nothing else having happened since.</p>
    <table border="1" cellpadding="4">
      <tr><th>when (UTC)</th><th>what</th><th>channel</th><th>user-agent</th><th>referrer</th><th>?src=</th></tr>
      ${rows}
    </table>
    ${reach}
    <p><small>A 402 and its settle are two different HTTP requests and can carry
    different headers, so they can land in different channels without either being
    wrong. Both are above, in order, which is the point of this page.</small></p>
  </section>`;
  return renderAdminShell("events", body, []);
}
