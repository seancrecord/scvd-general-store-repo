import { escapeHtml as esc } from "@/lib/sanitize";
import { offerPaths } from "@/services/offer-paths";
import { relatedOfferPaths } from "@/store/offer-paths";

export function largerWorkHtml(base: string): string {
  return `<section class="shelves" id="larger-work" aria-labelledby="larger-work-title">
    <h2 class="night-head" id="larger-work-title">Audits, reports &amp; custom work</h2>
    <p class="shelf-more">Find where agents get stuck, bring evidence to a customer review, or scope a larger job. Start with the free evidence; buy more only when it answers your next question.</p>
    <div class="shelf-grid">${offerPaths(base).filter(o => o.id !== "endpoint-watch").map(o => `<article class="shelf-card">
      <h3 class="shelf-name"><a href="/operators#${o.id}">${esc(o.title)}</a></h3>
      <p class="shelf-line"><strong>${esc(o.price_short)}</strong></p>
      <p class="shelf-line">${esc(o.why)}</p>
      <p class="shelf-line"><strong>You receive:</strong> ${esc(o.outcome)}</p>
      <a href="/operators#${o.id}">Scope, limits and next step →</a>
    </article>`).join("")}</div>
    <p class="shelf-more"><a href="/operators">Choose a path from a small check to larger work →</a></p>
  </section>`;
}

export function offerPathsHtml(base: string): string {
  return `<section><h2>Choose the outcome you need</h2><p>These are separate choices, not required steps in a package. Use the free evidence first; you can stop there. Prices below come from the current terms, and availability is checked at the relevant door.</p><nav aria-label="Choose an outcome"><ul>${offerPaths(base).map(o => `<li><a href="#${o.id}">${esc(o.title)}</a></li>`).join("")}</ul></nav></section>${offerPaths(base).map(o => `<section id="${o.id}">
    <h2>${esc(o.title)}</h2>
    <p><strong>When:</strong> ${esc(o.when)}</p>
    <p><strong>Why:</strong> ${esc(o.why)}</p>
    <p><strong>You receive:</strong> ${esc(o.outcome)}</p>
    <p><strong>Price:</strong> ${esc(o.price)}</p>
    ${"published_rungs_usdc" in o && o.published_rungs_usdc ? `<p>Published commission rungs: ${o.published_rungs_usdc.map(n => `${n} USDC`).join(", ")}. A rung is not an offer for an unreviewed scope.</p>` : ""}
    <p><strong>Delivery:</strong> ${esc(o.delivery)}</p>
    <p><strong>Limits:</strong> ${esc(o.limits)}</p>
    <p><strong>Free first:</strong> <a href="${esc(o.free_first.url)}">${esc(o.free_first.label)}</a>.</p>
    <p><a href="${esc(o.next_step.url)}">${esc(o.next_step.label)} →</a></p>
    ${"request" in o && o.request ? `<p><a href="${esc(o.request.human_url)}">Email a brief to the keeper</a>, or send <code>POST ${esc(o.request.url)}</code>.</p><pre>${esc(JSON.stringify(o.request.body, null, 2))}</pre><p>${esc(o.request.note)}</p>` : ""}
  </section>`).join("")}`;
}

export function relatedOffersHtml(itemId: string, base: string): string {
  const offers = relatedOfferPaths(itemId, base);
  return offers.length ? `<section><h2>If your next question is larger</h2>${offers.map(o => `<p>${esc(o.when)} <a href="${esc(o.url)}">${esc(o.title)} — scope, price and free starting point</a>.</p>`).join("")}<p>No further purchase is needed to keep or verify this result.</p></section>` : "";
}
