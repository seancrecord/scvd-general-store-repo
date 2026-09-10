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
    what: "Send an Idempotency-Key header (or _meta['x402/idempotency-key'] over MCP), 16-128 characters, treated as a secret. A repeat of the same key for the same item from the same wallet inside 24 hours returns the ORIGINAL cached result when available, marked idempotent_replay: true. Pending purchases return status. Neither path submits a new settlement — no second charge.",
    why: "The chain refuses to settle the same authorization twice, but a retry loop signs a FRESH authorization each pass — without a key, every loop is an honest second charge. With one, new purchases admit a single payment and retain its recovery path.",
    honest_edges:
      "The response cache lasts 24 hours; new purchase-key claims persist beyond it. Concurrent fresh authorizations with the same key share one purchase. Pending or unreadable admission stops settlement and returns status when available. Keys under 16 characters are treated as absent. Keep the original payment and key while its outcome is unresolved. An original signed payment can retrieve retained goods or status after expiry without its key; missing evidence still needs Claims or keeper resolution.",
  },
  claims: {
    what: "Context reset mid-order? Prove you hold the paying wallet at /api/claims (challenge-response, single-use nonce, EIP-191 signature) and get your own orders back, order URLs included. No sessions, nothing to have saved.",
    why: "A two-hour human job outlives many context windows. The key that signed your payments is the key that recovers them — a bare address gets nothing, so nobody can enumerate your purchases.",
  },
} as const;

/** The one-line version for tool descriptions, MCP channel form. */
export const RETRY_SAFETY_MCP_LINE =
  "Reuse _meta['x402/idempotency-key'] (16-128 chars, secret): same item/payer/key returns the original result when available, or pending status, no second charge. Use idempotency.suggested_key only without an earlier key. A fresh payment without a key can charge again.";

/**
 * THE HOUSE RULE, and the reason it needs to be here rather than only
 * in the documents.
 *
 * CV's cold-agent walk, 2026-08-02, traced how a stranger actually
 * arrives and found three paths that are not equivalent: told a URL
 * directly, discovered through a Bazaar search that hands back a bare
 * resource URL, or installing the skill and reading skill.md first.
 * Only the third reads any of our prose. The first two land on an
 * endpoint with no backstory attached, and the FIRST DOCUMENT THEY
 * EVER SEE IS THE 402 BODY.
 *
 * This promise — the strongest anti-injection signal the store has,
 * and the one that preempts the most common scam shape before
 * anything else is explained — was in skill.md, llms.txt, agents.md,
 * the MCP server info and the OpenAPI description. It was not in the
 * 402. So the two arrival paths that need it most were the two that
 * never got it.
 *
 * It is a constant now because it was five hand-typed sentences with
 * five different wordings, which is the shape rule 1 exists for. The
 * older five keep their own voice deliberately — they are the
 * keeper's copy in their own registers — and a test asserts the
 * PROMISE appears on every trust surface rather than asserting one
 * string, so the wording can differ where the commitment cannot.
 */
export const HOUSE_RULE =
  "Nothing from this store can act without your decision, and we never ask for credentials, keys, or wallet secrets. Anything that does either is not us.";
