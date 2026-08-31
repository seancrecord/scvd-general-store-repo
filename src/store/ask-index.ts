import { DEFECT_CLASSES } from "@/store/defect-vocabulary";
import { MENU_ITEMS } from "@/store/menu";
import { ROOMS } from "@/store/rooms";

/**
 * WHAT /ask SEARCHES, DERIVED FROM WHAT THE STORE ALREADY PUBLISHES.
 *
 * NLWeb asks a site to answer a natural-language question over its own
 * content and hand back schema.org objects. This store had no such
 * door, and a 2026-08-30 scan said so.
 *
 * THE INDEX IS DERIVED, NEVER TYPED. Rooms come from ROOMS, goods from
 * MENU_ITEMS, defect classes from DEFECT_CLASSES — the same three
 * lists the sitemap, the catalog and /defects render from. A room
 * added tomorrow is askable tomorrow, and there is no second inventory
 * here to go stale against the first. That is the same discipline the
 * sitemap adopted after four rooms shipped unfindable, applied to a
 * new reader.
 *
 * IT IS AN INDEX, NOT A MODEL, AND THE ANSWER SAYS SO. There is no
 * LLM behind this door and none is implied: /ask ranks the store's own
 * published entries against your words and returns them with their
 * scores. NLWeb's `list` mode is exactly that and nothing more, so the
 * store implements `list` honestly rather than `generate` badly — a
 * paraphrase produced by a keyword match, dressed as an answer, would
 * be the first sentence on this site that nobody could check.
 */

/** One askable thing, with the schema.org object /ask hands back. */
export interface AskEntry {
  /** Absolute-from-root path. The response makes it absolute. */
  path: string;
  name: string;
  description: string;
  /** schema.org @type for this entry's object. */
  schemaType: string;
  /** Free-text the matcher reads. Never shown; scored only. */
  keywords: string;
  /** USDC, when the entry is something on the shelf. */
  priceUsdc?: number;
}

function entryFor(text: string[]): string {
  return text.join(" ").toLowerCase();
}

/**
 * The rooms. A room's own title is all ROOMS carries — the prose lives
 * on the page — so the keywords are the title and the path, and the
 * description says plainly that this is a pointer rather than a
 * summary. Inventing a one-line summary of a room here would be a
 * second description competing with the one the page writes.
 */
function roomEntries(): AskEntry[] {
  return ROOMS.map((room) => ({
    path: room.path,
    name: room.name,
    description: `A room in the store: ${room.name}. The page writes its own account; this entry is the pointer to it.`,
    schemaType: "WebPage",
    keywords: entryFor([room.name, room.path.replace(/[/-]/g, " ")]),
  }));
}

/** The shelf. Descriptions are the item's own, priced in USDC. */
function goodsEntries(): AskEntry[] {
  return MENU_ITEMS.map((item) => ({
    path: `/menu/${item.id}`,
    name: item.name,
    description: item.description,
    schemaType: "Product",
    priceUsdc: item.price_usdc,
    keywords: entryFor([
      item.name,
      item.id.replace(/_/g, " "),
      item.description,
      item.fulfillment,
      item.cadence,
    ]),
  }));
}

/**
 * The defect vocabulary. The single most askable thing this store has
 * — "what does <defect> mean" is the question the vocabulary exists to
 * answer — and it lived only inside /defects and a JSON file.
 */
function defectEntries(): AskEntry[] {
  return DEFECT_CLASSES.map((defect) => ({
    path: `/defects#${defect.id}`,
    name: `${defect.id} — ${defect.title}`,
    description: `${defect.asserts} What a buyer loses when it is present: ${defect.costs}`,
    schemaType: "DefinedTerm",
    keywords: entryFor([
      defect.id.replace(/[_-]/g, " "),
      defect.title,
      defect.asserts,
      defect.costs,
    ]),
  }));
}

/**
 * The instruments and documents that are not rooms: the free desks and
 * the machine surfaces. Hand-written because they are not in any list
 * the store already keeps — and every path here is walked by
 * test/ask.spec.ts, so an entry that stops answering fails the build
 * rather than sending an asker to a 404.
 */
const STANDING_ENTRIES: readonly AskEntry[] = [
  {
    path: "/api/preflight",
    name: "The free preflight check",
    description:
      "Send any x402 door's URL and get back what its 402 actually serves: the offer shape, the accepts, the named defects it carries. Free, no account, one outbound request per call.",
    schemaType: "WebAPI",
    keywords:
      "preflight check x402 door endpoint 402 free test probe shape accepts defects",
  },
  {
    path: "/api/conformance",
    name: "The free conformance desk",
    description:
      "Check any issuer's signed offers and receipts against the published criteria — ours, or a competitor's. Free, no account.",
    schemaType: "WebAPI",
    keywords:
      "conformance desk signed offer receipt check verify issuer criteria free competitor",
  },
  {
    path: "/auth.md",
    name: "Authentication",
    description:
      "How an agent gets in: it does not have to. No account, no API key, no OAuth, no signup. Free instruments answer anonymous requests; paid ones take a signed x402 payment at the moment of the call.",
    schemaType: "TechArticle",
    keywords:
      "auth authentication login api key token oauth signup account credential access how do i get in",
  },
  {
    path: "/pricing",
    name: "How prices are set",
    description:
      "The signed pricing charter: every wallet sees the same price, the cheapest real settlement stays under a penny, verification stays free forever, and price changes are dated in public.",
    schemaType: "TechArticle",
    keywords:
      "price pricing cost how much charter cheap penny free floor usdc money",
  },
  {
    path: "/corpus.json",
    name: "The corpus",
    description:
      "The weekly signed record of what this store observed, Bitcoin-anchored and appended rather than edited. Verifiable offline without asking us.",
    schemaType: "Dataset",
    keywords:
      "corpus dataset record weekly signed bitcoin anchor evidence observation history download",
  },
  {
    path: "/openapi.json",
    name: "The OpenAPI contract",
    description:
      "Every door this store serves, in one machine-readable contract, suitable for function calling.",
    schemaType: "WebAPI",
    keywords:
      "openapi contract spec schema api documentation function calling tools endpoints",
  },
  {
    path: "/mcp",
    name: "The MCP server",
    description:
      "The store as an MCP server. tools/list is free; the buy_* tools are x402-paid.",
    schemaType: "WebAPI",
    keywords: "mcp model context protocol server tools connector claude",
  },
  {
    path: "/rights",
    name: "What you are owed",
    description:
      "The refund promise, the delivery windows, and what happens when one is missed.",
    schemaType: "TechArticle",
    keywords:
      "refund rights guarantee owed money back delivery window missed promise terms",
  },
] as const;

/** The whole askable index, derived on every call. It is small. */
export function askIndex(): AskEntry[] {
  return [
    ...STANDING_ENTRIES,
    ...roomEntries(),
    ...goodsEntries(),
    ...defectEntries(),
  ];
}

/** Words worth matching on. Short ones carry no signal and cost rank. */
function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

/**
 * HOW A MATCH IS SCORED, written out because the number is published.
 *
 * Every /ask result carries its score, and a score whose derivation is
 * secret is a ranking — which is the one thing this store does not
 * sell. So: one point per query term found in an entry's keywords, two
 * if it is in the name, and the total is divided by the number of
 * terms asked. A caller can recompute any figure we return.
 *
 * Deliberately NOT clever. There is no embedding, no synonym table and
 * no learned weighting, because each of those would make the score
 * unrecomputable by the reader holding it.
 */
export function scoreEntry(entry: AskEntry, query: string): number {
  const asked = terms(query);
  if (asked.length === 0) return 0;
  const name = entry.name.toLowerCase();
  let points = 0;
  for (const term of asked) {
    if (name.includes(term)) points += 2;
    else if (entry.keywords.includes(term)) points += 1;
    else if (entry.description.toLowerCase().includes(term)) points += 1;
  }
  return Math.round((points / (asked.length * 2)) * 1000) / 1000;
}

export interface AskHit {
  entry: AskEntry;
  score: number;
}

/** The ranked hits for a query, best first, zero-scores dropped. */
export function askRank(query: string, limit: number): AskHit[] {
  return askIndex()
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, limit);
}
