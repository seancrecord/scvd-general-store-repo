import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { DIRECTORY_PATH, signedDirectory } from "@/lib/web-bot-auth";
import { CARD_CRITERIA_VERSION } from "@/services/bot-auth-card";
import { getMenuItem } from "@/store";
import type { HonoEnv } from "@/types";
import { jsonLdScript } from "@/lib/jsonld";
import { callingCardHtml, CALLING_CARD_CSS } from "@/pages/calling-card";
import { callingCardInstructions, CALLING_CARD_PROPOSITION, CALLING_CARD_FREE, CALLING_CARD_MONEY, CALLING_CARD_BROWSER, CALLING_CARD_MODULE } from "@/store/calling-card";
import callingCardSource from "../../calling-card/calling-card.mjs";
import callingCardSetup from "../../calling-card/setup.js";
import { callingCardRoutes } from "@/routes/calling-card";

/**
 * GET /bot-auth — the plain-language room for the Web Bot Auth desk:
 * what signed agent identity is, what this store does about its own
 * (derived live, so the page cannot claim a posture the config does
 * not hold), the free check, and the paid card.
 *
 * The price on this page is read off the menu item rather than typed,
 * because a hand-typed copy of a value that lives in code elsewhere
 * is the defect AT_SCALE rule 1 exists to prevent.
 */
export const botAuthLandingRoutes = new Hono<HonoEnv>();
botAuthLandingRoutes.route("/",callingCardRoutes);

let assetVersion: Promise<string> | undefined;
function callingCardAssetVersion(): Promise<string> {
  return assetVersion ??= crypto.subtle.digest("SHA-256",new TextEncoder().encode(callingCardSource+callingCardSetup)).then(hash=>[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("").slice(0,16));
}

for (const [path, source] of [[CALLING_CARD_MODULE, callingCardSource], [CALLING_CARD_BROWSER, callingCardSetup]] as const) {
  botAuthLandingRoutes.get(path, async c => c.body(path===CALLING_CARD_BROWSER?source.replace('"./calling-card.mjs"',`"./calling-card.mjs?v=${await callingCardAssetVersion()}"`):source, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  }));
}

botAuthLandingRoutes.get("/bot-auth", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const card = getMenuItem("signature_agent_card");
  const directory = await signedDirectory(c.env);
  const ownPosture = directory
    ? `This store's outbound probes are signed with the same mechanism (RFC 9421, ed25519), and its own key directory hangs at ${base}${DIRECTORY_PATH} — fetch it and check the proof-of-possession signature yourself. We run on ourselves what we check on you.`
    : `This store's egress signing key is not configured right now, and its own directory at ${base}${DIRECTORY_PATH} answers 404 rather than serving an empty key set — those are different statements and the door says the true one. The battery below runs the same either way.`;
  const payload = {
    what_this_is: CALLING_CARD_PROPOSITION,
    for_money: CALLING_CARD_MONEY,
    free_first: CALLING_CARD_FREE,
    price: { setup_usdc: 0, signed_record_usdc: card?.price_usdc ?? null, cadence: "one_off" },
    how_to_call: callingCardInstructions(base),
    errors: {
      conflicting_input: "Keep one value for the named field and review again; ordering never resolves a conflict.",
      secret_input: "Remove private material; setup stays local and exports nothing from a rejected input.",
      invalid_input: "Use public JSON or labeled lines, at most 16 KB; unsupported fields are excluded and counted.",
      destination_not_allowed: "Review the destination and explicitly include its HTTPS origin in your card before sending.",
      signing_failed: "No request was sent. Check your local signer and its matching public key.",
      signer_required: "A card with signing details requires a local signer; it never silently falls back to unsigned requests.",
      existing_identity_signature: "Avoid stacking identity signers; the adapter will not overwrite an existing HTTP message signature.",
      request_outcome_unknown: "Delivery and any payment outcome are unknown. Reconcile with the endpoint before retrying.",
      unsupported_runtime: "Only the Node fetch integration is provided. Browser automation needs a separate integration.",
    },
    security: {
      input_storage: "Pasted inputs and the generated profile stay in browser memory until the page is closed. No local storage or automatic upload. Downloads contain only recognized public fields.",
      secrets: "Supply public identity fields only. Private signers stay in your own application. The local input check catches known credential fields, but is not a general secret scanner.",
      network: "Browser setup stays local. Pressing the directory check sends that public URL. Running --setup locally publishes only a public directory; --observe sends a signed introduction. Normal requests go to configured HTTPS origins with redirects returned for a decision. Diagnostic sharing is off unless the operator enables it; the consent names origins, fields and retention.",
      scope: "Signatures bind destination authority and directory reference. This receiver can report signature verification; it grants no permissions and establishes no body integrity, delegated authority, replay protection, other-site acceptance or settlement. Hosted directories expire unless explicitly renewed; revocation has propagation delays. Third-party registration is separate.",
    },
    title: "The Web Bot Auth desk",
    standfirst:
      "Web Bot Auth is the IETF's answer to 'is this crawler who it says it is': the agent signs its requests (RFC 9421 HTTP Message Signatures, ed25519) and publishes its public keys in a directory at a well-known URL, so any origin can verify the caller without a shared secret or an allowlist of IP ranges. Cloudflare verifies these signatures on inbound traffic today.",
    own_posture: ownPosture,
    free_check: {
      method: "POST",
      url: `${base}/api/bot-auth/check`,
      body: '{"url": "https://your-agent.example"}',
      note: "A bare origin is checked at /.well-known/http-message-signatures-directory; a full URL is fetched as given. One fetch, every check named, free, no account.",
      criteria: CARD_CRITERIA_VERSION,
    },
    signed_card: card
      ? {
          item: "signature_agent_card",
          price_usdc: card.price_usdc,
          url: `${base}/api/buy/signature_agent_card`,
          note: "The same battery with a signature, a certificate binding its evidence hash, and a permanent card URL — for when an origin, a directory, or a counterparty wants more than your word. The card URL is free to read forever.",
        }
      : null,
    what_the_battery_checks: [
      "the directory answers 200 at the URL a verifier would fetch",
      "the media type is application/http-message-signatures-directory+json",
      "the body is a JWK Set with at least one key",
      "every key is OKP/Ed25519 — the one algorithm deployed verifiers accept",
      "the directory's proof-of-possession signature verifies against a listed key",
    ],
    what_this_is_not:
      "A dated look at one document at one moment. Not an endorsement of the agent, not an identity check on who operates the key, and no statement that any particular request was ever signed with it.",
    found_us_in_your_logs: `If a request tagged "scvd-general-store/1.0 (+${base})" knocked on your endpoint: that was our weekly census of doors listed in public x402 discovery — one GET per host per week, no payload, signed with the key directory above so your logs can verify it was really us and not someone borrowing the string. Being knocked on means a public directory lists you as an x402 endpoint. What yours answered is free to check yourself, no account: POST ${base}/api/preflight with {"url": "https://your-endpoint"}.`,
  };
  if (c.req.query("format") !== "json" && prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/bot-auth",
      title: "The Web Bot Auth desk",
      description: "Signed agent identity, checked: a free battery for Web Bot Auth key directories, and a signed card for when somebody else has to believe the readout.",
      document: payload as unknown as Record<string, unknown>,
    });
  }
  if (c.req.query("format") === "json" || !wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(payload);
  }
  const checks = payload.what_the_battery_checks
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");
  return c.html(
    renderSimplePage({
      title: "The Web Bot Auth desk",
      description:
        "Build an agent calling card locally, download a Node fetch integration, and check your public Web Bot Auth directory with an optional signed record.",
      path: "/bot-auth",
      extraCss: CALLING_CARD_CSS,
      inertHtml: `<script type="module" src="${CALLING_CARD_BROWSER}?v=${await callingCardAssetVersion()}"></script>`,
      bodyHtml: `${callingCardHtml(card?.price_usdc,base)}
      ${jsonLdScript({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Agent calling-card setup", applicationCategory: "DeveloperApplication", operatingSystem: "Browser setup; Node integration", description: CALLING_CARD_PROPOSITION, url: `${base}/bot-auth`, offers: { "@type": "Offer", price: 0, priceCurrency: "USD" } })}
      <section>
        <p class="menu-desc">${escapeHtml(payload.standfirst)}</p>
        <p class="menu-meta">${escapeHtml(payload.own_posture)}</p>
      </section>
      <section>
        <h2>The free check</h2>
        <p class="menu-desc">One fetch of your key directory, every check named, no account:</p>
        <pre>curl -X POST ${escapeHtml(base)}/api/bot-auth/check \\
  -H 'Content-Type: application/json' \\
  -d '{"url": "https://your-agent.example"}'</pre>
        <ul>${checks}</ul>
      </section>
      <section>
        <h2>The signed card</h2>
        <p class="menu-desc">${escapeHtml(payload.signed_card?.note ?? "")}</p>
        <p class="menu-meta">GET ${escapeHtml(base)}/api/buy/signature_agent_card?url=https://your-agent.example — $${escapeHtml(String(payload.signed_card?.price_usdc ?? ""))} over x402, instant, USDC over x402 on a network offered in the current payment quote.</p>
        <p><a href="/menu/signature_agent_card">Buy the signed directory record with the browser till</a>. One directory reading; it does not certify the downloaded integration or future requests.</p>
      </section>
      <section>
        <h2>What this is not</h2>
        <p class="menu-meta">${escapeHtml(payload.what_this_is_not)}</p>
      </section>
      <section>
        <h2>Found us in your logs?</h2>
        <p class="menu-desc">${escapeHtml(payload.found_us_in_your_logs)}</p>
      </section>`,
    }),
  );
});
