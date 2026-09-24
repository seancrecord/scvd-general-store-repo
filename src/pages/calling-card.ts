import { escapeHtml } from "@/lib/sanitize";
import { CALLING_CARD_MODULE, CALLING_CARD_PROPOSITION, CALLING_CARD_MONEY, CALLING_CARD_FREE } from "@/store/calling-card";
import { CALLING_CARD_PATHS, CALLING_CARD_TERM_SECONDS, CALLING_CARD_REPORT_SECONDS } from "@/services/calling-card";

export const CALLING_CARD_CSS = `
.calling-card [hidden]{display:none!important}
.calling-card form{display:grid;gap:.8rem;margin-top:1.3rem}
.calling-card input:not([type=file]):not([type=checkbox]),.calling-card select{box-sizing:border-box;width:100%;background:#19131e;color:#f0e9df;border:1px solid #827483;border-radius:4px;padding:.75rem;font:inherit;min-height:44px}
.calling-card .cc-field{display:grid;gap:.4rem;margin:.8rem 0}
.calling-card label[data-consent]{display:flex;gap:.7rem;align-items:flex-start;margin:1rem 0}
.calling-card label[data-consent] input{margin-top:.3rem}
.calling-card [data-resolutions]>div{border-left:2px solid #b9a18a;padding-left:1rem;margin:1rem 0}
.calling-card textarea{width:100%;box-sizing:border-box;min-height:13rem;resize:vertical;background:#19131e;color:#f0e9df;border:1px solid #827483;border-radius:4px;padding:1rem;font:14px/1.65 ui-monospace,monospace}
.calling-card button,.calling-card .download-link{font:inherit;min-height:44px;border:1px solid #b9a18a;border-radius:3px;padding:.6rem .9rem;background:transparent;color:#f0e9df;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;text-decoration:none}
.calling-card button[type=submit]{background:#dac08a;color:#19131e;border-color:#dac08a;justify-self:start}
.calling-card button:disabled{opacity:.55;cursor:not-allowed}
.calling-card :focus-visible{outline:2px solid #f0dba8;outline-offset:4px}
.calling-card .cc-actions{display:flex;gap:.65rem;flex-wrap:wrap;margin:1rem 0}
.calling-card input[type=file]{max-width:100%;font:inherit}
.calling-card [data-status]{min-height:1.6em}
.calling-card [data-result]{border-top:1px solid var(--line);margin-top:1.5rem;padding-top:.5rem}
.calling-card pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:28rem;overflow:auto}
.calling-card li{margin-bottom:.75rem}
.calling-card .cc-note{border-left:2px solid #b9a18a;padding-left:1rem}
@media(max-width:520px){.calling-card .cc-actions>*{width:100%}.calling-card textarea{font-size:16px}}
`;

export function callingCardHtml(price: number | undefined, base = "https://scvd.store"): string {
  const origin=new URL(base);origin.protocol="https:";
  const service={origin:origin.origin,paths:CALLING_CARD_PATHS,term_seconds:CALLING_CARD_TERM_SECONDS};
  return `<section class="calling-card-intro"><h2>Your agent, introduced</h2>
    <p>${escapeHtml(CALLING_CARD_PROPOSITION)}</p><p>${escapeHtml(CALLING_CARD_FREE)}</p>
    <p>${escapeHtml(CALLING_CARD_MONEY)}</p>
    <p><strong>Supported today:</strong> Node fetch. Your existing payment client keeps its spending decisions. Site acceptance and payment completion remain separate outcomes.</p></section>
    <section id="calling-card-setup" class="calling-card" data-service="${escapeHtml(JSON.stringify(service))}" hidden>
      <h2>Bring what you have</h2>
      <p>Connect a Node agent. Start with its public name and the sites it may contact, or import existing public information below.</p>
      <div class="cc-field"><label for="cc-name">Agent name</label><input id="cc-name" data-name placeholder="My Agent" maxlength="120"></div>
      <div class="cc-field"><label for="cc-destinations">Sites this agent may contact</label><input id="cc-destinations" data-destinations placeholder="https://example.com, https://scvd.store"></div>
      <button type="button" data-start>Use these details</button>
      <details><summary>Import existing public information</summary>
      <p>Paste public identity fields or choose a public JSON file. This step stays in this browser. Use an HTTPS destination for each site allowed to receive your introduction.</p>
      <form><label for="cc-input">Public agent information</label>
      <textarea id="cc-input" spellcheck="false" autocomplete="off" placeholder="name: My Agent&#10;allowed_origins: https://scvd.store&#10;networks: eip155:8453" aria-describedby="cc-help"></textarea>
      <p id="cc-help">JSON or labeled lines, in any order. Never paste credentials, private keys, wallet secrets, or payment signatures.</p>
      <label for="cc-file">Or choose a public configuration file</label><input id="cc-file" data-file type="file" accept=".json,.txt,application/json,text/plain">
      <div class="cc-actions"><button type="submit">Organize my calling card</button><button type="button" data-sample>Use an example</button></div></form></details>
      <p data-status role="status" aria-live="polite"></p>
      <div data-result hidden><h2>Review your profile</h2><div data-resolutions></div><ul data-gaps></ul>
      <p>Requests carry your introduction in User-Agent and, when configured, signature headers. Destination permissions and payment-network declarations stay in your local profile.</p>
      <p class="cc-note">This is your declaration. A downloaded card does not establish who operates it, grant site access, or authorize spending.</p>
      <details open><summary>Public fields in your card</summary><pre data-preview></pre></details>
      <h3>Take it with you</h3><p data-instructions></p>
      <div class="cc-field"><label for="cc-mode">Signing setup</label><select id="cc-mode" data-mode><option value="managed">Create a local key and publish its public directory</option><option value="existing">Use my existing integration and signer</option></select></div>
      <p data-managed-note>The setup command creates your private key on your machine and publishes only its public directory for ${CALLING_CARD_TERM_SECONDS/86400} days. It grants no access rights. Renewal and revocation are explicit commands; propagation can take time.</p>
      <label data-consent><input type="checkbox" data-share><span>Share limited outcomes from the listed sites to improve compatibility. Reports include the site origin, HTTP status and fixed diagnostic labels. No paths, request bodies, credentials or payment payloads. Private to the store operator; retained ${CALLING_CARD_REPORT_SECONDS/86400} days. Off unless selected.</span></label>
      <div class="cc-actions"><button type="button" data-kit disabled>Download configured integration</button></div>
      <div data-local-steps><p>1. Run <code>node my-calling-card.mjs --setup</code> to create the local key and publish its public directory.</p><p>2. Run <code>node my-calling-card.mjs --observe</code> to send one signed introduction and get a dated, signed observation from this receiver.</p><p>3. In your agent: <code>import { connectLocal } from './my-calling-card.mjs'</code>, then <code>const request = await connectLocal()</code>. Use <code>request</code> as its underlying fetch. Finish a run with <code>await request.flushReports()</code> when sharing is enabled.</p><p>Keep the generated <code>.my-calling-card.mjs.local</code> folder private. Use <code>--renew</code> to extend directory publication or <code>--revoke</code> to retire it. To replace a key, revoke it and set up a newly named download.</p></div>
      <p data-existing-steps hidden>In your agent: <code>import { connect } from './my-calling-card.mjs'</code>, then use <code>connect()</code> or <code>connect({ sign })</code> with your existing local signer.</p>
      <details><summary>Connect an existing x402 client</summary>
      <p>After guided setup, keep your existing payment client, wallet connection, spending limits and approval hooks. Put the calling-card transport underneath it:</p>
      <pre>import { wrapFetchWithPayment } from '@x402/fetch';
import { connectLocal } from './my-calling-card.mjs';

const introducedFetch = await connectLocal();
const request = wrapFetchWithPayment(introducedFetch, client);
// client is your existing configured x402Client.
// Finish with await introducedFetch.flushReports().</pre>
      <p>Calling this request uses your client's existing payment behavior. Every outgoing attempt gets a fresh introduction. Settlement and delivery remain your application's responsibility.</p></details>
      <details><summary>Separate files and a worked example</summary>
      <div class="cc-actions"><button type="button" data-download disabled>1. Download card</button><a class="download-link" href="${CALLING_CARD_MODULE}" download="calling-card.mjs">2. Download integration</a><button type="button" data-example disabled>3. Download example</button></div>
      </details>
      <p>The example sends one GET only when you run it with a destination. No automatic retries or payments. See <a href="/bot-auth?format=json">machine instructions</a> for signer and directory setup.</p>
      <h3>If you published a key directory</h3><p>Pressing this sends only the public directory URL to the store for one free check. The optional signed record records that directory reading, not your runtime or future requests.</p>
      <button type="button" data-check disabled>Check my public directory — free</button><pre data-checked role="status" aria-live="polite"></pre>
      <a data-purchase hidden href="/menu/signature_agent_card">Get the signed directory record${price === undefined ? "" : ` — $${escapeHtml(String(price))} once`}</a>
      </div>
    </section>
    <noscript><p>Interactive setup needs JavaScript to organize inputs locally. <a href="${CALLING_CARD_MODULE}" download="calling-card.mjs">Download the integration</a> and use <code>normalizeCallingCard</code> in Node; <a href="/bot-auth?format=json">full instructions</a> are available without JavaScript.</p></noscript>`;
}
