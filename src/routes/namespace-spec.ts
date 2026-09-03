import { Hono } from "hono";
import { ASSURANCE_LADDER } from "@/store/assurance";
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
      /**
       * THE DIVERGENCE, NAMED (2026-08-18). The IETF drafts converging
       * on agent-payment receipts (draft-hopley-x402-canonicalisation-
       * jcs-v1, draft-vauban-x402-*) pin RFC 8785 JCS — sorted keys —
       * as the canonical preimage. We do not, and a spec that stayed
       * silent about that would read as either ignorance of the field
       * or a claim of compatibility, both false. Saying it plainly is
       * what lets a tool that speaks both disciplines bridge them.
       */
      relation_to_jcs_rfc8785:
        "This namespace's PRIMARY canonical form is DECLARED-FIELD-ORDER serialization, not RFC 8785 (JCS). JCS derives byte order by sorting keys; this spec derives it from the field lists published on this page, which are part of the contract. The two disciplines are equally deterministic and NOT byte-compatible: re-canonicalizing an scvd artifact's primary signature through JCS produces different bytes and a failed verification. This is deliberate and permanent for artifacts already issued — this store's signatures are forever, and migrating a preimage discipline would orphan every one of them (the frozen_prefix rule below is the same commitment at field level).",
      jcs_dual_emit:
        "SINCE 2026-08-18 every artifact minted here ALSO carries `signature_jcs`: a second ed25519 signature, same key, same field subset, over the RFC 8785 (JCS) canonicalization — sorted keys, ECMAScript number and string serialization, no whitespace. Verify it with any RFC 8785 implementation: jcs(signed_fields_as_object) -> utf8 bytes -> ed25519_verify against the same public_key. The primary signature remains the authoritative one; signature_jcs is interop, so any tool that verifies raw RFC 8785 bytes can check scvd artifacts without knowing our field lists. That is the JCS byte primitive only: the IETF receipt drafts that build on RFC 8785 add pre-canonicalisation rules our artifacts do not meet (integer-millisecond timestamps, NFC strings), and none of them assigns a role to an ed25519 signature, so signature_jcs verifies under RFC 8785, not under any draft — see relation_to_other_x402_receipt_work. Artifacts minted before 2026-08-18 carry no signature_jcs, exactly the way certificates minted before 2026-07-30 lack later fields: history, not a defect. Where served, signature_jcs_covers states this in place, and /api/verify reports the JCS signature's own validity separately from the primary's — never collapsed into one boolean.",
      /**
       * THE THREE DRAFTS, READ IN FULL (2026-09-03, CV at the keeper's
       * request; the prompt is docs/bylines/CV_PROMPT_IETF_2026-09.md).
       * This replaces the 2026-08-20 paragraph, which overstated two
       * things and is on /corrections for it: it described the vauban
       * family by a scope its consolidated draft has since deferred
       * to companion documents, and it said signature_jcs "already
       * verifies under" the drafts' discipline, when both drafts add
       * pre-canonicalisation rules (integer-millisecond timestamps,
       * NFC strings) our ISO-8601-dated artifacts do not meet and
       * neither assigns any role to an ed25519 signature. Stated per
       * draft now, at the revision read, so staleness is visible.
       */
      relation_to_other_x402_receipt_work: {
        as_of: "2026-09-03",
        standing:
          "Three Internet-Drafts on the IETF datatracker overlap this namespace's territory. What each defines, what this store's format shares with it, and where the two do not align, stated per draft at the revision read. All three are drafts, not standards; nothing on this page is bound by any of them.",
        drafts: [
          {
            draft: "draft-hopley-x402-canonicalisation-jcs-v1",
            revision_read: "-04",
            url: "https://datatracker.ietf.org/doc/draft-hopley-x402-canonicalisation-jcs-v1/",
            defines:
              "A canonicalisation discipline for agentic-payment receipts: JCS (RFC 8785) as the canonical preimage form, plus pre-canonicalisation schema-normalisation rules (integer-millisecond timestamps, pinned field names, preserved array order, type validation before canonicalisation) and an in-band canon_version pin, identified as urn:x402:canonicalisation:jcs-rfc8785-v1.",
            shared:
              "The RFC 8785 byte discipline itself, carried here by signature_jcs (dual-emitted on every artifact minted since 2026-08-18); SHA-256 over canonical JSON with lowercase-hex digests; field names and ordering treated as load-bearing.",
            not_aligned:
              "Our primary canonical form is declared-field-order serialisation, not JCS, and that is permanent for artifacts already issued; our artifacts carry ISO 8601 date strings, which this draft's Substrate Rule 2 (section 4.1) forbids in canonical preimages; our artifacts carry no canon_version field. The draft defines no receipt fields of its own (what a receipt binds is left to the formats that reference it) and specifies no anchoring and no post-quantum discipline; we have no post-quantum discipline either, and our anchoring is OpenTimestamps into Bitcoin for the records that anchor at all.",
          },
          {
            draft: "draft-hopley-x402-compliance-receipt",
            revision_read: "-02",
            url: "https://datatracker.ietf.org/doc/draft-hopley-x402-compliance-receipt/",
            defines:
              "A categorical compliance-screening receipt for agentic payments: ALLOW, REFER or DENY recorded at admission time under named statutory retention obligations, with six required fields (payer_ref, screen_result, screen_timestamp_ms, screen_provider_did, jurisdiction_flags, canon_version) and a hash-linked audit chain, canonicalised under the same jcs-rfc8785-v1 discipline.",
            shared:
              "The RFC 8785 layer via our signature_jcs; SHA-256 content hashing of canonical bytes; the issuer named by a resolvable key reference (their screen_provider_did; our published key and did:web document).",
            not_aligned:
              "A different artifact class. Theirs records a screening decision about a payer before money moves and binds payer_ref, outcome, provider, jurisdictions and time: no recipient, no amount, no resource, no settlement. Our certificate binds payer, recipient (asset, network, payTo), amount (paid_usdc), resource (item), time (date) and the settlement transaction. We emit no screening receipt, our canonical forms differ as above, anchoring is out of scope there (ours is OpenTimestamps into Bitcoin), and neither format carries any post-quantum discipline; we have none.",
          },
          {
            draft: "draft-vauban-x402-consolidated",
            revision_read: "-00",
            url: "https://datatracker.ietf.org/doc/draft-vauban-x402-consolidated/",
            defines:
              "A negotiable receipt-format extension with three variants (a Stwo Circle STARK proof; a hybrid ES256K + ML-DSA-65 dual signature; a classical ES256K JWS fallback) over a JCS preimage discipline, a two-axis post-quantum discipline mapped to the NIST PQC migration roadmap, and a Starknet on-chain anchor format with a canonical anchor tuple and Cairo event layout. The claim algebra, the payment-lifecycle FSM and the delegation binding are deferred to companion documents with no normative content in this draft (section 1.3).",
            shared:
              "The RFC 8785 preimage discipline under the same jcs-rfc8785-v1 marker (our signature_jcs layer); the same design goal, a self-contained receipt a stranger verifies offline; and their 32-byte action_ref, binding a payment artifact to a work-layer artifact, is the same construction as our attests digest, differing in name and in that ours states what was digested per item class.",
            not_aligned:
              "Signature scheme: theirs is ES256K, ML-DSA-65 or a STARK proof; ours is one ed25519 signature. Canonical form: as above, our primary form is declared-field-order, and our ISO date strings fail their integer-timestamp_ms and NFC rules (sections 3.4, 3.6, 3.7). Anchoring: theirs is a Starknet on-chain tuple verified over the Starknet JSON-RPC; ours is OpenTimestamps proofs committed into Bitcoin (the key-state log on each state change, the corpus weekly). Post-quantum: they specify a full two-axis discipline with a 2025 to 2030 migration window; we have none: one classical ed25519 key at a time, no STARK, no ML-DSA, no migration plan, said here rather than implied.",
          },
        ],
        conformance_desk:
          "The conformance desk does not parse either draft family's receipt format today; it checks artifacts under the x402 offer-receipt extension, not these drafts. Whether it should is a separate decision, not made on this page.",
        corrected:
          "2026-09-03: this block replaces a 2026-08-20 paragraph that described the vauban family by a scope its consolidated draft defers, and said signature_jcs already verified under the drafts' discipline. Neither was right; the entry is on /corrections.",
      },
    },
    /**
     * THE AUTHORITY PACK (P6, 2026-08-21 — three outside reads asked
     * the same question: "SCVD can sign observations, but why should
     * others trust SCVD as an observer?"). The answer this spec can
     * give is RECOMPUTABILITY: a worked vector with a published
     * throwaway key, a verifier small enough to read whole, and the
     * incident/revocation posture stated as facts about what exists
     * rather than promises about what would happen.
     */
    test_vectors: {
      what:
        "A fully worked example of both signature disciplines, with a PUBLISHED throwaway key. Run it before trusting your verifier: if your implementation cannot reproduce these two verifications, the bug is on your side of the wire, and finding that out costs nothing.",
      key_warning:
        "The vector key below signs NOTHING real. It appears in no key history and never will; a real artifact presenting it must fail step 1 of verification (key not in the store's history).",
      vector: {
        seed_hex: "42".repeat(32),
        public_key:
          "2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12",
        served_payload_exact_bytes:
          '{"note":"This vector signs nothing real; its key is published on purpose and appears in no key history.","artifact":"test_vector","issued_at":"2026-08-21T00:00:00.000Z"}',
        primary_signature_over_served_bytes:
          "194853ba44ed91d5f178d0ac225c5aed912c21f969118233f1e40dda9caa9f4af38cea1b2834ddd9cb99e8b2347c3025738d64e41eb5b725ee7ccee2ce4fd60e",
        jcs_canonicalization_of_same_payload:
          '{"artifact":"test_vector","issued_at":"2026-08-21T00:00:00.000Z","note":"This vector signs nothing real; its key is published on purpose and appears in no key history."}',
        signature_jcs_over_jcs_bytes:
          "532f58e1723cf5d9227b54cf8aaf809a6104cdc8fa2173d264d95920b7ffe05a6c4ecc7998e1f090165e3fa2c6057388be5a61468a99fbbaf5523f84acc5c009",
        the_lesson:
          "The payload's keys are served UNSORTED on purpose: the two disciplines produce different bytes and different signatures over the same object. A verifier that conflates them will pass one and fail the other, and this vector catches it.",
      },
      reference_verifier_js:
        'async function verify(message, signatureHex, publicKeyHex) { const hex = (h) => Uint8Array.from(h.match(/.{2}/g).map((b) => parseInt(b, 16))); const key = await crypto.subtle.importKey("raw", hex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]); return crypto.subtle.verify({ name: "Ed25519" }, key, hex(signatureHex), new TextEncoder().encode(message)); } // WebCrypto Ed25519 (Node 19+, Deno, Cloudflare Workers, modern browsers). message is signed_payload verbatim for the primary, or your own RFC 8785 canonicalization for signature_jcs.',
      incident_policy:
        "Stated as facts about what exists. ONE live signing key, one operator; a stolen live key would sign indistinguishably from the store — every artifact-selling surface says so. On suspected compromise, what the machinery already supports: the key is retired in the directory with an end-of-service date, a new key enters with its start date, the state change is committed into the Bitcoin-anchored key chain (which proves WHEN, never WHO SHOULD HAVE), and a corrections entry names the incident window. Containment is the service window: artifacts attribute to the key that signed them WITHIN its dated service, so a compromise bounds the doubt to the window between last-known-good anchor and retirement, never to the whole history. What does NOT exist yet, said plainly: a pre-announced successor key (the single-point-of-failure every outside read names; open ruling F3), and any co-signer or independent witness.",
      revocation_story:
        "There is no revocation registry, and this spec does not pretend one. Three mechanisms do the honest work instead: (1) EXPIRY — artifacts that age (passports) carry their own expiry and freshness arithmetic, and verifiers should refuse expired evidence without asking anybody; (2) WITHDRAWAL — a claim this store no longer stands behind is withdrawn IN PUBLIC at its original URL, the notice leading both dialects while the signed bytes stay byte-identical and the withdrawal rides OUTSIDE the signed payload (precedent: the August 2026 field report — a retraction must never rewrite what the signature covers); (3) KEY RETIREMENT — see incident_policy. /api/verify reports what a signature IS (valid over these bytes, by this key, in this service window), never that the claim remains endorsed.",
    },
    /**
     * THE LADDER ON THE SPEC (2026-08-20): the five levels are store
     * canon in store/assurance.ts; the spec serves them so a machine
     * reader learns what a valid signature is evidence OF without
     * visiting the human room at /trust.
     */
    assurance_levels: {
      what:
        "Every artifact verifies identically; its LEVEL says what a valid signature claims. Levels describe this store's claim, never the subject's quality.",
      levels: ASSURANCE_LADDER,
      human_room: `${base}/trust`,
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
      "The watch families are the exception to the omission rule above: absent optional fields serialize as null rather than being omitted, so every row is the same shape and any row is quotable alone. Standing watch rows sign JSON.stringify({watch_id, url, at, verdict, status, latency_ms, failed}); conformance watch passes sign JSON.stringify({watch_id, url, at, verdict, status, failed, advisories}) — exactly those keys, exactly that order, null for an absent status or latency.",
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
