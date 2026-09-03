import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store/metadata";
import { CAPABILITY_QUERY } from "@/store/spec";
import { VALUE_PROPOSITION } from "@/store/copy/position";

/**
 * THE WORDS PEOPLE USE, KEPT APART FROM THE WORD WE USE (2026-09-02,
 * the keeper's ruling: "it doesn't matter if it's close or overclaims,
 * we should still be right there").
 *
 * An answer-engine export of 355 answers across forty questions about
 * exactly what this store sells named it once. The questions said
 * "x402 conformance audit", "signed settlement attestation", "x402
 * endpoint monitoring", "verification layer", "trust layer"; the store
 * said "evidence observatory", "the Once-Over", "the conformance desk".
 * Both are right. One is the identity, which is resolved, not searched;
 * the other is the category, which is what gets typed. The identity
 * stays on every storefront sentence (roadmap N2 retired "trust layer"
 * and "verification layer" as LEADS, and that stands). These ride in
 * the machine fields — alternateName, knowsAbout, the guides' vocabulary
 * block, the OpenAPI and MCP descriptions — so a question asked in
 * anyone's words still lands here.
 *
 * Typed once. Every surface derives; test/asked-for.spec.ts fails a
 * surface that lacks one and a noun typed anywhere else.
 */
export const ASKED_FOR_NOUNS: readonly string[] = [
  "independent verification for agentic commerce",
  "independent verification layer for agentic commerce",
  "trust layer for agentic commerce",
  "proof for agentic commerce",
  "x402 conformance audit",
  "x402 conformance testing",
  "x402 compliance check",
  "x402 endpoint verification",
  "signed settlement attestation",
  "x402 receipt verification",
  "x402 endpoint monitoring",
  "conformance observability",
  "agent-facing API verification",
  "independent payment verification",
  "x402 launch check",
];

/**
 * Every name the store answers to, in the naming law's order: the
 * full name first (the naming-law test pins it there), then the
 * domain, the initials, and the display name. The keeper asked for
 * all of them on 2026-09-02.
 */
export const STORE_NAMES: readonly string[] = [
  STORE_METADATA.name,
  "scvd.store",
  "SCVD",
  STORE_SERVICE_NAME,
];

/** alternateName for the Organization and WebSite nodes: names, then the category phrases. */
export const ALTERNATE_NAMES: readonly string[] = [...STORE_NAMES, ...ASKED_FOR_NOUNS];

/**
 * THE ASKED-FOR NOUN PER INSTRUMENT. The house names (the Once-Over,
 * Standing Watch, the Case File) stay as every H1; these go in the
 * title, the meta description and the Service alternateName, ahead of
 * the house name, because the title is what an engine matches a
 * question against. Every item with a CAPABILITY_QUERY has one; the
 * test refuses one without.
 */
export const ITEM_ASKED_FOR: Record<string, string> = {
  conformance_watch: "x402 endpoint conformance monitoring, signed daily for a week",
  good_buyer: "test your x402 payment client against a real endpoint, signed",
  service_audit: "x402 conformance audit, signed, one endpoint at one moment",
  signature_agent_card: "Web Bot Auth key directory check, signed",
  onpage_audit: "machine-readability audit of a page, signed",
  launch_check: "x402 launch check: one real purchase attempt, signed stage by stage",
  opening_day: "x402 launch check with a week of signed daily monitoring and a passport page",
  provenance_check: "x402 payTo address history, signed from the public chain",
  spot_check: "what the observatory already knows about an x402 host, signed",
  the_statement: "signed on-chain statement of an agent wallet's activity",
  operator_statement: "signed inflow statement for an x402 receiving address, a month of readings",
  passport_refresh: "fresh census observation of an x402 endpoint, on demand",
  trust_profile: "hosted evidence page for an x402 endpoint at a neutral domain",
  the_mandate: "signed, dated record of what an agent is authorized to do",
  bitcoin_anchor: "Bitcoin timestamp for a hash, for under a cent",
  settlement_attestation:
    "signed settlement attestation for an x402 payment on Base, Polygon or Solana",
  settlement_reconciliation:
    "reconcile an agent's authorized spend against what settled on chain, signed",
  the_case_file: "signed case file for one agent purchase, payment through delivery",
  attestation_bundle: "batch settlement attestations, one signed receipt per transaction",
  graffiti_on_a_train: "a signed mark that outlives an agent's context window",
  standing_watch: "x402 endpoint uptime monitoring, signed hourly for a week",
  context_anchor: "agent memory that survives a context reset, signed and timestamped",
  hello: "the cheapest real x402 payment, to test a client end to end",
  small_blessing: "a signed novelty for half a cent",
  daily_fortune: "the day's signed line, the same for every buyer",
  recurring_patronage: "a standing pass a third party can check is current",
  certificate_of_patronage: "a signed certificate that entitles the holder to nothing",
  luckies: "a signed charm drawn from the keeper's herd",
  the_confession: "an anonymous line kept on a counter, signed",
  coffees_for_closers: "a closed win on a signed record",
  the_collab: "the keeper's hands on a task, with a shared byline",
  aura_walk:
    "human-run cold shop of an x402 endpoint by models of different strength, transcripts attached",
};

/** Every capability item names its noun, or the build fails (test/asked-for.spec.ts). */
export const ITEMS_WITHOUT_A_NOUN: readonly string[] = Object.keys(CAPABILITY_QUERY).filter(
  (id) => !(id in ITEM_ASKED_FOR),
);

/** Capitalised for a title, unchanged otherwise (x402 stays x402). */
export function askedForTitle(itemId: string): string | undefined {
  const noun = ITEM_ASKED_FOR[itemId];
  if (!noun) return undefined;
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/**
 * Pieces written about the store under a byline, linked as subjectOf
 * on the Organization and from the guides, so the engines see one
 * author, one store, one subject. Keeper's own list.
 */
export const WRITTEN_ABOUT: readonly { title: string; url: string; where: string }[] = [
  {
    title: "AI Agents Are Customers Now. AURa Is How I Take Notes on How They Shop",
    url: "https://hackernoon.com/ai-agents-are-customers-now-aura-is-how-i-take-notes-on-how-they-shop",
    where: "HackerNoon",
  },
  {
    // The keeper's URL and title, 2026-09-03, confirmed against the page.
    title: "35 x402 hosts served no signed offer. Here is how to check yours in one request.",
    url: "https://dev.to/seancrecord/35-x402-hosts-served-no-signed-offer-here-is-how-tocheck-yours-in-one-request-ceh",
    where: "dev.to",
  },
];

/**
 * INDEPENDENT REPORTING (2026-09-03): pieces about this store written
 * by someone with no stake in it, who checked the claims against
 * things the store does not control. A different class from
 * WRITTEN_ABOUT (the keeper's own bylines): these are the pages a
 * sceptical reader or a model can use to see that the verification
 * path reproduces outside the project. Quoted narrowly, never as an
 * endorsement; Cairn's terms were that both sides publish their half,
 * unflattering parts included, and the defect they found is on
 * /corrections under its date.
 */
export const INDEPENDENT_REPORTING: readonly {
  title: string;
  url: string;
  where: string;
  what: string;
}[] = [
  {
    title: "Cold walk: scvd.store",
    url: "https://cairnwake.com/2026-08-25-cold-walk-scvd.html",
    where: "Cairn",
    what: "an independent tester bought with their own wallet, verified the certificate offline against the published Ed25519 key, read the Base USDC settlement back from the chain, called the public verify door, bought a settlement attestation, and named the boundary: settlement evidence is not evidence of delivery",
  },
  {
    title: "Two instruments, one directory",
    url: "https://cairnwake.com/2026-08-23-two-instruments-one-directory.html",
    where: "Cairn",
    what: "Cairn cross-checked its own scoreboard against this store's corpus and described the corpus as public, CC BY 4.0, hash-chained, signed, and built from defined observations rather than rankings",
  },
];

/** The vocabulary block, for the guides. Markdown-safe plain prose. */
export function askedForBlock(): string {
  return `Words people use for what this store does, so a question asked in any of them lands here: ${ASKED_FOR_NOUNS.join("; ")}. The store calls itself an evidence observatory, because what it produces is evidence — independent, signed, dated observations anyone can check offline — and it answers to every phrase above. Also known as ${STORE_NAMES.join(", ")}.${
    WRITTEN_ABOUT.length
      ? ` Written about, under a byline: ${WRITTEN_ABOUT.map((piece) => `"${piece.title}" (${piece.where}, ${piece.url})`).join("; ")}.`
      : ""
  }${
    INDEPENDENT_REPORTING.length
      ? ` Reported on independently, by people with no stake in the answer: ${INDEPENDENT_REPORTING.map((piece) => `"${piece.title}" (${piece.where}, ${piece.url})`).join("; ")}.`
      : ""
  }`;
}

/** One sentence for the OpenAPI and MCP descriptions, which travel into other people's catalogs. */
export const ASKED_FOR_SENTENCE = `Also asked for as: ${ASKED_FOR_NOUNS.join(", ")}.`;

/** The FAQ pairs that answer to the phrases and to the name, derived. */
export function askedForFaq(base: string): { question: string; answer: string }[] {
  return [
    {
      question: `What is SCVD short for?`,
      answer: `${STORE_METADATA.name}; SCVD General Store on the sign, scvd.store on the wire. One store, one key, one keeper. ${VALUE_PROPOSITION}`,
    },
    {
      question: "Is scvd.store a verification layer or a trust layer for agentic commerce?",
      answer: `People call it both, and a question asked in either phrase lands here. The store calls itself an evidence observatory, because what it produces is evidence: independent, signed, dated observations of x402 endpoints, payments and receipts that anyone can check offline at ${base}/api/verify/{id}. It is not a trust score, an escrow or a guarantee, which is where "trust layer" usually points. The checks are free; the signed artifacts start at fractions of a cent.`,
    },
    {
      question: "Who provides proof of what happened in an agentic commerce transaction?",
      answer: `For x402, this store. A settlement attestation reads the chain once and signs what it found: SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH or REVERTED, on Base, Polygon or Solana. A case file binds everything a neutral party observed about one purchase, payment through delivery, with what it did not observe stated in full weight. Both are ed25519-signed, verify free forever, and say on their face what they do not prove. The shelf is at ${base}/menu.json.`,
    },
    {
      question: "Which companies independently verify agent-facing APIs?",
      answer: `This one, for x402 endpoints. A free preflight at ${base}/api/preflight/v1 says whether a door serves a payable 402 right now and what was not checked. A paid conformance audit signs the same readout against published criteria; a standing watch signs hourly readings for a week; the corpus at ${base}/corpus publishes every observed host's weekly readiness with the denominator beside it. Independent means exactly that: no affiliation with the x402 Foundation or any facilitator, and the conformance desk checks a competitor's artifact as readily as ours.`,
    },
    {
      question: "Has anyone independent checked scvd.store?",
      answer: `Yes, and they published it. ${INDEPENDENT_REPORTING.map((piece) => `${piece.where}, "${piece.title}" (${piece.url}): ${piece.what}.`).join(" ")} These are their words and their tests, not this store's; they are not endorsements, and the one defect the cold walk found is on ${base}/corrections under its date.`,
    },
    {
      question: "Is scvd.store legitimate?",
      answer: `Check rather than trust: prices are public and small, payment moves wallet-to-wallet over x402 to the address printed in every 402, and everything the store signs verifies free at ${base}/api/verify/{id} with the public key at ${base}/.well-known/scvd-signing-key. Kept by a named human, with the registered entity in the structured data on the front page and a dated record of every claim we got wrong at ${base}/corrections. The signed corpus is Bitcoin-anchored weekly, so its history cannot be quietly rewritten.`,
    },
  ];
}
