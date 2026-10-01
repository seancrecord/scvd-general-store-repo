import { Hono } from "hono";
import { readReceipt, signReading } from "@/services/receipt-verify";
import type { HonoEnv } from "@/types";

/**
 * /api/verify-receipt — anyone's receipt in, a signed verdict out.
 *
 * FREE, single document per call, like the rest of the free battery:
 * the conformance desk's whole posture is that checking should cost
 * nothing so nobody has an excuse not to. The paid tier this door
 * grows later is BATCH volume (outside-reads item 11; pricing is the
 * keeper's flag), never a better verdict — payment buys throughput,
 * not favor.
 */
export const receiptVerifyRoutes = new Hono<HonoEnv>();

/** A receipt is a small document; anything huge is not one. */
const MAX_RECEIPT_BYTES = 32_768;

receiptVerifyRoutes.get("/api/verify-receipt", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    what:
      "POST any receipt or signed artifact (JSON body, this store's or any issuer's) and receive a SIGNED verdict: valid | invalid | expired | insufficient_evidence | unsupported | indeterminate. Every check is named with its outcome; everything NOT checked is stated rather than implied.",
    how: `POST ${base}/api/verify-receipt with the receipt as the JSON body. Free, no account. Max ${MAX_RECEIPT_BYTES} bytes.`,
    envelopes: {
      hex: "A JSON document carrying `signature` and `public_key` as ed25519 hex beside its content (this store's own shape, and anyone's that signs the same way): the signature is tried over every derivable served form.",
      dsse: `A DSSE envelope — payloadType, base64 payload, signatures[{keyid, sig}] — verified over its pre-authentication encoding exactly as served. The envelope names a key and does not carry one, so supply the issuer's Ed25519 public key as a sibling \`public_key\` field or as ?public_key= (64 hex, ed25519:<base64url>, or base64). Without it the verdict is insufficient_evidence, never invalid.`,
    },
    what_it_checks:
      "Structure: signature material, ed25519 key shapes, the signature over every derivable served form (or the DSSE pre-authentication encoding), a claimed RFC 8785 twin, expiry by the document's own fields, and key attribution when the key is this store's.",
    what_it_never_checks:
      "On-chain settlement (that is the paid settlement_attestation), delivery quality, revocation, and — for keys that are not ours — who holds the key. For a DSSE envelope, also: the actor named inside (the signer's own label), the parent link and any checkpoint, and whether the payload is true. 'Unknown' and 'bad' are kept apart deliberately: they drive different automated actions.",
    stateless:
      "Submitted documents are verified and forgotten; the verdict binds to your document only by sha256. Nothing is stored, republished, or logged beyond the store's ordinary request counters.",
    verdicts: {
      valid: "internally consistent and every claimed signature verifies",
      invalid: "a claimed signature fails — altered after signing, or a false claim",
      expired: "verifies, but the document's own expiry has passed; refuse it",
      insufficient_evidence:
        "signature material exists in a form this desk cannot read — not proof of forgery",
      unsupported: "nothing cryptographic to check",
      indeterminate: "a check could not run to completion",
    },
    our_own_artifacts_by_id: `${base}/api/verify/{id} — the by-id door for artifacts this store minted, free forever.`,
  });
});

receiptVerifyRoutes.post("/api/verify-receipt", async (c) => {
  const raw = await c.req.text();
  if (raw.length === 0) {
    return c.json(
      { error: "POST the receipt as the JSON body; an empty body verifies nothing." },
      400,
    );
  }
  if (raw.length > MAX_RECEIPT_BYTES) {
    return c.json(
      {
        error: `Receipt too large (${raw.length} bytes; the cap is ${MAX_RECEIPT_BYTES}). A receipt is a small document — if yours is genuinely bigger, tell the keeper.`,
      },
      413,
    );
  }
  /**
   * The key beside the envelope, for formats that name a key and do not
   * carry one. A query parameter so a DSSE envelope can be POSTed as
   * the bytes its issuer wrote, untouched; a sibling field in the body
   * works too and the service reads either.
   */
  const publicKey = c.req.query("public_key");
  const reading = await readReceipt(c.env, raw, new Date(), publicKey ? { publicKey } : {});
  return c.json(await signReading(c.env, reading));
});
