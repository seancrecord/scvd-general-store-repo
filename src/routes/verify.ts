import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import {
  JCS_DUAL_EMIT_DATED,
  JCS_SIGNATURE_COVERS,
  jcsCanonicalize,
} from "@/lib/jcs";
import type { Context } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { isUrlTemplatePlaceholder } from "@/lib/url-template";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { citeBlock } from "@/lib/cite";
import { storeIdentity } from "@/lib/identity";
import { recordVerifyCall } from "@/lib/metrics";
import type { EventSignals } from "@/lib/metrics";
import {
  cachedPublicKeyHex,
  signMessage,
  canonicalizeCertificate,
  canonicalizeCertificateLegacy,
  certificateSignatureForm,
  certificateSignedSubset,
  fieldsOutsideLegacySignature,
  verifyMessageSignature,
} from "@/lib/signing";
import {
  canonicalizeAnchor,
  getAnchor,
  verifyAnchorSignature,
} from "@/services/anchors";
import { getCertificate } from "@/services/certificates";
import {
  existenceVerdict,
  type ExistenceInput,
  type ExistenceVerdict,
} from "@/services/certificate-anchors";
import { canonicalizeReport } from "@/services/reports";
import {
  CROSS_REF_INDEPENDENCE,
  CROSS_REF_MEANING,
  verifyCrossReferences,
} from "@/services/cross-reference";
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
import {
  canonicalizeHandover,
  getHandover,
  HANDOVER_MEANS,
  verifyHandoverSignature,
} from "@/services/key-handover";
import { VOICE, getMenuItem } from "@/store";
import { checkKeyServiceWindow } from "../../verifier/x402-verify.js";
import {
  attributeKey,
  currentKeyInServiceFrom,
  retiredKeysFor,
  rotationsPerformed,
} from "@/store/key-registry";
import { MAKER_MARKS } from "@/store/provenance";
import { IDENTITY_POLICY, SAMPLE_ARTIFACT_ID } from "@/store/spec";
import type { Certificate, HonoEnv } from "@/types";

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
/**
 * WHICH OF OUR KEYS SIGNED THIS, ANSWERED ON THE ARTIFACT.
 *
 * Added 2026-07-31 alongside the key registry, and it closes a hole
 * that predates any thought of rotation. Verification here checks a
 * signature against the public key stored in the artifact's OWN
 * record. That proves internal consistency and nothing else: a record
 * carrying somebody else's keypair verifies exactly as cleanly as one
 * of ours. What actually ties an artifact to this store is that its
 * key is a key we publish — a tie that was real but implicit while
 * there was one key and nothing compared against it.
 *
 * So every verify response now says which published key signed it, or
 * says plainly that it matches none of them. Same discipline as
 * signature_gap: name what the check does not cover, on the artifact,
 * rather than let a holder infer coverage from a green `valid`.
 *
 * It is also what keeps artifacts attributable across a handover. An
 * old certificate after a rotation reads `retired` with the date its
 * key left service, instead of quietly matching nothing.
 *
 * ON EVERY ARTIFACT CLASS, and it was not on 2026-07-31 when first
 * written — it went onto certificates and handovers, the two being
 * looked at, while stamps, anchors, luckies, gazette issues and
 * phantom checks got none. That is the maker's-mark lesson exactly:
 * a field present on some artifacts and absent on others reads as the
 * unmarked ones hiding something. Worse here, because after a
 * rotation an unmarked artifact shows a public key the reader
 * recognises from nowhere, with nothing on the response to say
 * "retired, and that is expected." Caught by re-reading rather than
 * by a test, which is the argument for the test underneath it.
 */
async function signedBy(
  c: Context<HonoEnv>,
  recordPublicKey: string | undefined,
  /**
   * The artifact's OWN claimed date, where the record carries one.
   * With it, the response also answers the layer-3 question — was
   * this key AUTHORIZED at that date? — which attribution alone
   * never did. Everything above the report route passes one.
   */
  artifactDateIso?: string,
): Promise<Record<string, unknown>> {
  /**
   * Two artifact classes record the key as optional. Where none was
   * stored there is nothing to attribute, and the honest response is
   * to omit the block rather than invent an attribution for a key that
   * is not there — an "unrecognised" verdict on an absent key would be
   * a scary answer to a question nobody asked.
   */
  if (!recordPublicKey) {
    return {};
  }
  /**
   * CACHED, because this runs on every verify and verification is the
   * one thing here that is free, unlimited and forever. The first cut
   * derived the public key from the seed on each call — an ed25519
   * scalar multiplication per request, on the hottest public path in
   * the store, to recompute a constant. cachedPublicKeyHex already
   * existed and was already used by the payment gate.
   */
  const current = await cachedPublicKeyHex(c.env.SIGNING_KEY);
  const attribution = attributeKey(recordPublicKey, current);

  /**
   * THE SERVICE-WINDOW CHECK (2026-08-24), closing the gap the
   * retired-key prose used to paper over. RETIRED_MEANS reassured
   * that a retired key is "expected on an artifact issued before the
   * handover" — without ever checking that it WAS issued before. A
   * stolen retired key signing an artifact dated after its own
   * retirement passed here with `status: "retired"` and comforting
   * words: cryptographically valid (layer 1), genuinely our key
   * (layer 2), and a forgery all the same, because at its claimed
   * date that key had no authority (layer 3).
   *
   * The comparison lives in verifier/x402-verify.js — the public
   * package, so the same check a dispute would run offline is the
   * one this response ran — and reads the registry through
   * retiredKeysFor, whose lock-wins rule keeps a mid-handover
   * artifact from being falsely flagged: a key still signing is
   * current, whatever the registry says.
   *
   * No block for an unrecognised key: no published window exists to
   * check against, and attributeKey's own verdict already says the
   * only honest thing there is to say.
   */
  const windowBlock =
    artifactDateIso && attribution.status !== "unrecognised"
      ? (() => {
          const checked = checkKeyServiceWindow(
            {
              current: {
                public_key: current,
                in_service_from: currentKeyInServiceFrom(current),
              },
              retired: retiredKeysFor(current),
            },
            recordPublicKey,
            artifactDateIso,
          );
          return {
            service_window: {
              status: checked.status,
              ...(checked.status !== "undated"
                ? { in_window: checked.status === "in_service" }
                : {}),
              ...(checked.window
                ? {
                    in_service_from: checked.window.in_service_from,
                    retired_on: checked.window.retired_on,
                  }
                : {}),
              artifact_dated: artifactDateIso,
              means: checked.detail,
            },
          };
        })()
      : {};

  return {
    signed_by: {
      public_key: recordPublicKey,
      ...attribution,
      ...windowBlock,
    },
  };
}

/**
 * A DIGEST OF THE EXACT BYTES THAT WERE SIGNED.
 *
 * Added 2026-07-31 for the bilateral-receipt fixture: an outside
 * operator (causeclaw, m/agents) listed the fields they would need
 * before treating another shop's certificate as one input to a local
 * decision, and after this evening's work this was the only one
 * missing. It is worth having whether or not that fixture ever
 * happens — it lets a holder confirm a COPY of an artifact is the
 * same artifact without re-fetching it from us, which is precisely
 * the property a cross-reference between two operators needs and the
 * one nothing here provided.
 *
 * DERIVED, NEVER STORED AND NEVER SIGNED. A hash of the signed
 * payload cannot live inside the signed payload without being
 * circular, and a stored copy is one more value that can drift from
 * the thing it describes. Computed on every response from the same
 * string served as signed_payload, so it is incapable of disagreeing
 * with it.
 *
 * SHA-256 over the UTF-8 bytes, hex, matching the digest already used
 * for settlement evidence hashes — one hashing convention across the
 * store rather than a second one nobody documented.
 */
async function artifactHash(signedPayload: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(signedPayload),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const HOW_TO_VERIFY =
  "signed_payload is the exact UTF-8 string this signature covers. What this store signs, who holds the key and whose word you are taking is declared per artifact class at /attestation, including where the trust model is the weakest available. Check it yourself: ed25519_verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). Then compare the fields inside signed_payload against the artifact above — if a field is shown but absent from signed_payload, the signature does not cover it, and this response says so out loud rather than leaving you to discover it. The key is also at /.well-known/scvd-signing-key, so you never have to take ours from this response.";

/** Re-verification is a demand signal; the ledger counts it per item. */
async function noteVerify(
  c: Context<HonoEnv>,
  item: string,
  /**
   * When the artifact was minted, where the record carries it. Feeds
   * the age bucket in metrics.ts — the one honest proxy available for
   * whether an artifact TRAVELLED, given that /api/verify is an
   * unauthenticated GET and we are not going to start identifying
   * callers to find out.
   */
  mintedIso?: string,
): Promise<void> {
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
  await recordVerifyCall(c.env, item, signals, mintedIso).catch(() => {
    // The count is a courtesy; verification itself never waits on it.
  });
}

/**
 * THE RECEIPT PAGE (the receipt chain, 2026-08-19). The same URL a
 * machine reads as JSON renders for a person as a printable receipt —
 * the store's standard content negotiation, applied to the one
 * artifact a human is most likely to be handed. The verdict is
 * RE-CHECKED AT RENDER, never cached: the page is a verification,
 * not a picture of one. Zero PII, nothing stored — a rendering of an
 * artifact that already exists.
 */
function receiptPageHtml(
  cert: Certificate,
  valid: boolean,
  form: string,
  existence?: ExistenceVerdict,
): string {
  // The certificate binds the item ID; the page shows the shelf name
  // where the menu still knows it, and the honest id where it doesn't
  // (retired items keep verifying forever; their receipts say what
  // the buyer's records say).
  const itemName = getMenuItem(cert.item)?.name ?? cert.item;
  const money =
    cert.paid_usdc !== undefined
      ? `$${cert.paid_usdc} ${cert.asset ?? "USDC"}${cert.tip_usdc ? ` (includes $${cert.tip_usdc} tip)` : ""}`
      : cert.settled_via
        ? `Trade account — ${cert.trade_partner ?? "a marketplace"} collected its customer's payment; none reached this store`
        : "Free shelf — no payment moved";
  const explorer = cert.settlement_tx
    ? cert.network && cert.network.startsWith("solana")
      ? `https://solscan.io/tx/${cert.settlement_tx}`
      : `https://basescan.org/tx/${cert.settlement_tx}`
    : null;
  const row = (label: string, value: string) =>
    `<p class="menu-desc"><strong>${escapeHtml(label)}</strong> — ${value}</p>`;
  return `<section>
      <p class="menu-desc"><strong>${
        valid
          ? `Signature verified just now (${escapeHtml(form)} form) — this receipt is genuine.`
          : "SIGNATURE DID NOT VERIFY. Do not trust this page's contents; the machine record below is the authority."
      }</strong></p>
      ${row("Item", escapeHtml(itemName))}
      ${row("Date", escapeHtml(cert.date.slice(0, 10)))}
      ${row("Paid", escapeHtml(money))}
      ${row("Patron number", `#${cert.patron_number}`)}
      ${cert.name ? row("For", escapeHtml(cert.name)) : ""}
      ${cert.made_by ? row("Made by", escapeHtml(cert.made_by)) : ""}
      ${cert.saw ? row("Catalog surface", `<code>${escapeHtml(cert.saw)}</code> <span class="menu-meta">(sha256 of the route, list price, and required inputs this receipt was minted against)</span>`) : ""}
      ${cert.purpose ? row("What your agent said this was for", `“${escapeHtml(cert.purpose)}” <span class="menu-meta">(the buyer's words, recorded verbatim and signed — the signature proves they were said, not that they were true)</span>`) : ""}
      ${cert.mandate_id ? row("Acting under recorded mandate", `<a href="/api/mandate/${escapeHtml(cert.mandate_id)}">${escapeHtml(cert.mandate_id)}</a> <span class="menu-meta">(the authorization your agent claims it was given, recorded and signed BEFORE this purchase — the link resolves to the full record and its honest limits)</span>`) : ""}
      ${explorer ? row("On-chain settlement", `<a href="${explorer}">${escapeHtml(cert.settlement_tx ?? "")}</a>`) : ""}
      ${cert.settled_via ? row("How it was paid for", `Trade account <strong>${escapeHtml(cert.trade_partner ?? "")}</strong>${cert.settled_via === "trade_account_test" ? " (test mode: nothing booked)" : ""}, listed trade price $${escapeHtml(String(cert.trade_price_usd ?? ""))}. <span class="menu-meta">The marketplace collected its customer's payment; this store saw none and names no chain. Refunds go through the account holder, who took the payment. Instruction digest <code>${escapeHtml(cert.trade_instruction ?? "")}</code>.</span>`) : ""}
      ${row("Certificate id", `<code>${escapeHtml(cert.cert_id)}</code>`)}
      ${existence ? row("Existed by", existence.existed_by ? `Bitcoin block ${existence.existed_by.block_height}${existence.existed_by.block_time ? ` (mined ${escapeHtml(existence.existed_by.block_time.slice(0, 10))})` : ""} <span class="menu-meta">${escapeHtml(existence.verdict)}</span>` : `<span class="menu-meta">${escapeHtml(existence.verdict)}</span>`) : ""}
    </section>
    ${cert.from_the_store ? `<section><p class="menu-desc"><em>${escapeHtml(cert.from_the_store)}</em> — the store</p></section>` : ""}
    <section>
      <p class="menu-meta">This page re-checks the ed25519 signature on every load. The machine-readable record — the exact signed bytes, the public key, and how to run the check with your own library — is this same URL served as JSON. What a signature from this store proves, per artifact class: <a href="/attestation">/attestation</a>. Re-verification is free, forever.</p>
    </section>`;
}

verifyRoutes.get("/api/verify/:cert_id", async (c) => {
  const id = c.req.param("cert_id");

  /**
   * A PLACEHOLDER IS NOT A MISSING ARTIFACT, AND THIS ENDPOINT USED TO
   * SAY IT WAS (2026-08-26).
   *
   * `/api/verify/{id}` is published as a URL template on llms.txt,
   * agents.md, skill.md, menu.json, the OpenAPI contract and every
   * purchase response. Some readers treat it as a link and fetch it
   * literally — a crawler pulling hrefs, a link checker, an agent told
   * to follow what it finds — and until today they got the ordinary
   * not-found: `valid: false`, status 404.
   *
   * That answer is false in the way that costs most. This store sells
   * the fact that a stranger can check an artifact without asking us,
   * and its verification endpoint was answering "no such artifact" to
   * its own documentation URL. A readiness scan reads that as a broken
   * link on the page we most want read; a careless agent reads
   * `valid: false` and has been told something about our goods.
   *
   * So a placeholder gets a 200 and usable guidance. TWO PROPERTIES
   * make that safe, and both are deliberate:
   *
   *   - there is NO `valid` field in this response, at all. Not
   *     `false`, not `true`. Nothing here can be mistaken for a
   *     verdict on an artifact, because no verdict is expressed.
   *   - the sample id it hands back is a real artifact that really
   *     verifies, so a reader following the guidance lands on a
   *     working example rather than another dead end.
   *
   * A real certificate id contains no braces, so nothing that could
   * have been looked up is swallowed here — see lib/url-template.ts
   * for why that check is kept narrow on purpose.
   */
  if (isUrlTemplatePlaceholder(id)) {
    return c.json({
      template: true,
      not_a_verification_result:
        "You fetched the URL TEMPLATE rather than a certificate id, so there is nothing here to verify and this response deliberately carries no verdict — no `valid` field, either way. Substitute a real id and this endpoint answers properly.",
      usage: `${c.env.STORE_BASE_URL}/api/verify/{cert_id}, where cert_id is the id on any artifact this store signed. Free, forever, no account, no key, no rate limit, and it answers for anyone — not only for whoever bought the thing.`,
      sample_cert_id: SAMPLE_ARTIFACT_ID,
      sample_verify_url: `${c.env.STORE_BASE_URL}/api/verify/${SAMPLE_ARTIFACT_ID}`,
      offline_note:
        "You do not need this endpoint at all. Every purchase response and every verify answer carries signed_payload, signature and public_key, which is everything an ed25519 check needs — and a check you run yourself is the one that carries weight, because an issuer confirming its own signature proves nothing about its honesty.",
      signing_key: `${c.env.STORE_BASE_URL}/.well-known/scvd-signing-key`,
      openapi: `${c.env.STORE_BASE_URL}/openapi.json`,
    });
  }

  /**
   * ECOSYSTEM REPORTS verify here like every artifact class (2026-08-19):
   * one endpoint answers for everything the store signs. The signature
   * is deterministic (ed25519, fixed canonical form), so re-deriving it
   * here and serving the exact bytes lets a stranger run the check with
   * their own library — which, as everywhere on this endpoint, is the
   * check that carries the weight; ours confirming ours does not.
   */
  const reportCanonical = await canonicalizeReport(id);
  if (reportCanonical) {
    const { signature, publicKey } = await signMessage(
      reportCanonical,
      c.env.SIGNING_KEY,
    );
    const valid = await verifyMessageSignature(
      reportCanonical,
      signature,
      publicKey,
    );
    return c.json({
      valid,
      artifact_class: "ecosystem_report",
      store_identity: storeIdentity(c.env.STORE_BASE_URL),
      report_url: `${c.env.STORE_BASE_URL}/api/report/${id}`,
      signature,
      public_key: publicKey,
      ...(await signedBy(c, publicKey)),
      algorithm: "ed25519",
      signed_payload: reportCanonical,
      artifact_hash: await artifactHash(reportCanonical),
      signature_covers:
        "signed_payload is the exact UTF-8 string the signature covers: ed25519_verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). The body_sha256 inside it binds the full report body served at report_url — hash that body yourself and compare; nothing in the report is outside the digest.",
      ...citeBlock({ base: c.env.STORE_BASE_URL, what: "ecosystem report", which: id, observed_at: null, url: `${c.env.STORE_BASE_URL}/api/report/${id}`, verify_url: `${c.env.STORE_BASE_URL}/api/verify/${id}` }),
    });
  }

  const record = await getCertificate(c.env, id);
  if (record) {
    await noteVerify(c, record.certificate.item, record.certificate.date);
    const form = await certificateSignatureForm(
      record.certificate,
      record.signature,
      record.public_key,
    );
    const valid = form !== "invalid";
    /**
     * THE EXISTED-BY BOUND (2026-09-05), on both faces of the receipt.
     * Computed once, up here, from the same signed payload the JSON
     * serves — the digest comparison inside it is between two values
     * derived on this response, which is the only way it can be
     * trusted to mean anything. The key's window comes from the same
     * registry read the service-window check uses; the artifact's own
     * date is deliberately NOT an input, because that date is the
     * claim this bound exists to test.
     */
    // Bound once rather than recomputed: the digest must be taken over
    // the EXACT string served as signed_payload, and a second call to
    // the canonicalizer is a second chance for the two to disagree.
    const certificateSignedPayload =
      form === "legacy"
        ? canonicalizeCertificateLegacy(record.certificate)
        : canonicalizeCertificate(record.certificate);
    const certificateArtifactHash = await artifactHash(certificateSignedPayload);
    const currentForBound = await cachedPublicKeyHex(c.env.SIGNING_KEY);
    const recordKey = record.public_key.toLowerCase();
    const retiredEntry = retiredKeysFor(currentForBound).find(
      (entry) => entry.public_key.toLowerCase() === recordKey,
    );
    const boundKey: ExistenceInput["key"] =
      recordKey === currentForBound.toLowerCase()
        ? { status: "current" }
        : retiredEntry
          ? { status: "retired", retiredOn: retiredEntry.retired_on }
          : { status: "unrecognised" };
    const existence = existenceVerdict(record, {
      artifactHash: certificateArtifactHash,
      key: boundKey,
    });
    if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
      return c.html(
        renderSimplePage({
          title: `Receipt ${record.certificate.cert_id}`,
          description:
            "A signed receipt from Sean-Claude Van Damme's General Store, re-verified on every load: what was bought, when, for how much, and the on-chain settlement where one exists. The machine-readable record is this same URL as JSON.",
          bodyHtml: `${receiptPageHtml(
            record.certificate,
            valid,
            form,
            existence,
          )}${jsonLdScript({
            "@context": "https://schema.org",
            "@type": "DigitalDocument",
            name: `Receipt ${record.certificate.cert_id}`,
            identifier: record.certificate.cert_id,
            url: `${c.env.STORE_BASE_URL}/api/verify/${record.certificate.cert_id}`,
            description: valid
              ? "An ed25519-signed receipt from scvd.store, re-verified against the published key on this load."
              : "A receipt whose signature did not verify on this load.",
            ...((record.certificate as { issued_at?: string }).issued_at
              ? { dateCreated: (record.certificate as { issued_at?: string }).issued_at }
              : {}),
            publisher: organizationRef(c.env.STORE_BASE_URL),
          })}`,
        }),
      );
    }
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
    /**
     * AN ATTESTATION OF NOTHING IS NAMED AS ONE (2026-09-04, CV's
     * second round). Two certificates were minted over MCP whose
     * `attests` is sha256 of the empty string — the sheaf's evidence
     * hash over zero observations, after the door dropped the
     * buyer's hashes — and this endpoint answered valid: true for
     * both, correctly: the signature covers exactly that. Signature
     * validity and substance are different questions, and a reader
     * running the automated check got only the first. The digest is
     * derived here, never typed, so the sentence cannot drift from
     * the bytes it describes.
     */
    const attestsNothing =
      typeof record.certificate.attests === "string" &&
      record.certificate.attests.toLowerCase() === (await artifactHash(""));
    return c.json({
      valid,
      ...(attestsNothing
        ? {
            attests_note:
              "This certificate's `attests` field is the sha256 of the EMPTY STRING: the signature is genuine and covers it, and what it attests to is nothing — no observation lay behind it when it was minted. Treat the artifact as void of substance; the signature only proves this store issued it.",
          }
        : {}),
      /**
       * Every verify response, not only the certificate one: an
       * artifact explains itself wherever it is checked, and a stamp
       * or an anchor travels the same way a cert does.
       */
      store_identity: storeIdentity(c.env.STORE_BASE_URL),
      certificate: record.certificate,
      signature: record.signature,
      public_key: record.public_key,
      ...(await signedBy(c, record.public_key, record.certificate.date)),
      algorithm: "ed25519",
      signed_payload: certificateSignedPayload,
      artifact_hash: certificateArtifactHash,
      signature_covers: HOW_TO_VERIFY,
      existence,
      ...citeBlock({ base: c.env.STORE_BASE_URL, what: "receipt", which: record.certificate.cert_id, observed_at: record.certificate.date, url: `${c.env.STORE_BASE_URL}/api/verify/${record.certificate.cert_id}` }),
      /*
       * THE DUAL-EMIT, REPORTED WITH THE SAME HONESTY AS THE PRIMARY
       * (2026-08-18). Three states, never collapsed: verified-here,
       * present-but-broken (named loudly — a bad interop signature is
       * a bug worth reporting, not a footnote), and absent — which for
       * anything minted before the dual-emit began is history, not a
       * defect, and saying WHY spares the reader inventing a reason.
       */
      ...(record.signature_jcs
        ? await (async () => {
            const jcsPayload = jcsCanonicalize(
              certificateSignedSubset(record.certificate),
            );
            const jcsValid = await verifyMessageSignature(
              jcsPayload,
              record.signature_jcs as string,
              record.public_key,
            );
            return {
              signature_jcs: record.signature_jcs,
              signature_jcs_valid: jcsValid,
              signature_jcs_payload: jcsPayload,
              signature_jcs_covers: JCS_SIGNATURE_COVERS,
              ...(jcsValid
                ? {}
                : {
                    signature_jcs_gap:
                      "The RFC 8785 signature on this record does NOT verify. The primary signature above is the authoritative one; if it verifies, the artifact is genuine and the broken interop signature is a store bug worth telling us about at /api/letter.",
                  }),
            };
          })()
        : {
            signature_jcs: null,
            signature_jcs_covers: `No RFC 8785 signature: this artifact was minted before ${JCS_DUAL_EMIT_DATED}, when the store began dual-emitting JCS alongside its declared-field-order discipline. The primary signature above is complete on its own; the JCS signature is interop, not authority.`,
          }),
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
       * CROSS-REFERENCES, RESOLVED LIVE RATHER THAN REPEATED.
       *
       * The certificate carries the counterpart's key fingerprint and
       * our signature covers it — but a fingerprint we minted months
       * ago is a claim about the past, and a reader wants to know
       * whether it holds NOW. So each reference is resolved against
       * the counterpart's own published key history at read time.
       *
       * Fails closed: an unreachable counterpart reads as unverified,
       * never as fine. That is the opposite of how decoration behaves
       * here, and correct for the same reason money is — the artifact
       * is evidence, and evidence that overstates is worse than none.
       */
      ...(record.certificate.cross_ref?.length
        ? {
            cross_references: {
              what_this_means: CROSS_REF_MEANING,
              if_the_counterpart_disappears: CROSS_REF_INDEPENDENCE,
              checked_at: new Date().toISOString(),
              results: await verifyCrossReferences(
                record.certificate.cross_ref,
                { asOf: new Date(record.certificate.date) },
              ),
            },
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
      /**
       * Every verify response, not only the certificate one: an
       * artifact explains itself wherever it is checked, and a stamp
       * or an anchor travels the same way a cert does.
       */
      store_identity: storeIdentity(c.env.STORE_BASE_URL),
      stamp: stampRecord.stamp,
      signature: stampRecord.signature,
      public_key: stampRecord.public_key,
      ...(await signedBy(c, stampRecord.public_key, stampRecord.stamp.date)),
      algorithm: "ed25519",
      signed_payload: canonicalizeStamp(stampRecord.stamp),
      artifact_hash: await artifactHash(canonicalizeStamp(stampRecord.stamp)),
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
      /**
       * Every verify response, not only the certificate one: an
       * artifact explains itself wherever it is checked, and a stamp
       * or an anchor travels the same way a cert does.
       */
      store_identity: storeIdentity(c.env.STORE_BASE_URL),
      anchor: anchorRecord.anchor,
      signature: anchorRecord.signature,
      public_key: anchorRecord.public_key,
      ...(await signedBy(c, anchorRecord.public_key, anchorRecord.anchor.date)),
      algorithm: "ed25519",
      signed_payload: canonicalizeAnchor(anchorRecord.anchor),
      artifact_hash: await artifactHash(canonicalizeAnchor(anchorRecord.anchor)),
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
      /**
       * Every verify response, not only the certificate one: an
       * artifact explains itself wherever it is checked, and a stamp
       * or an anchor travels the same way a cert does.
       */
      store_identity: storeIdentity(c.env.STORE_BASE_URL),
      lucky: luckyRecord.lucky,
      signature: luckyRecord.signature,
      public_key: luckyRecord.public_key,
      ...(await signedBy(c, luckyRecord.public_key, luckyRecord.lucky.date)),
      algorithm: "ed25519",
      signed_payload: canonicalizeLucky(luckyRecord.lucky),
      artifact_hash: await artifactHash(canonicalizeLucky(luckyRecord.lucky)),
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
        ...(await signedBy(c, issue.public_key, issue.date)),
        algorithm: "ed25519",
        // The paper's own markdown IS the signed payload, served whole
        // at /gazette so a holder compares the copy they read.
        signed_payload: issue.markdown,
        artifact_hash: await artifactHash(issue.markdown),
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
      /**
       * Every verify response, not only the certificate one: an
       * artifact explains itself wherever it is checked, and a stamp
       * or an anchor travels the same way a cert does.
       */
      store_identity: storeIdentity(c.env.STORE_BASE_URL),
      kind: "phantom_check",
      observation: phantomRecord.observation,
      signature: phantomRecord.signature,
      public_key: phantomRecord.public_key,
      ...(await signedBy(
        c,
        phantomRecord.public_key,
        phantomRecord.observation?.checked_at,
      )),
      algorithm: "ed25519",
      signed_payload: canonicalizePhantomCheck(phantomRecord),
      artifact_hash: await artifactHash(canonicalizePhantomCheck(phantomRecord)),
      signature_covers: HOW_TO_VERIFY,
      note: valid
        ? "Genuine observation. Signed at the moment of looking."
        : "Signature doesn't match. Treat this attestation as compromised.",
    });
  }

  /**
   * A key handover announcement, verified like anything else — except
   * that a holder checking one is asking a different question. On every
   * other artifact the question is "did this store issue it." Here it
   * is "did the key being RETIRED bless the key taking over," and the
   * answer is the signature: only the outgoing holder could have made
   * it. So the response says out loud which key signed, and that a
   * signature by the outgoing key is the intended and correct state
   * rather than something stale.
   */
  if (id.startsWith("handover_")) {
    const handoverRecord = await getHandover(c.env, id);
    if (handoverRecord) {
      const valid = await verifyHandoverSignature(handoverRecord);
      return c.json({
        valid,
        handover: handoverRecord.handover,
        signature: handoverRecord.signature,
        public_key: handoverRecord.public_key,
        // The announcement is the retiring key's LAST legitimate act,
        // signed on the swap day itself — the inclusive window edge
        // exists for exactly this artifact.
        ...(await signedBy(
          c,
          handoverRecord.public_key,
          handoverRecord.handover.announced,
        )),
        algorithm: "ed25519",
        signed_payload: canonicalizeHandover(handoverRecord.handover),
        artifact_hash: await artifactHash(
          canonicalizeHandover(handoverRecord.handover),
        ),
        signature_covers: HOW_TO_VERIFY,
        what_this_is: HANDOVER_MEANS,
        note: valid
          ? "Genuine handover announcement, signed by the key it retires."
          : "Signature doesn't match. Do NOT act on this handover; treat the key change it describes as unannounced.",
      });
    }
  }

  /**
   * THE HONEST 404, WITH THE ONE CAVEAT THAT STOPS IT LYING. KV writes
   * reach the minting region immediately and every other region within
   * about a minute — and this store now hands out signed receipts AT
   * SETTLEMENT TIME, inviting counterparties to verify them seconds
   * later from wherever they run. To that reader, a propagation 404 is
   * indistinguishable from "this artifact is fake," which is the worst
   * possible misreading of a delay. So the not-found says so: recent
   * ids may still be travelling, and a retry costs nothing. Found in
   * the 2026-08-01 scale walk, made urgent by the offer-receipt ship.
   */
  return c.json(
    {
      valid: false,
      error: VOICE.certNotFound,
      freshly_minted_note:
        "If this id was issued within the last minute, the record may still be propagating between regions — a just-minted artifact can 404 here briefly without being any less real. Verification is free and unlimited; try again in a minute before concluding anything.",
    },
    404,
  );
});

verifyRoutes.get("/.well-known/scvd-signing-key", async (c) => {
  const publicKey = await cachedPublicKeyHex(c.env.SIGNING_KEY);
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
    /**
     * EVERY KEY THIS STORE HAS EVER SIGNED WITH, current first.
     *
     * A retired key stays here permanently. An artifact carries the
     * public key it was signed with and verifies against it on its own
     * terms, so a rotation does not break old signatures — but a key
     * matching nothing the store publishes leaves an artifact merely
     * self-consistent rather than attributable to us. Publishing
     * retired keys forever is what preserves that link across a
     * handover, and it is why removing an entry from the registry
     * silently orphans everything signed under it.
     */
    key_history: {
      current: {
        public_key: publicKey,
        status: "current",
        in_service_from: currentKeyInServiceFrom(publicKey),
      },
      retired: retiredKeysFor(publicKey),
      rotations_performed: rotationsPerformed(publicKey),
    },
    /**
     * THE SAME KEY IN THE SHAPE DID RESOLVERS EXPECT. Found missing by
     * the first cold walk of a verify URL (2026-08-03): a reader
     * following links from an artifact could reach this page, the
     * attestation and the anchor log, but the DID document was
     * reachable only by already knowing the did:web well-known
     * convention — a guess that happened to resolve. The x402 Signed
     * Offers & Receipts extension identifies this store by did:web,
     * so the reader most likely to want the DID document is exactly
     * the one standing here.
     */
    did: {
      id: `did:web:${new URL(c.env.STORE_BASE_URL).host}`,
      document: `${c.env.STORE_BASE_URL}/.well-known/did.json`,
      note: "The same current key, published in the W3C DID shape the x402 offer-receipt extension resolves. One derivation serves both documents; they cannot disagree.",
    },
    continuity: {
      key_count: 1 + retiredKeysFor(publicKey).length,
      successor_key_exists: false,
      rotations_performed: rotationsPerformed(publicKey),
      if_this_key_ever_changes:
        "A legitimate handover is announced here BEFORE the new key signs anything, and the announcement is itself signed by the OUTGOING key, served as exact bytes at a verify URL. If you find a new key here that has already issued artifacts, or a handover notice the old key did not sign, that is not a handover — treat it as a compromise. If the old key cannot sign the announcement, there is no legitimate handover available and /corrections will say so rather than one being performed anyway.",
      full_policy: `${c.env.STORE_BASE_URL}/attestation`,
      /**
       * THE ADMISSION THIS BLOCK OWES ITS READER, and the first thing
       * that has ever been able to answer it.
       *
       * Everything above is served by us, off a page we control. The
       * transition chain makes an invented PREDECESSOR impossible
       * without its signature, but nothing here stops the registry
       * being quietly rewritten about WHEN. A reader who cached this
       * key a year ago and came back to a different one has been asked
       * to take our word about the dates on the change.
       *
       * The anchor log is that word committed somewhere we cannot
       * reach: a hash chain over this exact key state, timestamped into
       * Bitcoin. Named right here rather than on a page of its own,
       * because the reader who needs it is the one reading this block.
       */
      externally_anchored_history: `${c.env.STORE_BASE_URL}/.well-known/anchor-log.json — everything above is served by us and is editable by us. That log is a hash chain over this key state whose digests are timestamped into Bitcoin via OpenTimestamps, so how far back this registry could quietly have been rewritten is bounded by something outside our control. It proves WHEN a key state was committed and never WHO SHOULD HAVE held it: a thief with this key could timestamp exactly as validly. Forensics, not a defence.`,
    },
    note: "Anything we sign, this key verifies. Hangs by the door for a reason.",
  });
});
