import { Hono } from "hono";
import { jsonLdScript } from "@/lib/jsonld";
import { jcsCanonicalize, signJcs } from "@/lib/jcs";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  charterSignedSubset,
  cheapestListedUsd,
  PRICING_CHARTER,
  PRICING_CHARTER_EFFECTIVE,
  PRICING_CHARTER_VERSION,
} from "@/store/pricing-charter";
import type { HonoEnv } from "@/types";

/**
 * GET /pricing — how prices are set here, signed.
 *
 * The page is a promise, so it gets the same treatment as every other
 * promise in this store: a canonical form, an ed25519 signature over
 * it, and the exact bytes the signature covers served beside it so a
 * stranger verifies with their own library. A pricing policy you have
 * to trust the server to be honest about defeats its own purpose.
 *
 * The signature is DETERMINISTIC — it covers version + effective date
 * + clauses via JCS, none of which vary per request — so quoting it
 * is meaningful: two readers on two days hold the same signature over
 * the same words, and a changed word is a changed signature.
 */
export const pricingRoutes = new Hono<HonoEnv>();

function pricingJsonLd(base: string, floorUsd: number): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline:
      "The scvd.store pricing charter — how an x402 store sets prices, signed",
    description:
      "A versioned, ed25519-signed commitment about pricing: every wallet sees the same price, the cheapest real settlement stays under a penny, verification stays free forever, price changes are dated in public, and the only scarcity is human labor. Each clause ships with the check a stranger can run without asking us.",
    url: `${base}/pricing`,
    inLanguage: "en",
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    author: { "@type": "Organization", name: "scvd.store", url: base },
    publisher: { "@type": "Organization", name: "scvd.store", url: base },
    version: PRICING_CHARTER_VERSION,
    datePublished: PRICING_CHARTER_EFFECTIVE,
    about: PRICING_CHARTER.map((clause) => ({
      "@type": "DefinedTerm",
      name: clause.id,
      description: clause.rule,
      inDefinedTermSet: `${base}/pricing`,
    })),
    mentions: [
      {
        "@type": "PropertyValue",
        name: "cheapest real settlement on the shelf (USD)",
        value: floorUsd,
      },
      {
        "@type": "PropertyValue",
        name: "charter version",
        value: PRICING_CHARTER_VERSION,
      },
    ],
  });
}

pricingRoutes.get("/pricing", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const floorUsd = cheapestListedUsd();
  const subset = charterSignedSubset();
  const canonical = jcsCanonicalize(subset);
  /**
   * Signed live, absent honestly: a missing key serves the charter
   * with no signature block and a sentence saying so, because an
   * empty-string signature reads as a broken one and a fabricated
   * one is worse.
   */
  const signature = c.env.SIGNING_KEY
    ? await signJcs(subset, c.env.SIGNING_KEY)
    : null;

  const payload = {
    what_this_is:
      "The pricing charter: this store's standing, signed commitment about how prices are set. Clauses are promises — changing a word is a new version with a new signature, in public.",
    version: PRICING_CHARTER_VERSION,
    effective: PRICING_CHARTER_EFFECTIVE,
    current_floor_usd: floorUsd,
    clauses: PRICING_CHARTER,
    ...(signature
      ? {
          signature: {
            algorithm: "ed25519",
            /** JCS (RFC 8785) over the signed_payload object below. */
            discipline: "RFC8785",
            signed_payload: subset,
            canonical_form: canonical,
            signature,
            public_key: `${base}/.well-known/scvd-signing-key`,
            how_to_verify:
              "Recompute the JCS canonical form of signed_payload (or take canonical_form verbatim), then verify the ed25519 signature against the published public key with any library. No request to us required.",
          },
        }
      : {
          signature_absent:
            "No signing key is configured in this environment, so the charter is served unsigned rather than with a fabricated signature. The live store serves it signed.",
        }),
    the_shelf: `${base}/menu.json`,
    the_promise_if_we_miss: `${base}/rights`,
  };
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }

  const clauses = PRICING_CHARTER.map(
    (clause) => `<div class="menu-item">
      <div class="menu-line"><span class="menu-name"><code>${escapeHtml(clause.id)}</code></span></div>
      <p class="menu-desc"><strong>${escapeHtml(clause.rule)}</strong></p>
      <p class="menu-meta">Check it yourself: ${escapeHtml(clause.check)}</p>
    </div>`,
  ).join("\n");

  return c.html(
    renderSimplePage({
      title: "How prices are set",
      description:
        "The signed pricing charter: every wallet sees the same price, the cheapest real settlement stays under a penny, verification stays free forever, price changes are dated in public, and the only scarcity is human labor — each clause with the check a stranger can run.",
      path: "/pricing",
      bodyHtml: `<section>
        <p class="menu-desc"><strong>Nobody gets a different price here, and you don't have to take our word for that — the promise is signed.</strong></p>
        <p class="menu-desc">This charter is version ${escapeHtml(PRICING_CHARTER_VERSION)}, effective ${escapeHtml(PRICING_CHARTER_EFFECTIVE)}. Changing a word means a new version and a new signature, in public. The current floor on the shelf: <strong>$${escapeHtml(String(floorUsd))}</strong> — computed from the live menu as this page rendered, because a typed number would be a promise with an expiry date.</p>
      </section>
      <section>
        <h2>The clauses</h2>
        ${clauses}
      </section>
      <section>
        <h2>The signature</h2>
        ${
          signature
            ? `<p class="menu-desc">The clauses above are ed25519-signed over their RFC 8785 canonical form. The signature and the exact bytes it covers are in this page's JSON twin (same URL, <code>Accept: application/json</code>); the public key hangs at <a href="/.well-known/scvd-signing-key"><code>/.well-known/scvd-signing-key</code></a>. Verify it with your own library — no request to us required.</p>
        <p class="menu-meta"><code>${escapeHtml(signature)}</code></p>`
            : `<p class="menu-desc">No signing key is configured in this environment, so the charter is served unsigned rather than with a fabricated signature.</p>`
        }
      </section>
      <section>
        <h2>Where the promises meet the money</h2>
        <p class="menu-meta">The shelf this charter governs: <a href="/menu.json"><code>/menu.json</code></a>. What you're owed when a promised window is missed: <a href="/rights">/rights</a>. What a signature from this store proves, per artifact class: <a href="/attestation">/attestation</a>.</p>
      </section>
      ${pricingJsonLd(base, floorUsd)}`,
    }),
  );
});
