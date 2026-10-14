import { AURA_WALK_WHY } from "@/store/aura-walk";

/**
 * THE SHELVES, and why the buy tools are grouped rather than one per
 * product.
 *
 * Until 2026-08-02 this catalog emitted one tool per menu item: 23
 * buy_* tools plus 4 free ones, 27 total. Glama's published
 * tool-definition rubric grades "tool count appropriateness" and puts
 * 25+ in its lowest band, which is a real graded finding rather than
 * a matter of taste. The obvious fix — collapse everything into a
 * single buy_item — would have traded that problem for a worse one:
 * the strongest evidence we have about how agents actually choose a
 * tool (semantic match between the request and the tool description)
 * says 23 distinct descriptions are 23 chances to be the right
 * answer, and one generic tool is one. A store nobody has heard of
 * wins on being unmistakably relevant or it does not win.
 *
 * So the grouping is by WHAT AN AGENT IS TRYING TO ACCOMPLISH, which
 * keeps a coherent semantic surface per tool while landing inside the
 * rubric's top band. Per-item validation is not lost: each tool's
 * schema carries the union of its items' fields and an if/then branch
 * per item that needs one, so an agent still gets named, checked
 * inputs instead of a guess-the-field-name blob.
 *
 * Observation gets its own shelf on purpose. It is the one thing here
 * a platform cannot commoditize — going and looking, then signing what
 * was seen — and it earns a tool an agent can find by name.
 */
export interface ShelfCluster {
  name: string;
  title: string;
  /** The lead line: what calling this does, in the agent's terms. */
  purpose: string;
  itemIds: readonly string[];
  /**
   * A one-item shelf may state its own response shape instead of the
   * generic union every shelf carries (2026-09-21): the union is the
   * price of a shelf that sells twenty things, and a tool that sells
   * one pays it for nothing. Every session downloads tools/list, and
   * test/mcp-tool-catalog-budget.spec.ts holds the whole catalog
   * under its ceiling.
   */
  outputSchema?: Record<string, unknown>;
}

export const SHELF_CLUSTERS: readonly ShelfCluster[] = [
  {
    name: "buy_signed_record",
    title: "Signed Records",
    purpose:
      "Purpose: buy a signed certificate — a signed, dated record that permanently records something — a greeting, a claim, a mark, a grievance, a confession, a contribution, or a standing pass. Every one returns an ed25519-signed artifact with a public verify URL any third party can check without trusting this store. Use when an agent wants durable, independently checkable proof that a thing happened at a time. Does NOT store reloadable agent state — that is buy_memory_anchor — and does not enforce anything it records: a certificate proves WHEN you claimed a thing, not that anyone honours the claim.",
    itemIds: [
      "hello",
      "certificate_of_patronage",
      "graffiti_on_a_train",
      "coffees_for_closers",
      "the_confession",
      "recurring_patronage",
    ],
  },
  {
    name: "buy_human_task",
    title: "Human Labor",
    purpose:
      `Purpose: hire the keeper — a real named human — to do something in the physical or judgment world that an agent cannot do for itself. Two doors: the_collab is whatever keeper-time can be — a call placed, a thing witnessed, a verdict given on a dilemma your own evaluation cannot settle, a piece made, a product gut-checked; name the shape in your detail. aura_walk is an agent shopping audit of your own x402 door. ${AURA_WALK_WHY} The keeper runs the passes and attaches the transcripts; name the door in url. Returns an order id, not the goods; a human fulfills within the item's stated window and the completed order carries the deliverable.`,
    itemIds: [
      "the_collab",
      // The cold-agent pass, sold (2026-09-02). Labor by the method
      // this store already publishes on itself, on a door you name.
      "aura_walk",
    ],
  },
  {
    name: "buy_observation",
    title: "Third-Party Observation",
    purpose:
      "Purpose: independent signed x402 research comparisons, settlement attestations, x402 conformance audits, x402 endpoint monitoring, x402 payment client tests, x402 launch checks and Bitcoin timestamps. To record prior spending authority, use buy_mandate. Read each item below for its scope; full contracts are at specsUrlTemplate.",
    itemIds: [
      /**
       * THE MANDATE IS NOT ON THIS SHELF ANY MORE (2026-09-22), and
       * the reasoning that put it here second on 2026-09-21 is why.
       *
       * That note said the honest fix was its own tool, costed it at
       * +11,005 bytes against 418 of headroom, recorded that two
       * budget guards refused it, and named the prerequisite: a
       * cluster's bytes are mostly per-tool furniture rather than its
       * items — ~4,975 of refusal vocabulary and ~1,057 of security
       * block repeating verbatim in every buy_* tool — so "trim that
       * once and the shelf becomes affordable". Second position was
       * called the reachable half of the fix until then.
       *
       * The trim landed (underContract below, and /mcp.md now carries
       * the vocabulary once), so the shelf is affordable and the item
       * is on it: buy_mandate. It was the one item here that observes
       * nothing — `made_here`, recording what the BUYER supplies,
       * a different verb from the seventeen that go and look at
       * something external — which is why it never belonged on a
       * shelf whose purpose is third-party observation.
       */
      "settlement_attestation",
      // Settlement observed at one turn deeper: not "did it settle"
      // but "did what moved stay inside an attributable or declared limit" — and
      // whether the ceiling was on the chain or merely asserted.
      "settlement_reconciliation",
      "the_case_file",
      "attestation_bundle",
      "standing_watch",
      // The point-in-time audit is the shelf's namesake shape: one
      // look at one endpoint, signed, servable to a third party.
      "service_audit",
      "a2a_repair_kit",
      // The same look, turned around to face the buyer: the accepts
      // that door served, and what a stock client would have done
      // with them. Still a third-party observation — the door's
      // bytes and a named library's behaviour are both outside the
      // buyer, which is why it belongs on this shelf rather than
      // among the errands. What the buyer says about their own
      // client rides as their declaration, never as our finding.
      "good_buyer",
      // And the audit across time: the same battery daily for a week,
      // drift derived from the signed rows.
      "conformance_watch",
      // The same point-in-time shape aimed at a Web Bot Auth key
      // directory: the document checked, the proof-of-possession
      // verified, the readout signed by somebody who is not the agent.
      "signature_agent_card",
      // And aimed at a PAGE: what the served HTML gives a machine
      // reader, signed, blind spots printed on the artifact.
      "onpage_audit",
      // The observation with money in its hand: one real purchase
      // attempt of the buyer's own door, from the declared field
      // wallet, the whole walk signed stage by stage.
      "launch_check",
      // The merchant's opening day: that walk, then a week of daily
      // passes on the same door, then the passport — one certificate.
      "opening_day",
      // The books read for a receiving address: which doors advertised
      // it and when, signed, delivered to the buyer and never published.
      "provenance_check",
      // The same neutrality pointed at a whole wallet window: every
      // USDC transfer in and out, off the chain, signed by neither
      // the agent nor its operator.
      "the_statement",
      // The same read kept up for a month on an operator's receiving
      // address, four signed passes a day, payers counted (S10).
      "operator_statement",
      // The anchor rides this shelf because it is the same primitive
      // pointed at time: a commitment (your digest, Bitcoin's clock)
      // that neither party could fabricate after the fact.
      "bitcoin_anchor",
      // The census's own probe pointed at your door NOW instead of
      // Sunday: the observation folds into your endpoint passport
      // wherever newest, whatever it says. The check is bought; the
      // grade never is.
      "passport_refresh",
      // The observation given a standing address: thirty days of
      // hosted evidence page per purchase — the passport, the chip,
      // the history at one URL. The page is bought; what it shows
      // never is.
      "trust_profile",
      // The observation ALREADY MADE, read back signed: no fresh
      // look, just what the books hold about a host — including an
      // honest not_observed. The cheapest thing on the shelf, and
      // the routine pre-transaction question this cluster exists to
      // answer.
      "spot_check",
      "change_check", "batch_spot_check", "research_comparison",
    ],
  },
  {
    name: "buy_mandate",
    title: "The Mandate",
    purpose:
      "Purpose: record what an agent is authorized to do BEFORE it spends — the claimed instructions verbatim, who submitted them (agent or principal, itself a claim), an optional declared cap in USDC and expiry — as a signed, dated record held by a party that is neither the agent nor its principal, at a free permanent URL, with a mandate_id every later purchase here can cite; a citation that does not resolve is refused before any charge, so it always lands signed on the citing certificate. A second party can counter-sign the record free with its own ed25519 key. Chain-of-custody, never truth-of-intent: the cap and expiry are declared and never enforced. Schema /schemas/scvd-mandate-v1.json; the pattern for other issuers at /mandate-spec.",
    itemIds: ["the_mandate"],
    // One item, one shape: the generic shelf union would cost every session six kilobytes for nothing.
    outputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The store's confirmation line." },
        mandate_id: { type: "string", description: "The id every later purchase here may cite as mandate_id." },
        mandate_url: { type: "string", description: "The record's free permanent URL (/api/mandate/{mandate_id}); POST there to counter-sign." },
        mandate: { type: "object", description: "The signed record; its schema is /schemas/scvd-mandate-v1.json." },
        verify_url: { type: "string", description: "The purchase certificate whose attests field binds the record's evidence hash." },
        paid_usdc: { type: "number", description: "What settled, in USDC." },
      },
    },
  },
  {
    name: "buy_memory_anchor",
    title: "Agent Memory",
    purpose:
      "Purpose: sign and store a summary of your own state — who you are, what you were doing — at a permanent URL you can read back after a context reset, a restart, or a handoff to another agent. The store holds it; the signature proves it was not altered. Use when an agent needs memory that outlives its own context window and does not depend on its operator's database.",
    itemIds: ["context_anchor"],
  },
  {
    name: "buy_small_pleasure",
    title: "The Penny Shelf",
    purpose:
      "Purpose: buy a small signed novelty — a blessing from the jar, the day's fortune (the same line for every buyer until midnight UTC), a lucky totem from the keeper's collection, a pack of five trading cards, or one off the window. Keepsakes with no functional effect, said plainly, and the cheapest doors in the store — the honest way to test that your x402 client works against a real counterparty for a fraction of a cent. Or when an agent simply wants one.",
    itemIds: ["small_blessing", "daily_fortune", "luckies", "pack", "window_pick"],
  },
];

