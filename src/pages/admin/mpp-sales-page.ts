import { escapeHtml } from "@/lib/sanitize";
import { atomicToUsdc } from "@/lib/payments";
import { renderAdminShell } from "@/pages/admin/layout";
import type { MppSaleReading, MppSaleEvidenceListing } from "@/services/mpp-sales";

/**
 * THE MPP SALES, AS ROWS (2026-09-28). The take showed "1 MPP sale" and
 * the keeper had no way to see who paid, on which transaction, or for
 * what — the evidence sat in the monthly ledgers behind a count. One
 * row per retained sale, newest month first, each linking to the
 * purchase inspection that holds the rest.
 */
function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function row(sale: MppSaleReading): string {
  let usdc = "";
  try { usdc = `$${atomicToUsdc(sale.amount).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`; } catch { usdc = "(unreadable amount)"; }
  return `<tr>
    <td>${escapeHtml(sale.month)}</td>
    <td>${escapeHtml(sale.item ?? "(pilot product)")}</td>
    <td><code title="${escapeHtml(sale.payer)}">${escapeHtml(short(sale.payer))}</code>${sale.effective_house === null ? " <strong>classification unavailable</strong>" : sale.effective_house ? " <small>house</small>" : " <small>organic</small>"}${sale.house_correction ? " <small>(corrected; originally organic)</small>" : ""}</td>
    <td>${escapeHtml(usdc)} <small>(${escapeHtml(sale.amount)} atomic)</small></td>
    <td><code title="${escapeHtml(sale.transaction)}">${escapeHtml(short(sale.transaction))}</code> <small><a href="/admin/settlement/${encodeURIComponent(sale.transaction)}">books</a></small></td>
    <td><a href="/admin/purchases/${encodeURIComponent(sale.id)}"><code>${escapeHtml(short(sale.id))}</code></a></td>
  </tr>`;
}

export function renderMppSalesPage(listing: MppSaleEvidenceListing): string {
  const rows = [...listing.rows].sort((a, b) => b.month.localeCompare(a.month)).map(row).join("");
  const organic = listing.rows.filter((r) => r.effective_house === false).length;
  const house = listing.rows.filter((r) => r.effective_house === true).length;
  const unknown = listing.rows.length - organic - house;
  const monthsRead = listing.months.filter(month => !listing.months_unreadable.includes(month));
  const notes: string[] = [];
  if (unknown) notes.push(`${unknown} sale(s) have an unreadable house correction; their classification is unavailable.`);
  if (listing.months_unreadable.length) notes.push(`MPP ledger unreadable for ${listing.months_unreadable.join(", ")}: those months' sales are not on this page.`);
  if (listing.malformed) notes.push(`${listing.malformed} ledger row(s) did not validate and are not shown.`);
  const body = `
    <h2>Each sale</h2>
    <p>Native-protocol (MPP) sale rows successfully read: ${listing.rows.length} sale${listing.rows.length === 1 ? "" : "s"}, ${organic} organic, ${house} house${unknown ? `, ${unknown} unclassified` : ""}. Months read: ${monthsRead.map(escapeHtml).join(", ") || "none"}.</p>
    ${rows
      ? `<table border="1" cellpadding="4"><tr><th>month</th><th>item</th><th>payer</th><th>paid</th><th>settlement</th><th>purchase</th></tr>${rows}</table>`
      : `<p>${listing.malformed ? "No valid sale rows could be read." : listing.months_unreadable.length === listing.months.length ? "No monthly ledger could be read; the sale count is unavailable." : `No MPP sales retained${listing.months_unreadable.length ? " in the months that could be read" : ""}.`}</p>`}
    <p><small>The purchase link opens the retained purchase inspection; the books link reads every record the store holds for that settlement. x402 sales are not here: they are on <a href="/admin/buyers">the buyers</a> and the take.</small></p>
    <p><small>Cannot see: a sale whose ledger write failed after settlement, which the books sweep pages as certificate-native-accounting; and any sale on a month whose ledger did not answer, named above when it happens.</small></p>`;
  return renderAdminShell("mpp-sales", body, notes);
}
