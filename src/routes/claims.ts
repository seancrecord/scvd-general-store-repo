import { Hono } from "hono";
import { recoverMessageAddress } from "viem";
import * as ed25519 from "@noble/ed25519";
import { canonicalAddress } from "@/lib/addresses";
import { decodeBase58 } from "@/lib/base58";
import { KV_KEYS } from "@/lib/kv-keys";
import { listOrders } from "@/services/orders";
import { isRecord, type HonoEnv } from "@/types";

/**
 * THE CLAIMS DOOR — context-reset recovery, PROBLEMS.md #17, built.
 *
 * The failure it exists for: an agent pays for a two-hour human job,
 * its process resets at minute ten, and the respawned instance holds
 * no order id — the goods complete, claimed by nobody. Everything
 * needed to fix that already binds: every order carries the payer
 * wallet. This door lets a wallet prove itself LIVE and get its own
 * orders back.
 *
 * THE SHARP EDGE, named in the ledger before this was built: the door
 * must prove POSSESSION OF THE KEY, never accept a bare address — an
 * address-only lookup would be a purchase-history enumeration service
 * for anybody's wallet. So: challenge-response, single-use nonce,
 * five-minute expiry, the address never taken from the claimant's
 * word. The same key that signed the payments is the key that claims
 * them — no new secret, no session, nothing to persist across the
 * very context reset this exists to survive.
 *
 * BOTH RAILS (2026-08-19; EVM-only for its first three weeks, the
 * last door in the store that was): the address's shape picks the
 * proof, the same identifier-shape dispatch as the till and the
 * attestation desk. An EVM claimant signs EIP-191 personal_sign and
 * we recover the address from the signature; a Solana claimant signs
 * the challenge with the wallet's ed25519 signMessage and we verify
 * against the address ITSELF, which IS the public key — no recovery
 * step exists or is needed on that rail.
 *
 * EOA / ed25519 keys only, stated rather than hidden: recovery-based
 * verification cannot check a smart-contract wallet's EIP-1271
 * signature without an RPC client this Worker deliberately does not
 * carry, and a Solana multisig PDA is an account, not a key, so it
 * cannot signMessage at all. The buyers this recovers for signed
 * EIP-3009 authorizations or SVM transfers with a raw key by
 * definition.
 */
export const claimsRoutes = new Hono<HonoEnv>();

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Base58, 32-44 chars — same shape rule as the till (lib/payments). */
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const CHALLENGE_TTL_SECONDS = 300;

type Rail = "evm" | "solana";

function railOf(address: string): Rail | null {
  if (EVM_ADDRESS.test(address)) return "evm";
  if (SOLANA_ADDRESS.test(address)) return "solana";
  return null;
}

/**
 * canonicalAddress lowercases hex and preserves base58 byte-for-byte
 * (lib/addresses.ts) — so the challenge text, the KV key and the
 * order match all speak the same canonical form on both rails.
 */
function challengeText(address: string, nonce: string): string {
  return `scvd-claims-v1\n${canonicalAddress(address)}\n${nonce}`;
}

/**
 * A Solana wallet's signMessage yields 64 ed25519 bytes; clients hand
 * them on as base58 (Phantom convention) or hex. Both accepted, both
 * the same bytes.
 */
function solanaSignatureBytes(signature: string): Uint8Array | null {
  if (/^(0x)?[0-9a-fA-F]{128}$/.test(signature)) {
    const hex = signature.replace(/^0x/, "");
    const bytes = new Uint8Array(64);
    for (let i = 0; i < 64; i += 1) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  const decoded = decodeBase58(signature);
  return decoded && decoded.length === 64 ? decoded : null;
}

claimsRoutes.get("/api/claims", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    what: "Recover your own orders by proving you hold the wallet that paid — built for the agent whose context reset between paying and delivery. Both rails: EVM (Base) and Solana addresses alike.",
    how: [
      `1. POST ${base}/api/claims/challenge with JSON { address } — 0x + 40 hex (Base) or base58 (Solana), the wallet that paid. You get a challenge string and its expiry.`,
      "2. Sign the challenge string with the SAME key that signs your payments. EVM: EIP-191 personal_sign. Solana: your wallet's signMessage (ed25519) over the exact UTF-8 string.",
      `3. POST ${base}/api/claims with JSON { address, signature } inside ${CHALLENGE_TTL_SECONDS} seconds — EVM signatures 0x-hex; Solana signatures base58 or hex. A valid signature returns every order this store holds for that wallet, order URLs included.`,
    ],
    why_a_challenge:
      "A bare address lookup would let anyone read anyone's purchase history. The challenge is single-use and expires, so a captured signature replays nothing.",
    limits:
      "Raw keys only: EVM verification is recovery-based and cannot check a smart-contract wallet's EIP-1271 signature (no RPC dependency here, deliberately), and a Solana PDA/multisig is an account rather than a key, so it cannot signMessage. Solana addresses are case-sensitive base58 — send yours exactly. Orders only carry a payer since 2026-07-31; older purchases predate the binding and cannot be claimed this way.",
    free: true,
  });
});

claimsRoutes.post("/api/claims/challenge", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  if (!railOf(address)) {
    return c.json(
      { error: "Send JSON with address: the wallet that paid — 0x + 40 hex characters (Base) or a base58 Solana address (case-sensitive, sent exactly)." },
      400,
    );
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await c.env.COUNTERS.put(
    KV_KEYS.claimChallenge(canonicalAddress(address)),
    nonce,
    { expirationTtl: CHALLENGE_TTL_SECONDS },
  );
  return c.json({
    challenge: challengeText(address, nonce),
    sign_how:
      railOf(address) === "evm"
        ? "EIP-191 personal_sign over the exact challenge string, with the key that signs your payments. Then POST /api/claims with { address, signature }."
        : "Your wallet's signMessage (ed25519) over the exact challenge string, with the key that signs your payments. Send the signature base58 or hex. Then POST /api/claims with { address, signature }.",
    expires_in_seconds: CHALLENGE_TTL_SECONDS,
    single_use: true,
  });
});

claimsRoutes.post("/api/claims", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  const signature =
    isRecord(body) && typeof body["signature"] === "string"
      ? body["signature"].trim()
      : "";
  const rail = railOf(address);
  if (!rail || signature.length === 0) {
    return c.json(
      { error: "Send JSON with address (0x + 40 hex, or base58 Solana) and signature over the challenge from /api/claims/challenge." },
      400,
    );
  }
  const canonical = canonicalAddress(address);
  const kvKey = KV_KEYS.claimChallenge(canonical);
  const nonce = await c.env.COUNTERS.get(kvKey);
  if (!nonce) {
    return c.json(
      {
        error:
          "No live challenge for that address — challenges are single-use and expire after five minutes. Start again at /api/claims/challenge. (Solana addresses are case-sensitive: the claim must use the exact string the challenge was issued for.)",
      },
      400,
    );
  }
  // Single-use before verification even runs: a failed attempt burns
  // the nonce too, so nothing about this door rewards guessing.
  await c.env.COUNTERS.delete(kvKey);

  const challenge = challengeText(address, nonce);
  if (rail === "evm") {
    let recovered: string;
    try {
      recovered = await recoverMessageAddress({
        message: challenge,
        signature: signature as `0x${string}`,
      });
    } catch {
      return c.json(
        { error: "That signature did not parse. EIP-191 personal_sign over the exact challenge string, hex-encoded." },
        400,
      );
    }
    if (recovered.toLowerCase() !== canonical) {
      return c.json(
        {
          error:
            "The signature recovers to a different address than the one claimed. The key that signs your payments is the key that claims them — no other proof is accepted.",
        },
        403,
      );
    }
  } else {
    const signatureBytes = solanaSignatureBytes(signature);
    const publicKey = decodeBase58(canonical);
    if (!signatureBytes || !publicKey || publicKey.length !== 32) {
      return c.json(
        { error: "That signature did not parse. Solana claims want your wallet's ed25519 signMessage output over the exact challenge string — 64 bytes, base58 or hex." },
        400,
      );
    }
    let valid = false;
    try {
      valid = await ed25519.verifyAsync(
        signatureBytes,
        new TextEncoder().encode(challenge),
        publicKey,
      );
    } catch {
      valid = false;
    }
    if (!valid) {
      return c.json(
        {
          error:
            "The signature does not verify against the claimed address. On Solana the address IS the public key: the key that signs your payments is the key that claims them — no other proof is accepted.",
        },
        403,
      );
    }
  }

  const orders = (await listOrders(c.env)).filter(
    (order) =>
      order.payer !== undefined &&
      canonicalAddress(order.payer) === canonical,
  );
  const base = c.env.STORE_BASE_URL;
  return c.json({
    address: canonical,
    orders: orders.map((order) => ({
      order_id: order.order_id,
      order_url: `${base}/api/order/${order.order_id}`,
      item: order.item_id,
      status: order.status,
      created_at: order.created_at,
      sla_hours: order.sla_hours,
      cert_id: order.cert_id,
      ...(order.completed_at ? { completed_at: order.completed_at } : {}),
    })),
    note:
      orders.length === 0
        ? "No orders bound to this wallet. Orders carry a payer since 2026-07-31; anything older predates the binding, and instant purchases deliver in their own response rather than opening an order. The mailbox at /api/letter reaches the keeper for anything this door cannot see."
        : "Your orders, proven yours by the key that paid for them. Poll each order_url for status and the deliverable; nothing about this claim changed any order's state.",
  });
});
