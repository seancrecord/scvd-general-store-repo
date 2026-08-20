import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { signMessage } from "@/lib/signing";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { STORE_SERVICE_NAME } from "@/store";
import {
  STACK_DEPENDENCIES,
  STACK_HONEST_LIMIT,
  STACK_NOT_AN_ENDORSEMENT,
  STACK_STANDFIRST,
  STACK_WHAT_SURVIVES,
} from "@/store/stack";
import type { HonoEnv } from "@/types";

/**
 * GET /stack — the dependency disclosure, signed.
 *
 * The supply-chain mirror of /house-ledger.json: that one declares what
 * the store controls, this one declares what it does not. Signed for
 * the same reason the trust list is — so a reader can confirm the
 * DOCUMENT came from this origin rather than from whoever handed it
 * over.
 */
export const stackRoutes = new Hono<HonoEnv>();

export const STACK_PATH = "/stack";
export const STACK_VERSION = 1;

stackRoutes.get(STACK_PATH, async (c) => {
  const base = c.env.STORE_BASE_URL;
  const body = {
    version: STACK_VERSION,
    issuer: STORE_SERVICE_NAME,
    issuer_origin: base,
    issued_at: new Date().toISOString(),
    declares: STACK_STANDFIRST,
    not_an_endorsement: STACK_NOT_AN_ENDORSEMENT,
    what_survives_everything: STACK_WHAT_SURVIVES,
    honest_limit: STACK_HONEST_LIMIT,
    dependencies: STACK_DEPENDENCIES.map((entry) => ({ ...entry })),
    counts: {
      total: STACK_DEPENDENCIES.length,
      no_substitute: STACK_DEPENDENCIES.filter(
        (entry) => entry.substitutable === "no",
      ).length,
    },
    also: {
      house_ledger_url: `${base}/house-ledger.json`,
      house_ledger_note:
        "What this store controls, declared the same way. The two documents are halves of one answer.",
      signing_key_url: `${base}/.well-known/scvd-signing-key`,
    },
  };

  const canonical = JSON.stringify(body);
  const { signature, publicKey } = await signMessage(
    canonical,
    c.env.SIGNING_KEY,
  );
  const signed = {
    ...body,
    signature,
    public_key: publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };

  if (wantsHtml(c.req.header("Accept"))) {
    const rows = STACK_DEPENDENCIES.map(
      (entry) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(entry.name)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price">${escapeHtml(entry.substitutable === "no" ? "no substitute" : entry.substitutable)}</span>
        </div>
        <p class="menu-desc"><strong>Role:</strong> ${escapeHtml(entry.role)}</p>
        <p class="menu-desc"><strong>When it fails:</strong> ${escapeHtml(entry.when_it_fails)}</p>
        <p class="menu-desc"><strong>What you lose:</strong> ${escapeHtml(entry.what_you_lose)}</p>
        <p class="menu-meta">Check it: ${escapeHtml(entry.how_to_check)}</p>
      </div>`,
    ).join("\n");

    return c.html(
      renderSimplePage({
        title: "What this store rests on",
        description:
          "Every dependency this store rests on and does not control, with what stops working when each one fails and what a buyer loses.",
        path: "/stack",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(STACK_STANDFIRST)}</p>
          <p class="menu-desc"><strong>${escapeHtml(STACK_NOT_AN_ENDORSEMENT)}</strong></p>
        </section>
        <section>${rows}</section>
        <section>
          <p class="menu-desc">${escapeHtml(STACK_WHAT_SURVIVES)}</p>
          <p class="menu-meta">${escapeHtml(STACK_HONEST_LIMIT)}</p>
          <p class="menu-meta">The other half, what this store controls: <a href="/house-ledger.json"><code>/house-ledger.json</code></a>. The signed version of this page is the same URL with <code>Accept: application/json</code>.</p>
        </section>`,
      }),
    );
  }

  return c.json(signed, 200, { "Cache-Control": "no-store" });
});
