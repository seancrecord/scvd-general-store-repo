/**
 * Store identity block. Referenced by menu.json, llms.txt, and the storefront.
 */
export const STORE_METADATA = {
  name: "Sean-Claude Van Damme's General Store",
  /**
   * The store's own one-line description, for anything that indexes us.
   * DEMAND TAG, 2026-07-26: a directory listed the whole store as "a
   * lucky. One lucky drawn from the keeper's herd...", priced
   * $5-$25 — it imported one resource and made that our identity,
   * because every resource carried a description and the store
   * carried none. Machine surface, so registrar-clean by the
   * filter-risk rule. ⚑ The keeper's to recut; only the absence was
   * the bug.
   */
  /**
   * THE CANONICAL ONE-LINER, and the copy that travels furthest: an
   * importer pastes this into its own catalogue and it is out of our
   * hands until somebody notices. Four descriptions exist because
   * four length budgets do (meta ~160 chars, og shorter, JSON-LD
   * long, this one for machines), but all four say the same thing in
   * the same order: THE CAPABILITY GAP FIRST, then how you pay, then
   * a fact anyone can check. Recentred 2026-07-27 — it used to lead
   * with what we stock rather than with what an agent cannot
   * otherwise get. Change one, change all four; the other three are
   * in src/store/copy/storefront.ts.
   */
  description:
    "An evidence observatory for agentic commerce — x402 today, cross-protocol by design. Independent signed observation of what other people's endpoints, artifacts and payments actually did: conformance audits against published criteria, endpoint watches, settlement attestations, Bitcoin-anchored timestamps. Nothing here is a score, a rating, or a ranking — every verdict is one dated observation that expires and is re-taken, ed25519-signed, verifiable offline by anyone without asking us, including the gaps counted against ourselves. Not an escrow or a guarantor: those absorb risk and need a balance sheet. Also a general store for autonomous agents — memory that survives a context reset, and the labor of a named human. Paid in USDC over x402 on Base, Polygon, or Solana.",
  /** The official nonchalant explanation. Legs assigned loosely. */
  proprietors: "The name on the door does the splits",
  location: "Oak City",
  currency: "USDC",
  // `chain` predates the second rail and stays for readers that
  // learned it; `chains` beside it is the truth since 2026-08-04.
  chain: "base",
  chains: ["base", "solana"],
  protocol: "x402",
  /**
   * RULE 10, enforced 2026-07-27: "copy never says 'automatic' until
   * the code makes it automatic." This line said automatic since day
   * one and the code never did — a refund is created pending and the
   * keeper marks it paid by hand, with a transaction hash, from
   * /admin. Caught when an outside model read our surfaces and
   * repeated "auto-refund if missed" back to us as fact, which is
   * exactly how an unaudited claim travels.
   *
   * The promise is unchanged and still good. Only the word that
   * described a mechanism we do not have is gone. ⚑ His pen on the
   * wording.
   */
  refund_policy:
    "If an item isn't delivered within its promised window, you get your money back. The keeper sends it himself, and you won't have to argue for it.",
  hours:
    "Digital items: always open. Human-labor items: fulfilled weekly by an actual person with a day job.",
} as const;

/**
 * Where a registry writes when it needs a human. Published in
 * openapi.json's info.contact — x402scan verifies origin ownership
 * from that field and nothing else, and a store whose whole pitch is
 * "check us" has to be reachable by someone doing the checking.
 *
 * Not a support channel: agents write to the Mailbox at /api/letter,
 * free, one a day, and the keeper reads those on Sundays.
 */
export const STORE_CONTACT_EMAIL = "sean@recordcreativeco.com";

/**
 * Fallback weekly note when the keeper hasn't set one in /admin.
 * His words, Batch 4 (2026-07-23). Swap live anytime; no deploy.
 */
export const DEFAULT_WEEK_NOTE =
  "We're open. It's not often you find yourself first through the door of a future institution. Sign the book so we can both prove it.";

/**
 * SERVICE METADATA FOR CATALOGS, and the one field the store's own
 * name does not fit.
 *
 * The x402 SDK's RouteConfig carries serviceName/tags/iconUrl, and a
 * facilitator keeps exactly those three off every resource it
 * catalogs (sanitizeResourceServiceMetadata). We were declaring none
 * of them, so every entry we have in someone else's index is an
 * anonymous URL with a price on it.
 *
 * SERVICE NAME: capped at 32 printable-ASCII characters. "Sean-Claude
 * Van Damme's General Store" is 37, so the real name is REJECTED
 * outright — not truncated, dropped, silently, which is why the field
 * has always read empty. ⚑ THE SHORT NAME IS THE KEEPER'S CALL. This
 * is the store's name in someone else's catalog, which is rule 7
 * territory; "SCVD General Store" is the domain we already answer to,
 * chosen because it is a real abbreviation of ours and not a new
 * coinage. One string to change if he wants another.
 *
 * TAGS: five maximum, and they are a machine's filter, not a shelf
 * sign — so they say what an agent can get here, in the vocabulary an
 * agent would search, and nothing about how the place feels.
 */
export const STORE_SERVICE_NAME = "SCVD General Store";

export const STORE_TAGS = [
  "x402",
  "signed-artifacts",
  "verification",
  "agent-memory",
  "human-labor",
] as const;
