import { Hono } from "hono";
import {
  MARKDOWN_MEDIA_TYPE,
  prefersMarkdown,
  VARY_ACCEPT,
} from "@/lib/accept";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
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
import { CLIENT_CAP_LABEL, readAgainstCap } from "@/lib/client-spend-cap";
import { priceTiersUsdc } from "@/lib/payments";
import { MENU_ITEMS } from "@/store";
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

/**
 * Counted off the live shelf on every render, never typed. The charter
 * already holds this discipline for the floor price ("a typed number
 * would be a promise with an expiry date"); the same reasoning applies
 * to a count that moves the next time a price does.
 */
function overCapDoorCount(): number {
  return MENU_ITEMS.filter(
    (item) => readAgainstCap(priceTiersUsdc(item))?.blocked === true,
  ).length;
}

function pricedDoorCount(): number {
  return MENU_ITEMS.filter((item) => item.price_usdc > 0).length;
}

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
    author: organizationRef(base),
    publisher: organizationRef(base),
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

/**
 * THE CHARTER IN MARKDOWN, and why a third dialect earns its bytes.
 *
 * The page has served HTML to a browser and JSON to a machine since it
 * shipped, and that looked like full coverage until a 2026-08-30 scan
 * asked for `/pricing.md` and got a 404. The reader it was asking on
 * behalf of is real and is not either of the two we had built for: an
 * agent that wants the PROSE — the reasoning, the checks, the clause
 * a human would quote — without parsing HTML for it. JSON gives that
 * reader the clauses stripped of every sentence explaining them.
 *
 * RENDERED FROM PRICING_CHARTER, like the other two, so the three
 * dialects can no more disagree than any of them can disagree with the
 * signed payload. The signature is quoted rather than recomputed: the
 * bytes it covers are the JSON twin's `canonical_form`, and this page
 * says where to get them rather than serving a second copy a reader
 * might verify against by mistake.
 */
function pricingMarkdown(
  base: string,
  floorUsd: number,
  signature: string | null,
): string {
  const clauses = PRICING_CHARTER.map(
    (clause) => `### \`${clause.id}\`

**${clause.rule}**

Check it yourself: ${clause.check}`,
  ).join("\n\n");

  return `---
title: "How prices are set"
description: "The signed pricing charter for ${base}: every wallet sees the same price, the cheapest real settlement stays under a penny, verification stays free forever, price changes are dated in public, and the only scarcity is human labor."
url: "${base}/pricing"
version: "${PRICING_CHARTER_VERSION}"
effective: "${PRICING_CHARTER_EFFECTIVE}"
currency: "USDC"
floor_usd: ${floorUsd}
priced_doors: ${pricedDoorCount()}
signed: ${signature ? "true" : "false"}
---

# How prices are set

Nobody gets a different price here, and you do not have to take our
word for it — the promise is signed.

This charter is version ${PRICING_CHARTER_VERSION}, effective
${PRICING_CHARTER_EFFECTIVE}. Changing a word means a new version and a
new signature, in public.

**The current floor on the shelf: $${floorUsd}** — computed from the
live menu as this page rendered, because a typed number would be a
promise with an expiry date.

## The clauses

${clauses}

## The signature

${
    signature
      ? `The clauses above are ed25519-signed over their RFC 8785 canonical
form:

\`\`\`
${signature}
\`\`\`

The exact bytes that signature covers are the \`canonical_form\` field of
this page's JSON twin (${base}/pricing with \`Accept: application/json\`).
The public key hangs at ${base}/.well-known/scvd-signing-key. Verify it
with your own library — no request to us required.`
      : `No signing key is configured in this environment, so the charter is
served unsigned rather than with a fabricated signature. The live store
serves it signed.`
  }

## A ceiling that is not ours

The stock x402 client (\`@x402/core\`) applies a default ceiling of
${CLIENT_CAP_LABEL} per payment, inside \`selectPaymentRequirements\` and
BEFORE it picks an accept. Above that figure an unconfigured client
throws without signing anything. ${overCapDoorCount()} of this store's
${pricedDoorCount()} priced doors sit above it, counted from the live
shelf as this page rendered.

Raise \`maxAmountPerPayment\`, or pass \`spendControls: false\` if you mean
to. It is your operator's safety control and we ship nothing to route
around it — a store selling evidence does not sell a way past someone
else's spending limit.

This is not a charter clause. It is a fact about your client, read from
the installed package, and it sits deliberately outside the signed
payload above.

## How you pay

Every priced door is x402 v2, settled in USDC on Base, Polygon or
Solana. Call once, read the terms out of the 402, sign one of the
accepts, call again. The whole procedure is at ${base}/auth.md, and
there is no account to open first.

## Where the promises meet the money

- The shelf this charter governs: ${base}/menu.json
- What you are owed when a promised window is missed: ${base}/rights
- What a signature from this store proves, per artifact class: ${base}/attestation
`;
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
    /**
     * NOT A CLAUSE, AND SAID SO IN ITS OWN KEY (#52). The charter is
     * about how THIS STORE sets prices; this is a fact about the
     * BUYER'S client, and it sits outside `charterSignedSubset()` on
     * purpose — signing someone else's constant would be a promise we
     * have no standing to make, and it would change every time they
     * shipped a release.
     */
    a_ceiling_that_is_not_ours: {
      what: `The stock x402 client (@x402/core) applies a default ceiling of ${CLIENT_CAP_LABEL} per payment, inside selectPaymentRequirements and BEFORE it picks an accept. Above that figure an unconfigured client throws without signing.`,
      doors_above_it: overCapDoorCount(),
      priced_doors: pricedDoorCount(),
      what_to_do:
        "Raise maxAmountPerPayment, or pass spendControls: false if you mean to. It is your operator's safety control; we disclose it and do not route around it.",
      why_we_mention_it:
        "The refusal happens entirely on your side, so we cannot see it: we record a price check and then silence, which is shaped exactly like a shopper changing their mind. Each affected 402 repeats this in its own body.",
      not_part_of_the_charter:
        "This figure is read from the installed client package, not promised by us, and it is deliberately outside the signed payload above.",
    },
    the_shelf: `${base}/menu.json`,
    the_promise_if_we_miss: `${base}/rights`,
  };
  /**
   * Markdown only when the caller genuinely ranked it above whatever
   * this route would otherwise send — which is HTML for a browser and
   * JSON for everyone else. Ranking it against the wrong opponent is
   * the mistake lib/accept.ts exists to stop.
   */
  const accept = c.req.header("Accept");
  const defaultMedia = wantsHtml(accept, c.req.header("User-Agent")) ? "text/html" : "application/json";
  if (prefersMarkdown(accept, defaultMedia, c.req.header("User-Agent"))) {
    return c.text(pricingMarkdown(base, floorUsd, signature), 200, {
      "content-type": MARKDOWN_MEDIA_TYPE,
      Vary: VARY_ACCEPT,
    });
  }
  if (!wantsHtml(accept, c.req.header("User-Agent"))) {
    c.header("Vary", VARY_ACCEPT);
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
      // The twin genuinely answers now, so the link tag is honest
      // (scanner finding P17: never point rel=alternate at a 404).
      markdownAlt: "/pricing.md",
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
        <h2>A ceiling that isn&rsquo;t ours</h2>
        <p class="menu-desc">The stock x402 client (<code>@x402/core</code>) applies a default ceiling of <strong>${escapeHtml(CLIENT_CAP_LABEL)}</strong> per payment &mdash; inside <code>selectPaymentRequirements</code>, and <em>before</em> it picks an accept. Above that figure an unconfigured client throws without signing anything. <strong>${overCapDoorCount()}</strong> of this store&rsquo;s ${pricedDoorCount()} priced doors sit above it, counted from the live shelf as this page rendered.</p>
        <p class="menu-desc">Raise <code>maxAmountPerPayment</code>, or pass <code>spendControls: false</code> if you mean to. It is your operator&rsquo;s safety control and we do not ship anything to route around it &mdash; a store selling evidence does not sell a way past someone else&rsquo;s spending limit.</p>
        <p class="menu-meta">We volunteer this because the refusal happens entirely on your side: we record a price check and then silence, which looks exactly like changing your mind. This is not a charter clause &mdash; it is a fact about your client, read from the installed package, and it is deliberately outside the signed payload above.</p>
      </section>
      <section>
        <h2>Where the promises meet the money</h2>
        <p class="menu-meta">The shelf this charter governs: <a href="/menu.json"><code>/menu.json</code></a>. What you're owed when a promised window is missed: <a href="/rights">/rights</a>. What a signature from this store proves, per artifact class: <a href="/attestation">/attestation</a>.</p>
      </section>
      ${pricingJsonLd(base, floorUsd)}`,
    }),
  );
});


/**
 * /pricing.md — the same document at the address a checklist tries.
 *
 * THE SAME BYTES, NOT A SECOND DOCUMENT, exactly as /index.md relates
 * to `/`: this calls the function the negotiated route calls, so there
 * is nothing here that can drift from it, and the canonical link
 * points at /pricing because this is one page at two addresses and
 * saying otherwise hands an indexer a duplicate to adjudicate.
 *
 * It exists because content negotiation is the right mechanism and
 * not the only one anybody uses. An agent that has learned the
 * llms.txt-era convention guesses a path; a `.md` suffix is the guess
 * it makes, and a 404 there reads as "this store has no pricing
 * document" rather than "ask for it differently".
 */
pricingRoutes.get("/pricing.md", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const floorUsd = cheapestListedUsd();
  const signature = c.env.SIGNING_KEY
    ? await signJcs(charterSignedSubset(), c.env.SIGNING_KEY)
    : null;
  return c.text(pricingMarkdown(base, floorUsd, signature), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    /*
     * Vary on Accept even though this path does not negotiate: it is
     * the same resource as /pricing, which does, and a cache that
     * learned one without the other could serve a stale dialect.
     */
    Vary: VARY_ACCEPT,
    Link: `<${base}/pricing>; rel="canonical"`,
  });
});
