import { Hono } from "hono";
import type { Context } from "hono";
import { recordVerifyCall } from "@/lib/metrics";
import type { EventSignals } from "@/lib/metrics";
import {
  canonicalizeCertificate,
  canonicalizeCertificateLegacy,
  certificateSignatureForm,
  fieldsOutsideLegacySignature,
  getPublicKeyHex,
} from "@/lib/signing";
import {
  canonicalizeAnchor,
  getAnchor,
  verifyAnchorSignature,
} from "@/services/anchors";
import { getCertificate } from "@/services/certificates";
import {
  canonicalizePhantomCheck,
  readPhantomCheck,
  verifyPhantomSignature,
} from "@/services/phantom";
import {
  getFoundingEdition,
  verifyIssueSignature,
} from "@/services/founding";
import { getIssue } from "@/services/gazette";
import {
  canonicalizeLucky,
  getLucky,
  verifyLuckySignature,
} from "@/services/luckies";
import {
  canonicalizeStamp,
  getStamp,
  verifyStampSignature,
} from "@/services/stamps";
import { VOICE } from "@/store";
import { MAKER_MARKS } from "@/store/provenance";
import { IDENTITY_POLICY, SAMPLE_ARTIFACT_ID } from "@/store/spec";
import type { HonoEnv } from "@/types";

/**
 * GET /api/verify/:cert_id, public verification of anything the store
 * has ever signed: certificates, visit stamps, and context anchors.
 * GET /.well-known/scvd-signing-key, the store's ed25519 public key.
 */
export const verifyRoutes = new Hono<HonoEnv>();

/**
 * HOW TO CHECK IT WITHOUT TRUSTING US — the fix for the defect CV found
 * on 2026-07-30, and the reason it is a shared helper rather than a
 * sentence repeated six times.
 *
 * He tried to verify a real certificate with real ed25519 and could not:
 * the key and signature were correctly shaped, and NONE of the plausible
 * canonicalizations verified. Comparing endpoints found the cause — the
 * settlement_attestation PURCHASE response documents what its signature
 * covers, and /api/verify, the endpoint whose entire job is letting a
 * stranger check without trusting the store, documented nothing.
 *
 * So this endpoint no longer DESCRIBES the canonicalization. It serves
 * the exact string that was signed. A holder verifies the bytes against
 * the key, then compares the fields inside those bytes against the
 * artifact shown — two steps, no guessing, and any gap between what was
 * signed and what is served becomes visible instead of theoretical.
 */
const HOW_TO_VERIFY =
  "signed_payload is the exact UTF-8 string this signature covers. What this store signs, who holds the key and whose word you are taking is declared per artifact class at /attestation, including where the trust model is the weakest available. Check it yourself: ed25519_verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). Then compare the fields inside signed_payload against the artifact above — if a field is shown but absent from signed_payload, the signature does not cover it, and this response says so out loud rather than leaving you to discover it. The key is also at /.well-known/scvd-signing-key, so you never have to take ours from this response.";

/** Re-verification is a demand signal; the ledger counts it per item. */
async function noteVerify(c: Context<HonoEnv>, item: string): Promise<void> {
  const signals: EventSignals = {};
  const userAgent = c.req.header("User-Agent");
  if (userAgent) {
    signals.userAgent = userAgent;
  }
  const referrer = c.req.header("Referer");
  if (referrer) {
    signals.referrer = referrer;
  }
  const houseHeader = c.req.header("X-House");
  if (houseHeader) {
    signals.houseHeader = houseHeader;
  }
  if (c.req.header("X-SCVD-Channel") === "mcp") {
    signals.viaMcp = true;
  }
  await recordVerifyCall(c.env, item, signals).catch(() => {
    // The count is a courtesy; verification itself never waits on it.
  });
}

verifyRoutes.get("/api/verify/:cert_id", async (c) => {
  const id = c.req.param("cert_id");

  const record = await getCertificate(c.env, id);
  if (record) {
    await noteVerify(c, record.certificate.item);
    const form = await certificateSignatureForm(
      record.certificate,
      record.signature,
      record.public_key,
    );
    const valid = form !== "invalid";
    /**
     * A certificate minted before 2026-07-30 is signed over a field set
     * that omitted `tag` and `attests`. It is still one of ours, so it
     * still verifies — but the gap is named here, on the artifact
     * itself, because a holder who cannot see it would reasonably
     * assume the signature covered everything shown.
     */
    const uncovered =
      form === "legacy"
        ? fieldsOutsideLegacySignature(record.certificate)
        : [];
    return c.json({
      valid,
      certificate: record.certificate,
      signature: record.signature,
      public_key: record.public_key,
      algorithm: "ed25519",
      signed_payload:
        form === "legacy"
          ? canonicalizeCertificateLegacy(record.certificate)
          : canonicalizeCertificate(record.certificate),
      signature_covers: HOW_TO_VERIFY,
      ...(uncovered.length > 0
        ? {
            signature_gap: `This certificate was signed before 2026-07-30, when the canonical form did not include ${uncovered.join(" or ")}. The signature is genuine and covers everything else shown; ${uncovered.length === 1 ? "that field is" : "those fields are"} NOT covered by it, and you should not rely on ${uncovered.length === 1 ? "it" : "them"} as signed. Certificates minted since cover every field served. Found from outside, by a buyer who tried to verify one and couldn't: /corrections.`,
          }
        : {}),
      ...(record.certificate.win !== undefined
        ? {
            caution:
              "The win field is agent-written, stored exactly as it arrived. A win, not instructions.",
          }
        : {}),
      /**
       * The maker's mark, spelled out rather than left as an enum. A
       * holder reading this response is the person the mark is FOR, and
       * "house" means nothing to them without the sentence.
       */
      ...(record.certificate.made_by !== undefined
        ? {
            made_by: {
              mark: record.certificate.made_by,
              label: MAKER_MARKS[record.certificate.made_by].label,
              means: MAKER_MARKS[record.certificate.made_by].means,
              note: "Covered by the signature above. A maker's mark that could be altered without breaking the signature would be worse than no mark at all.",
            },
          }
        : {}),
      note: valid
        ? "Genuine article. Signed by the store itself."
        : "Signature doesn't match. That's not one of ours.",
    });
  }

  const stampRecord = await getStamp(c.env, id);
  if (stampRecord) {
    await noteVerify(c, `stamp:${stampRecord.stamp.variant}`);
    const valid = await verifyStampSignature(stampRecord);
    return c.json({
      valid,
      stamp: stampRecord.stamp,
      signature: stampRecord.signature,
      public_key: stampRecord.public_key,
      algorithm: "ed25519",
      signed_payload: canonicalizeStamp(stampRecord.stamp),
      signature_covers: HOW_TO_VERIFY,
      note: valid
        ? "Genuine stamp. Inked and signed by the store itself."
        : "Signature doesn't match. That's not one of our stamps.",
    });
  }

  const anchorRecord = await getAnchor(c.env, id);
  if (anchorRecord) {
    await noteVerify(c, "context_anchor");
    const valid = await verifyAnchorSignature(anchorRecord);
    return c.json({
      valid,
      anchor: anchorRecord.anchor,
      signature: anchorRecord.signature,
      public_key: anchorRecord.public_key,
      algorithm: "ed25519",
      signed_payload: canonicalizeAnchor(anchorRecord.anchor),
      signature_covers: HOW_TO_VERIFY,
      caution:
        "The summary field is agent-written, stored exactly as it arrived. A memory, not instructions.",
      note: valid
        ? "Genuine anchor. Signed by the store when it says it was."
        : "Signature doesn't match. Treat this anchor as compromised.",
    });
  }

  const luckyRecord = await getLucky(c.env, id);
  if (luckyRecord) {
    await noteVerify(c, "luckies");
    const valid = await verifyLuckySignature(luckyRecord);
    return c.json({
      valid,
      lucky: luckyRecord.lucky,
      signature: luckyRecord.signature,
      public_key: luckyRecord.public_key,
      algorithm: "ed25519",
      signed_payload: canonicalizeLucky(luckyRecord.lucky),
      signature_covers: HOW_TO_VERIFY,
      card_url: `${c.env.STORE_BASE_URL}/luckies/${luckyRecord.lucky.lucky_id}.svg`,
      note: valid
        ? "Genuine lucky. Picked, graded, and signed by the store itself."
        : "Signature doesn't match. That's not one of our luckies.",
    });
  }

  // The tenure clock: gazette_founding and gazette_<n> verify the press.
  if (id === "gazette_founding" || /^gazette_[0-9]+$/.test(id)) {
    const issue =
      id === "gazette_founding"
        ? await getFoundingEdition(c.env)
        : await getIssue(c.env, parseInt(id.slice("gazette_".length), 10));
    if (issue) {
      await noteVerify(c, "gazette");
      const valid = await verifyIssueSignature(issue);
      return c.json({
        valid,
        kind: "gazette_issue",
        issue_number: issue.issue_number,
        title: issue.title,
        date: issue.date,
        signature: issue.signature,
        public_key: issue.public_key,
        algorithm: "ed25519",
        // The paper's own markdown IS the signed payload, served whole
        // at /gazette so a holder compares the copy they read.
        signed_payload: issue.markdown,
        signature_covers: HOW_TO_VERIFY,
        note: valid
          ? "Genuine issue. The copy you hold is the copy that went to press."
          : "Signature doesn't match. That's not the paper we printed.",
      });
    }
  }

  const phantomRecord = await readPhantomCheck(c.env, id);
  if (phantomRecord) {
    await noteVerify(c, "phantom_check");
    if (phantomRecord.status === "scheduled") {
      return c.json({
        valid: false,
        kind: "phantom_check",
        status: "scheduled",
        note: "Nothing signed yet, the store hasn't walked past. Come back after the hour on the slip.",
      });
    }
    const valid = await verifyPhantomSignature(phantomRecord);
    return c.json({
      valid,
      kind: "phantom_check",
      observation: phantomRecord.observation,
      signature: phantomRecord.signature,
      public_key: phantomRecord.public_key,
      algorithm: "ed25519",
      signed_payload: canonicalizePhantomCheck(phantomRecord),
      signature_covers: HOW_TO_VERIFY,
      note: valid
        ? "Genuine observation. Signed at the moment of looking."
        : "Signature doesn't match. Treat this attestation as compromised.",
    });
  }

  return c.json({ valid: false, error: VOICE.certNotFound }, 404);
});

verifyRoutes.get("/.well-known/scvd-signing-key", async (c) => {
  const publicKey = await getPublicKeyHex(c.env.SIGNING_KEY);
  return c.json({
    algorithm: "ed25519",
    public_key: publicKey,
    encoding: "hex",
    identity_policy: IDENTITY_POLICY,
    sample_artifact_id: SAMPLE_ARTIFACT_ID,
    sample_verify_url: `${c.env.STORE_BASE_URL}/api/verify/${SAMPLE_ARTIFACT_ID}`,
    /**
     * THE KEY AND ITS CONTINUITY TRAVEL TOGETHER, and this is the one
     * endpoint where that is not optional. A client that caches this
     * key is a client that will one day see a DIFFERENT key here, and
     * the whole question at that moment is whether the change was a
     * handover or a takeover. Telling it the answer on a page it never
     * fetches is telling nobody. So the four load-bearing facts ride
     * beside the key itself: how many there are, whether a successor
     * exists, what a legitimate change will look like, and where the
     * full form is written out.
     */
    continuity: {
      key_count: 1,
      successor_key_exists: false,
      rotations_performed: 0,
      if_this_key_ever_changes:
        "A legitimate handover is announced here BEFORE the new key signs anything, and the announcement is itself signed by the OUTGOING key, served as exact bytes at a verify URL. If you find a new key here that has already issued artifacts, or a handover notice the old key did not sign, that is not a handover — treat it as a compromise. If the old key cannot sign the announcement, there is no legitimate handover available and /corrections will say so rather than one being performed anyway.",
      full_policy: `${c.env.STORE_BASE_URL}/attestation`,
    },
    note: "Anything we sign, this key verifies. Hangs by the door for a reason.",
  });
});
