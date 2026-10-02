import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { GazetteIssue } from "@/types";

/**
 * KEEPER'S FILES: the drawer where downloadable records live. The
 * tax CSV used to sit between action buttons on the back shelf and
 * the keeper couldn't find it when he wanted it — a file you
 * download belongs in a filing drawer, not a toolbox. Everything
 * here is a record of what already happened; nothing on this page
 * can change the store.
 */
/** Every issue that went to press, newest first as the rack lists them. */
function rackHtml(issues: GazetteIssue[]): string {
  if (issues.length === 0) {
    return "<p>No issues off the press.</p>";
  }
  return `<ul>${issues
    .map(
      (issue) =>
        `<li>Issue no. ${issue.issue_number}, ${escapeHtml(issue.title)}, ${escapeHtml(issue.date)}, contributors: ${issue.contributors.length > 0 ? issue.contributors.map((contributor) => escapeHtml(contributor.name)).join(", ") : "none named"}</li>`,
    )
    .join("\n")}</ul>`;
}

export function renderFilesPage(issues: GazetteIssue[] = [], loadNotes: string[] = []): string {
  const body = `
  <section>
    <p>Records for taking away. Nothing on this page changes the
    store — these are the books, packaged to leave the building.</p>
  </section>

  <section>
    <h2>The tax file</h2>
    <p><a href="/admin/export/tax.csv">Download the money ledger as CSV</a> —
    every certificate-backed sale (date, amount, tip, payer, settlement tx,
    house flag) plus refunds as their own negative rows. Hand it to a
    crypto-aware accountant as-is; every row verifies independently on a
    chain explorer by its tx.</p>
    <p><small>What it deliberately does NOT contain: penny-page settles
    (Almanac) mint no certificates and are not itemized — the chain record
    on the receive wallets is the backstop for those. House rows are
    flagged, never omitted: whether a self-purchase is income is the
    accountant's call, not an export's.</small></p>
  </section>

  <section>
    <h2>The founding edition</h2>
    <p><a href="/gazette/founding">Issue No. 1</a> — printed once, free,
    frozen with the ledger's numbers of its day. A record now, not a lever;
    the press that made it fired its one shot and its button left the
    back shelf.</p>
  </section>

  <section>
    <h2>The Gazette rack (${issues.length})</h2>
    <p>What the press printed while it ran. A record, like the founding
    edition above: the press's levers left the office 2026-10-02 and the
    public rack at <a href="/gazette">/gazette</a> still reads every issue.</p>
    ${rackHtml(issues)}
  </section>

  <section>
    <h2>The Sunday digest</h2>
    <p><a href="/admin/digest">The digest</a> — the week's numbers as JSON,
    same content the Sunday mail carries.</p>
  </section>`;
  return renderAdminShell("files", body, loadNotes);
}
