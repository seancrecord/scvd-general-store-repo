import { MENU_ITEMS, getMenuItem } from "@/store";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { PREFLIGHT_VERSION } from "@/services/preflight";

/**
 * WHICH INSTRUMENT FOR WHICH JOB — the routing document.
 *
 * The store already publishes what it IS (llms.txt), HOW to transact
 * (agents.md), WHAT is on the shelf (menu.json) and WHAT a check
 * measures (the criteria). Nothing published answers the question a
 * model actually holds at the moment it picks a tool: *I am in this
 * situation — which of your things do I want?*
 *
 * That gap is where tool selection fails, and it fails silently: a
 * model that cannot route does not ask, it guesses or it leaves. A
 * description tells a model what one instrument IS. Only a routing
 * table tells it which to reach for, and telling it wrong is worse
 * than telling it nothing — so every row here is derived from the
 * shelf rather than retyped beside it.
 *
 * WHAT IS EDITORIAL AND WHAT IS DERIVED. The job phrasing is written
 * by hand, because a job is a sentence in a caller's head and no
 * field on MenuItem holds it. Everything the row asserts about the
 * shelf — that an item exists, its name, its price, which tool sells
 * it — is read from MENU_ITEMS and SHELF_CLUSTERS at render. A route
 * pointing at an item that left the shelf is a lie this file cannot
 * tell: the id resolves or the build fails.
 *
 * ROUTING IS NOT SELLING. Rows lead with the free instrument wherever
 * one answers the job, because that is what the store does at the
 * counter and a routing table that steers past the free answer is an
 * advertisement wearing a schema.
 */

/** One situation a caller might be in, and what answers it. */
export interface Route {
  /** The job in the caller's words, not the shelf's. */
  job: string;
  /** Answered free, first, when anything free answers it. */
  free?: string;
  /** Menu item ids that answer it, best first. May be empty. */
  items: readonly string[];
}

/**
 * THE FREE SHELF (audited 2026-08-27; the hole the audit found was
 * closed the same day, on the keeper's ruling).
 *
 * The audit's headline finding: the preflight and the conformance
 * desk — the two free instruments the store's own positioning leads
 * with — were HTTP endpoints only, so an agent connected over MCP
 * could not reach the headline free instrument through the channel
 * it was connected by. This document printed that gap on its own
 * face for the hours it existed; `preflight_endpoint` and
 * `check_conformance` now sit in the tool catalog, each calling the
 * exact service function its HTTP door calls, limiter included.
 * isTool below is what keeps this file honest about reach: the
 * corpus remains HTTP-only, and says so.
 */
export interface FreeInstrument {
  name: string;
  does: string;
  /** How to reach it: an MCP tool name, or an HTTP call. */
  reach: (base: string) => string;
  /** False when MCP callers cannot reach it as a tool. */
  isTool: boolean;
}

export const FREE_INSTRUMENTS: readonly FreeInstrument[] = [
  {
    name: "Preflight",
    does:
      "One unpaid probe of any x402 door: does it answer a well-formed payment challenge right now. A shape check at one moment, never an uptime claim.",
    reach: (base) =>
      `MCP tool \`preflight_endpoint\`, or POST ${base}/api/preflight/${PREFLIGHT_VERSION} with {"url": "..."}`,
    isTool: true,
  },
  {
    name: "Conformance desk",
    does:
      "Checks any issuer's signed x402 offers and receipts — structure, signature against the issuer's did:web key, liveness. Any issuer, including ours and our competitors'.",
    reach: (base) => `MCP tool \`check_conformance\`, or POST ${base}/api/conformance/v1`,
    isTool: true,
  },
  {
    name: "verify_artifact",
    does:
      "Checks anything this store ever signed, by its id. Only our own ids; another store's artifact goes to the conformance desk.",
    reach: () => "MCP tool `verify_artifact`",
    isTool: true,
  },
  {
    name: "read_store_guide",
    does: "The whole shelf, the prices, and the house promises as text.",
    reach: () => "MCP tool `read_store_guide`",
    isTool: true,
  },
  {
    name: "The corpus",
    does:
      "The weekly signed census of public x402 doors, appended and Bitcoin-anchored. Our misses are published in it, against us.",
    reach: (base) => `GET ${base}/corpus.json`,
    isTool: false,
  },
];

/**
 * The routes, ordered roughly by how often the job comes up rather
 * than by what it costs.
 */
export const ROUTES: readonly Route[] = [
  {
    job: "I am about to pay an endpoint I have never used. Is its door even shaped right?",
    free: "Preflight — the preflight_endpoint tool, one probe, free, no account.",
    items: ["spot_check", "service_audit", "provenance_check"],
  },
  {
    /*
     * THE ROUTE FOR THE OTHER HALF OF THE SAME MOMENT (#96). The
     * route above asks whether the DOOR is shaped right. This asks
     * whether the buyer's own client will get through it — the
     * question the $1 ceiling made expensive to not ask, and the one
     * an agent has while its hand is already on the money.
     */
    job: "I am about to pay a door and I do not know whether my own client will even sign it.",
    free: "The payment dry run — the check_before_you_pay tool, one probe, free, no wallet touched.",
    items: ["good_buyer"],
  },
  {
    job: "Somebody handed me a signed offer or receipt and I do not know whether to trust it.",
    free: "Conformance desk — the check_conformance tool, free, any issuer, including ours.",
    items: [],
  },
  {
    job: "I need to hand a third party proof that an endpoint was working, not just tell them so.",
    items: ["service_audit", "trust_profile"],
  },
  {
    job: "I need to know whether a payment actually settled on chain, from somebody who is not the seller.",
    items: ["settlement_attestation", "settlement_reconciliation"],
  },
  {
    job: "I need to catch it if a door breaks midweek, not find out after it cost me.",
    items: ["conformance_watch", "standing_watch"],
  },
  {
    job: "I am launching a paid endpoint and want to know a real buyer can actually get through it.",
    items: ["launch_check", "opening_day", "onpage_audit"],
  },
  {
    job: "I need my own claim, or my principal's authorization, dated by somebody neutral before I act on it.",
    items: ["the_mandate", "attestation_bundle"],
  },
  {
    job: "I need an account of what moved through a wallet over a window, signed by neither side.",
    items: ["the_statement"],
  },
  {
    job: "I need to prove a document existed at a time, without trusting anybody's clock.",
    items: ["bitcoin_anchor"],
  },
  {
    job: "I will lose my context and need to read back who I was and what I was doing.",
    items: ["context_anchor"],
  },
  {
    job: "I want the census to look at my own door now rather than wait for Sunday.",
    items: ["passport_refresh"],
  },
  {
    job: "I need a person — a call placed, a thing witnessed, a judgment my own evaluation cannot settle.",
    items: ["the_collab"],
  },
  {
    job: "I want to record that something happened, at a time, checkable by anyone later.",
    items: [
      "hello",
      "certificate_of_patronage",
      "graffiti_on_a_train",
      "the_confession",
      "coffees_for_closers",
      "recurring_patronage",
    ],
  },
  {
    job: "I want to test that my x402 client works against a real counterparty before it matters.",
    items: ["small_blessing", "daily_fortune", "luckies"],
  },
  {
    job: "I want a machine-readable checkup of what my page gives a machine reader.",
    items: ["onpage_audit", "signature_agent_card"],
  },
];

/**
 * WHAT THIS STORE WILL NOT DO, on the routing surface rather than
 * only in the house rules, because a model routing a job we decline
 * wastes a call and learns nothing. Rule 23a/23b, said in the words
 * a caller would search with.
 */
export const DECLINED: readonly string[] = [
  "Hold money between two parties (escrow). We observe the gap; we do not stand in it.",
  "Judge a dispute between a buyer and a seller (arbitration).",
  "Promise to act at a future moment without an end date — a dead-man's switch, an open-ended SLA monitor. A bounded, prepaid, gap-published watch is the one shape we do sell.",
  "Solve a CAPTCHA, pass a bot check, or route around anyone's KYC.",
  "Guarantee, insure, or refund somebody else's delivery. We can only tell you what we saw.",
];

/** Ids this file deliberately does not route, with the reason. */
export const UNROUTED: Readonly<Record<string, string>> = {};

/** The tool that sells an item, derived. Free items return null. */
export function toolFor(itemId: string): string | null {
  const cluster = SHELF_CLUSTERS.find((shelf) =>
    shelf.itemIds.includes(itemId),
  );
  return cluster ? cluster.name : null;
}

/**
 * Every id a route names must be on the shelf. Called at render so a
 * removed item fails loudly here instead of printing a dead route to
 * a model that will then ask for it.
 */
export function unknownRoutedIds(): string[] {
  const shelf = new Set(MENU_ITEMS.map((item) => item.id));
  const bad: string[] = [];
  for (const route of ROUTES) {
    for (const id of route.items) {
      if (!shelf.has(id)) bad.push(id);
    }
  }
  return [...new Set(bad)];
}

/** Shelf items no route reaches and no exemption names. */
export function unroutedItemIds(): string[] {
  const routed = new Set(ROUTES.flatMap((route) => [...route.items]));
  return MENU_ITEMS.filter(
    (item) => !routed.has(item.id) && !(item.id in UNROUTED),
  ).map((item) => item.id);
}

function priceLine(itemId: string): string {
  const item = getMenuItem(itemId);
  if (!item) return itemId;
  const tool = toolFor(itemId);
  const how = tool ? `\`${tool}\` with item_id \`${itemId}\`` : `\`${itemId}\``;
  return `  - **${item.name}** — $${item.price_usdc} USDC · ${how}`;
}

/**
 * The document. Derived every render, so it cannot disagree with the
 * shelf it describes.
 */
export function whenToBuyMarkdown(base: string): string {
  const unknown = unknownRoutedIds();
  if (unknown.length > 0) {
    // Rule 46: a guard that cannot fail argues for the lie. This one
    // names the dead ids rather than printing a route to nowhere.
    throw new Error(
      `when-to-buy routes name items that are not on the shelf: ${unknown.join(", ")}`,
    );
  }

  const free = FREE_INSTRUMENTS.map((instrument) => {
    const note = instrument.isTool ? "" : " *(plain HTTPS only, not a tool)*";
    return `- **${instrument.name}**${note} — ${instrument.does}\n  - ${instrument.reach(base)}`;
  }).join("\n");

  const routes = ROUTES.map((route) => {
    const lines = [`### ${route.job}`];
    if (route.free) lines.push(`\n**Free first:** ${route.free}`);
    if (route.items.length > 0) {
      lines.push(
        `\n${route.free ? "If you need it signed and servable to somebody else:" : "On the shelf:"}\n${route.items.map(priceLine).join("\n")}`,
      );
    }
    return lines.join("\n");
  }).join("\n\n");

  const missing = unroutedItemIds();
  const gap =
    missing.length > 0
      ? `\n\n## Shelf items this document does not route\n\nNamed rather than hidden, because a routing table with a silent hole reads as complete when it is not:\n\n${missing.map((id) => `- \`${id}\``).join("\n")}`
      : "";

  return `# Which instrument for which job

A routing table. Every other context surface here says what the store
is, how to pay it, or what a check measures; this one answers the
question a caller actually holds: *I am in this situation — which of
your things do I want?*

Start free wherever a free thing answers the job. That is not modesty,
it is the order the counter works in.

## The free shelf

${free}

Every instrument marked as a tool answers on this same connection.
The HTTP door beside each is the identical service function — the two
cannot disagree about what a probe saw.

## The routes

${routes}

## What this store will not do

${DECLINED.map((line) => `- ${line}`).join("\n")}

## How a purchase works

Every paid instrument is an x402 tool call: call once, read the 402
terms in \`error.data\`, sign one of the \`accepts\`, call again with the
payment in \`_meta['x402/payment']\`. Goods are produced first and the
payment is presented at the last moment before signing, so a delivery
that fails takes no money at all.

Prices and names above are read from the live shelf at render. If this
document and \`${base}/menu.json\` ever disagree, the menu is right and
we want to hear about it.${gap}
`;
}
