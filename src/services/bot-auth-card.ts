import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { ProbeTargetRefused, checkProbeTarget, parseProbeTarget } from "@/lib/probe-target";
import { webBotAuthHeaders, DIRECTORY_PATH, DIRECTORY_CONTENT_TYPE } from "@/lib/web-bot-auth";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE SIGNATURE-AGENT CARD — a dated, signed, third-party observation
 * of an agent's Web Bot Auth key directory (2026-08-11, the WBA
 * line's demand test).
 *
 * WHO BUYS IT AND WHY: an agent operator who has stood up HTTP
 * Message Signatures on their crawler needs to show origins and
 * directories that the setup is real — the directory serves, the
 * content type is right, the keys are well-formed, and the directory
 * actually HOLDS the keys it lists (the proof-of-possession
 * signature verifies). A claim like that from the operator is worth
 * their reputation; this card is the same claim from a party with no
 * stake in it, quotable at a stable URL forever. The store runs this
 * exact machinery on its own egress (lib/web-bot-auth.ts), which is
 * how the battery got written: dogfood first, product second.
 *
 * THE LOOK IS FREE (POST /api/bot-auth/check), like every desk here.
 * The card is the free look plus everything a stranger needs to
 * believe it: a signature, a certificate binding, a permanent URL.
 *
 * Rule 43 boundaries, same as the Once-Over: a dated observation of
 * one document at one moment, never an endorsement of the agent, an
 * identity claim about who OPERATES the key, or a statement that any
 * particular request was signed with it.
 */

export const CARD_CRITERIA_VERSION = "signature-agent-directory-v1";

const CARD_SCOPE =
  "One GET of one directory document at one moment, against the named criteria. This reports what the directory served then: it is not an endorsement of the agent behind it, not a statement about who operates the key, and not evidence that any particular request was ever signed with it. An unreachable verdict is a fact about the network path between this store and that host at that moment.";

export interface DirectoryCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface SignatureAgentObservation {
  card_id: string;
  /** What the buyer asked about, exactly as given. */
  subject: string;
  /** The directory URL actually fetched (derived when subject is an origin). */
  directory_url: string;
  observed_at: string;
  criteria: string;
  verdict: "directory_ready" | "not_ready" | "unreachable" | "refused";
  checks: DirectoryCheck[];
  evidence_hash: string;
  scope: string;
}

export interface SignedSignatureAgentCard extends SignatureAgentObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

export interface SignatureAgentCardRecord {
  card: SignedSignatureAgentCard;
  cert_id: string;
  created_at: string;
}

/**
 * An origin becomes its well-known directory URL; a full path is
 * taken as given. The buyer's exact input still rides the artifact
 * as `subject`, so nothing about the derivation is hidden.
 */
export function directoryUrlFor(subject: string): string {
  const url = new URL(subject);
  if (url.pathname === "/" && !url.search) {
    return `${url.origin}${DIRECTORY_PATH}`;
  }
  return url.toString();
}

function base64UrlToHex(value: string): string {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function signatureBytesToHex(sfValue: string): string | null {
  const match = /^:([A-Za-z0-9+/=]+):$/.exec(sfValue.trim());
  if (!match?.[1]) {
    return null;
  }
  const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface DirectoryJwkLike {
  kty?: unknown;
  crv?: unknown;
  x?: unknown;
}

const CARD_TIMEOUT_MS = 8_000;
const MAX_DIRECTORY_BYTES = 64 * 1024;

/**
 * The free battery. Every check is named so a failed card says which
 * brick, and the one check this battery cannot always run says so on
 * its own row rather than passing silently — a proof-of-possession
 * signature over components this checker does not reconstruct is
 * reported as not checked, never as valid.
 */
export async function checkDirectory(
  env: Env,
  directoryUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ checks: DirectoryCheck[]; verdict: SignatureAgentObservation["verdict"] }> {
  const checks: DirectoryCheck[] = [];
  let response: Response;
  try {
    response = await fetchImpl(directoryUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(CARD_TIMEOUT_MS),
      // The checker introduces itself the way it hopes the checked
      // party does: signed, when the store's own egress key is set.
      headers: await webBotAuthHeaders(env, directoryUrl, {
        Accept: DIRECTORY_CONTENT_TYPE,
      }),
    });
  } catch (error) {
    return {
      verdict: "unreachable",
      checks: [
        {
          name: "reachable",
          ok: false,
          detail: `the fetch could not complete: ${String(error)}. A fact about the network path between us and that host at this moment — it does not prove the directory is down.`,
        },
      ],
    };
  }

  checks.push(
    response.status === 200
      ? { name: "status-200", ok: true, detail: "answered 200" }
      : {
          name: "status-200",
          ok: false,
          detail: `answered ${response.status} instead of 200. A verifier fetching this directory off a Signature-Agent header stops here.`,
        },
  );
  if (response.status !== 200) {
    return { verdict: "not_ready", checks };
  }

  const contentType = (response.headers.get("Content-Type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  checks.push(
    contentType === DIRECTORY_CONTENT_TYPE
      ? {
          name: "content-type",
          ok: true,
          detail: `serves ${DIRECTORY_CONTENT_TYPE}`,
        }
      : {
          name: "content-type",
          ok: false,
          detail: `serves ${contentType || "(none)"} instead of ${DIRECTORY_CONTENT_TYPE}. The directory draft names the media type; strict verifiers refuse without it.`,
        },
  );

  const raw = await response.text();
  if (raw.length > MAX_DIRECTORY_BYTES) {
    checks.push({
      name: "jwks-parses",
      ok: false,
      detail: `the document is over ${MAX_DIRECTORY_BYTES} bytes, which this battery declines to parse. A key directory is a small document.`,
    });
    return { verdict: "not_ready", checks };
  }
  let keys: DirectoryJwkLike[] = [];
  try {
    const body = JSON.parse(raw) as { keys?: unknown };
    if (!Array.isArray(body.keys) || body.keys.length === 0) {
      throw new Error("no keys array");
    }
    keys = body.keys as DirectoryJwkLike[];
    checks.push({
      name: "jwks-parses",
      ok: true,
      detail: `a JWK Set with ${keys.length} key${keys.length === 1 ? "" : "s"}`,
    });
  } catch {
    checks.push({
      name: "jwks-parses",
      ok: false,
      detail:
        "the body is not a JWK Set with a non-empty keys array. That is the entire document a verifier comes here for.",
    });
    return { verdict: "not_ready", checks };
  }

  const ed25519Keys = keys.filter(
    (key): key is { kty: string; crv: string; x: string } =>
      key.kty === "OKP" && key.crv === "Ed25519" && typeof key.x === "string",
  );
  checks.push(
    ed25519Keys.length === keys.length
      ? {
          name: "keys-ed25519",
          ok: true,
          detail: "every listed key is OKP/Ed25519 with an x coordinate",
        }
      : {
          name: "keys-ed25519",
          ok: false,
          detail: `${keys.length - ed25519Keys.length} of ${keys.length} keys are not OKP/Ed25519. Ed25519 is the one algorithm the Web Bot Auth drafts (and the verifiers deployed today) accept.`,
        },
  );

  /**
   * PROOF OF POSSESSION, checked only in the shape this battery can
   * honestly reconstruct: a signature tagged for the directory whose
   * covered components are exactly ("@authority"). Anything fancier
   * is reported as not checked — a checker that guesses at a base
   * and calls a mismatch a forgery would be worse than one that
   * names its own limit.
   */
  const input = response.headers.get("Signature-Input") ?? "";
  const signatureHeader = response.headers.get("Signature") ?? "";
  if (!input || !signatureHeader) {
    checks.push({
      name: "proof-of-possession",
      ok: false,
      detail:
        "the response carries no Signature-Input/Signature pair. The directory draft has the directory sign its own authority with each listed key, so a verifier knows the host controls what it publishes.",
    });
    return { verdict: "not_ready", checks };
  }
  const labelMatch = /(?:^|,\s*)([!#$%&'*+\-.^_`|~a-zA-Z0-9]+)=(\("@authority"\);[^,]*tag="http-message-signatures-directory")/.exec(
    input,
  );
  if (!labelMatch?.[1] || !labelMatch[2]) {
    checks.push({
      name: "proof-of-possession",
      ok: false,
      detail:
        'no signature over exactly ("@authority") with tag "http-message-signatures-directory" was found in Signature-Input. One may exist over components this battery does not reconstruct; this check verified nothing either way and says so.',
    });
    return { verdict: "not_ready", checks };
  }
  const label = labelMatch[1];
  const params = labelMatch[2];
  const sigMatch = new RegExp(`(?:^|,\\s*)${label}=(:[A-Za-z0-9+/=]+:)`).exec(
    signatureHeader,
  );
  const signatureHex = sigMatch?.[1] ? signatureBytesToHex(sigMatch[1]) : null;
  if (!signatureHex) {
    checks.push({
      name: "proof-of-possession",
      ok: false,
      detail: `Signature-Input declares "${label}" but the Signature header carries no parseable value for it.`,
    });
    return { verdict: "not_ready", checks };
  }
  const authority = new URL(directoryUrl).host;
  const base = `"@authority": ${authority}\n"@signature-params": ${params}`;
  let verified = false;
  for (const key of ed25519Keys) {
    if (await verifyMessageSignature(base, signatureHex, base64UrlToHex(key.x))) {
      verified = true;
      break;
    }
  }
  checks.push(
    verified
      ? {
          name: "proof-of-possession",
          ok: true,
          detail:
            "the directory's own signature over its authority verifies against a listed key — the host controls what it publishes",
        }
      : {
          name: "proof-of-possession",
          ok: false,
          detail:
            "a directory-tagged signature is present but verifies against none of the listed keys. Either the wrong key is published or the wrong key is signing; a verifier cannot tell which, and neither can we.",
        },
  );

  return {
    verdict: checks.every((check) => check.ok) ? "directory_ready" : "not_ready",
    checks,
  };
}

async function cardEvidenceHash(
  core: Omit<SignatureAgentObservation, "evidence_hash" | "scope">,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(core)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface CardOptions {
  fetch?: typeof fetch;
  now?: Date;
}

/** One fetch, one readout, one signature — the Once-Over's shape. */
export async function performSignatureAgentCard(
  env: Env,
  subject: string,
  options: CardOptions = {},
): Promise<SignedSignatureAgentCard> {
  let directoryUrl = subject;
  let outcome: Awaited<ReturnType<typeof checkDirectory>>;
  try {
    directoryUrl = directoryUrlFor(subject);
    const verdict = checkProbeTarget(parseProbeTarget(directoryUrl), "");
    if (!verdict.ok) {
      throw new ProbeTargetRefused(verdict.reason ?? "refused target");
    }
    outcome = await checkDirectory(env, directoryUrl, options.fetch ?? fetch);
  } catch (error) {
    // The buy door refuses these before money moves; if this branch
    // ever runs, the paid artifact still says only what is true: no
    // request was made, and that is a statement about our law.
    outcome = {
      verdict: "refused",
      checks: [
        {
          name: "probe-target-refused",
          ok: false,
          detail: `no request was made: ${error instanceof Error ? error.message : String(error)} This is a statement about this store's published probe-target law, NOT an observation about that host.`,
        },
      ],
    };
  }
  const core = {
    card_id: `sacard_${newEntryId()}`,
    subject,
    directory_url: directoryUrl,
    observed_at: (options.now ?? new Date()).toISOString(),
    criteria: CARD_CRITERIA_VERSION,
    verdict: outcome.verdict,
    checks: outcome.checks,
  };
  const observation: SignatureAgentObservation = {
    ...core,
    evidence_hash: await cardEvidenceHash(core),
    scope: CARD_SCOPE,
  };
  const { signature, publicKey } = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature,
    public_key: publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/** Stored after the mint so the envelope carries the cert id. */
export async function storeSignatureAgentCard(
  env: Env,
  card: SignedSignatureAgentCard,
  certId: string,
): Promise<SignatureAgentCardRecord> {
  const record: SignatureAgentCardRecord = {
    card,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.PATRONS, 
    KV_KEYS.signatureAgentCard(card.card_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getSignatureAgentCard(
  env: Env,
  cardId: string,
): Promise<SignatureAgentCardRecord | null> {
  return kvGetJson<SignatureAgentCardRecord>(env.PATRONS, 
    KV_KEYS.signatureAgentCard(cardId),
    "json",
  );
}
