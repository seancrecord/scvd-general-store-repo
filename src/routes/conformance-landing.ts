import { Hono } from "hono";
import {
  conformanceDoc,
  CONFORMANCE_VERSION,
} from "@/services/conformance";
import { CENSUS_FINDING, CENSUS_WHY_IT_MATTERS } from "@/store/copy/census";
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
      "The free conformance desk: POST any issuer's x402 signed offer or receipt and get a structured verdict. No account, no wallet, no 402 — and it checks a competitor's artifact exactly as readily as ours.",
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
      <p class="menu-desc"><strong>POST any issuer's x402 signed offer or receipt here. Free. No account. No wallet.</strong></p>
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

conformanceLandingRoutes.get("/conformance", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: "The conformance desk",
        description:
          "Free x402 conformance checking: POST any issuer's signed offer or receipt and get a structured verdict — parse, schema, ed25519 signature, liveness.",
        path: "/conformance",
        bodyHtml: landingHtml(base),
      }),
    );
  }
  return c.json(landingJson(base));
});
