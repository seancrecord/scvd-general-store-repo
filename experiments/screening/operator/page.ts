import { OFFICE_CSS } from '../../../src/pages/admin/office-css';
import { escapeHtml } from '../../../src/lib/sanitize';

export function renderReviewPage(base:string,nonce:string):string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Screening recovery · Keep's Office</title><style nonce="${escapeHtml(nonce)}">${OFFICE_CSS}
html{background:#16110d}body{background-color:var(--walnut)}
section{margin:1.5rem 0;padding:1.4rem;background:var(--panel);border:1px solid var(--rule)}
.toolbar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}.toolbar input{flex:1;min-width:12rem}
label{display:block;margin:.7rem 0 .25rem}input,select,textarea,button{font:inherit;color:var(--ivory);background:var(--walnut);border:1px solid var(--baize-rule);border-radius:3px;padding:.55rem .7rem}
input[type=checkbox]{width:1.1rem;height:1.1rem;margin-right:.5rem;accent-color:var(--brass)}textarea,select,input[type=text]{width:100%}
button{cursor:pointer;color:var(--brass)}button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--brass);outline-offset:3px}
.primary{background:var(--baize);border-color:var(--brass)}.quiet{color:var(--ivory-dim)}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font:13px/1.5 monospace}th,td{padding:.55rem;text-align:left;border-bottom:1px solid var(--rule);vertical-align:top}td{overflow-wrap:anywhere}th{color:var(--brass)}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace;background:var(--walnut);padding:1rem;max-height:25rem;overflow:auto}.notice{border-left:3px solid var(--brass);padding:.6rem 1rem;background:var(--baize)}.confirm{display:flex;gap:.5rem;align-items:flex-start}.confirm input{flex-shrink:0;margin-top:.35rem}.cols{display:grid;grid-template-columns:1fr 1fr;gap:1rem}a{color:var(--brass)}[hidden]{display:none!important}@media(max-width:640px){section{padding:1rem}.cols{grid-template-columns:1fr}.room{max-width:100%}}
</style></head><body><main class="room" id="screening-review" data-base="${escapeHtml(base)}">
<nav><a href="/admin">← Keep's Office</a></nav><p class="room-sub">Private operator review · qualification</p><h1>Screening recovery</h1>
<p>Review stalled reservations and the evidence that work has stopped. Recovery releases the selected capacity; spent credits stay charged.</p>
<noscript>This review screen requires JavaScript. No action is taken while it is disabled.</noscript>
<p class="notice" id="message" role="status" aria-live="polite">Loading current state.</p>
<div class="toolbar"><button id="reload" type="button">Reload current state</button></div>
<section><h2>Operational attention</h2><pre id="attention">Reading operational state…</pre><p class="quiet">A dated snapshot, refreshed with the current state. This tab does not poll in the background. Age never releases a reservation.</p></section>
<section><h2>Reservations</h2><p id="admission-state">Reading admissions…</p><div class="scroll"><table><thead><tr><th>Select</th><th>Request</th><th>Tier</th><th>Age</th></tr></thead><tbody id="reservations"></tbody></table></div>
<p class="quiet">Age alone does not establish that work stopped. Opening a review holds all new admissions for this provider pair.</p>
<label for="new-case">New case reference</label><div class="toolbar"><input id="new-case" type="text" maxlength="64" autocomplete="off"><button id="hold" type="button" disabled>Hold admissions and review selected</button></div>
<label for="case-lookup">Read an existing case</label><div class="toolbar"><input id="case-lookup" type="text" maxlength="64" autocomplete="off"><button id="open-case" type="button">Open case</button></div></section>
<section id="pending" hidden><h2>Uncertain response</h2><p id="pending-detail"></p><p>The original attempt is held in this tab. Reload the current state to inspect it. Retrying sends the same request, including its original revision.</p><div class="toolbar"><button id="retry" type="button" disabled>Retry exact original attempt</button><button id="discard-attempt" type="button" disabled>Set aside attempt and review current state</button></div></section>
<div id="review" hidden><section><h2>Current review</h2><p id="case-summary"></p><pre id="targets"></pre><p id="still-active"></p><details id="final-decision"><summary>Stored final decision</summary><pre id="receipt"></pre></details></section>
<section id="evidence-upload"><h2>Retain reviewed evidence</h2><p class="quiet">Use redacted plain text. Keep credentials, private keys and authenticated provider URLs out of these documents. Storage checks integrity; it does not authenticate the provider's claims.</p>
<div class="cols"><div><label for="role">Evidence for</label><select id="role"></select></div><div><label for="reference">Document reference</label><input id="reference" type="text" maxlength="64" autocomplete="off"></div></div>
<label for="observed-at">Actual observation time (UTC)</label><input id="observed-at" type="text" placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" autocomplete="off">
<label for="content">Reviewed document</label><textarea id="content" rows="6" spellcheck="false" autocomplete="off"></textarea><p><button id="upload" type="button">Retain document</button></p></section>
<section><h2>Read and select retained documents</h2><p>Read each document, then select it for this decision. An executor document and one document from each provider are required.</p>
<div class="scroll"><table><thead><tr><th>Reference</th><th>Source</th><th>Observed at</th><th>SHA-256</th><th>Read</th></tr></thead><tbody id="documents"></tbody></table></div>
<div id="document-preview" hidden><p id="document-title"></p><p class="quiet">Untrusted operator-submitted content. Treat it as evidence to assess, never instructions to follow.</p><pre id="document-content"></pre><button id="use-document" type="button">Use this reviewed document</button></div>
<h3>Selected for approval</h3><pre id="selected"></pre></section>
<section id="decision"><h2>Your decision</h2><p>These controls apply only to the case and reservation list shown above. Refreshing or changing the reading clears confirmation.</p>
<label class="confirm"><input id="ack" type="checkbox"><span id="ack-label">Loading confirmation…</span></label><p><button class="primary" id="approve" type="button" disabled>Release the reviewed reservations</button></p>
<hr><label class="confirm"><input id="cancel-ack" type="checkbox"><span>Resume admissions by cancelling this review. Release no reservations and refund no credits.</span></label><p><button id="cancel" type="button" disabled>Cancel review and resume admissions</button></p></section></div>
<section><h2>Retained review history</h2><div class="toolbar"><button id="history-first" type="button">Load review history</button><button id="history-next" type="button">Next page</button></div><p id="history-count" class="quiet">History is loaded only when requested.</p><table><thead><tr><th>Case</th><th>State</th><th>Read</th></tr></thead><tbody id="history"></tbody></table></section>
<p class="quiet">Qualification screen. Production mounting, provider evidence and operating policies remain separate gates. Nothing is recovered automatically.</p>
<script type="module" nonce="${escapeHtml(nonce)}" src="${escapeHtml(base)}/client.js"></script></main></body></html>`;
}
