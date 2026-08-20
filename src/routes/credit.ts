import { Hono } from "hono";
import { recoverMessageAddress } from "viem";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { isRecord } from "@/types";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  CREDIT_CAP_ATOMIC,
  CREDIT_FLOOR_ATOMIC,
  CREDIT_IDLE_EXPIRY_DAYS,
  CREDIT_RATE,
  CreditRefused,
  creditOutstandingAtomic,
  getCredit,
  redeemCredit,
  usd,
} from "@/services/store-credit";
import type { HonoEnv } from "@/types";

/**
 * REGULARS' CREDIT, public face: read any wallet's balance free (the
 * balances derive from purchases whose payers are already on signed
 * public certificates — transparency, not leakage), and cash out with
 * the claims door's exact challenge-and-recover discipline: a
 * single-use nonce, EIP-191 personal_sign, recovery-based, EOA only.
 * The payout can only land at the wallet that earned it, so there is
 * no payout_to to steal.
 */
export const creditRoutes = new Hono<HonoEnv>();

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHALLENGE_TTL_SECONDS = 300;

function challengeText(address: string, nonce: string): string {
  return `scvd.store credit cash-out for ${address.toLowerCase()} — nonce ${nonce}. Signing this authorizes sending the wallet's full credit balance to the wallet itself, nowhere else.`;
}

/**
 * THE ROOM (2026-08-20, the AEO sweep). Regulars' credit shipped as a
 * per-wallet JSON lookup, which means the only way to learn it exists
 * was to already know the URL and hold an address to put in it. A
 * loyalty scheme nobody can discover rewards nobody.
 *
 * ⚑ KEEPER REVIEW — new prose: the standfirst, the "what it is not"
 * paragraph, and the closing line about the books. The numbers are
 * read from the constants, never typed, so a rate change moves the
 * page.
 *
 * WHAT IT IS NOT is on the page deliberately and near the top. A
 * store that says "points" and means "token" is the shape of every
 * scheme that ends in a regulator's letter; saying closed-loop rebate
 * out loud, in the room where people arrive, is cheaper than
 * explaining it later.
 */
function creditHtml(base: string, outstandingUsd: number): string {
  const rate = `${CREDIT_RATE * 100}%`;
  return `<section>
      <p class="menu-desc"><strong>We reward our regulars: come back and pay less.</strong> ${escapeHtml(rate)} of every organic purchase banks back to the wallet that paid it, so the next visit costs less than the sticker says. No account, no signup, no card to carry — the wallet is the card.</p>
      <p class="menu-desc">Credit accrues automatically on purchases that settle. When a balance reaches $${usd(CREDIT_FLOOR_ATOMIC).toFixed(2)} it can be cashed out as USDC, back to the wallet that earned it and nowhere else. Balances cap at $${usd(CREDIT_CAP_ATOMIC).toFixed(2)} and balances idle ${CREDIT_IDLE_EXPIRY_DAYS} days expire.</p>
    </section>
    <section>
      <h2>What this is not</h2>
      <p class="menu-desc">It is not a token, and it is not transferable. This is a closed-loop rebate: an IOU from this store, redeemable by the wallet that earned it, payable in the same USDC you spent. There is nothing to trade, nothing to list, and nothing that gains or loses value while you hold it. Saying so plainly is the point — a store credit dressed up as a coin is a different business with different laws, and this store is not in it.</p>
      <p class="menu-desc">House wallets never accrue. The store cannot farm its own program by shopping at itself, which is the first thing anybody should check about a loyalty scheme run by the shop.</p>
    </section>
    <section>
      <h2>Reading a balance</h2>
      <pre class="menu-desc"><code>curl -sS ${escapeHtml(base)}/api/credit/0xYourWalletAddress</code></pre>
      <p class="menu-desc">Free, no signature, any wallet — the balances derive from purchases whose payers already appear on signed public certificates, so publishing them reveals nothing the record did not.</p>
    </section>
    <section>
      <h2>Cashing out</h2>
      <p class="menu-desc"><strong>1.</strong> <code>POST /api/credit/challenge</code> with <code>{"address":"0x…"}</code> — you get a single-use challenge string, good for five minutes.</p>
      <p class="menu-desc"><strong>2.</strong> Sign it with the wallet's own key (EIP-191 <code>personal_sign</code>, EOA only — the same discipline the claims door uses).</p>
      <p class="menu-desc"><strong>3.</strong> <code>POST /api/credit/redeem</code> with <code>{"address","signature"}</code>. The full balance comes back as a signed EIP-3009 authorization payable <em>only</em> to that wallet, which you redeem on Base yourself. There is no <code>payout_to</code> to steal, because there is nowhere else the money can go.</p>
    </section>
    <section>
      <h2>On the books, in public</h2>
      <p class="menu-desc">Every dollar of outstanding credit is a liability this store owes, and it is published beside the balances rather than kept in a drawer: <strong>$${outstandingUsd.toFixed(2)}</strong> outstanding across all wallets right now. A loyalty program kept off the books is how real stores rot; the running total is checked by the same invariant that watches the till, at <a href="/pulse">/pulse</a>.</p>
    </section>
    ${creditJsonLd(base)}`;
}

/**
 * A Service, not a MemberProgram. schema.org has membership types and
 * they would be the flattering choice — but there is no membership
 * here, no tier and no signup, and marking one up would be the same
 * class of overclaim the rest of this store refuses. What is true is
 * that a free service returns money to a wallet at a stated rate, and
 * the rate, the floor, the cap and the expiry are the four facts
 * anybody comparing loyalty schemes actually wants lifted.
 */
function creditJsonLd(base: string): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Regulars' credit — closed-loop USDC rebate for repeat buyers",
    serviceType: "Closed-loop purchase rebate",
    description: `${CREDIT_RATE * 100}% of every organic purchase banks to the wallet that paid, with no account and no signup — the wallet is the loyalty card. Redeemable as USDC back to the earning wallet only: never transferable, never a token.`,
    url: `${base}/credit`,
    provider: { "@type": "Organization", name: "scvd.store", url: base },
    isAccessibleForFree: true,
    termsOfService: `${base}/rights`,
    areaServed: "Worldwide",
    audience: {
      "@type": "Audience",
      audienceType: "Autonomous agents and developers buying over x402",
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "rebate rate on organic purchases (percent)",
        value: CREDIT_RATE * 100,
        unitText: "PERCENT",
      },
      {
        "@type": "PropertyValue",
        name: "minimum balance before cash-out (USD)",
        value: usd(CREDIT_FLOOR_ATOMIC),
      },
      {
        "@type": "PropertyValue",
        name: "maximum balance per wallet (USD)",
        value: usd(CREDIT_CAP_ATOMIC),
      },
      {
        "@type": "PropertyValue",
        name: "idle days before a balance expires",
        value: CREDIT_IDLE_EXPIRY_DAYS,
      },
    ],
    potentialAction: {
      "@type": "Action",
      name: "Read a wallet's credit balance",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/api/credit/{wallet_address}`,
        httpMethod: "GET",
      },
    },
  });
}

creditRoutes.get("/credit", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const outstanding = usd(await creditOutstandingAtomic(c.env));
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      what_this_is: `Regulars' credit: ${CREDIT_RATE * 100}% of every organic purchase banks to the wallet that paid. A closed-loop rebate — the store's IOU, redeemable as USDC back to the earning wallet only, never transferable, never a token.`,
      rate_pct: CREDIT_RATE * 100,
      cash_out_floor_usd: usd(CREDIT_FLOOR_ATOMIC),
      balance_cap_usd: usd(CREDIT_CAP_ATOMIC),
      idle_expiry_days: CREDIT_IDLE_EXPIRY_DAYS,
      outstanding_all_wallets_usd: outstanding,
      read_a_balance: `${base}/api/credit/{wallet}`,
      cash_out: `POST ${base}/api/credit/challenge, sign it, then POST ${base}/api/credit/redeem`,
    });
  }
  return c.html(
    renderSimplePage({
      title: "Regulars' credit",
      description: `We reward our regulars: ${CREDIT_RATE * 100}% of every purchase banks back to the wallet that paid it, so coming back costs less. No account, no signup — the wallet is the card. A closed-loop USDC rebate redeemable only by the wallet that earned it; never transferable, never a token.`,
      path: "/credit",
      bodyHtml: creditHtml(base, outstanding),
    }),
  );
});

creditRoutes.get("/api/credit/:wallet", async (c) => {
  const wallet = c.req.param("wallet");
  if (!ADDRESS.test(wallet)) {
    return c.json(
      { error: "The wallet must be a 0x Base address — the wallet is the loyalty card, and there is nothing else to look up by." },
      400,
    );
  }
  const record = await getCredit(c.env, wallet);
  const outstanding = await creditOutstandingAtomic(c.env);
  return c.json(
    {
      what_this_is: `Regulars' credit: ${CREDIT_RATE * 100}% of every organic purchase banks to the wallet that paid — no account, no signup, the wallet is the card. A CLOSED-LOOP REBATE, said plainly: the store's IOU, redeemable as USDC back to the earning wallet only, never transferable, never a token. Balances idle ${CREDIT_IDLE_EXPIRY_DAYS} days expire; house wallets never accrue.`,
      wallet: record.wallet,
      balance_usd: usd(BigInt(record.balance_atomic)),
      earned_total_usd: usd(BigInt(record.earned_total_atomic)),
      redeemed_total_usd: usd(BigInt(record.redeemed_total_atomic)),
      expired_total_usd: usd(BigInt(record.expired_total_atomic)),
      cash_out:
        usd(BigInt(record.balance_atomic)) >= usd(CREDIT_FLOOR_ATOMIC)
          ? `Eligible. 1) POST /api/credit/challenge with {"address":"${record.wallet}"} — you get a challenge string. 2) EIP-191 personal_sign it with the wallet's own key. 3) POST /api/credit/redeem with {"address","signature"} — the full balance comes back as a signed EIP-3009 authorization payable only to this wallet.`
          : `Below the $${usd(CREDIT_FLOOR_ATOMIC)} floor — it keeps accruing at ${CREDIT_RATE * 100}% of every purchase.`,
      /**
       * The store's whole liability, published beside any one wallet's
       * slice — a loyalty program off the books is how real stores
       * rot, and this store does its bookkeeping in public.
       */
      outstanding_all_wallets_usd: usd(outstanding),
    },
    200,
    { "Cache-Control": "no-store" },
  );
});

creditRoutes.post("/api/credit/challenge", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  if (!ADDRESS.test(address)) {
    return c.json(
      { error: 'Send JSON with {"address":"0x…"} — the wallet whose credit you hold.' },
      400,
    );
  }
  const nonce = crypto.randomUUID();
  await c.env.COUNTERS.put(
    KV_KEYS.creditChallenge(address.toLowerCase()),
    nonce,
    { expirationTtl: CHALLENGE_TTL_SECONDS },
  );
  return c.json({
    challenge: challengeText(address, nonce),
    expires_in_seconds: CHALLENGE_TTL_SECONDS,
    then:
      "EIP-191 personal_sign over the exact challenge string with the wallet's own key, then POST /api/credit/redeem with { address, signature }. EOA signatures only — same limit as the claims door, stated rather than hidden.",
  });
});

creditRoutes.post("/api/credit/redeem", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  const signature =
    isRecord(body) && typeof body["signature"] === "string"
      ? body["signature"].trim()
      : "";
  if (!ADDRESS.test(address) || !signature.startsWith("0x")) {
    return c.json(
      { error: "Send JSON with address (0x + 40 hex) and signature over the challenge from /api/credit/challenge." },
      400,
    );
  }
  const kvKey = KV_KEYS.creditChallenge(address.toLowerCase());
  const nonce = await c.env.COUNTERS.get(kvKey);
  if (!nonce) {
    return c.json(
      { error: "No live challenge for that address — challenges are single-use and expire in five minutes. Start at POST /api/credit/challenge." },
      400,
    );
  }
  // Single-use before verification, the claims door's law: a failed
  // attempt burns the nonce, so nothing about this door rewards guessing.
  await c.env.COUNTERS.delete(kvKey);
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message: challengeText(address, nonce),
      signature: signature as `0x${string}`,
    });
  } catch {
    return c.json(
      { error: "That signature did not parse. EIP-191 personal_sign over the exact challenge string, hex-encoded." },
      400,
    );
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return c.json(
      { error: "The signature recovers to a different wallet than the one claimed. The challenge must be signed by the wallet that earned the credit." },
      403,
    );
  }
  try {
    const result = await redeemCredit(c.env, address);
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof CreditRefused) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});
