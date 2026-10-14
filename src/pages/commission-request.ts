import { escapeHtml as esc } from "@/lib/sanitize";
import { renderSimplePage } from "@/pages/simple-page";
import { briefFormHtml, briefFormCss, type BriefDraft } from "@/pages/commission-brief";
import { isRecord } from "@/types";

export function briefErrorHtml(message: string, draft?: BriefDraft): string {
  return renderSimplePage({ title: "Check your brief", description: "Review your free custom-work request.", path: "/api/request",
    collapseNavigation: true, extraCss: briefFormCss,
    bodyHtml: `<section><p role="alert">${esc(message)}</p>${briefFormHtml(draft)}<p><a href="/operators#custom-review">Back to scope and terms</a></p></section>` });
}

/** Render only the public desk view; the private contact never reaches this function. */
export function commissionStatusHtml(view: Record<string, unknown>): string {
  const status = String(view["status"]);
  const titles: Record<string, string> = { requested: "Awaiting keeper review", quoted: "Quote ready", expired: "Quote expired", declined: "Request declined", accepted: "Commission accepted" };
  const quote = isRecord(view["quote"]) ? view["quote"] : undefined;
  return renderSimplePage({ title: "Your custom-work request", description: "The current status and terms of your request.",
    path: `/api/commission/${encodeURIComponent(String(view["id"]))}`, collapseNavigation: true,
    bodyHtml: `<section><h2>${esc(titles[status] ?? status)}</h2>
      <p>Save this page to check for the keeper’s reply. Anyone with this link can read the brief and terms; your reply contact is not shown.</p>
      <p><strong>Request:</strong> ${esc(String(view["id"]))}</p><p>${esc(String(view["description"]))}</p>
      <p><strong>Proposed budget:</strong> ${Number(view["offer_usdc"]) > 0 ? `${esc(String(view["offer_usdc"]))} USDC` : "No positive budget proposed"}. This is not an agreed price.</p>
      ${status === "requested" ? `<p>The keeper reviews requests by hand. Sending the brief is free. A quote will define the scope, price and delivery window; you can decide then.</p>` : ""}
      ${quote ? `<p><strong>Quote:</strong> ${esc(String(quote["usdc"]))} USDC · delivery window ${esc(String(quote["window_hours"]))} hours after payment.</p><p><strong>Quote expires:</strong> ${esc(String(quote["expires_at"]))}</p>${quote["note"] ? `<p>${esc(String(quote["note"]))}</p>` : ""}
        ${quote["pay_url"] ? `<p><a href="${esc(String(quote["pay_url"]))}">Open the quoted payment route</a></p><p>Payment requires a compatible client and your signed authorization. Opening the route alone does not pay. Share the exact route with your agent if paying that way.</p>` : `<p>This quote has expired. <a href="/operators#request-brief">Send a new brief</a> if the work still needs doing; terms may differ.</p>`}` : ""}
      ${status === "declined" ? `<p><strong>Keeper’s reply:</strong> ${esc(String(view["reply"] ?? ""))}</p>` : ""}
      ${status === "accepted" ? `<p>Your commission was accepted. The agreed delivery window applies.</p>${view["order_url"] ? `<p><a href="${esc(String(view["order_url"]))}">Read your order</a></p>` : ""}` : ""}
      <p><a href="/operators#custom-review">Custom-review scope and terms</a></p></section>` });
}
