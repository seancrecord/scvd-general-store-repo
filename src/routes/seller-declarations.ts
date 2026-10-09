import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { escapeHtml as h } from "@/lib/sanitize";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { attachDeclaration, parseDeclaration, declarationProof, declarationComparison, DeclarationRefused, DECLARATION_LIMIT, DECLARATION_CAP } from "@/services/seller-declaration";
import { listCorpus } from "@/services/corpus";
import { isSweepableHost, ASKED_FOR_SWEEP_CAP } from "@/services/asked-queue";
import { ladderRung } from "@/services/menu-markdown";
import { DECLARATION_PROPOSITION, DECLARATION_FREE, DECLARATION_MONEY, SELLER_DECLARATIONS_PATH, declarationNextSteps } from "@/store/seller-declarations";
import { isRecord, type HonoEnv } from "@/types";

export const sellerDeclarationRoutes = new Hono<HonoEnv>();
const errors = { invalid_request: "400: check the fields and use the exact prepared statement.", proof_failed: "403: prove the exact statement with the host file or every named wallet.", host_proof_required: "403: use the host file for unobserved hosts, address rotations or an existing host declaration.", stale_statement: "409: prepare a new statement with a current valid_from timestamp.", older_statement: "409: use a timestamp later than the retained declaration.", declaration_capacity: "409: contact the notice desk; the retained history is full.", rate_limited: "429: wait for Retry-After before submitting again.", history_unavailable: "503: retry later; no finding is inferred." };
function description(base: string) {
  return { what_this_is: DECLARATION_PROPOSITION, proposition: DECLARATION_PROPOSITION, price: "Free to submit and read.", for_money: DECLARATION_MONEY, free_first: DECLARATION_FREE,
    how_to_call: { prepare: `POST ${base}/api/seller-declaration with action: prepare and the declaration below; use the returned exact statement or hash. Preparation stores nothing.`,
      example: { action: "prepare", declaration: { artifact: "seller_declaration", version: 1, host: "your-host.example", declares: { pay_to: ["YOUR_PUBLIC_RECEIVING_ADDRESS"], networks: ["eip155:8453"], valid_from: "CURRENT_UTC_TIMESTAMP_WITH_MILLISECONDS" } } },
      host: "Serve the returned sha256 as a whitespace-separated token at https://{host}/.well-known/scvd-note.txt, maximum 4096 bytes, without a redirect. POST action: attach, evidence: well_known and the identical declaration.",
      wallet: "POST action: attach, evidence: wallet_signature, the identical declaration and signatures keyed by each normalized EVM address. Each wallet signs the exact prepared statement with personal_sign. Every address must appear in the last observed challenge for this host. This proves wallet control, not host control; host declarations take precedence. Use the host lane for new hosts, rotations or Solana.",
      read: `GET ${base}/api/seller-declaration?host=your-host.example. The comparison also rides /corpus/host/{host}.json and the held half of /api/look/v1.`,
      dates: "Use valid_from within ten minutes of attachment. A new declaration must have a later valid_from. Comparisons begin only after both valid_from and our attachment time; submitting the same declaration never renews its date.",
      queue: `An accepted declaration asks the existing bounded sweep to read the host. Up to ${ASKED_FOR_SWEEP_CAP} requested hosts are selected per week; this is not a guaranteed probe. Publish your endpoint in /.well-known/x402; /api/declare-door explains how.` },
    errors, security: { secrets: "Only public receiving addresses and signatures; never keys, credentials or wallet secrets. Nothing sends a payment.", storage: `Only address digests are retained and returned; up to ${DECLARATION_CAP} dated declarations per host support historical comparisons. Public hashes allow someone who already knows an address to test it.`, proof: "Host proof uses one bounded HTTPS read with redirects refused and the shared public-target rules. Wallet proof recovers each EVM signer. A shared wallet is not host ownership.", limits: DECLARATION_LIMIT },
    states: { match: "Every captured address digest is declared.", mismatch: "At least one captured address digest is not declared.", not_captured: "The last probed row captured no address.", not_probed: "No probe after this declaration became effective and was attached.", no_declaration: "No effective declaration is held." },
    next_steps: declarationNextSteps(base), watch: ladderRung(base, "conformance_watch", "Daily conformance observations for a bounded term; no declaration-change alerts.") };
}
sellerDeclarationRoutes.get(SELLER_DECLARATIONS_PATH, c => {
  const base = c.env.STORE_BASE_URL;
  const data = description(base);
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) return jsonDocumentMarkdownResponse({ base, path: SELLER_DECLARATIONS_PATH, title: "Seller declarations", description: DECLARATION_PROPOSITION, document: data });
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.json(data);
  return c.html(renderSimplePage({ title: "Seller declarations", path: SELLER_DECLARATIONS_PATH, description: DECLARATION_PROPOSITION, collapseNavigation: true, markdownAlt: SELLER_DECLARATIONS_PATH,
    extraCss: `.paper {max-width:880px} .paper h2 {text-align:left;text-transform:none;letter-spacing:normal} form {display:flex;flex-wrap:wrap;gap:.6rem;align-items:center} input {min-width:0;max-width:100%;padding:.65rem;font:inherit} button {padding:.65rem;font:inherit;cursor:pointer} summary {cursor:pointer} a:focus-visible,input:focus-visible,button:focus-visible {outline:3px solid var(--teal);outline-offset:3px}`,

    bodyHtml: `<p class="standfirst">${h(DECLARATION_PROPOSITION)}</p><p><strong>${h(DECLARATION_FREE)}</strong></p>
    <section><h2>What a buyer can check</h2><p>A dated comparison shows whether the receiving addresses we captured belong to the set you declared. The result names both dates and the source observation. A missing reading stays missing.</p><p>${h(DECLARATION_LIMIT)}</p><form action="/api/seller-declaration" method="get"><label for="declaration-host">Public hostname</label> <input id="declaration-host" name="host" placeholder="api.example.com" required><button type="submit">Read the free comparison</button></form></section>
    <section><h2>Declare your receiving addresses</h2><ol><li><a href="/api/seller-declaration">Prepare the exact declaration</a> with your public hostname, receiving addresses, networks and current UTC timestamp.</li><li>Prove control with a file on your host, or a signature from each eligible EVM wallet. Wallet proof does not establish host ownership.</li><li>Submit it, then read the comparison. New hosts join the bounded request queue; publication does not promise a probe date.</li></ol><p>Keep the prepared statement yourself. Public views retain address digests, so someone holding a receiving address can recompute and compare it.</p><details><summary>Exact requests, proof and errors</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${h(JSON.stringify(data.how_to_call, null, 2))}</pre><p>${h(Object.values(errors).join(" "))}</p></details></section>
    <section><h2>Need a record over time?</h2><p>The free comparison stays above. For scheduled payment-interface observations, <a href="/menu/conformance_watch">${h(String(data.watch?.name ?? "Conformance Watch"))}</a> — ${h(String(data.watch?.price ?? "see current terms"))}. These checks do not send declaration-change alerts.</p><p>${h(DECLARATION_MONEY)}</p><p><a href="/evidence-pilot">See the SCVD Attestation report and free sample</a></p></section>
    ${jsonLdScript({ "@context": "https://schema.org", "@type": "Service", name: "Seller declarations", description: DECLARATION_PROPOSITION, url: `${base}${SELLER_DECLARATIONS_PATH}`, provider: organizationRef(base), isAccessibleForFree: true })}` }));
});
sellerDeclarationRoutes.get("/api/seller-declaration", async c => {
  c.header("Cache-Control", "no-store");
  const host = c.req.query("host")?.trim().toLowerCase();
  if (!host) return c.json(description(c.env.STORE_BASE_URL));
  if (!isSweepableHost(host)) return c.json({ error: "invalid_host" }, 400);
  try {
    const comparison = await declarationComparison(c.env, await listCorpus(c.env), host);
    const data = { host, declared_vs_observed: comparison, next_steps: declarationNextSteps(c.env.STORE_BASE_URL) };
    if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) return c.html(renderSimplePage({
      title: `Receiving addresses: ${host}`, path: "/api/seller-declaration", description: DECLARATION_PROPOSITION, collapseNavigation: true,
      bodyHtml: `<section><h2>${h(comparison.state.replaceAll("_", " "))}</h2><p>${h(description(c.env.STORE_BASE_URL).states[comparison.state])}</p>
      <dl><dt>Declaration attached</dt><dd>${h(comparison.declaration?.attached_at ?? "No declaration held")}</dd><dt>Observed</dt><dd>${h(comparison.observed?.observed_at ?? "No comparable reading")}</dd><dt>Proof</dt><dd>${h(comparison.declaration?.proof_scope ?? "None")}</dd></dl>
      <p>${h(DECLARATION_LIMIT)}</p>${comparison.observed ? `<p><a href="/corpus/${comparison.observed.sequence}.json">Read the signed source snapshot</a></p>` : ""}
      <details><summary>Digests and full comparison</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${h(JSON.stringify(comparison, null, 2))}</pre></details>
      <p><a href="/seller-declarations">Declare receiving addresses free</a> · <a href="/corpus/host/${h(host)}">Read host history</a></p></section>
      <section><h2>For a review over time</h2><p>${h(DECLARATION_MONEY)}</p><p><a href="/evidence-pilot">Read the scope and sample report</a>. The pilot records daily conformance checks; it does not send declaration-change alerts.</p></section>`,
    }));
    return c.json(data);
  }
  catch (error) { if (error instanceof DeclarationRefused) return c.json({ error: error.code, note: error.message }, error.status); throw error; }
});
sellerDeclarationRoutes.post("/api/seller-declaration", bodyLimit({ maxSize: 16_384 }), async c => {
  c.header("Cache-Control", "no-store");
  try {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { throw new DeclarationRefused("invalid_request", "Send JSON."); }
    if (!isRecord(raw)) throw new DeclarationRefused("invalid_request", "Send an object.");
    const input = parseDeclaration(raw.declaration, new URL(c.env.STORE_BASE_URL).host);
    if (raw.action === "prepare") return c.json({ declaration: input, ...await declarationProof(input), expires_note: "Submit within ten minutes of valid_from. Preparation publishes nothing." });
    if (raw.action !== "attach") throw new DeclarationRefused("invalid_request", "action must be prepare or attach.");
    // Bound outbound proof reads and signature work per host. This is a KV
    // courtesy limit, not an atomic admission counter; races can admit extras.
    const key = `seller_declaration_attempt:${input.host}`;
    if (await kvGet(c.env.COUNTERS, key)) { c.header("Retry-After", "60"); throw new DeclarationRefused("rate_limited", "Wait one minute before retrying this host.", 429); }
    await kvPut(c.env.COUNTERS, key, "1", { expirationTtl: 60 });
    const declaration = await attachDeclaration(c.env, { ...raw, declaration: input });
    return c.json({ attached: true, declaration, comparison_url: `${c.env.STORE_BASE_URL}/api/seller-declaration?host=${input.host}`, next_steps: declarationNextSteps(c.env.STORE_BASE_URL) });
  } catch (error) { if (error instanceof DeclarationRefused) return c.json({ error: error.code, note: error.message }, error.status); throw error; }
});
