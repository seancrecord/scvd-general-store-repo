/**
 * THE TILL — a browser purchase path for an x402 store, in one file
 * with no build step and no dependencies.
 *
 * WHY THIS EXISTS. Until 2026-08-26 nobody could buy anything from
 * this store in a browser. There was no wallet code on the site at
 * all; the only script the origin ever served was an analytics
 * beacon. /try — the page whose own copy says "practice on us, the
 * till is real" — was a page of instructions telling the reader to go
 * and write an HTTP client. Every sale the store had ever made
 * required the buyer to write code or run an MCP client.
 *
 * Nobody decided that. It was the shape left behind by building the
 * agent door first and never coming back, and house rule 53 now names
 * it for what it is: a buyer who cannot pay is a design failure, not
 * a segment we do not serve.
 *
 * WHAT IT DOES. The four steps a paid x402 request takes, and nothing
 * else:
 *
 *   1. GET the buy URL. The store answers 402 with the machine-
 *      readable terms in the PAYMENT-REQUIRED header (base64 JSON).
 *   2. Pick an offer this wallet can actually pay, on the chain the
 *      wallet is actually on.
 *   3. Ask the wallet to sign an EIP-3009 TransferWithAuthorization
 *      over EIP-712, via eth_signTypedData_v4.
 *   4. Repeat the request with the signature in the PAYMENT-SIGNATURE
 *      header, and render whatever comes back.
 *
 * WHAT IT NEVER DOES, and these are not aspirations:
 *
 *   - It never asks for, reads, stores or transmits key material. The
 *     wallet signs; the key never leaves it. That is bit-for-bit what
 *     every agent buying here already does.
 *   - It never writes to localStorage, sessionStorage, IndexedDB or a
 *     cookie. Nothing about a purchase outlives the page.
 *   - It never calls anything but this origin. No RPC endpoint, no
 *     price oracle, no analytics, no third party of any kind.
 *   - It never reports a success it did not observe. See MONEY FAILS
 *     CLOSED, below, which is the half of this file that matters.
 *
 * MONEY FAILS CLOSED (AT_SCALE rule 7). Every path out of `purchase`
 * lands on one of exactly four outcomes, and the boundary between the
 * last two is the whole design:
 *
 *   delivered  — the store answered 200 and the goods are in hand.
 *   declined   — the store answered, definitively, no. Nothing moved.
 *   refused    — THIS TILL stopped, before any authorization was
 *                signed. Nothing was signed, so nothing can be spent.
 *   uncertain  — a signed authorization was PUT ON THE WIRE and we do
 *                not know what happened to it.
 *
 * `uncertain` is never softened into either neighbour. A browser till
 * is the one place in this store where a bug spends a real person's
 * money, and the temptation at exactly that moment is to round a
 * silence down to "failed" (so the buyer retries and pays twice) or
 * up to "worked" (so the buyer walks away from goods they own). Both
 * are lies with a price tag. So when the answer is not known, this
 * says it is not known, and hands over the three facts that let the
 * buyer settle it themselves: the idempotency key that makes a retry
 * free, the unix second the authorization stops being spendable, and
 * the URL where a certificate can be looked up.
 *
 * PROGRESSIVE ENHANCEMENT, in the strong sense. The pages this runs
 * on render their full instructions server-side and are complete
 * without it. This file adds a section at runtime and only when a
 * wallet is actually present: no provider, no markup, no difference.
 * With scripting off the served HTML is unchanged, because the only
 * things the server adds are an `application/json` island and a
 * `<script>` tag, and neither renders.
 *
 * KNOWN LIMITS, stated here rather than discovered later:
 *
 *   - EVM only. `window.ethereum` covers Base and Polygon in one code
 *     path; Solana / Phantom is a second pass and is not pretended at.
 *     A Solana-only offer is skipped with its reason shown.
 *   - EIP-1193 via `window.ethereum` only. EIP-6963 multi-wallet
 *     discovery is not implemented, so with several extensions
 *     installed this signs with whichever one won the injection race.
 *   - EOA signatures only. A smart-contract wallet (ERC-1271, ERC-
 *     6492) produces a signature this refuses, because EIP-3009 is
 *     checked by the USDC contract against an ECDSA recovery and a
 *     contract signature reverts there. Refusing early is the honest
 *     failure; a facilitator error twenty seconds later is not.
 *   - No chain switching. If the wallet is on the wrong network the
 *     till says which networks are payable and stops. Moving somebody
 *     else's wallet between chains to make a sale is not a thing this
 *     store does uninvited.
 *
 * Licence: MIT, same as the repository it ships in.
 */

/** The x402 version this till speaks, and the only one it will sign. */
export const X402_VERSION = 2;

/**
 * The longest an authorization signed here stays spendable, in
 * seconds — the house ceiling, applied as `min(seller's ask, this)`
 * and never the seller's number alone. The field runner clamps the
 * same way for the same reason: a signed authorization is a live
 * instrument until it expires, and the buyer, not the seller, should
 * decide how long they are exposed.
 */
export const MAX_AUTHORIZATION_SECONDS = 300;

/** EIP-3009's field list, in the order the USDC contract hashes them. */
export const TRANSFER_WITH_AUTHORIZATION_TYPE = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
];

/** EIP-712's own domain type. v4 requires it in `types`, spelled out. */
export const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ATOMIC_RE = /^(0|[1-9][0-9]*)$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
const EIP155_RE = /^eip155:([1-9][0-9]*)$/;

/**
 * A refusal this till made, with the stage it made it at. Carrying
 * the stage is not decoration: `stage` is how a caller knows whether
 * an authorization exists in the world. Everything thrown before
 * `sign` means nothing was signed and nothing can be spent.
 */
export class TillRefusal extends Error {
  constructor(stage, message, detail) {
    super(message);
    this.name = "TillRefusal";
    this.stage = stage;
    if (detail !== undefined) {
      this.detail = detail;
    }
  }
}

/** UTF-8-safe base64, because `btoa` alone throws above U+00FF. */
export function base64FromString(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** The inverse, and equally not `atob` alone. */
export function stringFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The challenge, out of the header and nowhere else.
 *
 * x402 v2 clients read the terms from PAYMENT-REQUIRED, not from the
 * body — the store's own preflight instrument fails other people's
 * doors for exactly this, and a till that quietly fell back to the
 * body would be signing against terms no standard client would have
 * seen. If the header is missing or unreadable, that is a refusal.
 */
export function decodeChallenge(headerValue) {
  if (typeof headerValue !== "string" || headerValue.trim() === "") {
    throw new TillRefusal(
      "challenge",
      "The store answered 402 with no PAYMENT-REQUIRED header. There are no terms to sign against, so nothing was signed.",
    );
  }
  let text;
  try {
    text = stringFromBase64(headerValue.trim());
  } catch {
    throw new TillRefusal(
      "challenge",
      "The PAYMENT-REQUIRED header is not base64. Nothing was signed.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TillRefusal(
      "challenge",
      "The PAYMENT-REQUIRED header decoded to something that is not JSON. Nothing was signed.",
    );
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.accepts)) {
    throw new TillRefusal(
      "challenge",
      "The payment terms carry no `accepts` array, so there is no offer to accept. Nothing was signed.",
    );
  }
  return parsed;
}

/**
 * Chain ids, as the words a wallet's own network picker uses.
 *
 * Display only — nothing here is consulted when money is decided. The
 * first live buyer (the keeper, 2026-08-27) was refused with "offered
 * on chain 8453, and the wallet is connected to chain 1", which is
 * accurate and useless: a person standing at a till does not know
 * their wallet's dropdown says "Ethereum" where the refusal says "1".
 * The map covers the chains this store sells on plus the ones a
 * wallet commonly wakes up connected to; anything else falls back to
 * the bare number, which is at least honest about being a number.
 */
const CHAIN_NAMES = {
  1: "Ethereum mainnet",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum One",
  43114: "Avalanche",
};

export function chainName(chainId) {
  return CHAIN_NAMES[chainId] || `chain ${chainId}`;
}

/** The chain id inside an eip155 CAIP-2 network string, or null. */
export function evmChainId(network) {
  if (typeof network !== "string") {
    return null;
  }
  const match = EIP155_RE.exec(network);
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Everything wrong with one offer, as sentences a buyer can read.
 *
 * Returned as a LIST rather than a boolean on purpose: when a till
 * refuses, the buyer's next question is always "why not that one",
 * and an offer skipped without a reason reads as a bug in the store.
 */
export function acceptProblems(accept, walletChainId) {
  if (!accept || typeof accept !== "object") {
    return ["the offer is not an object"];
  }
  const problems = [];
  if (accept.scheme !== "exact") {
    problems.push(
      `scheme is ${JSON.stringify(accept.scheme)}; this till only signs "exact"`,
    );
  }
  const offerChain = evmChainId(accept.network);
  if (offerChain === null) {
    problems.push(
      `network ${JSON.stringify(accept.network)} is not an EVM chain this till can sign for`,
    );
  } else if (
    typeof walletChainId === "number" &&
    offerChain !== walletChainId
  ) {
    problems.push(
      `offered on chain ${offerChain}, and the wallet is connected to chain ${walletChainId}`,
    );
  }
  if (typeof accept.amount !== "string" || !ATOMIC_RE.test(accept.amount)) {
    /*
     * ATOMIC UNITS, AS A STRING, ALWAYS. USDC has six decimals, so
     * "1000" is a tenth of a cent and 1000 would be a thousand
     * dollars. The value is copied verbatim into the authorization
     * and never converted, parsed or re-derived — a till that did
     * arithmetic on somebody's price is a till that can get it wrong.
     */
    problems.push("amount is not an atomic decimal string");
  }
  if (typeof accept.asset !== "string" || !ADDRESS_RE.test(accept.asset)) {
    problems.push("asset is not a contract address");
  }
  if (typeof accept.payTo !== "string" || !ADDRESS_RE.test(accept.payTo)) {
    problems.push("payTo is not an address");
  }
  const extra = accept.extra;
  if (
    !extra ||
    typeof extra !== "object" ||
    typeof extra.name !== "string" ||
    typeof extra.version !== "string"
  ) {
    /*
     * THE FIELD THAT COSTS AN EVENING. `extra` carries the EIP-712
     * domain name and version of the token contract, and on Base
     * mainnet USDC that name is "USD Coin" while on Base Sepolia it
     * is "USDC". Guessing it produces a well-formed signature that
     * recovers to nobody and reverts on chain, with no error visible
     * from either side. So it is never guessed here: no `extra`, no
     * signature.
     */
    problems.push(
      "extra.name / extra.version are absent — those are the token's EIP-712 domain, and a signature made with a guessed domain is invalid everywhere",
    );
  }
  return problems;
}

/**
 * The offer to sign: payable, on this wallet's chain, and CHEAPEST.
 *
 * Cheapest is a money-safety rule, not a preference. This store
 * offers patronage tiers — the same goods at higher prices, with the
 * excess recorded as a tip — so an offers array routinely contains
 * amounts a buyer did not ask to pay. A till that picked `accepts[0]`
 * would be choosing, on somebody else's behalf, to spend more of
 * their money than the price. Tipping is a decision a person makes on
 * purpose, and this till has no way to ask.
 */
export function chooseAccept(challenge, walletChainId) {
  const accepts = Array.isArray(challenge && challenge.accepts)
    ? challenge.accepts
    : [];
  if (accepts.length === 0) {
    throw new TillRefusal(
      "offer",
      "The store answered 402 but offered no payment terms at all. Nothing was signed.",
    );
  }
  const payable = [];
  const skipped = [];
  const switchableChains = [];
  for (const accept of accepts) {
    const problems = acceptProblems(accept, walletChainId);
    if (problems.length === 0) {
      payable.push(accept);
    } else {
      skipped.push({
        network: (accept && accept.network) || "(no network)",
        problems,
      });
      /*
       * Would this offer be signable if the wallet were on ITS chain?
       * Re-checking against the offer's own chain id isolates "wrong
       * network" from every other defect, so the refusal below can
       * say "switch" only when switching would actually work.
       */
      const offerChain = evmChainId(accept && accept.network);
      if (
        offerChain !== null &&
        acceptProblems(accept, offerChain).length === 0 &&
        !switchableChains.includes(offerChain)
      ) {
        switchableChains.push(offerChain);
      }
    }
  }
  if (payable.length === 0) {
    /*
     * THE FIRST SENTENCE IS FOR THE PERSON AT THE TILL. The first live
     * buyer got the diagnostic list alone and read it as a dev log,
     * because it was one. The most common way to stand here — wallet
     * parked on the wrong network — has a fix the buyer can do in two
     * taps, so when that is the whole story, the refusal says the fix
     * in wallet words. The per-offer diagnostics still ride along as
     * `detail` for the reader who wants the till's full reading.
     */
    const reason =
      typeof walletChainId === "number" && switchableChains.length > 0
        ? `Your wallet is connected to ${chainName(walletChainId)}, but this store sells on ${switchableChains
            .map(chainName)
            .join(
              " and ",
            )}. Open your wallet, switch its network to ${chainName(switchableChains[0])}, and press the button again. Nothing was signed and no money moved.`
        : "None of the offered payment terms can be signed by this wallet as it stands. Nothing was signed.";
    throw new TillRefusal("offer", reason, skipped);
  }
  return payable.reduce((best, next) =>
    BigInt(next.amount) < BigInt(best.amount) ? next : best,
  );
}

/**
 * 32 random bytes, from a CSPRNG or not at all.
 *
 * An EIP-3009 nonce is what makes an authorization single-use: the
 * token contract records it and reverts on reuse. A predictable nonce
 * is a collision waiting to be someone else's problem, so there is no
 * `Math.random` fallback here — a runtime without `getRandomValues`
 * gets a refusal, which costs a sale and never a signature.
 */
export function randomNonce(cryptoImpl) {
  const source =
    cryptoImpl || (typeof crypto !== "undefined" ? crypto : undefined);
  if (!source || typeof source.getRandomValues !== "function") {
    throw new TillRefusal(
      "nonce",
      "This browser exposes no cryptographic random source, so no safe authorization nonce can be made. Nothing was signed.",
    );
  }
  const bytes = source.getRandomValues(new Uint8Array(32));
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}

/** The EIP-3009 authorization, built only from values the store sent. */
export function buildAuthorization({ from, accept, nowSeconds, nonce }) {
  const asked = Number(accept.maxTimeoutSeconds);
  const window =
    Number.isFinite(asked) && asked > 0
      ? Math.min(Math.floor(asked), MAX_AUTHORIZATION_SECONDS)
      : MAX_AUTHORIZATION_SECONDS;
  return {
    from,
    to: accept.payTo,
    // Copied, never computed. See acceptProblems, atomic units.
    value: accept.amount,
    validAfter: "0",
    validBefore: String(Math.floor(nowSeconds) + window),
    nonce,
  };
}

/** The EIP-712 payload eth_signTypedData_v4 takes, as an object. */
export function buildTypedData(accept, authorization) {
  return {
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION_TYPE,
    },
    primaryType: "TransferWithAuthorization",
    domain: {
      name: accept.extra.name,
      version: accept.extra.version,
      chainId: evmChainId(accept.network),
      // The token contract checks this against its own immutable
      // DOMAIN_SEPARATOR. It is the asset, and nothing else.
      verifyingContract: accept.asset,
    },
    message: authorization,
  };
}

/**
 * The PAYMENT-SIGNATURE header value.
 *
 * `accepted` is the offer object COPIED WHOLE AND UNCHANGED. The
 * store deep-compares it against what it issued — key set identical,
 * types identical, `extra` included — and rebuilding it from parts is
 * the single most common way a hand-rolled client fails here, because
 * the resulting 402 says "verify" and the signature was never the
 * problem. So the object that came off the wire is the object that
 * goes back onto it.
 */
export function encodePaymentHeader({ accept, signature, authorization }) {
  if (typeof signature !== "string" || !SIGNATURE_RE.test(signature)) {
    throw new TillRefusal(
      "signature",
      "The wallet returned something that is not a 65-byte ECDSA signature. EIP-3009 is checked by the token contract against an ECDSA recovery, so this cannot be presented as payment. Smart-contract wallets (ERC-1271) land here, and this till does not pretend to support them.",
    );
  }
  return base64FromString(
    JSON.stringify({
      x402Version: X402_VERSION,
      accepted: accept,
      payload: { signature, authorization },
    }),
  );
}

/** Best-effort JSON, because a body we cannot read is never fatal. */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Best-effort text, for the same reason and the same non-guarantee. */
async function readText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function describeError(error) {
  if (error && typeof error.message === "string" && error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * A wallet rejection, told apart from a wallet failure.
 *
 * EIP-1193 reserves 4001 for "the user rejected the request", and the
 * difference matters to the person reading the screen: they pressed
 * cancel, and a page that answers that with an error message is
 * telling them something broke when nothing did.
 */
function isUserRejection(error) {
  return Boolean(error) && (error.code === 4001 || error.code === "4001");
}

/**
 * ONE PURCHASE, START TO FINISH.
 *
 * Every dependency is injected so this function is testable without a
 * browser, a wallet or a network: `provider` is anything with an
 * EIP-1193 `request`, `fetchImpl` is anything fetch-shaped, `nowMs`
 * and `cryptoImpl` make time and randomness ordinary arguments. The
 * DOM never appears in here — it is all in `mountTill`, below, and
 * the split is what lets the money path be tested exhaustively while
 * the rendering stays dumb enough not to need it.
 *
 * Returns one of the four outcomes described at the top of this file.
 * It does not throw for an expected failure; a thrown error out of
 * here is a bug in this file.
 */
export async function purchase(options) {
  const {
    url,
    provider,
    fetchImpl,
    nowMs = () => Date.now(),
    cryptoImpl,
  } = options;
  /*
   * BOUND, NOT BORROWED. `fetch` is a method on the global object, and
   * calling a bare reference to it detaches `this` — which browsers
   * answer with "Illegal invocation" rather than a request. The bug is
   * invisible to a test that injects its own fetch (every test here
   * does) and fatal in the only place that matters, so the binding is
   * explicit and this comment is why.
   */
  const doFetch =
    fetchImpl ||
    (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
      ? (...args) => globalThis.fetch(...args)
      : null);
  if (!doFetch) {
    return { outcome: "refused", stage: "setup", reason: "No fetch available." };
  }
  if (!provider || typeof provider.request !== "function") {
    return {
      outcome: "refused",
      stage: "setup",
      reason: "No EIP-1193 wallet is available in this page.",
    };
  }

  // ---- 1. The free knock. Nothing is signed anywhere in this block.
  let challengeResponse;
  try {
    challengeResponse = await doFetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    return {
      outcome: "refused",
      stage: "knock",
      reason: `The store could not be reached: ${describeError(error)}. Nothing was signed.`,
    };
  }

  if (challengeResponse.status === 200) {
    /*
     * A door that answers 200 unpaid is a free door, and buying it
     * would be paying for something already given. Deliver it and
     * say so, rather than manufacturing a payment to feel consistent.
     */
    const body = await readJson(challengeResponse);
    return {
      outcome: "delivered",
      paid: false,
      body,
      ...extractArtifact(body),
    };
  }

  if (challengeResponse.status !== 402) {
    const text = await readText(challengeResponse);
    return {
      outcome: "refused",
      stage: "knock",
      reason: `The store answered ${challengeResponse.status}, not 402, so there were no terms to pay. Nothing was signed.`,
      detail: text.slice(0, 400),
    };
  }

  let challenge;
  try {
    challenge = decodeChallenge(
      challengeResponse.headers.get("PAYMENT-REQUIRED"),
    );
  } catch (error) {
    return refusalResult(error, "challenge");
  }

  /*
   * The idempotency key rides along from here whether or not it is
   * ever used, because the moment it becomes valuable is the moment
   * everything else has gone wrong. It is derived from the item and
   * the minute — public by design, a cache slot rather than a key to
   * one — and slots are keyed by the verified paying wallet, so
   * echoing it can only ever reach the buyer's own earlier purchase.
   */
  const challengeBody = await readJson(challengeResponse);
  const idempotencyKey =
    challengeBody &&
    challengeBody.idempotency &&
    typeof challengeBody.idempotency.suggested_key === "string"
      ? challengeBody.idempotency.suggested_key
      : null;

  // ---- 2. What can this wallet actually pay, as it stands right now.
  let walletChainId = null;
  try {
    const raw = await provider.request({ method: "eth_chainId" });
    const parsed =
      typeof raw === "string" ? Number.parseInt(raw, 16) : Number(raw);
    walletChainId = Number.isSafeInteger(parsed) ? parsed : null;
  } catch (error) {
    return {
      outcome: "refused",
      stage: "wallet",
      reason: `The wallet would not say which chain it is on: ${describeError(error)}. Nothing was signed.`,
    };
  }
  if (walletChainId === null) {
    return {
      outcome: "refused",
      stage: "wallet",
      reason:
        "The wallet reported a chain id that could not be read. Nothing was signed.",
    };
  }

  let accept;
  try {
    accept = chooseAccept(challenge, walletChainId);
  } catch (error) {
    return refusalResult(error, "offer");
  }

  // ---- 3. The account. This is the first thing that shows a dialog.
  let from;
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    from = Array.isArray(accounts) ? accounts[0] : undefined;
  } catch (error) {
    if (isUserRejection(error)) {
      return {
        outcome: "refused",
        stage: "wallet",
        reason: "You closed the wallet without connecting. Nothing was signed.",
      };
    }
    return {
      outcome: "refused",
      stage: "wallet",
      reason: `The wallet would not connect: ${describeError(error)}. Nothing was signed.`,
    };
  }
  if (typeof from !== "string" || !ADDRESS_RE.test(from)) {
    return {
      outcome: "refused",
      stage: "wallet",
      reason:
        "The wallet returned no usable account address. Nothing was signed.",
    };
  }

  // ---- 4. Sign. After this block an instrument exists in the world.
  let authorization;
  let typedData;
  try {
    authorization = buildAuthorization({
      from,
      accept,
      nowSeconds: Math.floor(nowMs() / 1000),
      nonce: randomNonce(cryptoImpl),
    });
    typedData = buildTypedData(accept, authorization);
  } catch (error) {
    return refusalResult(error, "sign");
  }

  let signature;
  try {
    signature = await provider.request({
      method: "eth_signTypedData_v4",
      params: [from, JSON.stringify(typedData)],
    });
  } catch (error) {
    if (isUserRejection(error)) {
      return {
        outcome: "refused",
        stage: "sign",
        reason:
          "You declined the signature in your wallet. Nothing was signed and nothing can be spent.",
      };
    }
    return {
      outcome: "refused",
      stage: "sign",
      reason: `The wallet would not sign: ${describeError(error)}. Nothing was signed.`,
    };
  }

  let paymentHeader;
  try {
    paymentHeader = encodePaymentHeader({ accept, signature, authorization });
  } catch (error) {
    /*
     * SIGNED, AND NEVER SENT. The wallet made an instrument and this
     * till refused to present it — so it exists, unspent, until its
     * validBefore passes and it can never be used by anyone. That is
     * a refusal rather than an uncertainty, and it says the window
     * out loud because a buyer is entitled to know when the thing
     * they signed stops being real.
     */
    return {
      ...refusalResult(error, "signature"),
      authorizationValidBefore: authorization.validBefore,
    };
  }

  // ---- 5. The paid knock. From here, "we don't know" is a real answer.
  const outstanding = {
    idempotencyKey,
    authorizationValidBefore: authorization.validBefore,
    paidAmountAtomic: accept.amount,
    network: accept.network,
  };

  let paidResponse;
  try {
    paidResponse = await doFetch(url, {
      /*
       * NEVER FOLLOW A REDIRECT WITH THIS HEADER ON. PAYMENT-
       * SIGNATURE carries a signed, payable instrument; forwarding it
       * to whatever host a redirect names hands that instrument to a
       * third party. The store's own field runner refuses to follow
       * one for exactly this reason, and it is not a rule that gets
       * relaxed because the origin is us.
       */
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "PAYMENT-SIGNATURE": paymentHeader,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
    });
  } catch (error) {
    return {
      outcome: "uncertain",
      reason: `The paid request left this page and never came back: ${describeError(error)}.`,
      ...outstanding,
    };
  }

  if (paidResponse.type === "opaqueredirect" || paidResponse.status === 0) {
    return {
      outcome: "uncertain",
      reason:
        "The store answered the paid request with a redirect, which this till will not follow while carrying a payable signature. Whether the payment was taken before that redirect cannot be read from here.",
      ...outstanding,
    };
  }

  if (paidResponse.status === 200) {
    const body = await readJson(paidResponse);
    if (!body) {
      /*
       * 200 WITH AN UNREADABLE BODY IS NOT A SALE. The money may well
       * have moved; the goods are not in hand and cannot be shown. It
       * is exactly the case where rounding up to "delivered" would be
       * a lie the buyer discovers later, so it stays uncertain.
       */
      return {
        outcome: "uncertain",
        reason:
          "The store answered 200 but the response could not be read as JSON, so the goods cannot be shown and the settlement cannot be confirmed from here.",
        ...outstanding,
      };
    }
    return { outcome: "delivered", paid: true, body, ...extractArtifact(body) };
  }

  const declinedBody = await readJson(paidResponse);
  if (paidResponse.status === 402) {
    /*
     * A SECOND 402 IS A DEFINITIVE NO. The store verifies before it
     * settles and books the refusal; the authorization's nonce was
     * never spent. The window is still printed, because until it
     * passes the instrument is technically live.
     */
    return {
      outcome: "declined",
      status: 402,
      reason: declineReason(declinedBody),
      body: declinedBody,
      ...outstanding,
    };
  }

  return {
    outcome: "uncertain",
    reason: `The store answered ${paidResponse.status} to the paid request. That is neither a delivery nor a refusal this till can read, so whether the payment was taken is unknown from here.`,
    body: declinedBody,
    ...outstanding,
  };
}

/**
 * Decline codes this till knows how to say in buyer words.
 *
 * The raw code stays in parentheses so nothing is papered over — the
 * translation is an addition, never a replacement. Only codes whose
 * meaning is certain are listed; an unknown code is shown as itself,
 * because a guessed explanation of somebody's declined payment is
 * worse than a terse one. The first entry is not hypothetical: the
 * keeper's first live signature was declined with it, because he paid
 * from the store's own receiving wallet.
 */
const DECLINE_TRANSLATIONS = {
  self_send_not_allowed:
    "the paying wallet is the same wallet this store gets paid at, and the store will not buy from itself. Pay from any other wallet",
  insufficient_funds:
    "the wallet holds less USDC than the price, on the chain you signed on",
  insufficient_balance:
    "the wallet holds less USDC than the price, on the chain you signed on",
};

/** The store's own words for why it said no, when it gave any. */
export function declineReason(body) {
  if (!body || typeof body !== "object") {
    return "The store refused the payment and gave no readable reason.";
  }
  const candidates = [];
  const declined = body.payment_declined;
  if (declined && typeof declined === "object") {
    for (const key of ["reason", "detail", "message", "error"]) {
      if (typeof declined[key] === "string" && declined[key]) {
        candidates.push(declined[key]);
      }
    }
  }
  for (const key of ["error", "message", "note"]) {
    if (typeof body[key] === "string" && body[key]) {
      candidates.push(body[key]);
    }
  }
  if (candidates.length === 0) {
    return "The store refused the payment and gave no readable reason.";
  }
  /*
   * Prefer the candidate the till can explain: the keeper's first live
   * decline arrived as reason "verify_error" (opaque) with message
   * "self_send_not_allowed" (the actual story), and the old code
   * returned whichever came first.
   */
  for (const candidate of candidates) {
    const translated = DECLINE_TRANSLATIONS[candidate];
    if (translated) {
      return `${translated} (${candidate}).`;
    }
  }
  return candidates[0];
}

/**
 * The three things a buyer walks away with, dug out of the response.
 *
 * Absent rather than invented: a delivery whose certificate id cannot
 * be found is still a delivery, and it says so with the raw body
 * beside it rather than printing a blank where an id should be.
 */
export function extractArtifact(body) {
  if (!body || typeof body !== "object") {
    return {};
  }
  const certificate =
    body.certificate && typeof body.certificate === "object"
      ? body.certificate
      : null;
  const certId =
    (certificate && typeof certificate.cert_id === "string"
      ? certificate.cert_id
      : null) || (typeof body.cert_id === "string" ? body.cert_id : null);
  const verifyUrl =
    typeof body.verify_url === "string" ? body.verify_url : null;
  return {
    ...(certId ? { certId } : {}),
    ...(verifyUrl ? { verifyUrl } : {}),
    ...(body.deliverable !== undefined
      ? { deliverable: body.deliverable }
      : {}),
    ...(typeof body.paid_usdc === "number" ? { paidUsdc: body.paid_usdc } : {}),
  };
}

/** A thrown TillRefusal, flattened into the shape purchase() returns. */
function refusalResult(error, fallbackStage) {
  if (error instanceof TillRefusal) {
    return {
      outcome: "refused",
      stage: error.stage || fallbackStage,
      reason: error.message,
      ...(error.detail !== undefined ? { detail: error.detail } : {}),
    };
  }
  return {
    outcome: "refused",
    stage: fallbackStage,
    reason: `${describeError(error)} Nothing was signed.`,
  };
}

/* ------------------------------------------------------------------
 * THE DOM HALF. Nothing below here decides anything about money.
 * ---------------------------------------------------------------- */

/** The id of the inert JSON island the server renders for this till. */
export const SHELF_ELEMENT_ID = "scvd-till-shelf";

/*
 * OUTCOME COLORS (the keeper's first live walk, 2026-08-27): a refusal
 * rendered in the page's own ink read as store prose, not as a state
 * change. One hue per outcome, picked to hold contrast on the paper
 * theme's light and dark grounds alike: green means the goods are
 * yours, amber means no money moved and there is something to fix,
 * red is reserved for the one state a buyer must actually stop and
 * read. The left border makes the status a panel, so the eye finds it
 * before the sentence starts.
 */
const TILL_STYLE = `
.till{border-top:1px solid currentColor;margin-top:2rem;padding-top:1rem}
.till-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;margin:.75rem 0}
.till-row button{font:inherit;padding:.35rem .8rem;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;border-radius:2px}
.till-row button[disabled]{opacity:.5;cursor:not-allowed}
.till-row input{font:inherit;padding:.3rem;border:1px solid currentColor;background:transparent;color:inherit;min-width:14rem}
.till-status{margin:.75rem 0;white-space:pre-wrap}
.till-status[data-outcome]{border-left:3px solid currentColor;padding:.5rem .75rem}
.till-status[data-outcome=delivered]{color:#2f9e44}
.till-status[data-outcome=declined],.till-status[data-outcome=refused]{color:#d9480f}
.till-status[data-outcome=uncertain]{color:#e03131;font-weight:700}
.till-wallet[data-connected=yes]{color:#2f9e44}
.till-wallet[data-connected=wrong-chain]{color:#d9480f}
.till-detail summary{cursor:pointer;font-size:.85em;opacity:.75}
.till-out{max-height:26rem;overflow:auto;white-space:pre-wrap;word-break:break-word}
`;

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * A price, for a person to read. Display only, and never anywhere near
 * a signature: what gets signed is the store's atomic string, copied.
 *
 * Two decimals at least, six at most, and no trailing zeros past the
 * second — so $1 reads "$1.00", a half-cent reads "$0.005", and the
 * cheapest thing on the shelf reads "$0.001" rather than "$0.0010".
 */
function usd(value) {
  const [whole, frac = ""] = Number(value).toFixed(6).split(".");
  return `$${whole}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}

/**
 * Read the shelf the server rendered. Returns null when there is no
 * island, which is the normal case on every page without a till.
 */
export function readShelf(doc) {
  const node = doc.getElementById(SHELF_ELEMENT_ID);
  if (!node) {
    return null;
  }
  try {
    const parsed = JSON.parse(node.textContent || "");
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * BUILD THE TILL, AND ONLY IF THERE IS A WALLET TO USE IT.
 *
 * The absent-provider case is the load-bearing one. A page with no
 * wallet gets no button, no heading and no empty state, because a
 * till nobody can use is furniture in the way of the instructions
 * that DO work — and those instructions are the whole page for every
 * reader who is not standing in front of a browser extension.
 */
export function mountTill({ doc, provider, shelf, fetchImpl, nowMs, cryptoImpl }) {
  if (!provider || typeof provider.request !== "function" || !shelf) {
    return null;
  }
  const anchor = doc.querySelector("main.paper header") || doc.body;
  if (!anchor) {
    return null;
  }

  const style = el(doc, "style");
  style.textContent = TILL_STYLE;
  doc.head.appendChild(style);

  const section = el(doc, "section", "till");
  section.id = "till";
  section.appendChild(el(doc, "h2", null, shelf.heading || "Buy it here"));
  if (shelf.standfirst) {
    section.appendChild(el(doc, "p", "menu-desc", shelf.standfirst));
  }
  if (shelf.house_rule) {
    section.appendChild(el(doc, "p", "menu-meta", shelf.house_rule));
  }

  /*
   * THE WALLET LINE (the keeper's ask, 2026-08-27, after a live walk
   * spent three attempts discovering which account and network his
   * wallet was actually offering this page). One live sentence: which
   * account is connected HERE and on which network, refreshed the
   * moment either changes in the wallet — so the wrong-account and
   * wrong-network discoveries happen before a button is pressed, not
   * inside a signature prompt.
   *
   * Read-only and display-only. eth_accounts and eth_chainId prompt
   * for nothing, and nothing here gates a purchase: the money path
   * still decides from the live 402's accepts alone, so a stale or
   * unreadable line costs a hint, never a signature. The chains it
   * may warn about come from the shelf the server rendered
   * (evm_chains, derived from the payment gate's own constants),
   * never hardcoded here.
   */
  const walletLine = el(doc, "p", "till-wallet menu-meta");
  walletLine.setAttribute("data-connected", "unknown");
  const shortAddress = (address) =>
    `${address.slice(0, 6)}…${address.slice(-4)}`;
  const storeChains = Array.isArray(shelf.evm_chains)
    ? shelf.evm_chains.filter((id) => Number.isSafeInteger(id))
    : [];
  const refreshWalletLine = async () => {
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      const chainHex = await provider.request({ method: "eth_chainId" });
      const chainId = Number.parseInt(chainHex, 16);
      const account =
        Array.isArray(accounts) && typeof accounts[0] === "string"
          ? accounts[0]
          : null;
      if (!account) {
        walletLine.setAttribute("data-connected", "no");
        walletLine.textContent =
          "○ Wallet found, but no account is connected to this page yet — pressing Pay asks your wallet to connect first.";
        return;
      }
      const wrongChain =
        storeChains.length > 0 &&
        Number.isSafeInteger(chainId) &&
        !storeChains.includes(chainId);
      walletLine.setAttribute(
        "data-connected",
        wrongChain ? "wrong-chain" : "yes",
      );
      walletLine.textContent = Number.isSafeInteger(chainId)
        ? `● Connected as ${shortAddress(account)} on ${chainName(chainId)}${
            wrongChain
              ? ` — this store sells on ${storeChains
                  .map(chainName)
                  .join(
                    " and ",
                  )}. Switch your wallet's network before pressing Pay.`
              : ". The signature request will come from this account."
          }`
        : `● Connected as ${shortAddress(account)}.`;
    } catch {
      walletLine.setAttribute("data-connected", "unknown");
      walletLine.textContent =
        "The wallet would not say what it has connected; pressing Pay will ask it directly.";
    }
  };
  refreshWalletLine();
  if (typeof provider.on === "function") {
    provider.on("accountsChanged", refreshWalletLine);
    provider.on("chainChanged", refreshWalletLine);
  }
  section.appendChild(walletLine);

  const status = el(doc, "p", "till-status menu-meta");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  /*
   * THE FORENSICS, FOLDED (the keeper's first live walk): the raw
   * response and the per-offer diagnostics are the audit trail and
   * they stay — but behind a summary line, because the first live
   * refusal handed a person four lines of protocol reading where the
   * one sentence that mattered was "switch your wallet's network".
   * The status line is for the buyer; this pane is for whoever asks
   * the buyer's next question.
   */
  const detailPane = el(doc, "details", "till-detail");
  detailPane.appendChild(
    el(doc, "summary", null, "The till's full reading, for the curious"),
  );
  const output = el(doc, "pre", "till-out menu-desc");
  output.hidden = true;
  detailPane.appendChild(output);
  const syncDetail = (open) => {
    detailPane.hidden = output.hidden;
    detailPane.open = !output.hidden && Boolean(open);
  };
  syncDetail(false);

  const buttons = [];
  const say = (text, outcome) => {
    status.textContent = text;
    if (outcome) {
      status.setAttribute("data-outcome", outcome);
    } else {
      status.removeAttribute("data-outcome");
    }
  };

  for (const item of shelf.items) {
    const row = el(doc, "div", "till-row");
    row.appendChild(
      el(doc, "span", "menu-name", `${item.name} — ${usd(item.price_usdc)}`),
    );
    const inputs = new Map();
    for (const field of item.requires || []) {
      const input = el(doc, "input");
      input.type = "text";
      input.placeholder = field.name;
      input.setAttribute("aria-label", `${item.name}: ${field.name}`);
      inputs.set(field.name, input);
      row.appendChild(input);
    }
    const button = el(doc, "button", null, `Pay ${usd(item.price_usdc)}`);
    button.type = "button";
    buttons.push(button);
    button.addEventListener("click", () => {
      const missing = [];
      const params = new URLSearchParams();
      for (const [name, input] of inputs) {
        const value = (input.value || "").trim();
        if (!value) {
          missing.push(name);
        } else {
          params.set(name, value);
        }
      }
      if (missing.length > 0) {
        say(`${item.name} needs ${missing.join(", ")} before it can be bought.`);
        return;
      }
      params.set("src", "till");
      const url = `${item.buy_path}?${params.toString()}`;
      for (const other of buttons) {
        other.disabled = true;
      }
      say(
        `Asking the store for terms, then your wallet for one signature. ${item.name}, ${usd(item.price_usdc)}.`,
      );
      output.hidden = true;
      syncDetail(false);
      purchase({ url, provider, fetchImpl, nowMs, cryptoImpl })
        .then((result) => {
          renderResult({ doc, result, say, output, item });
          // The goods open the pane; a refusal leaves it folded.
          syncDetail(result.outcome === "delivered");
        })
        .catch((error) => {
          /*
           * purchase() is written not to throw. If it does, the state
           * of the money is unknown by definition, and unknown is the
           * one thing this will not round off.
           */
          say(
            `The till itself failed after the request went out: ${describeError(error)}. Whether a payment was taken cannot be determined from this page — check ${shelf.verify_hint || "/api/verify"} before trying again.`,
            "uncertain",
          );
          syncDetail(false);
        })
        .finally(() => {
          for (const other of buttons) {
            other.disabled = false;
          }
        });
    });
    row.appendChild(button);
    section.appendChild(row);
  }

  section.appendChild(status);
  section.appendChild(detailPane);
  anchor.insertAdjacentElement
    ? anchor.insertAdjacentElement("afterend", section)
    : doc.body.appendChild(section);
  return section;
}

/** One outcome, one sentence, and the goods when there are goods. */
export function renderResult({ result, say, output, item }) {
  if (result.outcome === "delivered") {
    const parts = [`${item.name}: delivered.`];
    if (result.certId) {
      parts.push(`Certificate ${result.certId}.`);
    }
    if (result.verifyUrl) {
      parts.push(`Verify it any time, free: ${result.verifyUrl}`);
    }
    if (!result.certId && !result.verifyUrl) {
      parts.push(
        "The store answered with the goods but no certificate id could be read from the response — the full body is below.",
      );
    }
    say(parts.join(" "), "delivered");
    output.hidden = false;
    output.textContent = JSON.stringify(result.body, null, 2);
    return;
  }

  if (result.outcome === "declined") {
    say(
      `The store refused the payment, so there are no goods and nothing was settled. It said: ${result.reason}${
        result.authorizationValidBefore
          ? ` The authorization you signed can never be used after unix second ${result.authorizationValidBefore}.`
          : ""
      }`,
      "declined",
    );
    output.hidden = result.body === null || result.body === undefined;
    output.textContent = result.body ? JSON.stringify(result.body, null, 2) : "";
    return;
  }

  if (result.outcome === "refused") {
    const detail = Array.isArray(result.detail)
      ? result.detail
          .map((entry) => `${entry.network}: ${entry.problems.join("; ")}`)
          .join("\n")
      : typeof result.detail === "string"
        ? result.detail
        : "";
    say(result.reason, "refused");
    output.hidden = detail === "";
    output.textContent = detail;
    return;
  }

  /*
   * UNCERTAIN. Everything here is the buyer's, and none of it is a
   * verdict: the key that makes one retry free, the second the signed
   * authorization dies, and where to look the purchase up.
   */
  const lines = [
    "THE OUTCOME OF THIS PAYMENT IS NOT KNOWN.",
    result.reason,
    "It may have gone through. Do not assume either way, and do not simply try again — a fresh attempt signs a fresh authorization and would be a second, honest charge.",
  ];
  if (result.idempotencyKey) {
    lines.push(
      `If you do retry within the minute, send Idempotency-Key: ${result.idempotencyKey} — the same key for the same item and wallet returns the original purchase instead of charging again.`,
    );
  }
  if (result.authorizationValidBefore) {
    lines.push(
      `The authorization you signed cannot be used after unix second ${result.authorizationValidBefore}.`,
    );
  }
  say(lines.join("\n"), "uncertain");
  output.hidden = result.body === null || result.body === undefined;
  output.textContent = result.body ? JSON.stringify(result.body, null, 2) : "";
}

/**
 * Auto-mount, once, when this file is loaded by a real page.
 *
 * Guarded on `document` so the same module imports cleanly into a test
 * runner with no DOM, which is where every assertion above is made.
 */
if (typeof document !== "undefined") {
  const start = () => {
    mountTill({
      doc: document,
      provider: typeof window !== "undefined" ? window.ethereum : undefined,
      shelf: readShelf(document),
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
