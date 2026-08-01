/**
 * x402-verify — a zero-dependency verifier for x402 Signed Offers &
 * Receipts, did:web identity, and key history.
 *
 * WHAT THIS IS FOR. The x402 Signed Offers & Receipts extension lets a
 * seller commit to its terms before money moves and prove delivery
 * after. Both artifacts are JWS (RFC 7515 compact, alg EdDSA over
 * Ed25519) whose `kid` is a DID URL. Checking one properly means doing
 * FOUR separate things, and the whole point of this file is that they
 * are separate:
 *
 *   1. Parse the JWS without trusting any of it.
 *   2. Resolve the kid to a key you got from somewhere other than the
 *      artifact — otherwise you are asking the artifact to vouch for
 *      itself.
 *   3. Check the signature against that key.
 *   4. Check the payload against the spec's schema.
 *
 * STEPS 3 AND 4 ARE NOT THE SAME CHECK AND A VERIFIER THAT RUNS ONLY
 * ONE IS BROKEN. A payload can carry a perfectly valid signature over
 * a schema-invalid body: the signer really did sign it, and it is
 * still not a conformant offer. Our published conformance vectors
 * include exactly that case as a teaching artifact because it is the
 * mistake real implementations make.
 *
 * WHAT IT IS NOT. This verifies CRYPTOGRAPHY AND SHAPE. It cannot tell
 * you whether the seller actually delivered what it promised — no
 * offline check can, because that is a fact about the world rather
 * than about bytes. Anyone claiming otherwise is selling you a feeling.
 *
 * NOT SPECIFIC TO ANY STORE, including the one that wrote it. It takes
 * a DID or a raw key and checks what you hand it. It was written by
 * scvd.store, which runs the same extension and publishes the vectors
 * this file is tested against; there is no call home in here and
 * nothing about scvd.store is privileged.
 *
 * RUNTIME. Zero dependencies. Ed25519 verification uses WebCrypto
 * (Node 18.4+, Deno, Bun, Cloudflare Workers, recent browsers). If
 * your runtime lacks Ed25519 in WebCrypto, pass your own `verify`
 * function — the crypto is a seam on purpose, not a lock-in.
 *
 * Licence: MIT, same as the repository it ships in.
 */

/** Spec §4.2 — every field an offer must carry. */
export const OFFER_REQUIRED_FIELDS = [
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
  "validUntil",
];

/** Spec §5.2 — every field a receipt must carry. `transaction` is optional. */
export const RECEIPT_REQUIRED_FIELDS = [
  "version",
  "network",
  "resourceUrl",
  "payer",
  "issuedAt",
];

/** base64url -> bytes, with no dependency and no silent success. */
export function decodeBase64Url(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeJsonSegment(segment) {
  const bytes = decodeBase64Url(segment);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function hexToBytes(hex) {
  const clean = typeof hex === "string" ? hex.replace(/^0x/, "") : "";
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Split a compact JWS into its parts WITHOUT trusting any of them.
 * The signing input is the exact ASCII of the first two segments and
 * the dot between them, per RFC 7515 — recomputing it from the parsed
 * objects instead is the classic way to get a verifier that says no
 * to valid artifacts.
 */
export function parseJws(jws) {
  if (typeof jws !== "string") {
    return { ok: false, problem: "not a string" };
  }
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return { ok: false, problem: `expected 3 segments, got ${parts.length}` };
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeJsonSegment(headerSegment);
  const payload = decodeJsonSegment(payloadSegment);
  const signature = decodeBase64Url(signatureSegment);
  if (!header) return { ok: false, problem: "header is not base64url JSON" };
  if (!payload) return { ok: false, problem: "payload is not base64url JSON" };
  if (!signature) return { ok: false, problem: "signature is not base64url" };
  return {
    ok: true,
    header,
    payload,
    signature,
    signingInput: `${headerSegment}.${payloadSegment}`,
  };
}

/** Ed25519 verification via WebCrypto, or whatever you inject. */
export async function verifyEd25519(signingInput, signature, publicKey, options = {}) {
  if (typeof options.verify === "function") {
    return Boolean(await options.verify(signingInput, signature, publicKey));
  }
  const subtle = options.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "No WebCrypto available. Pass options.verify to supply your own Ed25519 check.",
    );
  }
  try {
    const key = await subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, [
      "verify",
    ]);
    return await subtle.verify(
      { name: "Ed25519" },
      key,
      signature,
      new TextEncoder().encode(signingInput),
    );
  } catch {
    return false;
  }
}

/**
 * did:web -> the document and its Ed25519 keys.
 *
 * Follows the did:web method: the domain (and optional path) becomes
 * an https URL for did.json. Keys come back keyed by their FULL kid so
 * a caller can match the artifact's kid exactly rather than guessing
 * which key was meant.
 */
export async function resolveDidWeb(did, options = {}) {
  if (typeof did !== "string" || !did.startsWith("did:web:")) {
    return { ok: false, problem: "not a did:web identifier" };
  }
  const withoutMethod = did.slice("did:web:".length).split("#")[0];
  const segments = withoutMethod.split(":").map(decodeURIComponent);
  const host = segments[0].replace(/%3A/gi, ":");
  const path = segments.slice(1);
  const url =
    path.length > 0
      ? `https://${host}/${path.join("/")}/did.json`
      : `https://${host}/.well-known/did.json`;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return { ok: false, problem: "no fetch available; pass options.fetch" };
  }
  let document;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return { ok: false, problem: `did document HTTP ${response.status}`, url };
    }
    document = await response.json();
  } catch (error) {
    return { ok: false, problem: `did document unreachable: ${String(error)}`, url };
  }
  const keys = new Map();
  for (const method of document?.verificationMethod ?? []) {
    const jwk = method?.publicKeyJwk;
    if (jwk?.kty === "OKP" && jwk?.crv === "Ed25519" && typeof jwk.x === "string") {
      const bytes = decodeBase64Url(jwk.x);
      if (bytes) keys.set(String(method.id), bytes);
    }
  }
  return { ok: true, document, keys, url };
}

function schemaProblems(payload, requiredFields, kind) {
  const problems = [];
  if (typeof payload !== "object" || payload === null) {
    return ["payload is not an object"];
  }
  for (const field of requiredFields) {
    if (!(field in payload)) {
      problems.push(`missing required field: ${field}`);
    }
  }
  if ("version" in payload && payload.version !== 1) {
    problems.push(`version must be 1 for this revision, got ${payload.version}`);
  }
  if (kind === "offer" && "validUntil" in payload) {
    if (typeof payload.validUntil !== "number") {
      problems.push("validUntil must be a number (seconds since the epoch)");
    }
  }
  if (kind === "receipt" && "issuedAt" in payload) {
    if (typeof payload.issuedAt !== "number") {
      problems.push("issuedAt must be a number (seconds since the epoch)");
    }
  }
  return problems;
}

export function validateOfferPayload(payload) {
  return schemaProblems(payload, OFFER_REQUIRED_FIELDS, "offer");
}

export function validateReceiptPayload(payload) {
  return schemaProblems(payload, RECEIPT_REQUIRED_FIELDS, "receipt");
}

/**
 * Is an offer still live at `now`?
 *
 * LEEWAY IS THE CALLER'S, AND IT DEFAULTS TO GENEROUS-BUT-STATED.
 * Issuance should be strict and consumption tolerant: the issuer's
 * clock and yours will differ by seconds, and a 300-second window
 * makes a few seconds of skew harmless. This is separate from schema
 * validity on purpose — an expired offer was a perfectly good offer.
 */
export function isOfferLive(payload, options = {}) {
  const leewaySeconds = options.leewaySeconds ?? 5;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload?.validUntil !== "number") {
    return { live: false, reason: "no numeric validUntil" };
  }
  const live = now <= payload.validUntil + leewaySeconds;
  return {
    live,
    reason: live
      ? `valid until ${payload.validUntil} (+${leewaySeconds}s leeway)`
      : `expired at ${payload.validUntil}, now ${now}`,
  };
}

/**
 * The whole check, as separate reported findings rather than one
 * boolean. A caller that only wants a yes/no reads `ok`; a caller
 * debugging their own implementation reads `checks` and learns which
 * of the four things failed, which is the difference between a
 * verifier and a wall.
 */
export async function verifyArtifact(jws, options = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  const parsed = parseJws(jws);
  if (!parsed.ok) {
    add("parse", false, parsed.problem);
    return { ok: false, checks };
  }
  add("parse", true, "three base64url segments, header and payload are JSON");

  const alg = parsed.header?.alg;
  const algOk = alg === "EdDSA";
  add("alg", algOk, algOk ? "EdDSA" : `expected EdDSA, got ${String(alg)}`);

  const kid = parsed.header?.kid;
  add(
    "kid",
    typeof kid === "string" && kid.length > 0,
    typeof kid === "string" ? kid : "no kid in header",
  );

  const kind =
    options.kind ??
    ("payer" in (parsed.payload ?? {}) ? "receipt" : "offer");
  const problems =
    kind === "receipt"
      ? validateReceiptPayload(parsed.payload)
      : validateOfferPayload(parsed.payload);
  add(
    "schema",
    problems.length === 0,
    problems.length === 0
      ? `conforms to the ${kind} schema`
      : problems.join("; "),
  );

  let publicKey = options.publicKey ?? null;
  if (typeof publicKey === "string") publicKey = hexToBytes(publicKey);

  if (!publicKey && typeof kid === "string" && kid.startsWith("did:web:")) {
    const resolved = await resolveDidWeb(kid, options);
    if (!resolved.ok) {
      add("key-resolution", false, resolved.problem);
    } else {
      const matched = resolved.keys.get(kid);
      if (matched) {
        publicKey = matched;
        add("key-resolution", true, `kid found in ${resolved.url}`);
      } else {
        add(
          "key-resolution",
          false,
          `kid is not in the DID document's verificationMethod (${resolved.url}). ` +
            "A retired key resolves here too if the issuer publishes key history; " +
            "an unknown kid means the artifact is not attributable to this DID.",
        );
      }
    }
  } else if (!publicKey) {
    add(
      "key-resolution",
      false,
      "no publicKey given and the kid is not a did:web URL",
    );
  } else {
    add("key-resolution", true, "public key supplied by the caller");
  }

  if (publicKey) {
    const valid = await verifyEd25519(
      parsed.signingInput,
      parsed.signature,
      publicKey,
      options,
    );
    add(
      "signature",
      valid,
      valid
        ? "signature verifies over ASCII(header.payload)"
        : "signature does NOT verify against the resolved key",
    );
  } else {
    add("signature", false, "not checked: no key to check against");
  }

  if (kind === "offer" && options.checkExpiry !== false) {
    const live = isOfferLive(parsed.payload, options);
    // Reported, never folded into ok: an expired offer is a valid
    // artifact and a caller may be auditing history rather than buying.
    checks.push({
      name: "expiry",
      ok: live.live,
      detail: live.reason,
      advisory: true,
    });
  }

  const ok = checks.every((check) => check.advisory || check.ok);
  return { ok, checks, header: parsed.header, payload: parsed.payload, kind };
}

/**
 * OPTIONAL: check a key against an issuer's externally anchored key
 * history.
 *
 * Offline verification answers "did this key sign this?". It cannot
 * answer "was this key the issuer's key at the time, and can the
 * issuer prove they did not rewrite that later?" — because a
 * self-hosted key registry can be edited after the fact.
 *
 * Some issuers publish an append-only hash chain of their key state at
 * /.well-known/anchor-log.json and submit its digests to
 * OpenTimestamps, which anchors them into Bitcoin. Where that exists,
 * this reads it and tells you when the key first appears and whether
 * that entry's timestamp is Bitcoin-confirmed or still pending.
 *
 * GENERIC BY DESIGN. Any issuer can publish this shape; nothing here
 * is specific to whoever wrote this library. An issuer without one
 * simply returns `available: false`, which is information rather than
 * a failure — most do not have one, and that is the honest state of
 * the ecosystem today.
 *
 * WHAT IT STILL DOES NOT PROVE: an anchor proves WHEN a key state was
 * committed, never WHO SHOULD HAVE held it. A thief with the key could
 * anchor too. This bounds a compromise window; it does not prevent one.
 */
export async function checkAnchoredKeyHistory(did, publicKeyHex, options = {}) {
  if (typeof did !== "string" || !did.startsWith("did:web:")) {
    return { available: false, reason: "not a did:web identifier" };
  }
  const wanted = String(publicKeyHex ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  if (wanted.length === 0) {
    // Without this guard an empty key would match an entry that simply
    // omitted the field, and the function would answer "found" to a
    // question nobody asked.
    return { available: false, reason: "no public key given to look for" };
  }
  const url = anchorLogUrlFor(did);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return { available: false, reason: "no fetch available" };
  }
  let log;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {
        available: false,
        reason: `no anchor log at ${url} (HTTP ${response.status})`,
      };
    }
    log = await response.json();
  } catch (error) {
    return {
      available: false,
      reason: `anchor log unreachable: ${String(error)}`,
    };
  }

  const entries = Array.isArray(log?.entries) ? log.entries : [];
  if (entries.length === 0) {
    return { available: true, url, found: false, reason: "anchor log is empty" };
  }

  // Recompute the chain BEFORE reading anything off it. An unverified
  // chain is just a web page making claims about itself.
  const chain = await verifyAnchorChain(log, options);

  const matches = entries
    .filter((entry) => snapshotNamesKey(entry?.snapshot, wanted))
    .sort((a, b) => sequenceOf(a) - sequenceOf(b));
  if (matches.length === 0) {
    return {
      available: true,
      url,
      found: false,
      chain_ok: chain.ok,
      chain_problems: chain.problems,
      reason:
        "this key does not appear anywhere in the issuer's anchored key history",
    };
  }

  const first = matches[0];
  const firstSequence = sequenceOf(first);
  /**
   * A LATER CONFIRMED ENTRY VOUCHES FOR AN EARLIER ONE — but only if
   * the chain between them actually links, which is why this reads
   * `chain.ok` rather than taking the log's word. Each entry commits
   * to the digest before it, so one Bitcoin-confirmed digest at
   * sequence N puts every entry at or below N on the wrong side of
   * rewriting. With a broken chain that inference is void, and we
   * fall back to demanding the matching entry be confirmed itself.
   */
  const voucher = entries
    .filter((entry) => entry?.ots?.status === "complete")
    .filter((entry) =>
      chain.ok
        ? sequenceOf(entry) >= firstSequence
        : sequenceOf(entry) === firstSequence,
    )
    .sort((a, b) => sequenceOf(a) - sequenceOf(b))[0];

  return {
    available: true,
    url,
    found: true,
    chain_ok: chain.ok,
    chain_problems: chain.problems,
    first_seen_at: first?.snapshot?.taken_at ?? null,
    first_seen_sequence: Number.isFinite(firstSequence) ? firstSequence : null,
    bitcoin_confirmed: Boolean(voucher),
    /**
     * Handed back so the caller can settle the question themselves.
     * We do not run `ots verify` — that needs a Bitcoin header source
     * and this file has no dependencies — so `bitcoin_confirmed` is
     * the ISSUER'S CLAIM about their own proof, checked for chain
     * position but not against Bitcoin. The proof is right here;
     * verifying it is one command and nobody should take our word.
     */
    ots_proof_base64: voucher?.ots?.proof_base64 ?? null,
    ots_status_is_unverified_claim: true,
    /**
     * THE COMPARISON THAT ACTUALLY CATCHES BACKDATING, named because
     * running `ots verify` alone does not do it. That command proves
     * the digest existed by some block; it says nothing about the date
     * the SNAPSHOT claims. An entry claiming an old taken_at whose
     * proof lands in a much later block was written after the fact.
     * The chain checks above prove internal consistency; only this one
     * ties the log to time the issuer does not control.
     */
    settle_it_yourself:
      "Run `ots verify` on ots_proof_base64, then compare the Bitcoin block time it reports against first_seen_at. Close together means the entry was committed when it says. A much later block means the snapshot was backdated, which no amount of internal chain consistency would reveal.",
    reason: !chain.ok
      ? `the published chain does not recompute (${chain.problems.length} problem(s)); treat every claim on it as unbacked`
      : voucher
        ? "key appears in the chain at or below a Bitcoin-confirmed entry; run `ots verify` on ots_proof_base64 to confirm the timestamp independently"
        : "key appears in an intact chain, but no entry at or after it is Bitcoin-confirmed yet (a pending proof is a calendar's promise, not a commitment)",
  };
}

/** did:web -> the host-rooted anchor-log URL, ports decoded per did:web. */
function anchorLogUrlFor(did) {
  const host = did.slice("did:web:".length).split("#")[0].split(":")[0];
  return `https://${host.replace(/%3A/gi, ":")}/.well-known/anchor-log.json`;
}

function sequenceOf(entry) {
  const value = entry?.snapshot?.sequence;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function snapshotNamesKey(snapshot, wanted) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const current = String(snapshot.current_public_key ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  if (current.length > 0 && current === wanted) return true;
  const retired = Array.isArray(snapshot.retired_keys)
    ? snapshot.retired_keys
    : [];
  return retired.some((key) => {
    const hex = String(key?.public_key ?? "")
      .replace(/^0x/, "")
      .toLowerCase();
    return hex.length > 0 && hex === wanted;
  });
}

/**
 * The canonical byte string an anchor snapshot hashes to.
 *
 * DERIVED, NEVER READ OFF THE PAGE. A log that publishes both a
 * snapshot and the string it claims to have hashed can publish two
 * different things — show you an innocent snapshot and hash a
 * different one. So this rebuilds the string from the snapshot's own
 * fields in the documented order and ignores any `canonical_form` the
 * issuer supplied. Unknown fields are dropped rather than appended,
 * because a hash that grows with whatever the issuer adds is not a
 * fixed form.
 */
export function canonicalizeAnchorSnapshot(snapshot) {
  const retired = Array.isArray(snapshot?.retired_keys)
    ? snapshot.retired_keys
    : [];
  return JSON.stringify({
    version: snapshot?.version,
    sequence: snapshot?.sequence,
    taken_at: snapshot?.taken_at,
    previous_digest: snapshot?.previous_digest ?? null,
    current_public_key: snapshot?.current_public_key,
    retired_keys: [...retired]
      .map((key) => ({
        public_key: String(key?.public_key ?? ""),
        retired_on: String(key?.retired_on ?? ""),
      }))
      .sort((a, b) =>
        a.retired_on === b.retired_on
          ? a.public_key.localeCompare(b.public_key)
          : a.retired_on.localeCompare(b.retired_on),
      ),
    artifacts_issued_total: snapshot?.artifacts_issued_total,
  });
}

/** SHA-256 hex. WebCrypto by default; injectable like `verify` is. */
async function sha256Hex(text, options = {}) {
  if (typeof options.digest === "function") {
    return options.digest(text);
  }
  const bytes = new TextEncoder().encode(text);
  const hashed = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Recompute an anchor log end to end: every digest, every link.
 *
 * This is the whole reason the anchor log is worth more than a
 * sentence on a website. Three things are checked, and each catches a
 * different lie:
 *
 *   - REHASH. sha256 of the canonical snapshot must equal the
 *     published digest. Catches an edited snapshot.
 *   - LINK. `previous_digest` must equal the previous entry's actual
 *     recomputed digest. Catches an edited-and-rehashed snapshot,
 *     because the next entry still commits to the old digest.
 *   - SEQUENCE. Consecutive published entries must step by one.
 *     Catches a deleted entry, which the link check alone would miss
 *     if the deletion took a matched pair with it.
 *
 * A log that does not start at sequence 1 is NOT reported as broken —
 * it may simply be paged or capped — but it is reported, because
 * "the history before this point was not published here" is
 * something a reader should be told rather than left to assume.
 */
export async function verifyAnchorChain(log, options = {}) {
  const entries = Array.isArray(log?.entries) ? log.entries : [];
  const problems = [];
  const notes = [];
  if (entries.length === 0) {
    return { ok: true, problems, notes, checked: 0 };
  }

  let previousDigest = null;
  let previousSequence = null;
  for (const entry of entries) {
    const snapshot = entry?.snapshot;
    const sequence = sequenceOf(entry);
    const label = Number.isFinite(sequence) ? `sequence ${sequence}` : "an entry";
    if (!snapshot || typeof snapshot !== "object") {
      problems.push(`${label}: no snapshot published, so nothing can be checked`);
      previousDigest = null;
      previousSequence = sequence;
      continue;
    }
    if (!Number.isFinite(sequence)) {
      problems.push("an entry has no numeric sequence");
    }

    const canonical = canonicalizeAnchorSnapshot(snapshot);
    let recomputed;
    try {
      recomputed = await sha256Hex(canonical, options);
    } catch (error) {
      problems.push(`${label}: could not hash (${String(error)})`);
      previousDigest = null;
      previousSequence = sequence;
      continue;
    }
    if (recomputed !== String(entry?.digest ?? "").toLowerCase()) {
      problems.push(
        `${label}: published digest does not match the published snapshot`,
      );
    }
    if (
      typeof entry?.canonical_form === "string" &&
      entry.canonical_form !== canonical
    ) {
      problems.push(
        `${label}: the issuer's canonical_form is not the snapshot they published`,
      );
    }

    if (previousSequence === null) {
      if (sequence !== 1) {
        notes.push(
          `chain starts at sequence ${sequence}; entries before it were not published here`,
        );
      }
      if (sequence === 1 && snapshot.previous_digest !== null) {
        problems.push("sequence 1: genesis entry claims a previous digest");
      }
    } else {
      if (Number.isFinite(sequence) && sequence !== previousSequence + 1) {
        problems.push(
          `gap between sequence ${previousSequence} and ${sequence}: an entry is missing`,
        );
      }
      if (
        previousDigest !== null &&
        String(snapshot.previous_digest ?? "").toLowerCase() !== previousDigest
      ) {
        problems.push(
          `${label}: previous_digest does not match the entry before it`,
        );
      }
    }

    previousDigest = recomputed;
    previousSequence = sequence;
  }

  return { ok: problems.length === 0, problems, notes, checked: entries.length };
}

/** A one-line human summary; handy in CI logs. */
export function formatResult(result) {
  const lines = result.checks.map(
    (check) =>
      `${check.ok ? "PASS" : check.advisory ? "NOTE" : "FAIL"}  ${check.name}: ${check.detail}`,
  );
  return `${result.ok ? "VERIFIED" : "REJECTED"}\n${lines.join("\n")}`;
}
