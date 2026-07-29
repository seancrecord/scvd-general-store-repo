import { BASE_CHAIN, BASE_USDC } from "@/lib/base-rpc";

/**
 * WHAT THIS STORE RESTS ON, AND WHAT BREAKS WHEN EACH PIECE DOES.
 *
 * The honest version of the keeper's idea, 2026-07-29: name the large
 * companies in the stack as a trust signal.
 *
 * THE DISHONEST VERSION USES NEARLY THE SAME WORDS. "Powered by
 * Coinbase. Built on Base. Secured by Cloudflare." Every one of those
 * is technically defensible and all three imply a relationship that
 * does not exist — nobody at any of those companies has heard of this
 * store. That is borrowed credibility, it is the move the trust list's
 * scope guard exists to prevent, and an agent doing diligence finds no
 * corroboration on the other end, which costs more than the sentence
 * ever earns.
 *
 * So this is a DEPENDENCY DISCLOSURE instead. Not "they vouch for us"
 * but "here is what we rest on, here is what fails when each one does,
 * and here is what you lose in that case." It is information a careful
 * buyer needs and almost nobody volunteers, every line is checkable
 * from outside, and it claims no endorsement at all.
 *
 * One line, if it needs compressing: WE DEPEND ON THEM; THEY HAVE
 * NEVER HEARD OF US; BOTH FACTS ARE PUBLISHED.
 *
 * It is the supply-chain mirror of /house-ledger.json — that document
 * says what we control, this one says what we don't.
 */

export interface StackDependency {
  /** What it is, named plainly rather than branded. */
  name: string;
  /** What it does for this store, in one sentence. */
  role: string;
  /** What stops working the moment it does. Stated without hedging. */
  when_it_fails: string;
  /** What the buyer loses, which is the part that matters to them. */
  what_you_lose: string;
  /** How an outsider can confirm we actually depend on it. */
  how_to_check: string;
  /**
   * Whether we could route around it. Honest answers only; "no" is the
   * common one and pretending otherwise would make the whole document
   * decorative.
   */
  substitutable: "no" | "with work" | "yes";
}

export const STACK_DEPENDENCIES: readonly StackDependency[] = [
  {
    name: "The Coinbase Developer Platform facilitator",
    role: "Verifies and settles every payment this store takes. We are a service, never the facilitator — we never hold your funds and never move them ourselves.",
    when_it_fails:
      "Nothing here can be bought. Not slowly, not partially: the gate settles before it hands over goods, so a facilitator outage means every paid door answers 402 and no artifact is minted. No amount of our own code fixes it.",
    what_you_lose:
      "Nothing you paid for. A payment that does not settle mints nothing, consumes nothing, and leaves no order behind — that ordering is deliberate and it is the one guarantee that holds through an outage.",
    how_to_check:
      "Every 402 this store issues names the scheme and network it will accept; the facilitator is the party that answers a verify call for them.",
    substitutable: "with work",
  },
  {
    name: "Base",
    role: "The chain the money moves on. Every settlement is a real on-chain USDC transfer.",
    when_it_fails:
      "Settlement stops. Reads stop too, which means settlement_attestation — the one item that queries the chain — cannot answer and will say so rather than guess.",
    what_you_lose:
      "Nothing already bought. Certificates verify against our signing key rather than against the chain, so every artifact this store has ever issued still verifies with Base down.",
    how_to_check: `Our 402s advertise ${BASE_CHAIN}, and every settlement is a transaction anyone can look up.`,
    substitutable: "no",
  },
  {
    name: "USDC on Base",
    role: "The only asset this store prices in, at the contract address published in every challenge.",
    when_it_fails:
      "A depeg or a contract pause stops payment. The prices here are small enough that a depeg is an accounting curiosity rather than a business event, but a pause is a hard stop.",
    what_you_lose:
      "Nothing retroactive. Past settlements are past; this is a forward-looking dependency only.",
    how_to_check: `The asset in every 402 is ${BASE_USDC}.`,
    substitutable: "with work",
  },
  {
    name: "Cloudflare Workers",
    role: "The whole store, one Worker. Every page, every door, every counter.",
    when_it_fails:
      "The store is gone from the internet for the duration. Not degraded — absent.",
    what_you_lose:
      "Access to your artifacts while it lasts, including verification. THIS IS THE WORST ONE FOR A BUYER and it is worth saying plainly: the certificates we sign are only as reachable as this host, and 'never take a verify URL down' is a rule we hold rather than a property we own.",
    how_to_check:
      "Resolve scvd.store and read the response headers. It is not hidden.",
    substitutable: "with work",
  },
  {
    name: "The store's own ed25519 signing key",
    role: "Signs every certificate, every attestation, the trust list, and the house ledger.",
    when_it_fails:
      "If it is lost, nothing new can be signed and every artifact ever issued becomes unverifiable. If it is stolen, anything can be signed in our name, which is worse.",
    what_you_lose:
      "The thing you actually bought. A certificate whose key cannot be checked is a sentence rather than an artifact. This is the one dependency with no substitute and no recovery, which is why signature tenure is treated here as the asset that cannot be bought back.",
    how_to_check:
      "The public key hangs at /.well-known/scvd-signing-key and rides inside every JSON 402 body, so you can verify a signature without a second request.",
    substitutable: "no",
  },
  {
    name: "Cloudflare KV",
    role: "The books: orders, certificates, counters, the guestbook.",
    when_it_fails:
      "Reads go stale or empty. Certificates already minted are stored here, so a KV loss is an artifact loss — the signature would still be valid and the record would be gone.",
    what_you_lose:
      "Retrieval, not validity. If you kept your own copy of a certificate, its signature still checks against the published key with our storage in ruins. Keeping your own copy is therefore worth doing, and we would rather say so than be the only place your receipt exists.",
    how_to_check:
      "Buy the cheapest thing on the shelf and keep the response. It contains everything needed to verify without us.",
    substitutable: "with work",
  },
] as const;

export const STACK_STANDFIRST =
  "Everything this store rests on that it does not control, what stops working when each one does, and what you lose in that case. Published because a buyer assessing an origin needs its failure modes more than its logos, and almost nobody volunteers them.";

export const STACK_NOT_AN_ENDORSEMENT =
  "NONE OF THIS IS AN ENDORSEMENT, IN EITHER DIRECTION. We depend on these services; not one of them has heard of this store; both facts are published here together. If you have seen a small operation imply a partnership by listing a large company's name, this is the same list written the honest way — as exposure rather than as credibility.";

export const STACK_HONEST_LIMIT =
  "This is what we know we depend on. A dependency we have not thought of is not disclosed by this document, and the list is maintained by hand rather than derived from anything, so treat it as a signed and dated statement of our own understanding — not as an audit. Where it is wrong, it is wrong in the direction of things we forgot.";

export const STACK_WHAT_SURVIVES =
  "What survives all of it: an ed25519 signature over a canonical JSON certificate. If you keep the artifact you bought, its signature checks against the published key with this store, its host, and its books all gone. That is the whole reason the goods are shaped this way.";
