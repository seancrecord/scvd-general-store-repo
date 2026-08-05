import { renderAdminShell } from "@/pages/admin/layout";

/**
 * KEEPER'S FILES: the drawer where downloadable records live. The
 * tax CSV used to sit between action buttons on the back shelf and
 * the keeper couldn't find it when he wanted it — a file you
 * download belongs in a filing drawer, not a toolbox. Everything
 * here is a record of what already happened; nothing on this page
 * can change the store.
 */
export function renderFilesPage(loadNotes: string[] = []): string {
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
    <h2>The Sunday digest</h2>
    <p><a href="/admin/digest">The digest</a> — the week's numbers as JSON,
    same content the Sunday mail carries.</p>
  </section>`;
  return renderAdminShell("files", body, loadNotes);
}
