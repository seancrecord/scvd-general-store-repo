import { Hono } from "hono";
import { sanitizeText } from "@/lib/sanitize";
import {
  ATTESTATION_LABEL_CAP,
  MANDATE_ATTESTATION_CAP,
  attestMandate,
  attestationPayload,
  getMandate,
  listAttestations,
} from "@/services/mandates";
import { isRecord, type HonoEnv } from "@/types";

/**
 * GET /api/mandate/{mandate_id} — a purchased mandate record, served
 * free forever: the signed claimed-authorization, the certificate
 * that bound it, and how to verify both. The page a dispute reads.
 */
export const mandateRoutes = new Hono<HonoEnv>();

mandateRoutes.get("/api/mandate/:mandate_id", async (c) => {
  const record = await getMandate(c.env, c.req.param("mandate_id"));
  if (!record) {
    return c.json(
      {
        error:
          "No mandate under that id. The id is on the purchase response and the certificate; the item is /api/buy/the_mandate.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  const attestations = await listAttestations(c.env, record.mandate.mandate_id);
  return c.json(
    {
      what_this_is:
        "A signed, dated record that the mandate text inside was submitted to this store as a claimed authorization, before any purchase that cites it. Chain-of-custody, not truth-of-intent: it proves the claim was made, by a party claiming the role stated — never that the human principal actually said it, and never that the declared cap or expiry were honored.",
      mandate: record.mandate,
      certificate: `${base}/api/verify/${record.cert_id}`,
      cited_by:
        "Any certificate carrying this mandate_id was minted AFTER this record existed — the buy door refuses citations it cannot resolve — and carries it signed. Verify any such certificate at /api/verify/{cert_id} and this link is part of what its signature covers.",
      how_to_verify: [
        "1. The record is signed on its own: re-serialize every field above `signature` (same order) and check the ed25519 signature against the key at /.well-known/scvd-signing-key.",
        "2. The record's evidence_hash is bound into the purchase certificate's attests field — the certificate URL above answers for it.",
        "3. recorded_at is this store's clock, vouched for by the signature; for a commitment no clock can rewrite, the store's artifacts anchor into Bitcoin via OpenTimestamps — see /api/buy/bitcoin_anchor for anchoring this record's evidence_hash yourself.",
      ],
      created_at: record.created_at,
      /*
       * WHO ELSE SIGNED THIS, and what the store is NOT saying about
       * them. Every attestation below verified against the payload in
       * its own signature_covers before it was filed, and each is
       * checkable by a stranger without believing this store. What
       * none of them means: that the parties agreed, that anybody is
       * bound, that anything was performed or is owed. Those are
       * conclusions, and this desk records rather than concludes.
       */
      attestations,
      attestation_note:
        attestations.length === 0
          ? `Nobody but the submitter has signed this record. A second party can, free, at POST /api/mandate/${record.mandate.mandate_id}/attest — which is the answer to the obvious objection that an agent wrote its own authorization.`
          : `${attestations.length} key${attestations.length === 1 ? " has" : "s have"} signed this record's id and evidence hash with their own key. That is what is claimed and all that is claimed: not that the parties agreed, not that anyone is bound, not that anything was performed. Check each signature yourself against the string in its signature_covers.`,
      attest_here: {
        url: `${base}/api/mandate/${record.mandate.mandate_id}/attest`,
        method: "POST",
        free: "Recording a mandate costs a dime; attesting to one costs nothing, ever. If the second party had to pay, this record would tilt toward whoever bought it.",
        sign_this: attestationPayload(
          record.mandate.mandate_id,
          record.mandate.evidence_hash,
        ),
        body: {
          public_key: "your ed25519 public key, 64 lowercase hex characters",
          signature: "your signature over sign_this, 128 lowercase hex characters",
          label: "optional, what you call yourself — recorded unverified",
        },
      },
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});

/**
 * POST /api/mandate/{mandate_id}/attest — a second party signs, free.
 *
 * The store verifies the signature before filing it and files nothing
 * that does not verify, so every attestation this record serves is
 * one a stranger can re-check. It adds no claim of its own: not that
 * the parties agreed, not that anyone is bound. See the long note in
 * services/mandates.ts for why there is no weaker echoed tier.
 */
mandateRoutes.post("/api/mandate/:mandate_id/attest", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      {
        error:
          'Send JSON: { "public_key": "64 hex", "signature": "128 hex", "label": "(optional)" }. Sign the exact string this mandate serves as sign_this — GET the record for it.',
      },
      400,
    );
  }
  const mandateId = c.req.param("mandate_id");
  const result = await attestMandate(c.env, mandateId, {
    publicKey: body["public_key"],
    signature: body["signature"],
    label: sanitizeText(body["label"], ATTESTATION_LABEL_CAP) || undefined,
  });
  if (!result.ok) {
    const refusal =
      result.reason === "no_such_mandate"
        ? {
            status: 404 as const,
            error:
              "No mandate under that id. The id is on the purchase response and the certificate; the item is /api/buy/the_mandate.",
          }
        : result.reason === "bad_key"
          ? {
              status: 400 as const,
              error:
                "public_key must be an ed25519 public key: 64 lowercase hex characters. Nothing was filed.",
            }
          : result.reason === "bad_signature_shape"
            ? {
                status: 400 as const,
                error:
                  "signature must be an ed25519 signature: 128 lowercase hex characters. Nothing was filed.",
              }
            : result.reason === "full"
              ? {
                  status: 409 as const,
                  error: `That mandate already carries ${result.cap} attesting keys, which is the cap. A key that has already attested may attest again for free; a new one cannot.`,
                }
              : {
                  status: 400 as const,
                  error:
                    "That signature does not verify against that key over this mandate's payload, so nothing was filed — a record that accepted signatures it could not check would be worth nothing to the next person who reads it. Sign the exact string in signature_covers below, bytes as given.",
                  signature_covers: attestationPayload(mandateId, "<this mandate's evidence_hash>"),
                  payload_to_sign: result.payload,
                };
    const { status, ...rest } = refusal;
    return c.json(rest, status);
  }
  return c.json(
    {
      recorded:
        "Your signature is filed against that mandate and serves on its public record, free, forever.",
      mandate_url: `${c.env.STORE_BASE_URL}/api/mandate/${mandateId}`,
      attestation: result.attestation,
      attesting_keys: result.total,
      what_this_does_not_say:
        "That you agreed to anything, that anybody is bound, that anything was performed or is owed. It says this key signed this mandate's id and evidence hash at this moment, and it hands the reader your signature so they can check that much without trusting us.",
      slots_left: MANDATE_ATTESTATION_CAP - result.total,
    },
    201,
  );
});
