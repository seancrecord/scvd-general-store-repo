import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_AUTHORIZATION_SECONDS,
  SHELF_ELEMENT_ID,
  acceptProblems,
  base64FromString,
  buildAuthorization,
  buildTypedData,
  chainName,
  chooseAccept,
  declineReason,
  decodeChallenge,
  encodePaymentHeader,
  evmChainId,
  extractArtifact,
  mountTill,
  purchase,
  randomNonce,
  readShelf,
  stringFromBase64,
} from "./till.js";

/**
 * THE TILL'S TESTS RUN UNDER NODE, NOT THE WORKER POOL, and that is a
 * deliberate choice rather than a convenience.
 *
 * till/till.js is browser JavaScript served byte-for-byte to buyers.
 * The Worker's test pool runs inside workerd, which forbids dynamic
 * code evaluation — so the file could be fetched there and never
 * EXECUTED, and a test that only checks the bytes went out is not a
 * test of a payment path. Under node:test the real module is imported
 * and every money decision in it is exercised against fabricated
 * wallets, clocks, randomness and DOMs.
 *
 * The Worker-side companion (test/browser-till.spec.ts) checks the
 * other half: that the bytes are served, that the pages carry the
 * inert island, and that a reader with scripting off sees a document
 * identical to the one they saw before any of this existed.
 */

/* ------------------------------------------------------------------
 * Fixtures — the store's real 402, copied off the wire.
 * ---------------------------------------------------------------- */

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x1111111111111111111111111111111111111111";
const WALLET = "0x2222222222222222222222222222222222222222";
const SIGNATURE = `0x${"ab".repeat(65)}`;

function baseAccept(overrides = {}) {
  return {
    scheme: "exact",
    network: "eip155:8453",
    amount: "1000",
    asset: USDC_BASE,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
    ...overrides,
  };
}

const SOLANA_ACCEPT = {
  scheme: "exact",
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  amount: "1000",
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  payTo: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE",
  maxTimeoutSeconds: 300,
  extra: { feePayer: "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE" },
};

function challengeHeader(accepts) {
  return base64FromString(
    JSON.stringify({
      x402Version: 2,
      error: "Payment required",
      resource: { url: "https://scvd.store/api/buy/hello" },
      accepts,
    }),
  );
}

/** A response object with only the surface `purchase` actually touches. */
function fakeResponse({ status, headers = {}, json, text = "" }) {
  const lower = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    status,
    type: "basic",
    headers: { get: (name) => lower.get(String(name).toLowerCase()) ?? null },
    json: async () => {
      if (json === undefined) {
        throw new Error("not json");
      }
      return json;
    },
    text: async () => text,
  };
}

/**
 * A wallet. `calls` records every EIP-1193 request so a test can prove
 * what was and was NOT asked of it — a refusal that still popped a
 * signing dialog would be a refusal that cost the buyer something.
 */
function fakeWallet(overrides = {}) {
  const wallet = {
    chainId: "0x2105",
    accounts: [WALLET],
    signature: SIGNATURE,
    signError: null,
    accountsError: null,
    calls: [],
    lastTypedData: null,
    ...overrides,
  };
  wallet.request = async ({ method, params }) => {
    wallet.calls.push(method);
    if (method === "eth_chainId") {
      return wallet.chainId;
    }
    if (method === "eth_requestAccounts") {
      if (wallet.accountsError) throw wallet.accountsError;
      return wallet.accounts;
    }
    if (method === "eth_signTypedData_v4") {
      if (wallet.signError) throw wallet.signError;
      wallet.lastTypedData = JSON.parse(params[1]);
      wallet.signer = params[0];
      return wallet.signature;
    }
    throw new Error(`unexpected method ${method}`);
  };
  return wallet;
}

/**
 * A two-knock store: 402 first, then whatever the test says. Records
 * both requests so the header assertions have something to read.
 */
function fakeStore({ accepts = [baseAccept()], paid, challengeBody } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (requests.length === 1) {
      return fakeResponse({
        status: 402,
        headers: { "PAYMENT-REQUIRED": challengeHeader(accepts) },
        json: challengeBody ?? {
          error: "Payment required",
          idempotency: { suggested_key: "scvd-suggested-hello-29796428" },
        },
      });
    }
    if (typeof paid === "function") {
      return paid(init);
    }
    return (
      paid ??
      fakeResponse({
        status: 200,
        json: {
          deliverable: { note: "hello" },
          certificate: { cert_id: "cert_abc123" },
          verify_url: "https://scvd.store/api/verify/cert_abc123",
          paid_usdc: 0.001,
        },
      })
    );
  };
  return { fetchImpl, requests };
}

const FIXED_NOW = () => 1_800_000_000_000;
const FIXED_CRYPTO = {
  getRandomValues: (array) => {
    array.fill(7);
    return array;
  },
};

function run(options = {}) {
  const store = options.store ?? fakeStore();
  const wallet = options.wallet ?? fakeWallet();
  return purchase({
    url: "/api/buy/hello?src=till",
    provider: wallet,
    fetchImpl: store.fetchImpl,
    nowMs: FIXED_NOW,
    cryptoImpl: FIXED_CRYPTO,
  }).then((result) => ({ result, store, wallet }));
}

/* ------------------------------------------------------------------
 * 1. Reading the 402.
 * ---------------------------------------------------------------- */

test("base64 round-trips text the store might actually send", () => {
  const text = '{"note":"a café, a naïve π, an em—dash"}';
  assert.equal(stringFromBase64(base64FromString(text)), text);
});

test("the challenge is decoded out of the header, and only the header", () => {
  const challenge = decodeChallenge(challengeHeader([baseAccept()]));
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.accepts.length, 1);
  assert.equal(challenge.accepts[0].amount, "1000");
});

test("an absent, unreadable or accept-less header is a refusal, not a guess", () => {
  for (const bad of [undefined, "", "   ", "not-base64!!", base64FromString("nope")]) {
    assert.throws(() => decodeChallenge(bad), /TillRefusal|refus/i, String(bad));
  }
  assert.throws(
    () => decodeChallenge(base64FromString(JSON.stringify({ x402Version: 2 }))),
    /accepts/,
  );
});

test("eip155 chain ids are read, and nothing else is", () => {
  assert.equal(evmChainId("eip155:8453"), 8453);
  assert.equal(evmChainId("eip155:137"), 137);
  assert.equal(evmChainId("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"), null);
  assert.equal(evmChainId("eip155:0x2105"), null);
  assert.equal(evmChainId(undefined), null);
});

/* ------------------------------------------------------------------
 * 2. Choosing what to sign. This is where money is decided.
 * ---------------------------------------------------------------- */

test("an offer missing its EIP-712 domain is never signed", () => {
  const problems = acceptProblems(baseAccept({ extra: undefined }), 8453);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /extra\.name/);
});

test("an offer on another chain is skipped with its reason", () => {
  const problems = acceptProblems(baseAccept({ network: "eip155:137" }), 8453);
  assert.match(problems[0], /chain 137/);
  assert.match(problems[0], /chain 8453/);
});

test("a dollar-shaped amount is refused — atomic units or nothing", () => {
  assert.match(acceptProblems(baseAccept({ amount: 1000 }), 8453)[0], /atomic/);
  assert.match(acceptProblems(baseAccept({ amount: "0.001" }), 8453)[0], /atomic/);
});

test("the CHEAPEST payable tier is chosen, never the first", () => {
  /*
   * The store offers patronage tiers: the same goods at a higher price
   * with the excess recorded as a tip, and the cheapest is not
   * necessarily first in the array. Picking any other one spends money
   * the buyer never agreed to spend.
   */
  const chosen = chooseAccept(
    {
      accepts: [
        baseAccept({ amount: "5000" }),
        baseAccept({ amount: "1000" }),
        baseAccept({ amount: "50000" }),
      ],
    },
    8453,
  );
  assert.equal(chosen.amount, "1000");
});

test("a Solana-only challenge refuses rather than pretending", () => {
  assert.throws(
    () => chooseAccept({ accepts: [SOLANA_ACCEPT] }, 8453),
    (error) => {
      assert.equal(error.stage, "offer");
      assert.match(error.message, /Nothing was signed/);
      assert.match(error.detail[0].problems.join(" "), /not an EVM chain/);
      // No EVM offer exists, so "switch your network" would be a lie.
      assert.doesNotMatch(error.message, /switch/i);
      return true;
    },
  );
});

/*
 * THE FIRST LIVE REFUSAL (the keeper, Rainbow on Ethereum mainnet,
 * 2026-08-27). The till said "offered on chain 8453, and the wallet is
 * connected to chain 1" — correct, complete, and unreadable by anyone
 * whose wallet dropdown says "Ethereum" where the refusal said "1".
 * These tests pin the repair: when the ONLY thing wrong is the wallet's
 * network, the refusal names both sides in wallet words and says the
 * two-tap fix; the per-offer diagnostics survive as detail.
 */
test("a wallet on the wrong network is told the fix in wallet words", () => {
  assert.throws(
    () =>
      chooseAccept(
        {
          accepts: [
            baseAccept(),
            baseAccept({ network: "eip155:137" }),
            SOLANA_ACCEPT,
          ],
        },
        1,
      ),
    (error) => {
      assert.equal(error.stage, "offer");
      assert.match(error.message, /connected to Ethereum mainnet/);
      assert.match(error.message, /sells on Base and Polygon/);
      assert.match(error.message, /switch its network to Base/);
      assert.match(error.message, /Nothing was signed and no money moved/);
      // The full reading still rides along, one entry per skipped offer.
      assert.equal(error.detail.length, 3);
      return true;
    },
  );
});

test("switch is only suggested when switching would actually work", () => {
  // The lone EVM offer is broken beyond its chain (no EIP-712 domain),
  // so sending the buyer to the network picker would strand them there.
  assert.throws(
    () =>
      chooseAccept(
        { accepts: [baseAccept({ network: "eip155:137", extra: undefined })] },
        1,
      ),
    (error) => {
      assert.doesNotMatch(error.message, /switch/i);
      assert.match(error.message, /Nothing was signed/);
      return true;
    },
  );
});

test("chains are named as a wallet names them, numbers as a fallback", () => {
  assert.equal(chainName(1), "Ethereum mainnet");
  assert.equal(chainName(8453), "Base");
  assert.equal(chainName(137), "Polygon");
  assert.equal(chainName(999999), "chain 999999");
});

/*
 * THE FIRST LIVE DECLINE, same walk: the store's 402 carried reason
 * "verify_error" (opaque) and message "self_send_not_allowed" (the
 * story — the keeper had paid from the store's own receiving wallet).
 * The old declineReason returned whichever string came first.
 */
test("a decline the till understands is said in buyer words, code attached", () => {
  const reason = declineReason({
    payment_declined: {
      reason: "verify_error",
      message: "self_send_not_allowed",
    },
  });
  assert.match(reason, /will not buy from itself/);
  assert.match(reason, /\(self_send_not_allowed\)/);
});

test("an unknown decline code is shown as itself, never guessed at", () => {
  assert.equal(
    declineReason({
      payment_declined: { reason: "verify_error", message: "some_new_code" },
    }),
    "verify_error",
  );
  assert.match(
    declineReason({}),
    /gave no readable reason/,
  );
});

/* ------------------------------------------------------------------
 * 3. Building the authorization.
 * ---------------------------------------------------------------- */

test("the authorization copies the store's amount and never recomputes it", () => {
  const accept = baseAccept({ amount: "4000" });
  const authorization = buildAuthorization({
    from: WALLET,
    accept,
    nowSeconds: 1_800_000_000,
    nonce: "0x00",
  });
  assert.equal(authorization.value, "4000");
  assert.equal(authorization.to, PAY_TO);
  assert.equal(authorization.validAfter, "0");
});

test("the validity window is clamped to the house ceiling, not the seller's ask", () => {
  const greedy = buildAuthorization({
    from: WALLET,
    accept: baseAccept({ maxTimeoutSeconds: 86_400 }),
    nowSeconds: 1_000,
    nonce: "0x00",
  });
  assert.equal(greedy.validBefore, String(1_000 + MAX_AUTHORIZATION_SECONDS));

  const modest = buildAuthorization({
    from: WALLET,
    accept: baseAccept({ maxTimeoutSeconds: 60 }),
    nowSeconds: 1_000,
    nonce: "0x00",
  });
  assert.equal(modest.validBefore, "1060");
});

test("the nonce is 32 bytes from a CSPRNG, or there is no nonce", () => {
  assert.match(randomNonce(FIXED_CRYPTO), /^0x[0-9a-f]{64}$/);
  assert.throws(() => randomNonce({}), /random/);
  const a = randomNonce();
  const b = randomNonce();
  assert.notEqual(a, b);
});

test("the EIP-712 domain comes from the offer's extra, never from a default", () => {
  const accept = baseAccept({ extra: { name: "USDC", version: "9" } });
  const typed = buildTypedData(accept, { from: WALLET });
  assert.equal(typed.domain.name, "USDC");
  assert.equal(typed.domain.version, "9");
  assert.equal(typed.domain.chainId, 8453);
  assert.equal(typed.domain.verifyingContract, USDC_BASE);
  assert.equal(typed.primaryType, "TransferWithAuthorization");
  // v4 needs the domain type spelled out in `types`, or wallets throw.
  assert.ok(Array.isArray(typed.types.EIP712Domain));
});

/* ------------------------------------------------------------------
 * 4. The header, and the whole round trip.
 * ---------------------------------------------------------------- */

test("the accepted offer is echoed whole and unchanged", () => {
  const accept = baseAccept();
  const header = encodePaymentHeader({
    accept,
    signature: SIGNATURE,
    authorization: { from: WALLET },
  });
  const decoded = JSON.parse(stringFromBase64(header));
  assert.equal(decoded.x402Version, 2);
  // Deep equality including `extra`: the store deep-compares this, and
  // a rebuilt-from-parts object is the commonest way a client fails.
  assert.deepEqual(decoded.accepted, accept);
  assert.equal(decoded.payload.signature, SIGNATURE);
});

test("a signature that is not 65 bytes is never presented as payment", () => {
  for (const bad of ["0x1234", SIGNATURE + "ab", 42, null]) {
    assert.throws(
      () =>
        encodePaymentHeader({
          accept: baseAccept(),
          signature: bad,
          authorization: {},
        }),
      /ECDSA/,
    );
  }
});

test("a whole purchase puts the signature in PAYMENT-SIGNATURE and delivers", async () => {
  const { result, store, wallet } = await run();

  assert.equal(result.outcome, "delivered");
  assert.equal(result.certId, "cert_abc123");
  assert.equal(result.verifyUrl, "https://scvd.store/api/verify/cert_abc123");
  assert.deepEqual(result.deliverable, { note: "hello" });

  // Two knocks: one free, one paid. The first carries no payment.
  assert.equal(store.requests.length, 2);
  assert.equal(store.requests[0].init.headers["PAYMENT-SIGNATURE"], undefined);

  const paid = store.requests[1].init.headers;
  const presented = JSON.parse(stringFromBase64(paid["PAYMENT-SIGNATURE"]));
  assert.equal(presented.payload.signature, SIGNATURE);
  assert.equal(presented.payload.authorization.from, WALLET);
  assert.equal(presented.payload.authorization.value, "1000");
  assert.deepEqual(presented.accepted, baseAccept());

  // The suggested key rides along, so one retry is free rather than a
  // second honest charge.
  assert.equal(paid["Idempotency-Key"], "scvd-suggested-hello-29796428");

  // And the header is never carried through a redirect.
  assert.equal(store.requests[1].init.redirect, "manual");

  // The wallet was asked for exactly three things, in this order.
  assert.deepEqual(wallet.calls, [
    "eth_chainId",
    "eth_requestAccounts",
    "eth_signTypedData_v4",
  ]);
  assert.equal(wallet.lastTypedData.domain.name, "USD Coin");
});

/* ------------------------------------------------------------------
 * 5. Refusals: no goods, and no false success either way.
 * ---------------------------------------------------------------- */

test("a wrong-chain wallet refuses BEFORE any dialog is opened", async () => {
  const { result, store, wallet } = await run({
    wallet: fakeWallet({ chainId: "0x1" }),
  });
  assert.equal(result.outcome, "refused");
  assert.equal(result.stage, "offer");
  assert.match(result.reason, /Nothing was signed/);
  assert.equal(result.certId, undefined);
  assert.equal(result.deliverable, undefined);
  // No second request, and — the part that matters — no signing dialog.
  assert.equal(store.requests.length, 1);
  assert.deepEqual(wallet.calls, ["eth_chainId"]);
});

test("a declined signature is a refusal, not an error and not a sale", async () => {
  const rejection = Object.assign(new Error("User rejected"), { code: 4001 });
  const { result, store } = await run({
    wallet: fakeWallet({ signError: rejection }),
  });
  assert.equal(result.outcome, "refused");
  assert.equal(result.stage, "sign");
  assert.match(result.reason, /declined the signature/);
  assert.match(result.reason, /nothing can be spent/);
  assert.equal(store.requests.length, 1);
});

test("a second 402 is a decline: no goods, and the store's own reason", async () => {
  const store = fakeStore({
    paid: fakeResponse({
      status: 402,
      json: {
        payment_declined: { reason: "the authorization had already been used" },
      },
    }),
  });
  const { result } = await run({ store });
  assert.equal(result.outcome, "declined");
  assert.match(result.reason, /already been used/);
  assert.equal(result.deliverable, undefined);
  assert.equal(result.certId, undefined);
  // The buyer is told when the instrument they signed dies.
  assert.match(String(result.authorizationValidBefore), /^\d+$/);
});

test("the store answering something other than 402 stops before the wallet", async () => {
  const store = {
    requests: [],
    fetchImpl: async (url, init) => {
      store.requests.push({ url, init });
      return fakeResponse({ status: 500, text: "boom" });
    },
  };
  const { result, wallet } = await run({ store });
  assert.equal(result.outcome, "refused");
  assert.equal(result.stage, "knock");
  assert.match(result.reason, /answered 500/);
  assert.deepEqual(wallet.calls, []);
});

/* ------------------------------------------------------------------
 * 6. UNCERTAIN. The outcome that must never be rounded off.
 * ---------------------------------------------------------------- */

test("a paid request that never comes back is uncertain, not failed", async () => {
  const store = fakeStore({
    paid: () => {
      throw new Error("NetworkError when attempting to fetch resource.");
    },
  });
  const { result } = await run({ store });

  assert.equal(result.outcome, "uncertain");
  // Not a refusal and not a decline: both would be claims about money
  // this page cannot see.
  assert.notEqual(result.outcome, "refused");
  assert.notEqual(result.outcome, "declined");
  assert.equal(result.deliverable, undefined);
  assert.equal(result.certId, undefined);
  // The three facts that let a buyer settle it themselves.
  assert.equal(result.idempotencyKey, "scvd-suggested-hello-29796428");
  assert.match(String(result.authorizationValidBefore), /^\d+$/);
  assert.equal(result.paidAmountAtomic, "1000");
});

test("200 with a body that will not parse is uncertain, never delivered", async () => {
  const store = fakeStore({ paid: fakeResponse({ status: 200 }) });
  const { result } = await run({ store });
  assert.equal(result.outcome, "uncertain");
  assert.match(result.reason, /could not be read/);
  assert.equal(result.certId, undefined);
});

test("a redirect on the paid knock is uncertain and is never followed", async () => {
  const store = fakeStore({
    paid: { ...fakeResponse({ status: 0 }), type: "opaqueredirect" },
  });
  const { result } = await run({ store });
  assert.equal(result.outcome, "uncertain");
  assert.match(result.reason, /redirect/);
});

test("an unreadable status on the paid knock is uncertain, not a decline", async () => {
  const store = fakeStore({ paid: fakeResponse({ status: 503, json: {} }) });
  const { result } = await run({ store });
  assert.equal(result.outcome, "uncertain");
  assert.match(result.reason, /503/);
  assert.equal(result.certId, undefined);
});

test("a delivery whose certificate cannot be read is still not a lie", () => {
  const artifact = extractArtifact({ deliverable: { note: "hi" } });
  assert.equal(artifact.certId, undefined);
  assert.equal(artifact.verifyUrl, undefined);
  assert.deepEqual(artifact.deliverable, { note: "hi" });
});

/* ------------------------------------------------------------------
 * 7. The DOM half: no wallet, no markup.
 * ---------------------------------------------------------------- */

/** The smallest document that answers what mountTill actually asks. */
function fakeDocument() {
  const make = (tag) => ({
    tag,
    children: [],
    attributes: {},
    textContent: "",
    hidden: false,
    listeners: {},
    className: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    addEventListener(name, handler) {
      this.listeners[name] = handler;
    },
    insertAdjacentElement(_position, node) {
      inserted.push(node);
      return node;
    },
  });
  const inserted = [];
  const head = make("head");
  const body = make("body");
  const header = make("header");
  const shelfNode = make("script");
  return {
    inserted,
    head,
    body,
    header,
    shelfNode,
    createElement: make,
    getElementById: (id) => (id === SHELF_ELEMENT_ID ? shelfNode : null),
    querySelector: (selector) =>
      selector === "main.paper header" ? header : null,
  };
}

const SHELF = {
  heading: "Buy one from this browser",
  standfirst: "One signature.",
  house_rule: "This store never asks you to run code.",
  items: [
    { id: "hello", name: "A Signed Hello", price_usdc: 0.001, buy_path: "/api/buy/hello", requires: [] },
  ],
};

test("with no wallet present, the page gains nothing at all", () => {
  const doc = fakeDocument();
  doc.shelfNode.textContent = JSON.stringify(SHELF);

  const mounted = mountTill({ doc, provider: undefined, shelf: readShelf(doc) });

  assert.equal(mounted, null);
  // Not an empty section, not a hidden one, not a style tag: nothing.
  assert.equal(doc.inserted.length, 0);
  assert.equal(doc.head.children.length, 0);
  assert.equal(doc.body.children.length, 0);
});

test("a provider without an EIP-1193 request method is not a wallet", () => {
  const doc = fakeDocument();
  doc.shelfNode.textContent = JSON.stringify(SHELF);
  assert.equal(
    mountTill({ doc, provider: { isMetaMask: true }, shelf: readShelf(doc) }),
    null,
  );
  assert.equal(doc.inserted.length, 0);
});

test("with a wallet present, exactly one section appears", () => {
  const doc = fakeDocument();
  doc.shelfNode.textContent = JSON.stringify(SHELF);

  const mounted = mountTill({
    doc,
    provider: fakeWallet(),
    shelf: readShelf(doc),
  });

  assert.ok(mounted);
  assert.equal(doc.inserted.length, 1);
  assert.equal(doc.inserted[0], mounted);
  const text = JSON.stringify(mounted);
  assert.match(text, /A Signed Hello/);
  // The store's anti-impersonation promise is on the till itself.
  assert.match(text, /never asks you to run code/);
});

test("the full reading is there, folded, until there is something to read", () => {
  /*
   * The buyer's sentence lives in the status line; the raw response
   * and per-offer diagnostics live behind a <details> fold. Before any
   * purchase there is nothing to read, so the fold itself is hidden —
   * not merely closed — and the section shows buttons and prose only.
   */
  const doc = fakeDocument();
  doc.shelfNode.textContent = JSON.stringify(SHELF);
  const section = mountTill({ doc, provider: fakeWallet(), shelf: readShelf(doc) });
  const pane = section.children.find((child) => child.tag === "details");
  assert.ok(pane, "the forensics pane exists");
  assert.equal(pane.hidden, true);
  assert.ok(pane.children.some((child) => child.tag === "summary"));
  assert.ok(pane.children.some((child) => child.tag === "pre"));
});

test("a page with no shelf island grows no till, wallet or not", () => {
  const doc = fakeDocument();
  doc.getElementById = () => null;
  assert.equal(readShelf(doc), null);
  assert.equal(
    mountTill({ doc, provider: fakeWallet(), shelf: readShelf(doc) }),
    null,
  );
  assert.equal(doc.inserted.length, 0);
});

test("an item with required inputs will not buy on an empty field", async () => {
  const doc = fakeDocument();
  doc.shelfNode.textContent = JSON.stringify({
    ...SHELF,
    items: [
      {
        id: "settlement_attestation",
        name: "A Settlement Attestation",
        price_usdc: 0.004,
        buy_path: "/api/buy/settlement_attestation",
        requires: [{ name: "tx_hash" }],
      },
    ],
  });
  const wallet = fakeWallet();
  const section = mountTill({ doc, provider: wallet, shelf: readShelf(doc) });

  const row = section.children.find((child) => child.className === "till-row");
  const button = row.children.find((child) => child.tag === "button");
  button.listeners.click();

  const status = section.children.find((child) =>
    String(child.className).includes("till-status"),
  );
  assert.match(status.textContent, /needs tx_hash/);
  // Nothing was asked of the wallet, because nothing could be bought.
  assert.deepEqual(wallet.calls, []);
});

test("prices read like prices, at both ends of the shelf", () => {
  const doc = fakeDocument();
  doc.shelfNode.textContent = JSON.stringify({
    ...SHELF,
    items: [
      { id: "a", name: "A", price_usdc: 0.001, buy_path: "/a", requires: [] },
      { id: "b", name: "B", price_usdc: 0.5, buy_path: "/b", requires: [] },
      { id: "c", name: "C", price_usdc: 1, buy_path: "/c", requires: [] },
      { id: "d", name: "D", price_usdc: 25, buy_path: "/d", requires: [] },
    ],
  });
  const section = mountTill({ doc, provider: fakeWallet(), shelf: readShelf(doc) });
  const labels = section.children
    .filter((child) => child.className === "till-row")
    .map((row) => row.children.find((child) => child.tag === "button").textContent);
  // Two decimals at least, no trailing zeros past the second: the
  // cheapest thing on the shelf is "$0.001", never "$0.0010".
  assert.deepEqual(labels, ["Pay $0.001", "Pay $0.50", "Pay $1.00", "Pay $25.00"]);
});

test("the default fetch is bound, so a browser does not answer 'Illegal invocation'", async () => {
  /*
   * A REGRESSION TEST FOR A BUG THAT NO INJECTED FETCH CAN CATCH.
   *
   * Every other test here passes its own `fetchImpl`, so the default
   * path — the only one a real buyer takes — is the one nothing
   * exercises. `fetch` is a method on the global object, and calling a
   * detached reference to it is a TypeError in every browser while
   * working fine under Node, which is exactly the shape of defect that
   * ships green and fails on contact with a customer.
   *
   * So the browser's rule is reproduced here: this global refuses to be
   * called with the wrong receiver.
   */
  const original = globalThis.fetch;
  let receiverWasGlobal = false;
  globalThis.fetch = function boundOnly() {
    if (this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch': Illegal invocation");
    }
    receiverWasGlobal = true;
    return Promise.resolve(
      fakeResponse({ status: 404, text: "no such door" }),
    );
  };
  try {
    const result = await purchase({
      url: "/api/buy/hello",
      provider: fakeWallet(),
      nowMs: FIXED_NOW,
      cryptoImpl: FIXED_CRYPTO,
    });
    assert.equal(receiverWasGlobal, true);
    // A 404 is a refusal, not a transport failure — which is the proof
    // the request was actually made rather than thrown away.
    assert.equal(result.outcome, "refused");
    assert.equal(result.stage, "knock");
    assert.match(result.reason, /answered 404/);
  } finally {
    globalThis.fetch = original;
  }
});
