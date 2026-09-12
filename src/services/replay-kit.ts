import { hashQuotedTerms, quotedTerms, type QuotedTerms } from "@/discovery/receipt-surface";
import { citeBlock } from "@/lib/cite";
import { sha256Hex } from "@/lib/idempotency";
import { storeIdentity } from "@/lib/identity";
import { jcsCanonicalize } from "@/lib/jcs";
import { offerKid, signDetachedJws, signJws } from "@/lib/offer-receipt";
import { settlementExplorer } from "@/lib/payment-networks";
import { manifestAccepts, priceTiersUsdc } from "@/lib/payments";
import { canonicalizeCertificate, certificateSignatureForm } from "@/lib/signing";
import { inputMismatchRefusal } from "@/services/purchase-intent";
import { settlementStateFor, type SettlementState } from "@/services/settlement-state";
import { getMenuItem } from "@/store";
import type { Certificate, CertificateRecord, Env } from "@/types";

/**
 * THE REPLAY KIT (2026-09-12) — one paid call, as an integration test
 * an agent can run against this store without trusting it.
 *
 * Asked for from outside, by name, after the quote and the sale's
 * standing went into the receipt: "a verifier sample an agent can
 * replay: one paid call id, the JWS offer, settlement proof, response
 * hash, and the refusal code when scope is wrong. That turns scvd from
 * a promise into an integration test." Every one of those parts
 * existed at some URL; none of them stood together. This is the
 * stitching, keyed by certificate id, derived on every read from the
 * signed record and the live catalog, stored nowhere.
 *
 * WHAT IS RETAINED AND WHAT IS NOT, said on the kit itself. The
 * certificate, its signature and its settlement transaction are the
 * record. The five accepted terms are recovered by hashing the
 * catalog's current accepts and matching the certificate's SIGNED
 * `quote` — so a recovered term set is one the buyer's own signature
 * was bound to, not a guess. The JWS offer the 402 actually carried is
 * NOT retained (offers are minted per challenge with a five-minute
 * validUntil, and the buyer never sends one back); the kit signs a
 * fresh offer over the same five terms, by the same key, and says so
 * in those words. A replayer decodes it, hashes the five, and sees the
 * certificate name them. That is the test; the timestamp is not.
 *
 * THE KIT IS SIGNED, detached JWS over its own RFC 8785 form, so a
 * copy of it can be checked against did.json like an offer. The
 * signature proves this store assembled this kit from these parts; it
 * does not make any part truer than its own signature already does.
 */

export const REPLAY_KIT_CLASS = "replay_kit";
const OFFER_VALIDITY_SECONDS = 300;

export interface ReplayKitOffer {
  quote: string | null;
  accepted_terms: QuotedTerms | null;
  recovered_from: string;
  jws: string | null;
  jws_note: string;
  kid: string;
  did_document: string;
  check: string;
}

export interface ReplayKit {
  artifact_class: typeof REPLAY_KIT_CLASS;
  store_identity: ReturnType<typeof storeIdentity>;
  replay_url: string;
  verify_url: string;
  call: {
    cert_id: string;
    item: string;
    patron_number: number;
    date: string;
    purpose?: string;
    mandate_id?: string;
    attests?: string;
  };
  offer: ReplayKitOffer;
  settlement: {
    state: SettlementState["payment_state"];
    transaction: string | null;
    network: string | null;
    explorer: string | null;
    payer: string | null;
    paid_usdc: number | null;
    asset: string | null;
    check: string;
    standing: SettlementState;
  };
  response: {
    form: "current" | "legacy" | "invalid";
    signed_payload: string;
    signature: string;
    signature_jcs: string | null;
    public_key: string;
    algorithm: "ed25519";
    artifact_hash: string;
    check: string;
  };
  refusal: {
    wrong_scope: ReturnType<typeof inputMismatchRefusal>;
    how_to_provoke: string;
    other_codes: Record<string, string>;
  };
  replay: string[];
  not_retained: string[];
  cite: string;
  cite_format: string;
}

export interface SignedReplayKit extends ReplayKit {
  kit_signature: {
    format: "jws-detached";
    kid: string;
    covers: string;
    signature: string;
  };
}

/**
 * The five terms the certificate's quote was hashed from, found by
 * hashing every accepts entry the catalog would serve for this item
 * today and matching the signed hash. The match is exact or nothing:
 * a price change, a moved payTo or a retired rail since the sale
 * means the terms are no longer recoverable from the catalog, and the
 * kit says so rather than serving the nearest row.
 */
async function recoverAcceptedTerms(
  env: Env,
  cert: Certificate,
): Promise<{ terms: QuotedTerms | null; recovered_from: string }> {
  if (!cert.quote) {
    return {
      terms: null,
      recovered_from:
        cert.paid_usdc !== undefined && cert.paid_usdc > 0
          ? "not_observed: this certificate was minted before 2026-09-12, when the accepted quote began riding the signature. Nothing here can name the terms it was paid against."
          : "not_applicable: no money moved on this certificate, so no terms were accepted.",
    };
  }
  const item = getMenuItem(cert.item);
  if (!item) {
    return {
      terms: null,
      recovered_from:
        "not_recoverable: the item is no longer on the menu, so the catalog cannot be hashed against the signed quote.",
    };
  }
  for (const accept of manifestAccepts(env, priceTiersUsdc(item))) {
    const terms = quotedTerms(accept);
    if (terms && (await hashQuotedTerms(terms)) === cert.quote) {
      return {
        terms,
        recovered_from:
          "catalog: the current accepts for this item, hashed one by one; this is the one whose sha256 equals the certificate's signed quote. The match is exact, so these are the terms the buyer's payment signature was bound to.",
      };
    }
  }
  return {
    terms: null,
    recovered_from:
      "not_recoverable_from_current_catalog: no accepts entry the shelf serves today hashes to the signed quote — the price, the receiving address or the rails have changed since this sale. The quote still binds the original terms; only the catalog to recover them from has moved.",
  };
}

async function signedOfferFor(
  env: Env,
  cert: Certificate,
  terms: QuotedTerms,
  nowSeconds: number,
): Promise<string | null> {
  try {
    return await signJws(env, {
      version: 1,
      resourceUrl: `${env.STORE_BASE_URL}/api/buy/${cert.item}`,
      scheme: terms.scheme,
      network: terms.network,
      asset: terms.asset,
      payTo: terms.payTo,
      amount: terms.amount,
      validUntil: nowSeconds + OFFER_VALIDITY_SECONDS,
    });
  } catch {
    return null;
  }
}

export async function buildReplayKit(
  env: Env,
  record: CertificateRecord,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SignedReplayKit> {
  const cert = record.certificate;
  const base = env.STORE_BASE_URL;
  const form = await certificateSignatureForm(cert, record.signature, record.public_key);
  const signedPayload = canonicalizeCertificate(cert);
  const recovered = await recoverAcceptedTerms(env, cert);
  const kid = await offerKid(env);
  const jws = recovered.terms ? await signedOfferFor(env, cert, recovered.terms, nowSeconds) : null;
  const standing = await settlementStateFor(env, cert);
  const verifyUrl = `${base}/api/verify/${cert.cert_id}`;
  const replayUrl = `${base}/api/replay/${cert.cert_id}`;
  const recoveryPlaceholder = {
    purchase_recorded: true,
    purchase_id: "<the original purchase's id>",
    status_url: `${base}/api/purchase-status/<purchase_id>`,
    status_token: "<held by the buyer, never published>",
    status_tool: "check_purchase",
    status_auth: "GET status_url with Authorization: Bearer <status_token>. Keep the token private. This read is free and never submits payment.",
  };
  const kit: ReplayKit = {
    artifact_class: REPLAY_KIT_CLASS,
    store_identity: storeIdentity(base),
    replay_url: replayUrl,
    verify_url: verifyUrl,
    call: {
      cert_id: cert.cert_id,
      item: cert.item,
      patron_number: cert.patron_number,
      date: cert.date,
      ...(cert.purpose ? { purpose: cert.purpose } : {}),
      ...(cert.mandate_id ? { mandate_id: cert.mandate_id } : {}),
      ...(cert.attests ? { attests: cert.attests } : {}),
    },
    offer: {
      quote: cert.quote ?? null,
      accepted_terms: recovered.terms,
      recovered_from: recovered.recovered_from,
      jws,
      jws_note: jws
        ? "Signed on THIS read, over the same five terms, by the same Ed25519 key that signed the certificate (kid below, resolvable at did_document). The offer the paid 402 actually carried differed only in validUntil and was not retained — offers are minted per challenge and a buyer never sends one back. Decode this one, drop version, resourceUrl and validUntil, lowercase asset and payTo on eip155 networks, canonicalize the five that remain (RFC 8785), sha256, and compare with offer.quote: equality is the certificate naming the offer's terms."
        : "No offer can be signed: the accepted terms could not be recovered (recovered_from says why). A kit with a made-up offer would be worse than one without.",
      kid,
      did_document: `${base}/.well-known/did.json`,
      check: "jws_verify(offer.jws, key_from(did_document, offer.kid)) and sha256(jcs(lowercase_evm_addresses(five_terms_of(payload)))) == offer.quote == certificate.quote",
    },
    settlement: {
      state: standing.payment_state,
      transaction: cert.settlement_tx ?? null,
      network: cert.network ?? null,
      explorer: cert.settlement_tx ? settlementExplorer(cert.network, cert.settlement_tx) : null,
      payer: cert.payer ?? null,
      paid_usdc: cert.paid_usdc ?? null,
      asset: cert.asset ?? null,
      check:
        "Read the transaction on the named network yourself: a USDC Transfer from settlement.payer to the offer's payTo for the offer's amount, in the block the explorer shows. The store's word is the certificate; the chain is the proof, and it does not need us.",
      standing,
    },
    response: {
      form,
      signed_payload: signedPayload,
      signature: record.signature,
      signature_jcs: record.signature_jcs ?? null,
      public_key: record.public_key,
      algorithm: "ed25519",
      artifact_hash: await sha256Hex(signedPayload),
      check:
        "ed25519_verify(utf8(signed_payload), hex(signature), hex(public_key)) against a key you fetch from /.well-known/scvd-signing-key, then sha256(utf8(signed_payload)) == artifact_hash. Every field in the certificate is inside signed_payload; anything you find outside it is unsigned.",
    },
    refusal: {
      wrong_scope: inputMismatchRefusal(recoveryPlaceholder),
      how_to_provoke:
        "Present a settled payment — same PAYMENT-SIGNATURE, same nonce — against a different product or different inputs than it bought. The door answers with this body: refused, charged once (the original sale), charged_again false, settlement_attempted false, and the ORIGINAL purchase's private recovery handle so the buyer can read what the money actually bought. The placeholder values above are the shape; a real refusal carries the buyer's own ids and token, which are never published.",
      other_codes: {
        payment_declined: "The authorization verified but did not settle; no money moved and nothing left the shelf.",
        settlement_unknown: "The settle call returned no verdict; the payment is unresolved and the buyer must not sign a new one. The hourly reconciler asks the chain.",
        purchase_not_settled: "A recorded attempt whose settlement was refused; the buyer may start a fresh purchase with a fresh payment and a new idempotency key.",
        purchase_recovery_pending: "The payment settled and delivery is being recovered from the retained record; no second settlement is attempted.",
      },
    },
    replay: [
      "1. GET replay_url. Everything below is inside this document; nothing requires an account.",
      "2. Verify response.signed_payload against a key fetched from /.well-known/scvd-signing-key; confirm sha256 of it equals response.artifact_hash.",
      "3. Decode offer.jws; verify it against the key offer.kid resolves to in did_document; hash its five terms and match offer.quote and the quote inside signed_payload.",
      "4. Read settlement.transaction on settlement.network at settlement.explorer or your own RPC: payer, payTo and amount must agree with the offer.",
      "5. Read settlement.standing.delivery_audit: closed means goods went out; open means the store owes and says so.",
      "6. Optionally provoke refusal.wrong_scope by re-presenting a settled payment against another product: expect that code, charged_again false, and no second settlement.",
    ],
    not_retained: [
      "The exact JWS offer the paid 402 carried (per-challenge, five-minute validity, never returned by the buyer). Its five terms are recovered by hash; its validUntil is not.",
      "The buyer's PAYMENT-SIGNATURE header. A one-way fingerprint is kept on the private purchase journal for recovery; the bytes are not served.",
      "The facilitator's PAYMENT-RESPONSE header and the signed receipt inside it, which travelled to the buyer once and are the buyer's to keep.",
    ],
    ...citeBlock({ base, what: "replay kit", which: cert.cert_id, observed_at: cert.date, url: replayUrl, verify_url: verifyUrl }),
  };
  const signature = await signDetachedJws(env, jcsCanonicalize(kit));
  return {
    ...kit,
    kit_signature: {
      format: "jws-detached",
      kid,
      covers:
        "The RFC 8785 (JCS) form of this document with kit_signature removed, as the detached payload of an EdDSA JWS (RFC 7515 Appendix F): rebuild header..signature into header.base64url(payload).signature and verify against the key kid resolves to. Proves this store assembled this kit from these parts on this read; makes no part truer than its own signature does.",
      signature,
    },
  };
}
