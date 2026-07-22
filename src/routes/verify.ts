import { Hono } from "hono";
import { getPublicKeyHex, verifyCertificateSignature } from "@/lib/signing";
import { getCertificate } from "@/services/certificates";
import { VOICE } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /api/verify/:cert_id — public verification of any certificate.
 * GET /.well-known/scvd-signing-key — the store's ed25519 public key.
 */
export const verifyRoutes = new Hono<HonoEnv>();

verifyRoutes.get("/api/verify/:cert_id", async (c) => {
  const record = await getCertificate(c.env, c.req.param("cert_id"));
  if (!record) {
    return c.json({ valid: false, error: VOICE.certNotFound }, 404);
  }
  const valid = await verifyCertificateSignature(
    record.certificate,
    record.signature,
    record.public_key,
  );
  return c.json({
    valid,
    certificate: record.certificate,
    signature: record.signature,
    public_key: record.public_key,
    algorithm: "ed25519",
    note: valid
      ? "Genuine article. Signed by the store itself."
      : "Signature doesn't match. That's not one of ours.",
  });
});

verifyRoutes.get("/.well-known/scvd-signing-key", async (c) => {
  const publicKey = await getPublicKeyHex(c.env.SIGNING_KEY);
  return c.json({
    algorithm: "ed25519",
    public_key: publicKey,
    encoding: "hex",
    note: "Anything we sign, this key verifies. Hangs by the door for a reason.",
  });
});
