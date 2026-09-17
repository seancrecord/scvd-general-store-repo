import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { InspectionResult } from "@/services/purchase-inspection";
import { formatUnits } from "viem";

export function renderPurchasePage(result?: InspectionResult): string {
  const fields = result?.body.purchase;
  const list = (values: Record<string, unknown>) => `<dl>${Object.entries(values).map(([key, value]) =>
    `<dt>${escapeHtml(key.replaceAll("_", " "))}</dt><dd style="overflow-wrap:anywhere">${escapeHtml(value === null ? "not recorded / unknown" : typeof value === "boolean" ? value ? "yes" : "no" : key.endsWith("state") || key === "accounting_check" ? String(value).replaceAll("_", " ") : String(value))}</dd>`).join("")}</dl>`;
  const body = `<section><h2>Inspect a purchase</h2>
    <form method="get" action="/admin/purchases"><label>Purchase ID
      <input type="text" name="purchase_id" required pattern="[a-f0-9]{64}" maxlength="64" spellcheck="false" value="${escapeHtml(fields?.purchase_id ?? "")}"></label>
      <button type="submit">Read purchase</button></form>
    <p>Use the purchase ID from the buyer's recovery handle. This reads the retained purchase and, for MPP, its individual ledger entry.</p>
    <p><a href="/admin/take">Back to the take</a></p>
    ${result ? `<p>${escapeHtml(result.body.note)}</p><p>Read at ${escapeHtml(result.body.read_at)}. ${escapeHtml(result.body.code)}</p>` : ""}
    ${fields ? `<h3>Retained purchase</h3>
      ${fields.decimals !== null ? `<p>Quoted amount: ${escapeHtml(formatUnits(BigInt(fields.amount_atomic), fields.decimals))} ${escapeHtml(fields.currency ?? "")}</p>` : ""}
      ${list(Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "ledger" && key !== "house_correction")))}
      <h3>Individual ledger evidence</h3>${list({ state: fields.ledger.state, month: fields.ledger.month ?? null,
        mismatched_fields: fields.ledger.mismatched_fields?.join(", ") || "none reported" })}
      ${fields.ledger.sale ? list(fields.ledger.sale) : ""}
      ${fields.house_correction ? `<h3>House correction</h3>${list({ ...fields.house_correction })}<p>The original sale remains unchanged. Effective totals include this correction.</p>` : ""}
      ${fields.protocol === "mpp" && fields.house === false && !fields.house_correction && fields.accounting_check === "confirmed" ?
        `<h3>Correct house classification</h3><p>Register the buying wallet as house first. This moves this one purchase and its exact amount from organic to house; it preserves the original evidence.</p>
        <form method="post" action="/admin/purchases/${escapeHtml(fields.purchase_id)}/house-correction"><label>Reason <input name="reason" required maxlength="500"></label><button type="submit">Record house correction</button></form>` : ""}` : ""}
    </section>`;
  return renderAdminShell("take", body);
}
