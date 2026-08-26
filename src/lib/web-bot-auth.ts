import { signMessage } from "@/lib/signing";
import { outboundHeaders } from "@/lib/identity";

/**
 * WEB BOT AUTH — the store's egress, cryptographically signed.
 *
 * Implements the IETF Web Bot Auth pair (draft-meunier-web-bot-auth-
 * architecture: RFC 9421 HTTP Message Signatures over ed25519, plus
 * the http-message-signatures-directory document) on the requests
 * this store MAKES. The user-agent line in lib/identity.ts says who
 * we are; anybody can type that string. These headers prove it, and
 * an origin that has never heard of us can check the proof against
 * our published directory without asking us — the same trust shape
 * as everything else this store signs.
 *
 * DOGFOOD FIRST, PRODUCT MAYBE. Shipped 2026-08-11 as the store
 * signing its own probes (preflight, watches, ward round, phantom
 * checks) and serving its own key directory. If verified crawler
 * identity becomes a thing agents pay for, most of that product is
 * this file; if it never does, the store's probes still carry
 * verifiable identity into an ecosystem where origins increasingly
 * gate on it — Cloudflare verifies these signatures on inbound
 * traffic today.
 *
 * DECORATION FAILS OPEN (AT_SCALE rule 7's other half). The key is
 * the optional WBA_SIGNING_KEY secret; unset or malformed, every
 * caller gets exactly the unsigned headers it sent before this file
 * existed, and a signing failure mid-request falls back the same
 * way. A probe that cannot introduce itself politely still probes:
 * watch rows owed to paying customers never hang on a courtesy.
 *
 * A SEPARATE KEY FROM SIGNING_KEY, DELIBERATELY. The artifact key's
 * compromise story is written into /attestation and a handover
 * protocol; an egress key is a lower-stakes credential that should
 * be rotatable without touching either. One key wearing both hats
 * would couple the two lifecycles for no benefit beyond one less
 * secret.
 */

/** The tag the architecture draft assigns to request signatures. */
const REQUEST_TAG = "web-bot-auth";
/** The tag the directory draft assigns to the directory's own proof. */
/**
 * WHEN THE EGRESS KEY ENTERED SERVICE, and why this date and not
 * another.
 *
 * 2026-08-24 is the day the code that uses this key shipped. A key
 * cannot have signed a request before the module that signs with it
 * existed, so this is a FLOOR a stranger can check rather than a
 * claim they have to take: the commit is in the public repository.
 *
 * It is deliberately not "today, rolling". `nbf` answers "how early
 * could this key have signed", and an answer that advances with the
 * clock would quietly invalidate every signature we ever made — the
 * exact opposite of what the field is for.
 *
 * This is NOT the artifact-signing key, which has its own registry
 * with real handover dates at store/key-registry.ts. This key signs
 * outbound probes and nothing else; it has never been rotated, and if
 * it is, this date moves with it and the old one belongs in a
 * registry of its own rather than in a comment.
 */
export const WBA_KEY_IN_SERVICE_FROM = "2026-08-24";

/**
 * HOW FAR AHEAD THE DIRECTORY VOUCHES FOR ITS OWN KEY.
 *
 * Rolling, and said out loud rather than dressed up as a rotation
 * promise: `exp` here is a CEILING ON TRUST, not a scheduled
 * retirement. It means "do not honour a signature from this key, or a
 * cached copy of this document, beyond this point without fetching
 * the directory again". The store's own security.txt Expires is
 * computed the same way and for the same reason — a hand-typed date
 * in a served document is a thing that goes stale silently, and a
 * fixed one here would eventually expire our own live key and break
 * outbound signing with no error anybody would see.
 *
 * Thirty days is far enough past the directory's one-day
 * Cache-Control that no cached copy can expire while still being
 * served, and near enough that a verifier honouring it re-fetches
 * about once a month.
 */
export const WBA_KEY_TRUST_WINDOW_SECONDS = 30 * 24 * 3600;

const DIRECTORY_TAG = "http-message-signatures-directory";
/**
 * Where the directory draft says the directory lives. Served by
 * routes/bot-auth.ts; the constant lives here so the route and the
 * Signature-Agent header can never point at two different paths.
 */
export const DIRECTORY_PATH = "/.well-known/http-message-signatures-directory";
export const DIRECTORY_CONTENT_TYPE =
  "application/http-message-signatures-directory+json";

/** Signatures outlive their moment briefly; the draft caps this low. */
const SIGNATURE_LIFETIME_SECONDS = 300;

export interface Ed25519Jwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  /**
   * PUBLISHED SO A VERIFIER CAN MATCH A SIGNATURE TO A KEY.
   *
   * The thumbprint has always been computed and has always ridden on
   * every signature as the keyid — it just never appeared in the
   * directory, so an origin holding one of our signed requests could
   * fetch this document and still have nothing to match the keyid
   * AGAINST. Publishing the key without its name is half a handshake.
   *
   * SAFE BY CONSTRUCTION, not by luck: RFC 7638 canonicalizes an OKP
   * key over crv, kty and x ONLY, and jwkThumbprint below hand-writes
   * exactly those three. Adding kid cannot move the thumbprint, which
   * is why this is an addition and not a key rotation.
   *
   * Optional in the type because the thumbprint is derived FROM the
   * jwk: the object exists for one function call before it has a
   * name.
   */
  kid?: string;
  /**
   * KEY LIFETIME, IN THE TWO FIELDS A VERIFIER LOOKS FOR (2026-08-26).
   *
   * The directory published a key with no validity window at all, so
   * an origin holding one of our signed requests could confirm the
   * signature and had nothing to bound it with: no earliest moment
   * this key could have signed, no latest moment it should be
   * honoured. A key with no window is a key that is trusted forever
   * by default, which is not a property any operator should hand out
   * and not one this store wants held against it.
   *
   * Unix seconds, both. Neither moves the RFC 7638 thumbprint — that
   * is computed over crv, kty and x only, and jwkThumbprint hand-
   * writes exactly those three, which is the same reason `kid` above
   * could be added without rotating anything.
   */
  nbf?: number;
  exp?: number;
}

interface WbaKeyMaterial {
  seedHex: string;
  jwk: Ed25519Jwk;
  /** RFC 7638 thumbprint — the keyid every signature carries. */
  thumbprint: string;
}

/** The slice of Env this module needs; keeps tests and callers honest. */
export interface WbaEnv {
  WBA_SIGNING_KEY?: string;
  STORE_BASE_URL: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * RFC 7638: the thumbprint hashes the REQUIRED members only, in
 * lexicographic order, with no whitespace. For OKP that is exactly
 * crv, kty, x — hand-assembled here because JSON.stringify of a
 * wider object would silently include whatever fields the JWK grows.
 */
export async function jwkThumbprint(jwk: Ed25519Jwk): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return base64Url(new Uint8Array(digest));
}

/**
 * Derived once per isolate per seed. The map is keyed by seed so a
 * rotated secret can never serve the previous key's directory from a
 * warm isolate — the same discipline as cachedPublicKeyHex.
 */
const keyMaterialCache = new Map<string, Promise<WbaKeyMaterial | null>>();

async function deriveKeyMaterial(seedHex: string): Promise<WbaKeyMaterial | null> {
  try {
    // signMessage validates the seed shape and yields the public key;
    // signing a fixed probe message is the cheapest path to it that
    // reuses the one hex/ed25519 codepath the store already trusts.
    const { publicKey } = await signMessage("wba-key-derivation", seedHex);
    const jwk: Ed25519Jwk = {
      kty: "OKP",
      crv: "Ed25519",
      x: base64Url(hexToBytes(publicKey)),
    };
    const thumbprint = await jwkThumbprint(jwk);
    // Name the key with the same string its signatures carry.
    return { seedHex, jwk: { ...jwk, kid: thumbprint }, thumbprint };
  } catch {
    // A malformed secret reads as no secret: decoration fails open.
    return null;
  }
}

function keyMaterial(env: WbaEnv): Promise<WbaKeyMaterial | null> {
  const seed = env.WBA_SIGNING_KEY;
  if (!seed) {
    return Promise.resolve(null);
  }
  let cached = keyMaterialCache.get(seed);
  if (!cached) {
    cached = deriveKeyMaterial(seed);
    keyMaterialCache.set(seed, cached);
  }
  return cached;
}

/** The public JWK, or null when no egress key is configured. */
export async function webBotAuthJwk(env: WbaEnv): Promise<Ed25519Jwk | null> {
  const material = await keyMaterial(env);
  return material ? material.jwk : null;
}

/**
 * RFC 9421 signature base + params for one covered-component list.
 * The params string appears BYTE-IDENTICAL in the base and in the
 * Signature-Input header — built once, used twice, because the two
 * drifting apart is the classic way these signatures fail to verify.
 */
function buildSignature(
  componentLines: string[],
  components: string,
  thumbprint: string,
  tag: string,
): { params: string; base: string } {
  const created = Math.floor(Date.now() / 1000);
  const expires = created + SIGNATURE_LIFETIME_SECONDS;
  const nonce = base64(crypto.getRandomValues(new Uint8Array(32)));
  const params = `(${components});created=${created};expires=${expires};keyid="${thumbprint}";alg="ed25519";nonce="${nonce}";tag="${tag}"`;
  const base = [...componentLines, `"@signature-params": ${params}`].join("\n");
  return { params, base };
}

/**
 * Outbound headers for a request the store makes as itself: the
 * user-agent it always carried, plus — when the egress key is set —
 * the Web Bot Auth triplet over ("@authority" "signature-agent").
 * Those two components are the architecture draft's minimum, and the
 * minimum is the point: nothing about the path or body is claimed,
 * only "this request reached your authority from the key behind
 * scvd.store".
 */
export async function webBotAuthHeaders(
  env: WbaEnv,
  targetUrl: string,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const unsigned = outboundHeaders(extra);
  try {
    const material = await keyMaterial(env);
    if (!material) {
      return unsigned;
    }
    const authority = new URL(targetUrl).host;
    const agent = new URL(env.STORE_BASE_URL).origin;
    const { params, base } = buildSignature(
      [`"@authority": ${authority}`, `"signature-agent": "${agent}"`],
      `"@authority" "signature-agent"`,
      material.thumbprint,
      REQUEST_TAG,
    );
    const { signature } = await signMessage(base, material.seedHex);
    return {
      ...unsigned,
      // The sf-string quotes are part of the field value, and the
      // covered component above must match them byte for byte.
      "Signature-Agent": `"${agent}"`,
      "Signature-Input": `sig1=${params}`,
      Signature: `sig1=:${base64(hexToBytes(signature))}:`,
    };
  } catch {
    return unsigned;
  }
}

export interface SignedDirectory {
  body: { keys: Ed25519Jwk[] };
  headers: Record<string, string>;
}

/**
 * The directory document plus the proof-of-possession headers the
 * directory draft requires: the response signs its own "@authority"
 * with every key it lists (we list one), tag
 * "http-message-signatures-directory", so a verifier knows the
 * directory holder actually controls the keys it publishes rather
 * than pasting someone else's.
 */
export async function signedDirectory(
  env: WbaEnv,
): Promise<SignedDirectory | null> {
  const material = await keyMaterial(env);
  if (!material) {
    return null;
  }
  const authority = new URL(env.STORE_BASE_URL).host;
  const { params, base } = buildSignature(
    [`"@authority": ${authority}`],
    `"@authority"`,
    material.thumbprint,
    DIRECTORY_TAG,
  );
  const { signature } = await signMessage(base, material.seedHex);
  /*
   * BUCKETED TO THE UTC DAY, not to this instant. The directory is
   * served with a day of Cache-Control, so a per-request `exp` would
   * hand two verifiers different windows for the same bytes — and the
   * one holding the cached copy would be reading a number that was
   * true when it was minted and is not now. Anchoring to the start of
   * the day makes every copy served that day agree with itself.
   */
  const startOfDay =
    Math.floor(Date.now() / 1000 / 86400) * 86400;
  const keys = [
    {
      ...material.jwk,
      nbf: Math.floor(Date.parse(`${WBA_KEY_IN_SERVICE_FROM}T00:00:00Z`) / 1000),
      exp: startOfDay + WBA_KEY_TRUST_WINDOW_SECONDS,
    },
  ];
  return {
    body: { keys },
    headers: {
      "Content-Type": DIRECTORY_CONTENT_TYPE,
      // A day: long enough that verifiers are not hammering the
      // directory per request, short enough that a rotation lands.
      "Cache-Control": "max-age=86400",
      "Signature-Input": `sig1=${params}`,
      Signature: `sig1=:${base64(hexToBytes(signature))}:`,
    },
  };
}
