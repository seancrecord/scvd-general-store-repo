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
    path: "/fixtures.json",
    name: "The fixtures",
    description:
      "The recorded 402 doors, MPP challenges and signed-artifact vectors this store tests its own instruments against, at stable URLs with the sha256 of the bytes served, so another instrument can cite the exact bytes.",
    caution:
      "Test material, not observations of live doors, and not signed: a recorded fixture is bytes kept verbatim to test an instrument against; a synthetic one is built from a specification's own examples and says so.",
    cadence: "appended when a fixture joins the tree",
  },
  {
    path: "/corpus.json",
    name: "The signed corpus",
    description:
      "One snapshot per weekly ward round of the public x402 discovery list: which hosts were listed, which answered, and what a single conformance probe saw. Hash-chained, ed25519-signed, Bitcoin-anchored.",
    caution:
      "Dated observations of moments, never a ranking. A verdict is what one probe saw from one vantage at one time; anything derived from the rows carries its rule and its denominator.",
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
      "Routing data, not a ranking. A row is a dated fact that a door was answering correctly, never a promise about delivery and never a verdict on its operator.",
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
  {
    /*
     * ADDED 2026-08-29, the day after it shipped, and the gap is the
     * point: /doors.json was built to close "the census has hundreds
     * of subjects and no index of them" and was then absent from the
     * store's own index of datasets. A catalogue that misses the
     * thing built to fix a catalogue gap is the same failure one
     * level up.
     */
    path: "/doors.json",
    name: "Every door the census has met",
    description:
      "One entry per host the weekly ward round has ever carried, alphabetical, with the most recent dated verdict, the week it was taken, how many rounds carried the host and how many reached a real verdict, and the URL of its full signed history.",
    caution:
      "Not a scoreboard and not a ranking. Each entry is ONE observation with the date it was taken; rounds_scored is published as a denominator so you can see the weight behind a row, and the division that would turn it into a score is deliberately not performed.",
    cadence: "weekly, with the ward round",
  },
  {
    /*
     * ADDED 2026-09-02: the porch had counted every agent-read surface
     * since 2026-08-21 and nothing public read the counters back. This
     * is the reading — and it is a dataset about the observer, not
     * about anyone else, which is why its caution is about floors.
     */
    path: "/observatory",
    name: "The observatory — what gets read here, counted",
    description:
      "Per month and per surface, how many times each agent-read surface of this store was fetched: organic visits beside the house and infrastructure buckets kept out of them, and the channel split inside the organic count. In name order, never by count.",
    caution:
      "Every count is a floor — the porch drops writes past a per-minute budget and the ledger scans a capped number of keys, both stated on the page — and a visit is a fetch, not a visitor. Not a ranking of our own rooms; no rate is served.",
    cadence: "live, in monthly buckets",
  },
  {
    /*
     * The state of x402 by month, 2026-09-03 (roadmap V5).
     */
    path: "/corpus/month",
    name: "The state of x402, by month",
    description:
      "One derived reading per calendar month of signed rounds: doors named, probed, payable and not at the month's closing week; every round's counts summed as door-weeks, labelled apart; defects by registered name in door-weeks; the month before beside it. A stable address per month at /corpus/month/{YYYY-MM}.",
    caution:
      "Two kinds of number, never divided into a share: the closing week is the state at month end, door-weeks count a door once per round it was probed in. No host is named and nothing is ranked; the month before is a reading beside this one, and the direction is the reader's.",
    cadence: "weekly, as the Sunday round appends a week to the month",
  },
  {
    /*
     * The feeds index, 2026-09-03: the four Atom feeds are XML and
     * cannot answer JSON by Accept, so the page that lists them is
     * the dataset, and each feed carries the corrections pointer in
     * its subtitle.
     */
    path: "/feeds",
    name: "Feeds — the record, as Atom",
    description:
      "Four Atom feeds derived at fetch from the same record the pages read: the week's doors (one entry per signed week), the corpus chain (one per signed snapshot), the corrections and the disagreements. Every entry links the page it came from.",
    caution:
      "A feed entry is a pointer with a summary, never the record itself: the derivation and the denominator are on the linked page. Entries are in date order because feed readers expect it, not because any door is ranked.",
    cadence: "weekly for the two corpus feeds; the other two when something happens",
  },
] as const;
