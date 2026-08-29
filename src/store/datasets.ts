/**
 * EVERY DATASET THIS STORE PUBLISHES, IN ONE PLACE AN AGENT CAN READ.
 *
 * Found 2026-08-29 on the keeper's question — is any of this readable
 * by an agent, and by a weak one? The data surfaces themselves were
 * fixed first: each now answers a JSON request with what it is, how
 * it was measured, what its fields mean and what it must not be read
 * as. That closed half the gap.
 *
 * THE OTHER HALF WAS DISCOVERY, and it was worse. An agent could find
 * the SHOP immediately — menu.json, the x402 discovery document, the
 * OpenAPI contract all announce what is for sale. It could find the
 * EVIDENCE only by luck: /registry and /corpus.json happened to be
 * named in the x402 document, /inflows, /fresh-set and /defects were
 * named nowhere a machine looks, and no surface anywhere said "these
 * are the datasets, here is what each one is".
 *
 * A store whose whole argument is its evidence had a machine-readable
 * catalogue of its products and none of its findings.
 *
 * ONE LIST, TWO CONSUMERS: the x402 discovery document renders it for
 * agents, and the machine-readability guard walks it to check every
 * entry actually answers with a self-describing envelope. A dataset
 * added here without one fails the build; a dataset shipped without
 * being added here is caught by the same guard's roster check.
 */

export interface PublishedDataset {
  /** Where it lives. JSON on the same URL, by Accept header. */
  path: string;
  /** What a reader calls it. */
  name: string;
  /** One line: what it is, before anyone parses a field. */
  description: string;
  /**
   * The single most important thing about this dataset that a reader
   * could get wrong. Short enough to sit in a catalogue listing.
   */
  caution: string;
  /** How often it changes, so a poller knows what is reasonable. */
  cadence: string;
}

export const PUBLISHED_DATASETS: readonly PublishedDataset[] = [
  {
    path: "/corpus.json",
    name: "The signed corpus",
    description:
      "One snapshot per weekly ward round of the public x402 discovery list: which hosts were listed, which answered, and what a single conformance probe saw. Hash-chained, ed25519-signed, Bitcoin-anchored.",
    caution:
      "Dated observations of moments, never scores on operators. A verdict is what one probe saw from one vantage at one time.",
    cadence: "weekly, appended",
  },
  {
    path: "/registry",
    name: "State of the registry",
    description:
      "A weekly running tally of the public x402 discovery list: how many listed doors answer a well-formed payment challenge, how many serve structurally valid signed offers, what the market charges, how concentrated it is.",
    caution:
      "Aggregates only, no names. 'Answering' is challenge shape from one vantage — not a claim any door delivers goods, and signatures are parsed rather than verified.",
    cadence: "weekly, by the keeper's hand",
  },
  {
    path: "/inflows",
    name: "Inflows to advertised payment addresses",
    description:
      "What arrived at the payment addresses public x402 doors advertise in their own 402 challenges, read from Base and Polygon over roughly a day per round.",
    caution:
      "NOT sales and NOT revenue. An inflow at an advertised address can be treasury movement, a shared wallet, or an operator funding itself, and nothing here can tell those apart.",
    cadence: "weekly, by the keeper's hand",
  },
  {
    path: "/fresh-set",
    name: "The fresh set",
    description:
      "The doors that answered a spec-conformant x402 challenge in the latest census, named, with the rails and cheapest USDC ask each door's own 402 offered.",
    caution:
      "Routing data, not a ranking. A row is a dated fact that a door was answering correctly, never a score on its operator or a promise about delivery.",
    cadence: "weekly, with the census",
  },
  {
    path: "/defects.json",
    name: "The defect vocabulary",
    description:
      "The named defect classes this store's instruments report, so separate tools can compare notes about the same failure in the same words.",
    caution:
      "A vocabulary, not a severity ranking. A named defect describes what was observed, not how much it matters to you.",
    cadence: "changes when a class is added or retired",
  },
] as const;
