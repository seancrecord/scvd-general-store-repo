import { Hono } from "hono";
import {
  CONSENT_OFFER,
  buildProvenanceRecord,
  countSelfAudit,
  currentSelfAuditWeek,
  getProvenanceCheck,
  selfAuditChallengeText,
  validSubjectAddress,
  verifySelfAudit,
} from "@/services/provenance-check";
import type { HonoEnv } from "@/types";

/**
 * THE COMPANY AN ADDRESS KEEPS — the doors around the paid item
 * (roadmap N4). Two things live here:
 *
 *   GET /api/provenance-check/:id — a purchased record, served to
 *   whoever holds the id. "Never published" is kept by the id being
 *   the only key: nothing enumerates these, nothing indexes them, and
 *   no public surface is keyed to the subject address.
 *
 *   GET/POST /api/provenance/self — the free self-audit. Prove control
 *   of an EVM address with an EIP-191 signature over a dated
 *   challenge and receive the same answer the paid door sells, free,
 *   ending with the consent offer. We count the ask, not the asker.
 */
export const provenanceRoutes = new Hono<HonoEnv>();

provenanceRoutes.get("/api/provenance-check/:id", async (c) => {
  const stored = await getProvenanceCheck(c.env, c.req.param("id"));
  if (!stored) {
    return c.json(
      {
        error:
          "No provenance check under that id. The id is on the purchase response and the certificate; the item is /api/buy/provenance_check.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  return c.json(
    {
      what_this_is:
        "A signed record of what the signed chain held about one receiving address at the moment stated: which doors advertised it, in which signed weeks, with what verdicts and drift. Delivered to whoever holds this id; published nowhere, keyed to no subject, never a score.",
      check: stored.check.record,
      evidence_hash: stored.check.evidence_hash,
      signed_payload: stored.check.signed_payload,
      signature: stored.check.signature,
      signature_jcs: stored.check.signature_jcs,
      public_key: stored.check.public_key,
      certificate: `${base}/api/verify/${stored.cert_id}`,
      how_to_verify: [
        "1. ed25519_verify(signed_payload, signature) against public_key, also served at /.well-known/scvd-signing-key.",
        "2. The record's evidence_hash is bound into the purchase certificate's attests field — the certificate URL above answers for it.",
        "3. how_to_rederive on the record rebuilds every line from the public chain: digest the address as documented, fetch the named snapshots, compare.",
      ],
      created_at: stored.created_at,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

provenanceRoutes.get("/api/provenance/self", (c) => {
  const week = currentSelfAuditWeek();
  const address = c.req.query("address");
  const valid = address && /^0x[0-9a-fA-F]{40}$/.test(address.trim()) ? address.trim() : null;
  return c.json({
    what_this_is:
      "The free self-audit: prove control of your own EVM receiving address and read what the signed chain holds about it — the same answer the paid door sells, free, delivered to you, never published.",
    how: [
      "1. GET this URL with ?address=0x... to see the exact challenge for this week.",
      "2. Sign the challenge with that wallet (EIP-191 personal_sign).",
      "3. POST {address, signature} here. The answer comes back with the consent offer at the end; a yes is required for anything public, and declining costs nothing.",
    ],
    week,
    ...(valid
      ? { address: valid, challenge: selfAuditChallengeText(valid, week) }
      : {
          note: "Add ?address=0x... (EVM, 0x + 40 hex) to see the challenge text to sign. Solana addresses can be asked about through the paid door for now.",
        }),
    what_we_keep:
      "One integer per week: how many self-audits were run. No address, no wallet, no timestamp finer than the week.",
    paid_door: "/api/buy/provenance_check?address=... — for an address that is not yours, five dollars, signed and certificate-bound.",
  });
});

provenanceRoutes.post("/api/provenance/self", async (c) => {
  let body: { address?: unknown; signature?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Send JSON: {address, signature}." }, 400);
  }
  const address =
    typeof body.address === "string" ? body.address.trim() : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return c.json(
      { error: "The self-audit takes an EVM address (0x + 40 hex). GET this URL with ?address= for the challenge." },
      400,
    );
  }
  if (typeof body.signature !== "string") {
    return c.json({ error: "Sign the challenge (GET this URL with ?address=) with the wallet and send the signature." }, 400);
  }
  const week = currentSelfAuditWeek();
  if (!(await verifySelfAudit(address, body.signature, week))) {
    return c.json(
      {
        error:
          "That signature does not recover to the address named for this week's challenge. Sign exactly the challenge text GET returns, with the wallet the address belongs to.",
      },
      403,
    );
  }
  if (!validSubjectAddress(address)) {
    return c.json({ error: "That is not an address this store can digest." }, 400);
  }
  const record = await buildProvenanceRecord(c.env, address);
  const self_audits_this_week = await countSelfAudit(c.env, week);
  return c.json(
    {
      ...record,
      proved: { by: "wallet_signature", week },
      free: true,
      consent_offer: CONSENT_OFFER,
      self_audits_this_week,
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
