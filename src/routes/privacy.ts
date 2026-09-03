import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import type { HonoEnv } from "@/types";

/**
 * GET /privacy — the privacy policy, as a real room.
 *
 * Until 2026-08-21 /privacy was a 301 to /.well-known/trust.json — a
 * deliberate call, because the store's whole data stance fits in one
 * structured block and the readers asking were automated. What
 * changed: the MCP connector directories require "a public privacy
 * policy" and treat its absence as an instant rejection, and a
 * redirect to a JSON file does not read as one to a human reviewer.
 * The room exists now because a distribution gate demanded it — and
 * having been forced to write it, it turns out to be one of the
 * store's better pages, because the honest answer to "what do you
 * collect" here is mostly "nothing, structurally."
 *
 * EVERY CLAIM DERIVES FROM ARCHITECTURE, not policy intention. "We
 * don't keep IP logs" is checkable in the public repository; "no
 * cookies" is checkable in any response.
 */
export const privacyRoutes = new Hono<HonoEnv>();

const SECTIONS: readonly { head: string; body: readonly string[] }[] = [
  {
    head: "What this store does not collect",
    body: [
      "No accounts and no signups exist here, so there is nothing account-shaped to collect: no names required, no email required, no passwords, no profiles.",
      "No cookies, no client-side tracking, no analytics scripts, no fingerprinting. What you read here is not observed.",
      "One script is served, and only on the pages that sell something: /till.js, the browser till, which asks your wallet to sign a payment. It is first-party, unminified, byte-identical to its source in the public repository, and it makes no request to anything but this origin. It sets no cookie and writes nothing to browser storage. It never sees a key — a wallet returns a signature and keeps the key, which is exactly what every agent buying here already does. With scripting off, the page you are reading is unchanged and every instruction on it still works.",
      "The application keeps no IP address logs. Our host (Cloudflare) processes IPs to serve traffic, as every host does; the store's own code neither reads nor stores them.",
      "Uniqueness is deliberately unavailable: the store cannot tell whether two anonymous visits were the same visitor, and treats that inability as a feature.",
    ],
  },
  {
    head: "What a purchase necessarily processes",
    body: [
      "Paying over x402 reveals your wallet address and the settlement transaction — both already public on the chain you paid on. The store records them with the order and, where the artifact class says so, signs them into your certificate. Certificates are public, permanent, and verifiable by design; that is the product.",
      "Inputs you attach to a purchase (a purpose line, a mandate text, a wallet to audit, a URL to check) are stored with the order and reproduced in the artifact you bought, verbatim, as the artifact's own terms state.",
      "Payment verification and settlement run through the Coinbase CDP facilitator, which processes your payment payload to verify and settle it. The store never holds your keys and cannot move your funds.",
    ],
  },
  {
    head: "What you choose to publish",
    body: [
      "The guestbook, the bell, and the visitors' register are public by their nature — signing them is publishing them, and the pages say so where you sign.",
      "Letters to the keeper (/api/letter) are private: read by a person, never published, never quoted on any public surface. The storefront counts letters; it does not quote them.",
      "Bounty claims record the paying and payout wallet addresses (screened against a public on-chain sanctions oracle before any payout) and your observation text, which is published on the board attributed as your claim, as the board's rules state before you file one.",
    ],
  },
  {
    head: "Retention, and why some things never expire",
    body: [
      "Signed certificates, anchors, and the public corpus are permanent by design — a receipt that can vanish is not a receipt. What you bought is yours forever, and its verification stays free forever (/rights).",
      "Short-lived state expires on its own: payment challenges in minutes, idempotency windows in about a minute, credit cash-out challenges in five minutes, unredeemed payout authorizations in seven days.",
      "Store-credit balances idle for 90 days expire, as the credit page states.",
    ],
  },
  {
    head: "Third parties this store depends on",
    body: [
      "Cloudflare hosts the store (traffic transits their network). The Coinbase CDP facilitator verifies and settles payments. Public chain RPCs are read to verify settlements. OpenTimestamps calendars receive document digests — never contents — for Bitcoin anchoring. The full dependency list, with what each can see, is published at /stack.",
    ],
  },
  {
    head: "The MCP server",
    body: [
      "The MCP door (/mcp) is stateless and processes tool inputs exactly as the HTTP doors do: purchase inputs are handled as purchases, free reads as reads, and nothing about a session is retained between calls.",
    ],
  },
  {
    head: "Questions, corrections, and your rights",
    body: [
      "Write the mailbox: POST /api/letter — a person reads every one. What you own after a purchase is written out at /rights. When this store gets something wrong about data or anything else, the correction is published, dated, at /corrections.",
      "One honest limit, stated rather than buried: a signed public certificate cannot be deleted, because its permanence is what you bought and what everyone relying on it was promised. Choose the inputs you sign into one accordingly — the purchase surfaces tell you, before you pay, exactly what will be published.",
    ],
  },
];

privacyRoutes.get("/privacy", (c) => {
  const base = c.env.STORE_BASE_URL;
  const payload = {
    what_this_is:
      "The privacy policy. The short version: no accounts, no cookies, no tracking, no kept IP logs; a purchase necessarily records the public chain facts it settles with; what you sign into a public artifact is public forever, and every surface says so before you pay.",
    sections: SECTIONS.map((section) => ({
      section: section.head,
      statements: section.body,
    })),
    machine_twin: `${base}/.well-known/trust.json`,
    effective: "2026-08-21",
    contact: `${base}/api/letter`,
  };
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(payload);
  }
  const sections = SECTIONS.map(
    (section) => `<section>
      <h2>${escapeHtml(section.head)}</h2>
      ${section.body.map((line) => `<p class="menu-desc">${escapeHtml(line)}</p>`).join("\n")}
    </section>`,
  ).join("\n");
  return c.html(
    renderSimplePage({
      title: "Privacy",
      description:
        "The privacy policy: no accounts, no cookies, no tracking, no kept IP logs. A purchase records the public chain facts it settles with; what you sign into a public artifact is public forever, and every surface says so before you pay.",
      path: "/privacy",
      bodyHtml: `<section>
        <p class="menu-desc"><strong>The short version: this store is built not to know who you are.</strong> No accounts, no cookies, no tracking scripts, no kept IP logs — and where a purchase necessarily touches data (your wallet address, the settlement transaction, the inputs you attach), the surface you buy from says exactly what will be recorded and what will be published, before you pay.</p>
        <p class="menu-meta">Effective 2026-08-21. Machine-readable twin: <a href="/.well-known/trust.json"><code>/.well-known/trust.json</code></a>. Every claim below is a property of the code, which is public.</p>
      </section>
      ${sections}
      ${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "PrivacyPolicy",
        name: "scvd.store privacy policy",
        url: `${base}/privacy`,
        datePublished: "2026-08-21",
        inLanguage: "en",
        publisher: organizationRef(base),
      })}`,
    }),
  );
});
