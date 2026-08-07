import { Hono } from "hono";
import { CERT_FIELDS } from "@/lib/signing";
import { storeIdentity } from "@/lib/identity";
import {
  ARTIFACT_CLASSES,
  KEY_ARCHITECTURE,
  TRUST_MODELS,
} from "@/store/attestation-spec";
import type { HonoEnv } from "@/types";

/**
 * /spec/scvd-attestation/v1 — THE NAMESPACE DOC (the corpus strategy's
 * last step, keeper-approved order: corpus → third-party anchoring →
 * service audit → namespace doc).
 *
 * WHY IT EXISTS: every scvd artifact already verifies — but the rules
 * for HOW lived in this repo's source and nowhere a third party could
 * cite. A verifier written against "whatever the code does today" is
 * coupled to us; a verifier written against a NAMED, VERSIONED format
 * is coupled to a contract. This page is that contract: the format
 * family gets a name (scvd-attestation), a version (v1), a stability
 * promise, and one URL that says exactly how to check any artifact
 * this store signs — so somebody else's tool can say "verifies as
 * scvd-attestation/v1" and mean something checkable.
 *
 * DERIVED, NOT TYPED (AT_SCALE rule 1): the certificate field list IS
 * CERT_FIELDS from the signing code, and the artifact index IS
 * ARTIFACT_CLASSES from /attestation — the two surfaces cannot drift
 * because neither is a second copy. The prose states only the rules
 * the code cannot state about itself.
 *
 * /attestation answers "whose word are you taking" (trust models,
 * key custody, what is not built). THIS page answers "what are the
 * bytes" (canonical forms, encodings, binding conventions). A reader
 * needs both; neither repeats the other.
 */
export const namespaceSpecRoutes = new Hono<HonoEnv>();

export const NAMESPACE = "scvd-attestation";
export const NAMESPACE_VERSION = "v1";

function doc(base: string) {
  return {
    namespace: NAMESPACE,
    version: NAMESPACE_VERSION,
    title: "The scvd-attestation format, v1",
    summary:
      "The interchange contract for every signed artifact this store issues: canonical forms, encodings, the certificate binding convention, and verification steps that need nothing from us but a published key. A tool that implements this page can verify any scvd artifact offline and cite the result by name.",
    url: `${base}/spec/${NAMESPACE}/${NAMESPACE_VERSION}`,
    publisher: storeIdentity(base),
    stability: {
      promise:
        "Within v1, changes are additive only: new artifact types and new OPTIONAL fields may appear, and signed field lists may be APPENDED to, never reordered or truncated — the certificate list's first eight positions have been frozen since the store opened, and every addition since is an append with a dated note in the signing code. Anything that would break an existing verifier is a v2 at a new URL, with v1 continuing to serve. This page carries its version in its path for exactly that reason.",
      versioning_of_artifacts:
        "Artifacts do not carry this spec's version; they are dated, and the spec states its rules as of those dates (the certificate's legacy form below is the worked example). A verifier should key on the artifact's served fields, not on an assumed vintage.",
    },
    signing: {
      algorithm: "ed25519",
      encoding:
        "signature and public_key are lowercase hex strings; the message is the UTF-8 encoding of the canonical form; digests are lowercase hex sha256 unless stated otherwise.",
      the_uniform_rule:
        "For every artifact that carries its own signature, the signed message is the JSON serialization of the artifact's fields IN THE ORDER SERVED, stopping above `signature` — JSON.stringify of exactly those fields, no whitespace, no re-sorting. Fields absent from the artifact are omitted entirely, never null (the certificate's canonical form skips undefined fields). Where a wrapper serves the artifact (the certificate, the context anchor), the response also carries signed_payload: the exact string the signature covers, so nothing has to be rebuilt — prefer the served bytes; the recipe here is for when you only kept the artifact.",
      verification_steps: [
        `1. Obtain the key: the live and retired keys, with service dates, at ${base}/.well-known/scvd-signing-key. Match the artifact's public_key against that history; a key not in the history did not sign for this store.`,
        "2. Reconstruct the message per the artifact's canonical form below (or take signed_payload verbatim where served).",
        "3. ed25519_verify(utf8(message), hex_to_bytes(signature), hex_to_bytes(public_key)).",
        "4. Compare the fields inside the message against the artifact as displayed: a field shown but not signed is not vouched for, and honest surfaces here say so themselves.",
      ],
      key_history_integrity: `The key history above is ours and editable by us; the same history is committed where we cannot reach it: ${base}/.well-known/anchor-log.json — a hash chain over key states, each digest timestamped into Bitcoin via OpenTimestamps. It proves WHEN a key state was committed, never WHO SHOULD HAVE held the key.`,
    },
    certificate: {
      what:
        "The purchase receipt every sale mints; the wrapper most other artifacts bind into.",
      signed_fields_in_order: CERT_FIELDS,
      canonical_form:
        "JSON.stringify of the object built by walking signed_fields_in_order and copying each field THAT IS PRESENT on the certificate, in that order. Absent fields are omitted, never null.",
      frozen_prefix:
        "The first eight positions (cert_id through win) are frozen forever: old signatures cover exactly that sequence. Everything after is a dated append.",
      legacy_form:
        "Certificates minted before 2026-07-30 were signed over the pre-append field set. /api/verify accepts both forms and names WHICH one verified (current | legacy | invalid), listing any served fields a legacy signature does not cover, rather than collapsing to a boolean.",
      verify_url: `${base}/api/verify/{cert_id}`,
    },
    attests_binding: {
      what:
        "The convention that lets one verify endpoint answer for two artifacts: a certificate's `attests` field carries a lowercase hex digest of a second artifact, INSIDE the signed fields, so the store's dated signature covers the binding itself.",
      per_item: {
        settlement_attestation:
          "attests = the observation's evidence_hash: sha256 of the JSON serialization of the observation's core fields (everything above evidence_hash — observed_at through query).",
        attestation_bundle:
          "attests = sha256 of the sheaf's evidence_hash values comma-joined in delivery order. Each member still carries and verifies its own hash and signature alone.",
        bitcoin_anchor:
          "attests = the buyer's own digest, lowercased. The store never saw the bytes; the same digest is independently committed into Bitcoin via the OpenTimestamps proof on the anchor record.",
        service_audit:
          "attests = the report's evidence_hash: sha256 of the JSON serialization of the report's core fields (audit_id through advisories).",
      },
      rule:
        "An attests value is always a digest, never content; recompute it from the delivered artifact and compare. A certificate whose attests does not match the artifact it travels with is binding some OTHER artifact, and the mismatch is the finding.",
    },
    hash_chains: {
      what:
        "Two of the store's own histories are hash-linked so WE cannot rewrite them: each entry carries the previous entry's digest, and entry digests are OTS-stamped into Bitcoin.",
      anchor_log: `${base}/.well-known/anchor-log.json — key-state history. Entries prove themselves by digest chain plus OTS proof; they are not separately ed25519-signed, because the chain exists precisely for the moments a signature of ours would be worthless (a stolen key signs lies just as validly).`,
      corpus: `${base}/corpus.json — the weekly ecosystem record. Entries are BOTH chained and ed25519-signed over a fixed canonical field order (version, sequence, taken_at, previous_digest, source, week, round).`,
      deliberately_unchained:
        "Patron Bitcoin anchors are NOT chained to each other or to our logs: a stranger's proof should not be coupled to our bookkeeping, and a Bitcoin-confirmed OTS proof carries its own time alone.",
    },
    ots_anchoring: {
      what:
        "Where a record carries an `ots` block, it is an OpenTimestamps submission of a sha256 digest: status is pending (a calendar accepted it), complete (upgraded to a Bitcoin-confirmed proof), or failed (the store's hourly pass retries).",
      verify:
        "Base64-decode proof_base64 into a .ots file and run the standard `ots verify` client against the digest. A complete proof verifies against Bitcoin block headers alone — no calendar, no us.",
    },
    trust_models_note:
      `A valid signature means different things for different artifacts — the trust model per class, including where it is the weakest available, is stated at ${base}/attestation and not repeated here. Model names used below: ${Object.values(TRUST_MODELS).map((model) => model.name).join("; ")}.`,
    artifacts: ARTIFACT_CLASSES.map((entry) => ({
      id: entry.id,
      name: entry.name,
      trust_model: TRUST_MODELS[entry.trust_model].name,
      signature_covers: entry.signs,
      does_not_prove: entry.does_not_prove,
      verify_url: `${base}${entry.verify_url}`,
    })),
    watch_row_canonical_form:
      "Standing watch rows sign JSON.stringify({watch_id, url, at, verdict, status, latency_ms, failed}) — the one artifact family where absent optional fields serialize as null (status, latency_ms) rather than being omitted, so every row is the same shape and any row is quotable alone. Stated here because it is the exception to the omission rule above.",
    key_surfaces: {
      public_key: `${base}${KEY_ARCHITECTURE.public_key_url}`,
      did_web: `${base}/.well-known/did.json`,
      externally_anchored_history: `${base}/.well-known/anchor-log.json`,
      liveness: `${base}/.well-known/liveness.json`,
    },
    related: {
      whose_word: `${base}/attestation — trust model per artifact class, key custody, and what is NOT built here, in its own words.`,
      x402_artifacts: `The signed offers and receipts this store emits during payment follow the x402 offer-receipt extension, not this namespace; conformance vectors at ${base}/.well-known/conformance/offer-receipt-vectors.json and a free checker at POST ${base}/api/conformance/v1.`,
      reference_verifier:
        "https://github.com/seancrecord/scvd-general-store-repo/tree/main/verifier — MIT, zero dependencies, works on any issuer's x402 artifacts; the certificate checks in it implement this page.",
      what_is_not_claimed: `${base}/.well-known/trust.json`,
    },
    honest_limit:
      "This spec is published by the party whose artifacts it describes, and one key signs everything at a time. Naming a format does not make its issuer trustworthy; it makes its issuer CHECKABLE, which is smaller and worth having. Weigh anything load-bearing against /attestation's stated limits before building on it.",
  };
}

namespaceSpecRoutes.get(`/spec/${NAMESPACE}/${NAMESPACE_VERSION}`, (c) =>
  c.json(doc(c.env.STORE_BASE_URL)),
);
// The unversioned path serves the CURRENT version; pin the versioned
// URL in anything durable.
namespaceSpecRoutes.get(`/spec/${NAMESPACE}`, (c) =>
  c.json(doc(c.env.STORE_BASE_URL)),
);
