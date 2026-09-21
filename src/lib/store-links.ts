import { getMenuItem } from "@/store";
import { USE_WHEN } from "@/store/spec";
import { ROOMS } from "@/store/rooms";
import { STORE_SERVICE_NAME } from "@/store/metadata";
import type { PassportTier } from "@/services/passport-tier";

/**
 * THE LINK SET (2026-09-21) — one builder for what every JSON
 * envelope this store serves says about where the store is and what
 * comes next.
 *
 * WHAT THE SEPTEMBER READ FOUND. The dominant reader of the corpus
 * host pages is a machine walking the index: sixty-nine thousand
 * reads a month on six thousand pages, one read of each JSON twin,
 * no referrer on any of them. An index stores bodies and drops
 * headers, so whatever links a JSON body carries is what that index
 * can answer with later, and whatever it does not carry is invisible
 * to the agent that asks its index where to buy. The 402 body carried
 * a verification block and buyer guidance and no menu URL; the MCP
 * error data carried less; the verify JSON carried a cite block and
 * no catalog; the host page's JSON twin carried its feed and its
 * criteria and nothing that said a store was behind it. Four
 * envelopes, four different answers to "what is this and what is
 * next", and the pattern the 404 already had (where_to_look_next)
 * lived only on the error path.
 *
 * WHAT THIS IS. `store`: the same short roster of doors on every
 * envelope, absolute URLs, stable across republishes. `next`: the
 * step after this one, DERIVED, never typed — items that share a
 * use_when recipe with the current item; the deeper rung of the room
 * this path belongs to; the settlement observation for the tx just
 * settled; the instrument a host page's own tier picks. Every entry
 * names the source it came from, so a reader can see the derivation
 * and a test can hold that no source is hand-placed. `attest`: the
 * buy→attest loop, first-class — the URL prefilled with the
 * settlement, what the attestation proves that the receipt does not,
 * and the conflict line, because a chain observation of this store's
 * own sale is signed by a party to it.
 *
 * WHAT IT IS NOT. Not a ranking (rule 43): `next` is in derivation
 * order — use_when, room, settlement, tier — and within a source in
 * the catalogue's own order, never by price or by sales. Not a
 * recommendation engine: nothing here reads who is asking.
 */

export interface StoreDoors {
  name: string;
  homepage: string;
  llms_txt: string;
  agents_md: string;
  menu_json: string;
  openapi_json: string;
  skill_md: string;
  developers: string;
  verify_url_template: string;
  signing_key: string;
  preflight: string;
  conformance_desk: string;
}

export type NextSource = "use_when" | "room" | "settlement" | "host_tier";

export interface NextStep {
  item: string;
  name: string;
  price_usdc: number;
  url: string;
  /** Why this item follows: the recipe's own sentence, the room, the settlement, the tier. */
  why: string;
  source: NextSource;
}

export interface AttestLoop {
  item: "settlement_attestation";
  url: string;
  price_usdc: number;
  what_it_proves:
    string;
  conflict: string;
}

export interface StoreLinks {
  store: StoreDoors;
  next: NextStep[];
  attest?: AttestLoop;
  derivation: string;
}

export interface HostContext {
  host: string;
  tier: PassportTier;
  /** True when the newest signed observation came from a paid refresh rather than the weekly round. */
  refreshed?: boolean;
}

export interface LinkContext {
  /** The item this envelope is about: a 402, a purchase, a receipt. */
  item?: string;
  /** The path this envelope was served under, for the room's deeper rung. */
  path?: string;
  /** A settled transaction the reader now holds. */
  settlement?: { tx: string; item: string };
  /** The host a page is about, with the tier its own rows derived. */
  host?: HostContext;
}

export const STORE_LINKS_DERIVATION =
  "next is derived, never typed: items that share a use_when recipe with this one (menu.json use_when), the deeper rung of the room this path belongs to, the settlement observation for the transaction just settled, and the instrument this host's own tier picks. In derivation order, then the catalogue's order; never by price, never by sales, never a ranking. store is the same roster on every envelope this store serves.";

export const ATTEST_CONFLICT_LINE =
  "This store is a party to the sale it would be attesting: the observation is a read of the chain, signed by the seller. It proves what the chain says about the settlement — block, confirmations, the amount that moved — from a read you did not make; it does not make the seller a neutral witness to its own till. For a third party's settlement the same instrument is disinterested.";

export function storeDoors(base: string): StoreDoors {
  return {
    name: STORE_SERVICE_NAME,
    homepage: base,
    llms_txt: `${base}/llms.txt`,
    agents_md: `${base}/agents.md`,
    menu_json: `${base}/menu.json`,
    openapi_json: `${base}/openapi.json`,
    skill_md: `${base}/skill.md`,
    developers: `${base}/developers`,
    verify_url_template: `${base}/api/verify/{id}`,
    signing_key: `${base}/.well-known/scvd-signing-key`,
    preflight: `${base}/api/preflight/v1`,
    conformance_desk: `${base}/api/conformance/v1`,
  };
}

/** The 404's list, derived from the same roster: what a lost reader is told. */
export function whereToLookNext(base: string): Array<{ url: string; what: string }> {
  const doors = storeDoors(base);
  return [
    { url: doors.llms_txt, what: "the front door: what this store is, in full" },
    { url: doors.agents_md, what: "the operational manual: how to transact here" },
    { url: doors.menu_json, what: "the catalog: every item, price and input contract" },
    { url: doors.openapi_json, what: "the OpenAPI 3.1 contract for every endpoint" },
    { url: doors.developers, what: "the developer portal" },
    { url: `${base}/sitemap.xml`, what: "every public URL this store serves" },
  ];
}

const SETTLEMENT_ITEMS = ["settlement_attestation", "settlement_reconciliation", "attestation_bundle"];

function step(base: string, itemId: string, why: string, source: NextSource, url?: string): NextStep | null {
  const item = getMenuItem(itemId);
  if (!item) return null;
  return { item: item.id, name: item.name, price_usdc: item.price_usdc, url: url ?? `${base}/api/buy/${item.id}`, why, source };
}

/** The buy→attest loop for a settlement the reader holds; none on the settlement items themselves. */
export function attestLoop(base: string, settlement: { tx: string; item: string } | undefined): AttestLoop | undefined {
  if (!settlement || SETTLEMENT_ITEMS.includes(settlement.item)) return undefined;
  const item = getMenuItem("settlement_attestation");
  if (!item) return undefined;
  return {
    item: "settlement_attestation",
    url: `${base}/api/buy/settlement_attestation?tx_hash=${encodeURIComponent(settlement.tx)}`,
    price_usdc: item.price_usdc,
    what_it_proves:
      "The chain's own account of this settlement — status, block, confirmations, chain head, the amount that moved — read at a stated moment and signed, verifiable against the published key without asking this store. The receipt says the store booked a sale; this says the chain holds the payment. The hash is already in the URL.",
    conflict: ATTEST_CONFLICT_LINE,
  };
}

export function storeLinks(base: string, ctx: LinkContext = {}): StoreLinks {
  const next: NextStep[] = [];
  const seen = new Set<string>(ctx.item ? [ctx.item] : []);
  const push = (candidate: NextStep | null) => {
    if (!candidate || seen.has(candidate.item)) return;
    seen.add(candidate.item);
    next.push(candidate);
  };
  if (ctx.item) {
    for (const recipe of USE_WHEN) {
      if (!recipe.items.includes(ctx.item)) continue;
      for (const id of recipe.items) {
        if (id.startsWith("free:")) continue;
        push(step(base, id, recipe.when, "use_when"));
      }
    }
  }
  if (ctx.path) {
    const room = ROOMS.find((entry) => entry.path === ctx.path || (ctx.path!.length > 1 && entry.path !== "/" && ctx.path!.startsWith(`${entry.path}/`)));
    for (const id of room?.deeper ?? []) push(step(base, id, `the deeper rung of ${room!.name}`, "room"));
  }
  const attest = attestLoop(base, ctx.settlement);
  if (attest) push(step(base, attest.item, "you now hold the settlement transaction this observation requires", "settlement", attest.url));
  if (ctx.host) {
    const host = encodeURIComponent(ctx.host.host);
    if (ctx.host.tier === "broken") {
      push(step(base, "launch_check", `the newest signed observation of ${ctx.host.host} found the door not ready: a launch check names what a buyer would hit`, "host_tier", `${base}/api/buy/launch_check?host=${host}`));
    } else {
      push(step(base, "spot_check", `${ctx.host.host} answers; a spot check is one signed observation of it now, outside the weekly round`, "host_tier", `${base}/api/buy/spot_check?host=${host}`));
    }
    if (!ctx.host.refreshed) {
      push(step(base, "passport_refresh", `the newest observation of ${ctx.host.host} is the weekly round's; a refresh is a new one now`, "host_tier", `${base}/api/buy/passport_refresh?host=${host}`));
    }
  }
  return {
    store: storeDoors(base),
    next,
    ...(attest ? { attest } : {}),
    derivation: STORE_LINKS_DERIVATION,
  };
}
