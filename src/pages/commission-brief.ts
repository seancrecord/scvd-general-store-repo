import { escapeHtml as esc } from "@/lib/sanitize";
import { COMMISSION_DESCRIPTION_CAP, COMMISSION_CONTACT_CAP } from "@/store/commission-desk";

export interface BriefDraft { description: string; contact: string; offer_usdc: string }

export const briefFormCss = `
.brief-form label { display: block; margin: 1.2rem 0 .35rem; font-weight: 600; }
.brief-form input, .brief-form textarea { box-sizing: border-box; width: 100%; padding: .7rem; border: 1px solid currentColor; border-radius: .3rem; background: transparent; color: inherit; font: inherit; }
.brief-form textarea { min-height: 9rem; resize: vertical; }
.brief-form button { margin-top: 1rem; padding: .8rem 1.1rem; font: inherit; cursor: pointer; }
.brief-form :focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
`;

export function briefFormHtml(draft: BriefDraft = { description: "", contact: "", offer_usdc: "" }): string {
  return `<form class="brief-form" id="request-brief" method="POST" action="/api/request" aria-label="Request a custom review">
    <h3>Send a brief</h3><p>Requesting is free. The keeper will quote the work and delivery window or explain why it does not fit. Sending this form starts no work and takes no payment.</p>
    <label for="brief-description">What would you like reviewed?</label>
    <p id="brief-help">Include the decision you need to make, public endpoints, useful evidence and any deadline. Up to ${COMMISSION_DESCRIPTION_CAP} characters. Do not include credentials, secrets or confidential details.</p>
    <textarea id="brief-description" name="description" required maxlength="${COMMISSION_DESCRIPTION_CAP}" aria-describedby="brief-help">${esc(draft.description)}</textarea>
    <label for="brief-contact">Where can the keeper reply?</label>
    <input id="brief-contact" name="contact" type="text" required maxlength="${COMMISSION_CONTACT_CAP}" value="${esc(draft.contact)}" aria-describedby="brief-contact-help">
    <p id="brief-contact-help">An email address or another reachable reply contact. This field stays private.</p>
    <label for="brief-budget">Proposed budget in USDC (optional)</label>
    <input id="brief-budget" name="offer_usdc" type="number" min="0" step="any" inputmode="decimal" value="${esc(draft.offer_usdc)}" aria-describedby="brief-budget-help">
    <p id="brief-budget-help">Leave blank if you need a quote first. A proposed budget is not a payment or an agreed price.</p>
    <p>Your brief is readable by anyone with its status link. If declined, a brief excerpt and the keeper’s reason appear on the public decline record. Keep private details out of the brief.</p>
    <button type="submit">Send brief — free</button>
  </form>`;
}

