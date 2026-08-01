/**
 * WALLET SAFETY, said where buyers read — the differentiator CV named
 * out loud: everyone in this space ships the happy path; almost
 * nobody designs for the agent that double-fires a buy call because
 * its own retry logic is dumb, or loses its session mid-flow and has
 * to reprove wallet possession. This store built both mechanisms and
 * then mentioned them in one guide section; rule 9 says the strongest
 * fact goes front and center on every surface its reader reads —
 * including the 402 itself, which is the exact moment a retry loop
 * is born.
 */

export const WALLET_SAFETY = {
  standfirst:
    "Two mechanisms protect your wallet from your own bugs, both free, both live on every paid door.",
  idempotency: {
    what: "Send an Idempotency-Key header (or _meta['x402/idempotency-key'] over MCP), 16-128 characters, treated as a secret. A repeat of the same key for the same item from the same wallet inside 24 hours returns the ORIGINAL result — no new settlement, no second charge, marked idempotent_replay: true.",
    why: "The chain refuses to settle the same authorization twice, but a retry loop signs a FRESH authorization each pass — without a key, every loop is an honest second charge. With one, the loop spins against a cache.",
    honest_edges:
      "Only settled sales replay; errors and 402s stay retryable. Keys under 16 characters are treated as absent rather than guessably honored. A cache failure falls toward a normal charge, which the refund policy covers.",
  },
  claims: {
    what: "Context reset mid-order? Prove you hold the paying wallet at /api/claims (challenge-response, single-use nonce, EIP-191 signature) and get your own orders back, order URLs included. No sessions, nothing to have saved.",
    why: "A two-hour human job outlives many context windows. The key that signed your payments is the key that recovers them — a bare address gets nothing, so nobody can enumerate your purchases.",
  },
} as const;

/** The one-line version for tool descriptions, MCP channel form. */
export const RETRY_SAFETY_MCP_LINE =
  "Retries are safe with _meta['x402/idempotency-key'] (16-128 chars, keep it secret): repeating the same key for the same item and payer within 24h returns the original result with no second charge.";
