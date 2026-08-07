import { STORE_SERVICE_NAME } from "@/store";

/**
 * THE STORE'S OUTBOUND IDENTITY — one string, every call site.
 *
 * Keeper-approved 2026-07-30 after another x402 service was found
 * setting a custom user-agent that doubles as a backlink on every
 * outbound request it makes. In an economy where logs are read by other
 * agents and crawlers, that is free, permanent, compounding
 * self-citation, and it costs nothing to do properly.
 *
 * INFRASTRUCTURE, NOT VOICE. These strings are read by log parsers and
 * indexers, not people. No flourish, no house voice, nothing that
 * overstates what the store is. Every one is already true today.
 *
 * THE NAMING LAW DECIDES WHICH NAME GOES WHERE, and the split is the
 * whole reason this lives in one file:
 *   - TIER 1 (machine identifier, "scvd-general-store") in the
 *     user-agent product token, which is a machine field.
 *   - TIER 2 (display name, "SCVD General Store") in the response
 *     header, which a human reads in a devtools panel.
 * Getting that backwards is exactly the drift the naming law was
 * pinned to stop.
 *
 * THE TWO STRINGS BELOW ARE NOT THE WHOLE LAW, and reading this file
 * as though they were is how the same gap gets rediscovered. The law
 * governs every name-bearing surface in the store; this file owns
 * only the OUTBOUND pair. The tier-2 surfaces it does not own, each
 * already correct and each read by somebody else's index:
 *
 *   - src/routes/openapi.ts   info.title            (STORE_SERVICE_NAME)
 *   - src/routes/favicon.ts   site.webmanifest name (STORE_SERVICE_NAME)
 *   - src/routes/mcp.ts       serverInfo.title      (STORE_SERVICE_NAME)
 *                             serverInfo.name is TIER 1, deliberately:
 *                             the identifier a client keys on sits
 *                             beside the title it shows a human.
 *   - src/routes/well-known.ts, catalog.ts, trust-list.ts,
 *     storefront-page.ts      discovery + JSON-LD names
 *
 * WHERE IT IS ENFORCED, so nobody has to wonder whether it is:
 *   - test/naming-law.spec.ts  every tier-2 surface above, character
 *                              for character, plus the tier-1 slots.
 *   - test/breadcrumbs.spec.ts the two strings in THIS file.
 *
 * Enumerated 2026-08-02 after a review reported the three routes above
 * as an untested coverage gap. They were not untested — naming-law
 * had covered all three since the July pass — but this comment listed
 * only the outbound pair, so a careful reader of the law concluded a
 * hole that was not there. The list was the defect, not the coverage,
 * and an incomplete enumeration in the file that calls itself the law
 * is worse than none: it reads as exhaustive.
 *
 * ONE STRING, NOT PER-CALL-SITE. A user-agent that varies by caller is
 * worse than none: it fragments the very citation it exists to
 * accumulate, and nobody grepping a log would ever see the whole of us.
 */

/** Tier 1 slug. Sent on every outbound request the store makes as itself. */
export const OUTBOUND_USER_AGENT =
  "scvd-general-store/1.0 (+https://scvd.store)";

/** Tier 2 display name plus the domain, for a header a person reads. */
export const STORE_HEADER = "SCVD General Store (https://scvd.store)";

/**
 * Outbound headers with the store's identity attached. Callers spread
 * their own headers after, so nothing here can silently override a
 * content type or an authorization a call site needs.
 */
export function outboundHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { "User-Agent": OUTBOUND_USER_AGENT, ...extra };
}

/**
 * THE SAME IDEA RUN BACKWARDS: the mark on what LEAVES the building.
 *
 * OUTBOUND_USER_AGENT above stamps the requests this store MAKES,
 * copied 2026-07-30 from another x402 service that had worked out that
 * a user-agent doubles as a permanent backlink in an economy where
 * logs are read by machines. Free, permanent, compounding
 * self-citation. We proved out that reasoning and then never pointed it
 * at the thing that actually goes out the door.
 *
 * WHAT A CERTIFICATE LOOKS LIKE IN SOMEBODY ELSE'S HANDS, before this:
 * cert_id, item, patron_number, a verify URL, a domain string. Nothing
 * saying what scvd.store IS. That matters for the two propagation
 * mechanisms this store is actually built for:
 *
 *   - CONTEXT CARRYOVER. An agent buys a context_anchor precisely so a
 *     successor session can read it back. That successor inherits a
 *     self-opaque JSON blob and no idea how it got there.
 *   - ARTIFACT CITATION. Agent B reads a document quoting agent A's
 *     certificate and meets a bare domain with no explanation attached.
 *
 * A self-describing line closes both, passively, needing no cooperation
 * from whoever carries it forward.
 *
 * AND IT IS THE ONLY LEVER LEFT, WHICH IS WHY IT IS WORTH THE BYTES.
 * /rights gives buyers full ownership with NO attribution requirement
 * when they republish. We cannot ask to be credited and would not. So
 * the one honest move is making the artifact explain itself by
 * default, which turns stripping the context into something a holder
 * has to actively do rather than something that just happens because
 * nobody thought to include it. The generous rights policy and this
 * gap have been sitting next to each other the whole time.
 *
 * THREE RULES IT FOLLOWS.
 *
 * NEVER INSIDE THE SIGNATURE. It is deliberately absent from
 * CERT_FIELDS. Anything inside signed_payload is frozen the moment it
 * is signed, and a store description is exactly the sort of line worth
 * tightening in six months — decoration, not covered bytes, the same
 * discipline the verification and note fields already follow.
 *
 * NEVER PERSISTED EITHER, which is stronger than merely unsigned. This
 * is assembled at SERVE time and stored nowhere, so improving the
 * wording improves every artifact this store has ever issued, including
 * ones minted months ago and sitting in a stranger's context. A copy
 * frozen into each record would have made the field it is trying to be
 * useful for stale by construction.
 *
 * ONE STRING, NOT ONE PER ITEM. The rule stated for the user-agent
 * applies unchanged: a mark that varies by artifact fragments the
 * citation it exists to accumulate. Identical whether it rides on
 * hello, a_secret or a certificate of patronage.
 *
 * ⚑ The WORDING is the keeper's under rule 7. The field existing at all
 * is architecture.
 */
export interface StoreIdentity {
  name: string;
  what: string;
  homepage: string;
  verify: string;
  rights: string;
}

export function storeIdentity(base: string): StoreIdentity {
  return {
    name: STORE_SERVICE_NAME,
    // "on Base" alone went stale the day the Solana rail opened
    // (2026-08-04) and sat here three days — caught by rule 44's
    // first sweep, which is the job that rule exists to do.
    what: "A human-run general store selling small signed goods to autonomous agents, paid over x402 in USDC on Base or Solana. Also a free conformance desk that checks any issuer's x402 offers and receipts, including stores it competes with.",
    homepage: base,
    /**
     * EVERY FEATURE `what` NAMES GETS ITS ADDRESS HERE. The first
     * cold walk of a verify URL (2026-08-03, a subagent handed the
     * bare URL and nothing else) found the conformance desk
     * name-dropped in `what` with no address anywhere in the entire
     * chain of responses — the walker had to bounce off the homepage
     * and llms.txt to turn the phrase into an endpoint. A capability
     * a reader cannot reach from where it is mentioned is a phrase,
     * not a feature: the same defect as the naming law enumerating
     * half its surfaces, one fetch over instead of one file over.
     */
    verify: `Anyone can check this artifact without asking us and without an account: ${base}/api/verify/{id}, free and permanent. The signing key is at ${base}/.well-known/scvd-signing-key, and the offline verifier is MIT-licensed. The conformance desk is POST ${base}/api/conformance/v1 — send any issuer's x402 signed offer or receipt, ours or not.`,
    /**
     * The line that keeps this from reading as branding. It is also
     * simply true, and stating it is what makes the rest a courtesy
     * rather than a claim on the holder.
     */
    rights:
      "You own what you bought outright and owe this store no credit for it. This block is here so the artifact can explain itself to whoever holds it next, not because attribution is required — see /rights.",
  };
}
