import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { DIRECTORY_PATH, signedDirectory } from "@/lib/web-bot-auth";
import { CARD_CRITERIA_VERSION } from "@/services/bot-auth-card";
import { getMenuItem } from "@/store";
import type { HonoEnv } from "@/types";

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

botAuthLandingRoutes.get("/bot-auth", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const card = getMenuItem("signature_agent_card");
  const directory = await signedDirectory(c.env);
  const ownPosture = directory
    ? `This store's outbound probes are signed with the same mechanism (RFC 9421, ed25519), and its own key directory hangs at ${base}${DIRECTORY_PATH} — fetch it and check the proof-of-possession signature yourself. We run on ourselves what we check on you.`
    : `This store's egress signing key is not configured right now, and its own directory at ${base}${DIRECTORY_PATH} answers 404 rather than serving an empty key set — those are different statements and the door says the true one. The battery below runs the same either way.`;
  const payload = {
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
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json(payload);
  }
  const checks = payload.what_the_battery_checks
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");
  return c.html(
    renderSimplePage({
      title: "The Web Bot Auth desk",
      description:
        "Signed agent identity, checked: a free battery for Web Bot Auth key directories, and a signed card for when somebody else has to believe the readout.",
      path: "/bot-auth",
      bodyHtml: `<section>
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
        <p class="menu-meta">GET ${escapeHtml(base)}/api/buy/signature_agent_card?url=https://your-agent.example — $${escapeHtml(String(payload.signed_card?.price_usdc ?? ""))} over x402, instant, USDC on Base, Polygon, or Solana.</p>
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
