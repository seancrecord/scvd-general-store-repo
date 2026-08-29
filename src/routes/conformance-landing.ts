import { Hono } from "hono";
import {
  checkConformance,
  conformanceDoc,
  CONFORMANCE_VERSION,
  type ConformanceRequest,
  type ConformanceVerdict,
} from "@/services/conformance";
import { FIRST_PARTY_SCRIPT_CSP } from "@/lib/csp";
import { CENSUS_FINDING, CENSUS_WHY_IT_MATTERS } from "@/store/copy/census";
import { jsonLdScript } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import type { HonoEnv } from "@/types";

/**
 * GET /conformance — the crawlable landing for the conformance desk.
 *
 * The desk itself has answered at /api/conformance/v1 since it opened,
 * with an HTML twin on the same path. That was never enough: an API
 * endpoint with no landing page is invisible to every crawler and
 * every model that learns the store from its pages — the 2026-08-10
 * five-model check found NONE of them knew the desk existed, because
 * the only doors were an API path and a JSON document. This room is
 * the page a search engine, an answer engine, or a person can be
 * handed.
 *
 * Everything checkable derives: the verdict vocabulary and the
 * conflict-of-interest wording come from conformanceDoc (the same
 * object the API serves), and the census finding is the shared
 * constant the corpus landing prints too. The page adds only prose,
 * so it cannot disagree with the desk about what the desk does.
 */
export const conformanceLandingRoutes = new Hono<HonoEnv>();

const VERIFIER_URL =
  "https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier";
const SIGNER_URL =
  "https://github.com/seancrecord/scvd-general-store-repo/tree/main/signer";

function landingJson(base: string) {
  const doc = conformanceDoc(base);
  return {
    what_this_is:
      "The free conformance desk: paste any issuer's x402 signed offer or receipt into the form at /conformance, or POST it to the API, and get a structured verdict. No account, no wallet, no 402 — and it checks a competitor's artifact exactly as readily as ours.",
    endpoint: `${base}/api/conformance/${CONFORMANCE_VERSION}`,
    endpoint_shape_check: `${base}/api/preflight/v1`,
    census: CENSUS_FINDING,
    why_it_matters: CENSUS_WHY_IT_MATTERS,
    packages: {
      "x402-verify": {
        what: "The desk's own method as a zero-dependency MIT npm package, so every verdict can be reproduced offline without trusting this store.",
        source: VERIFIER_URL,
      },
      "x402-sign": {
        what: "The other half: issue your own x402 signed offers and receipts, so your 402 carries a pre-payment commitment a buyer can verify.",
        source: SIGNER_URL,
      },
    },
    conformance_vectors: `${base}/.well-known/conformance/offer-receipt-vectors.json`,
    desk: doc,
  };
}

/**
 * THE DESK AS A FORM — the declarative WebMCP surface, and the first
 * thing on this store a person in a browser can actually USE.
 *
 * TWO GAPS, ONE MARKUP. The desk has been free and public since it
 * opened and has never been usable without a terminal: the room
 * printed a curl invocation and left anybody without one at the door.
 * And the browser door (P7) was imperative-only — every declaration
 * cost real JavaScript, on a store whose whole shelf of free
 * instruments takes one short input.
 *
 * The declarative API closes both. Attributes read first-hand from
 * the spec repo on 2026-08-29 (webmachinelearning/webmcp,
 * declarative-api-explainer.md): `toolname` and `tooldescription` on
 * the form are analogous to the imperative API's name and
 * description, `toolparamdescription` on each control describes that
 * input, and the browser compiles the form down to an input schema
 * itself. No script, no second definition to drift.
 *
 * `toolautosubmit` IS DELIBERATELY ABSENT, and it is the whole ruling
 * in one missing attribute. With it, an agent fills the form and
 * submits it on the visitor's behalf. Without it, the browser puts
 * the submit button in focus and the PERSON presses it — which is
 * rule 17 exactly: nothing the store hands you can act without your
 * decision. An agent can prepare this check; only a human can run it.
 *
 * Nothing here asks for a credential, a key, or a wallet secret, and
 * nothing it can do costs money. The artifact a caller pastes is
 * somebody else's signed bytes; it is read, never echoed back into
 * the page (rule 18 — third-party text is never rendered as ours).
 */
function deskFormHtml(): string {
  return `<section>
      <h2>Check one now</h2>
      <p class="menu-desc">Paste a signed offer or receipt — any issuer's, including ours. Free, no account, and the verdict says what it does not prove.</p>
      <form method="post" action="/conformance" class="desk-form"
        toolname="check_conformance"
        tooldescription="Check whether an x402 signed offer or receipt is well-formed and correctly signed. Takes one compact JWS artifact from any issuer and returns a structured verdict: parse, schema, ed25519 signature, and liveness. Free, read-only, and it makes no payment.">
        <label for="artifact">The artifact — a compact JWS, as it appears in the 402</label>
        <textarea id="artifact" name="artifact" rows="4" required
          toolparamdescription="The compact JWS string of the signed offer or receipt to check — three base64url segments separated by dots. Copy it out of the endpoint's PAYMENT-REQUIRED header or its receipt."></textarea>
        <label for="public_key_hex">The issuer's public key in hex — optional</label>
        <input type="text" id="public_key_hex" name="public_key_hex"
          toolparamdescription="Optional 64-character hex ed25519 public key. Supply it and the check runs entirely offline, making no request in anyone's name; leave it blank and the key named by the artifact's kid is resolved by did:web.">
        <button type="submit">Check it</button>
      </form>
      <p class="menu-meta">The same check, without a browser: <code>POST /api/conformance/${CONFORMANCE_VERSION}</code>. The same check, without us: the <a href="${VERIFIER_URL}"><code>x402-verify</code></a> package, offline.</p>
    </section>`;
}

/** The form's own styling — the page ships no script, so this is all of it. */
const DESK_FORM_CSS = `
.desk-form { margin: 0.8em 0; }
.desk-form label { display: block; margin: 0.6em 0 0.2em; font-size: 0.9em; }
.desk-form textarea, .desk-form input[type=text] {
  width: 100%; box-sizing: border-box; font-family: inherit; font-size: 0.9em;
  padding: 0.4em; border: 1px solid currentColor; background: transparent;
  color: inherit;
}
.desk-form button { margin-top: 0.6em; font: inherit; padding: 0.4em 1em; }
.verdict-row { margin: 0.2em 0; }
`;

/**
 * The verdict, rendered for eyes. Every field comes off the same
 * object the API returns, so this page cannot report a verdict the
 * desk did not reach — and every string is escaped, because the
 * checks describe an artifact somebody else wrote.
 */
function verdictHtml(verdict: ConformanceVerdict): string {
  const rows = verdict.checks
    .map(
      (check) =>
        `<div class="menu-item">
          <div class="menu-line">
            <span class="menu-name">${check.ok ? "\u00b7" : "\u2717"} ${escapeHtml(check.name)}${check.advisory ? " (advisory)" : ""}</span>
          </div>
          <p class="menu-desc">${escapeHtml(check.detail)}</p>
        </div>`,
    )
    .join("\n");
  return `<section>
      <h2>${escapeHtml(verdict.verdict.replace(/_/g, " "))}</h2>
      <p class="verdict-row menu-desc">Kind: ${escapeHtml(verdict.kind ?? "not determined")} \u2022 key resolution: ${escapeHtml(verdict.key_resolution)}</p>
      <p class="verdict-row menu-desc">${escapeHtml(verdict.liveness)}</p>
    </section>
    <section>
      <h2>The checks</h2>
      ${rows}
    </section>
    <section>
      <p class="menu-meta">This is one reading of one artifact at one moment, and it is not a statement about the issuer. Reproduce it offline with <a href="${VERIFIER_URL}"><code>x402-verify</code></a> rather than taking this page's word: that is the point of the desk.</p>
      <p class="menu-meta"><a href="/conformance">Check another</a></p>
    </section>`;
}

function landingHtml(base: string): string {
  const doc = conformanceDoc(base);
  const checks = doc.what_it_checks
    .map((line) => `<p class="menu-desc">${escapeHtml(line)}</p>`)
    .join("\n");
  const curlConformance = `curl -sS ${base}/api/conformance/${CONFORMANCE_VERSION} \\
  -H 'Content-Type: application/json' \\
  -d '{"artifact":"<compact JWS>"}'`;
  const curlPreflight = `curl -sS ${base}/api/preflight/v1 \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://your-shop.example/api/buy/thing"}'`;
  return `<section>
      <p class="menu-desc"><strong>Paste any issuer's x402 signed offer or receipt into the form above, or POST any issuer's artifact to the API. Free. No account. No wallet.</strong></p>
      <p class="menu-desc">${escapeHtml(doc.summary)}</p>
      <p class="menu-desc">Before an agent commits to a purchase anywhere in the x402 economy, this is the cheap verification step that says whether the artifact in its hand is what it claims to be — whoever signed it, this store included.</p>
    </section>
    <section>
      <h2>Why it matters</h2>
      <p class="menu-desc">${escapeHtml(CENSUS_FINDING)}</p>
      <p class="menu-desc">${escapeHtml(CENSUS_WHY_IT_MATTERS)}</p>
    </section>
    <section>
      <h2>Using it</h2>
      <p class="menu-desc">Check an artifact — a signed offer or a signed receipt, from any issuer:</p>
      <pre class="menu-desc"><code>${escapeHtml(curlConformance)}</code></pre>
      <p class="menu-desc">Supply <code>public_key_hex</code> alongside the artifact and the check runs entirely offline, making no request in your name; leave it out and the key named by the artifact's <code>kid</code> is resolved for you (did:web).</p>
      <p class="menu-desc">Checking an endpoint rather than an artifact — does a seller's door answer a well-formed x402 v2 payment challenge at all — is the free preflight, one probe, one moment:</p>
      <pre class="menu-desc"><code>${escapeHtml(curlPreflight)}</code></pre>
    </section>
    <section>
      <h2>What the verdict covers</h2>
      ${checks}
    </section>
    <section>
      <h2>Run the same checks without us</h2>
      <p class="menu-desc">The desk's method is a zero-dependency MIT file, published to npm as <a href="${VERIFIER_URL}"><code>x402-verify</code></a>, so every verdict this desk returns can be reproduced offline without trusting this store. The other half, for issuers: <a href="${SIGNER_URL}"><code>x402-sign</code></a> adds signed offers and receipts to your own 402s, which is precisely the thing the census found almost nobody ships.</p>
      <p class="menu-desc">Deterministic test vectors (known-good and known-bad, regenerable byte for byte) are served at <a href="/.well-known/conformance/offer-receipt-vectors.json"><code>/.well-known/conformance/offer-receipt-vectors.json</code></a>, and every live 402 on this store is a real test target.</p>
    </section>
    <section>
      <h2>Why you should not take this page's word</h2>
      <p class="menu-desc">${escapeHtml(String(doc.our_conflict_of_interest))}</p>
      <p class="menu-desc">${escapeHtml(String(doc.run_it_yourself))}</p>
    </section>
    <section>
      <p class="menu-meta">The pinned contract for anything automated: <a href="/api/conformance/${CONFORMANCE_VERSION}"><code>/api/conformance/${CONFORMANCE_VERSION}</code></a> (GET for the full request shape as JSON). Paid siblings, for when a verdict needs a signature and a permanent URL: a point-in-time signed audit (service_audit) and a week of daily signed passes (conformance_watch), both on <a href="/menu.json"><code>/menu.json</code></a>. What a signature from this store proves, per artifact class: <a href="/attestation">/attestation</a>.</p>
    </section>`;
}

/**
 * THE DESK AS STRUCTURED DATA (the AEO pass, 2026-08-20).
 *
 * The finding that built this page was that five outside models asked
 * "what is scvd.store" and none of them knew the desk existed. A
 * landing page fixed the crawl; it did not fix the classification.
 * Answer engines fielding "what tool verifies x402 payments" are
 * matching against typed entities — a free WebAPI with a stated price
 * of zero, an endpoint, and its documentation — not against prose
 * that happens to describe one.
 *
 * PRICE ZERO IS STATED, NOT IMPLIED. "Free" in a sentence is a word;
 * an Offer of 0 USD is a fact a machine can compare against the paid
 * alternatives it is weighing us next to, which is the whole reason
 * the desk is free in the first place.
 *
 * Every field derives from conformanceDoc — the same object the API
 * itself serves — so the markup cannot describe a desk that is not
 * the one answering.
 */
function conformanceApiJsonLd(base: string): string {
  const doc = conformanceDoc(base);
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "The scvd conformance desk — free x402 offer and receipt verification",
    description: doc.summary,
    url: `${base}/conformance`,
    documentation: `${base}/api/conformance/${CONFORMANCE_VERSION}`,
    /* /terms is a keyword redirect; name the room itself. */
    termsOfService: `${base}/rights`,
    provider: { "@type": "Organization", name: "scvd.store", url: base },
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      /*
       * USDC everywhere, including on a zero (2026-08-27, the
       * keeper's one-currency ruling). The currency of a free thing
       * is arbitrary, which is exactly why it should match the one
       * currency everything paid here settles in — a document that
       * prices its free instruments in one currency and its shelf in
       * another invites a reader to wonder which one is the claim.
       */
      priceCurrency: "USDC",
      availability: "https://schema.org/InStock",
    },
    potentialAction: {
      "@type": "Action",
      name: "Check an x402 signed offer or receipt from any issuer",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/api/conformance/${CONFORMANCE_VERSION}`,
        httpMethod: "POST",
        contentType: "application/json",
        encodingType: "application/json",
      },
    },
    featureList: doc.what_it_checks,
    softwareHelp: [
      { "@type": "CreativeWork", name: "x402-verify", url: VERIFIER_URL },
      { "@type": "CreativeWork", name: "x402-sign", url: SIGNER_URL },
    ],
    citation: `${base}/registry`,
  });
}

const DESK_DESCRIPTION =
  "Free x402 conformance checking: paste or POST any issuer's signed offer or receipt and get a structured verdict — parse, schema, ed25519 signature, liveness.";

conformanceLandingRoutes.get("/conformance", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    // Shipping a script means shipping a fence — the P7 ruling's
    // condition, the same constant the storefront and the till pages
    // send. The declarative form needs no script; /webmcp.js rides
    // along so the imperative tools are declared in the room where
    // this desk's verb lives.
    c.header("Content-Security-Policy", FIRST_PARTY_SCRIPT_CSP);
    return c.html(
      renderSimplePage({
        title: "The conformance desk",
        description: DESK_DESCRIPTION,
        path: "/conformance",
        webmcp: true,
        extraCss: DESK_FORM_CSS,
        bodyHtml: `${deskFormHtml()}\n${landingHtml(base)}\n${conformanceApiJsonLd(base)}`,
      }),
    );
  }
  return c.json(landingJson(base));
});

/**
 * POST /conformance — the form's own door.
 *
 * It calls `checkConformance`, the exact function the JSON API and the
 * MCP tool call, so a verdict rendered here and a verdict returned
 * there cannot disagree: one desk, three doors. The form is the only
 * caller that arrives form-encoded, which is why this handler exists
 * at all rather than the markup pointing at /api/conformance/v1 — that
 * door reads JSON, and a browser form does not send JSON.
 *
 * NO-STORE for the reason the API path states: somebody checking an
 * artifact they do not trust should not have the answer served to the
 * next caller out of a cache.
 */
conformanceLandingRoutes.post("/conformance", async (c) => {
  const form = await c.req.parseBody();
  const artifact = typeof form.artifact === "string" ? form.artifact.trim() : "";
  const key =
    typeof form.public_key_hex === "string" ? form.public_key_hex.trim() : "";
  const request: ConformanceRequest = {
    artifact,
    ...(key ? { public_key_hex: key } : {}),
  };

  const page = (bodyHtml: string) => {
    c.header("Content-Security-Policy", FIRST_PARTY_SCRIPT_CSP);
    c.header("Cache-Control", "no-store");
    return c.html(
      renderSimplePage({
        title: "The conformance desk",
        description: DESK_DESCRIPTION,
        path: "/conformance",
        webmcp: true,
        extraCss: DESK_FORM_CSS,
        bodyHtml,
      }),
    );
  };

  if (!artifact) {
    return page(
      `<section><h2>Nothing to check</h2><p class="menu-desc">Paste the artifact itself \u2014 a compact JWS, three base64url segments separated by dots.</p></section>\n${deskFormHtml()}`,
    );
  }

  const result = await checkConformance(request, c.env);
  if (result.error || !result.verdict) {
    /*
     * The desk's own refusal text, escaped and rendered as OURS
     * because it is ours — it describes what we could not do with the
     * bytes, never what the bytes say.
     */
    return page(
      `<section><h2>Could not check it</h2><p class="menu-desc">${escapeHtml(result.error ?? "The desk returned no verdict.")}</p></section>\n${deskFormHtml()}`,
    );
  }
  return page(verdictHtml(result.verdict));
});
