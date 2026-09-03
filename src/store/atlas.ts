import { MENU_ITEMS } from "@/store/menu";
import { PUBLISHED_DATASETS } from "@/store/datasets";
import { ROOMS } from "@/store/rooms";
import { shoppingFields } from "@/lib/shopping-fields";

/**
 * THE ATLAS — every door, what it costs, and what it is FOR, in one
 * fetch, arranged the way somebody arriving with a goal would need it.
 *
 * AN EXPERIMENT, SAID OUT LOUD (the keeper, 2026-08-29: "idk if
 * anybody does this so don't be afraid to try... and just see if
 * agents like it"). Nobody publishes this shape as far as we know.
 * It may turn out that agents ignore it entirely and the llms.txt
 * index was always enough. That is a finding either way, and it is
 * cheap to learn: the atlas is counted on the porch like every other
 * surface, so in a month there is a number rather than an opinion.
 *
 * WHY IT IS NOT THE SITEMAP, THE MENU, OR llms.txt. The sitemap lists
 * URLs and says nothing about them. The menu lists what is for sale
 * and nothing that is free. llms.txt is prose an agent must read
 * through. None of them answers the question a reader actually
 * arrives with, which is not "what exists" but "I want to do X — what
 * do I call, does it cost anything, and what comes back?"
 *
 * DERIVED, NOT RETYPED (rule 46). Prices come from the menu, datasets
 * from the dataset roster, rooms from the room list. An atlas that
 * restated any of them would be a second copy of a fact, and the
 * second copy is the one that goes stale — this store has a whole
 * corrections page about that. What IS typed here is the editorial
 * part no other file holds: which door answers which goal, and in
 * what order to call them.
 */

export interface AtlasDoor {
  path: string;
  name: string;
  access: "free" | "paid";
  /** Present on paid doors only, in USDC. Minimum for tiered items. */
  price_usdc?: number;
  method: string;
  /** What it is for, in the reader's terms rather than ours. */
  purpose: string;
  /** The single thing most likely to be misread about it. */
  caution?: string;
}

export interface AtlasTask {
  /** A goal in the reader's words, not the store's. */
  goal: string;
  /** What to call, in order. */
  call: readonly string[];
  /** Why this and not the neighbouring door. */
  note: string;
}

export interface AtlasJourney {
  name: string;
  when: string;
  steps: readonly {
    do: string;
    endpoint?: string;
    method?: string;
    cost: string;
    expect: string;
  }[];
}

/**
 * WHAT TO USE FOR WHAT. The editorial core, and the reason this file
 * exists — every other surface can tell a reader what a door IS, and
 * none of them says which door answers the question they came with.
 */
const TASKS: readonly AtlasTask[] = [
  {
    goal: "I am about to pay an x402 endpoint and want to know if it will work",
    call: ["POST /api/preflight/v2"],
    note: "Free, no account. Checks the door's challenge shape and whether its payTo can actually be credited. It does NOT buy anything, so it cannot tell you the goods arrive — nothing that costs you nothing can.",
  },
  {
    goal: "I have a URL and a wallet and want everything you hold about that door before I decide",
    call: ["POST /api/look/v1"],
    note: "Free, no account. One live probe (the preflight's own) folded with the signed history of the host: rounds probed out of rounds since first sighting, the tier with its fraction, the last round's failed checks, the catalog's agreement. It never says whether to pay; it puts both halves on the table with their denominators.",
  },
  {
    goal: "Somebody handed me a signed offer or receipt and I do not trust it",
    call: ["POST /api/conformance/v1"],
    note: "Free, and it checks anyone's artifacts including our competitors' and our own. Structure, signature and time — never whether the price is fair or the seller is honest.",
  },
  {
    goal: "I want to check something THIS store signed, without trusting this store",
    call: ["GET /api/verify/{id}"],
    note: "Serves the exact bytes a signature covers so you can verify offline with your own library. Free forever, whether or not you bought the thing.",
  },
  {
    goal: "I want to know what the x402 market actually looks like",
    call: ["GET /registry", "GET /inflows", "GET /corpus.json"],
    note: "Registry is what the listings are worth; inflows is what arrived at the addresses they advertise; the corpus is the signed weekly record behind both. All free, all JSON via Accept, none of them a score on anybody.",
  },
  {
    goal: "I want to buy something and I have never used x402",
    call: ["GET /try", "GET /menu.json"],
    note: "/try is a live practice till that settles real money at a price designed not to matter. Learn the flow there before spending on anything you need.",
  },
  {
    goal: "I want to watch one endpoint over time rather than check it once",
    call: ["GET /menu.json"],
    note: "The standing watch is paid, because it costs us a week of probes. One check is free at preflight; the watch is the thing a single check cannot be.",
  },
  {
    /*
     * ADDED 2026-09-03 with the operators' room. Every paid item on
     * the shelf is bought by somebody who runs a door, and the atlas
     * had no goal in their voice.
     */
    goal: "I run an x402 door and want to know what is free and what is for sale, in the order a launch happens",
    call: ["GET /operators"],
    note: "Free, no account. The shelf from the seller's side: four moments from before launch to when something goes wrong, the free instrument named first in each, every price read off the shelf when served. Nothing there ranks, scores or certifies a door.",
  },
  {
    goal: "I think this store published something wrong",
    call: ["GET /corrections"],
    note: "Every claim we got wrong, dated, with what changed. If yours is not there, the issue templates in the repo are the way in.",
  },
] as const;

/**
 * MULTI-STEP FLOWS, because the hard part is rarely one call. Each
 * step says what it costs BEFORE the reader commits to the flow.
 */
const JOURNEYS: readonly AtlasJourney[] = [
  {
    name: "Pay an endpoint you have never paid before",
    when: "You have a URL that returns 402 and you do not know if it settles.",
    steps: [
      {
        do: "Check the door's shape and whether its payTo can be credited",
        endpoint: "/api/preflight/v2",
        method: "POST",
        cost: "free",
        expect: "A verdict plus named advisories. A pass means the shape is right, never that goods arrive.",
      },
      {
        do: "If it serves signed offers, check one",
        endpoint: "/api/conformance/v1",
        method: "POST",
        cost: "free",
        expect: "Structure, signature and time. A conforming offer is still only a promise.",
      },
      {
        do: "Practise the payment flow somewhere it does not matter",
        endpoint: "/try",
        method: "GET",
        cost: "the cheapest thing on the shelf",
        expect: "A real settlement on a real rail, small enough to be a rounding error.",
      },
      {
        do: "Pay the endpoint you came for",
        cost: "theirs",
        expect: "Nothing this store can promise. We observe; we do not guarantee anybody's delivery.",
      },
    ],
  },
  {
    name: "Decide whether to trust an artifact somebody sent you",
    when: "You are holding a signed offer or receipt from a stranger.",
    steps: [
      {
        do: "Verify it at the free desk",
        endpoint: "/api/conformance/v1",
        method: "POST",
        cost: "free",
        expect: "A verdict naming defects from a published vocabulary.",
      },
      {
        do: "Look the defect up rather than guessing what it means",
        endpoint: "/defects.json",
        method: "GET",
        cost: "free",
        expect: "The named class, in words separate tools can share.",
      },
      {
        do: "Check the issuer's history if the artifact is ours",
        endpoint: "/api/verify/{id}",
        method: "GET",
        cost: "free",
        expect: "The exact signed bytes, checkable offline without us.",
      },
    ],
  },
] as const;

/** Doors that cost nothing and are not on the menu. */
/**
 * EXPORTED so test/free-doors-answer-rule-57.spec.ts can walk it. The
 * atlas is what an arriving agent reads to find what is free; a door
 * advertised there and unable to answer the five questions rule 57
 * requires is the gap the rule was written to close.
 */
export const FREE_DOORS: readonly AtlasDoor[] = [
  {
    path: "/api/preflight/v2",
    name: "Preflight",
    access: "free",
    method: "POST",
    purpose: "Check any x402 door's challenge shape and whether its payTo can be credited.",
    caution: "Shape and receivability, not delivery. A pass is not a promise the goods arrive.",
  },
  {
    /*
     * ADDED 2026-08-29. The buyer's half of the free ladder was on
     * llms.txt and the OpenAPI contract and absent from the atlas —
     * the one surface arranged by the goal a reader arrives with,
     * and "will my client actually pay this" is a goal.
     */
    path: "/api/before-you-pay/v1",
    name: "Before you pay",
    access: "free",
    method: "POST",
    purpose:
      "Replay the stock x402 client's own selection logic over a door's challenge: which accept YOUR client would sign, or why it would refuse locally before signing anything.",
    caution:
      "A fact about your configuration, not about the door. It walks selection, never settlement — nothing is signed and no wallet is touched.",
  },
  {
    /*
     * ADDED 2026-09-02 (roadmap L6). The one door that answers the
     * goal a reader arrives with when they hold a URL and a wallet:
     * both halves — the live probe and the held history — in one call.
     */
    path: "/api/look/v1",
    name: "The look",
    access: "free",
    method: "POST",
    purpose: "What this store holds about one x402 door: one live probe folded with the signed chain's history of the host, counts with their denominators, the tier with its fraction.",
    caution: "Not a score and not a safety threshold. Two kinds of fact kept apart; whether they add up to paying is the reader's line to draw.",
  },
  {
    path: "/api/conformance/v1",
    name: "The conformance desk",
    access: "free",
    method: "POST",
    purpose: "Check any issuer's signed offers and receipts — competitors' and our own included.",
    caution: "Structure, signature and time only. Never a judgement about price or honesty.",
  },
  {
    path: "/api/verify/{id}",
    name: "Verify anything we signed",
    access: "free",
    method: "GET",
    purpose: "Serves the exact bytes a signature covers, so you can check it offline with your own library.",
    caution: "Free whether or not you bought the thing. Do not trust this endpoint; run the file.",
  },
  {
    path: "/operators",
    name: "For operators",
    access: "free",
    method: "GET",
    purpose: "The shelf from the seller's side, in the order a launch happens: free first in every stage, every price read off the shelf.",
    caution: "A reading order, not a recommendation to buy. Nothing there scores or certifies a door.",
  },
  {
    path: "/a2a",
    name: "The evidence agent (A2A)",
    access: "free",
    method: "POST",
    purpose: "Hand this store a task the A2A way: message/send with { task, …input } for preflight_endpoint, verify_receipt or get_endpoint_readiness; one bounded artifact back. The card is at /.well-known/agent-card.json.",
    caution: "Evidence, never a judgment: it does not say whether to pay, which door to use, or whether a merchant can be trusted. Read-only and free; the paid instruments stay x402 doors.",
  },
  {
    path: "/corpus/month",
    name: "The state of x402, by month",
    access: "free",
    method: "GET",
    purpose: "The corpus by calendar month: doors named, probed, payable and not at month end, door-weeks across the rounds, defects by name, the month before beside it. A stable address per month to cite.",
    caution: "Closing-week counts and door-week totals are two kinds of number and are never divided into a share. No host is named; nothing is ranked.",
  },
  {
    path: "/feeds",
    name: "Feeds",
    access: "free",
    method: "GET",
    purpose: "Four Atom feeds derived from the record: the week's doors, the corpus chain, the corrections, the disagreements. Poll them instead of the pages.",
    caution: "Entries are pointers with summaries; the derivation and the denominator are on the linked page. Never a ranking.",
  },
  {
    path: "/try",
    name: "The practice till",
    access: "free",
    method: "GET",
    purpose: "A live x402 door for learning the flow against real settlement.",
    caution: "It settles real money. Cheap on purpose, not free.",
  },
] as const;

export function buildAtlas(base: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Collection",
    name: "The atlas — every door, what it costs, and what it is for",
    url: `${base}/atlas.json`,
    description:
      "One fetch that answers 'I want to do X — what do I call, does it cost anything, and what comes back?'. The sitemap lists URLs and says nothing about them; the menu lists what is for sale and nothing that is free; the guide is prose you must read through. This is arranged by the goal a reader arrives with.",
    status:
      "EXPERIMENTAL, and published as one. Nobody we know of serves this shape, so it may turn out agents ignore it and the guide index was always enough. Fetches of this file are counted on the porch like every other surface, so that question gets a number rather than an opinion.",
    how_to_read:
      "start_here maps a goal to the calls that answer it — read that first. journeys are multi-step flows with the cost of each step stated before you commit. doors is the flat roster: free instruments, then everything on the paid shelf with its price, then the published datasets. Everything here is free to read and nothing on this page asks for a key.",
    start_here: TASKS,
    journeys: JOURNEYS,
    doors: {
      free: FREE_DOORS.map((door) => ({ ...door, url: `${base}${door.path}` })),
      /* Derived from the menu: the price a buyer is quoted lives in
       * exactly one place, and it is not here. */
      paid: MENU_ITEMS.map((item) => ({
        id: item.id,
        name: item.name,
        access: "paid" as const,
        price_usdc: item.price_usdc,
        pricing: item.pricing,
        fulfillment: item.fulfillment,
        purpose: item.description,
        buy: `${base}/menu.json`,
        buy_url: `${base}/api/buy/${item.id}`,
        listing_url: `${base}/menu/${item.id}`,
        /* ROADMAP S6 (2026-09-02): when (the routing table reversed),
         * sample_url (the specimen roster) and verify (the one door),
         * the same derivation menu.json carries. */
        ...shoppingFields(item.id, base),
      })),
      /* Derived from the dataset roster, cautions and all. */
      data: PUBLISHED_DATASETS.map((dataset) => ({
        path: dataset.path,
        url: `${base}${dataset.path}`,
        name: dataset.name,
        access: "free" as const,
        purpose: dataset.description,
        caution: dataset.caution,
        cadence: dataset.cadence,
        format: "JSON via Accept: application/json; HTML otherwise",
      })),
      /* Derived from the room list: the pages a reader can walk. */
      rooms: ROOMS.map((room) => ({
        path: room.path,
        url: `${base}${room.path}`,
        name: room.name,
      })),
    },
    also: {
      guide: `${base}/llms.txt`,
      complete_guide: `${base}/llms-full.txt`,
      agent_manual: `${base}/agents.md`,
      openapi: `${base}/openapi.json`,
      x402_discovery: `${base}/.well-known/x402.json`,
      mcp: `${base}/mcp`,
    },
    what_this_is_not:
      "Not a ranking, not advice about which door is best, and not a promise about anybody's delivery — this store's own included. A free instrument tells you what was observed; it never tells you a purchase will work. Prices here are derived from the menu at request time, but the 402 challenge at the door is the only price that binds.",
  };
}
