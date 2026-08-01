import { Hono } from "hono";
import { recoverMessageAddress } from "viem";
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
 * five-minute expiry, EIP-191 personal_sign, address recovered from
 * the signature and never taken from the claimant's word. The same
 * key that signed the payments is the key that claims them — no new
 * secret, no session, nothing to persist across the very context
 * reset this exists to survive.
 *
 * EOA signatures only, stated rather than hidden: recovery-based
 * verification cannot check a smart-contract wallet's EIP-1271
 * signature without an RPC client this Worker deliberately does not
 * carry. The buyers this recovers for signed EIP-3009 authorizations
 * with an EOA key by definition.
 */
export const claimsRoutes = new Hono<HonoEnv>();

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHALLENGE_TTL_SECONDS = 300;

function challengeText(address: string, nonce: string): string {
  return `scvd-claims-v1\n${address.toLowerCase()}\n${nonce}`;
}

claimsRoutes.get("/api/claims", (c) => {
  const base = c.env.STORE_BASE_URL;
  return c.json({
    what: "Recover your own orders by proving you hold the wallet that paid — built for the agent whose context reset between paying and delivery.",
    how: [
      `1. POST ${base}/api/claims/challenge with JSON { address: "0x..." } — you get a challenge string and its expiry.`,
      "2. Sign the challenge string with the SAME key that signs your payments (EIP-191 personal_sign, the message is the exact string served).",
      `3. POST ${base}/api/claims with JSON { address, signature } inside ${CHALLENGE_TTL_SECONDS} seconds. A valid signature returns every order this store holds for that wallet, order URLs included.`,
    ],
    why_a_challenge:
      "A bare address lookup would let anyone read anyone's purchase history. The challenge is single-use and expires, so a captured signature replays nothing.",
    limits:
      "EOA signatures only — recovery-based verification cannot check a smart-contract wallet's EIP-1271 signature without an RPC dependency this store deliberately does not carry. Orders only carry a payer since 2026-07-31; older purchases predate the binding and cannot be claimed this way.",
    free: true,
  });
});

claimsRoutes.post("/api/claims/challenge", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const address =
    isRecord(body) && typeof body["address"] === "string"
      ? body["address"].trim()
      : "";
  if (!ADDRESS.test(address)) {
    return c.json(
      { error: "Send JSON with address: a 20-byte hex wallet address (0x + 40 hex characters) — the wallet that paid." },
      400,
    );
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await c.env.COUNTERS.put(
    KV_KEYS.claimChallenge(address.toLowerCase()),
    nonce,
    { expirationTtl: CHALLENGE_TTL_SECONDS },
  );
  return c.json({
    challenge: challengeText(address, nonce),
    sign_how:
      "EIP-191 personal_sign over the exact challenge string, with the key that signs your payments. Then POST /api/claims with { address, signature }.",
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
  if (!ADDRESS.test(address) || !signature.startsWith("0x")) {
    return c.json(
      { error: "Send JSON with address (0x + 40 hex) and signature (0x-prefixed) over the challenge from /api/claims/challenge." },
      400,
    );
  }
  const kvKey = KV_KEYS.claimChallenge(address.toLowerCase());
  const nonce = await c.env.COUNTERS.get(kvKey);
  if (!nonce) {
    return c.json(
      {
        error:
          "No live challenge for that address — challenges are single-use and expire after five minutes. Start again at /api/claims/challenge.",
      },
      400,
    );
  }
  // Single-use before verification even runs: a failed attempt burns
  // the nonce too, so nothing about this door rewards guessing.
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
      {
        error:
          "The signature recovers to a different address than the one claimed. The key that signs your payments is the key that claims them — no other proof is accepted.",
      },
      403,
    );
  }

  const orders = (await listOrders(c.env)).filter(
    (order) => order.payer?.toLowerCase() === address.toLowerCase(),
  );
  const base = c.env.STORE_BASE_URL;
  return c.json({
    address: address.toLowerCase(),
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
