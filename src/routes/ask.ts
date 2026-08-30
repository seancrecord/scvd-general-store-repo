import { Hono } from "hono";
import type { Context } from "hono";
import { askIndex, askRank, type AskEntry, type AskHit } from "@/store/ask-index";
import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store/metadata";
import type { HonoEnv } from "@/types";

/**
 * NLWeb — /ask, /sites and the schema feed.
 *
 * NLWeb asks a site to take a natural-language question about its own
 * content and hand back schema.org objects. The store had no such door
 * until now, which a 2026-08-30 scan reported on three of its rows.
 *
 * WHAT THIS IS, SAID BEFORE ANYTHING ELSE: a ranked index of what this
 * store already publishes, not a model. Every result is an entry that
 * exists at a URL you can open, with a score you can recompute from
 * the rule printed in the answer itself. Nothing is generated, and
 * `mode=generate` is refused by name rather than answered with a
 * paraphrase — a sentence assembled by a keyword match and served as
 * an answer would be the first thing on this site nobody could check,
 * on the door whose whole subject is checkability.
 *
 * NO KV, NO OUTBOUND, NO KEY. The index derives from three lists
 * already compiled into the worker, so this door costs a request and
 * nothing else. That is why it is free and why it can stay free.
 */
export const askRoutes = new Hono<HonoEnv>();

/**
 * CORS ON THIS DOOR, SET HERE RATHER THAN INHERITED, and the reason is
 * that the app-wide derivation cannot see two of the three ways this
 * door answers.
 *
 * lib/cors.ts decides the allowance from what came back — a GET that
 * answered 200 with a JSON, markdown, plain-text or XML body outside
 * /admin. That doctrine's own sentence is "public, read-only, and
 * byte-identical for every caller", and every response from /ask
 * satisfies it. Two of them fall outside the check anyway: an
 * event-stream is not one of the document types the regex knows, and a
 * POST is not a GET. A browser-resident NLWeb client uses both — SSE is
 * the transport it reaches for first — so without this it would fail
 * at the fetch with nothing in our logs to show for it.
 *
 * The OPTIONS handler is what makes the POST usable at all: a
 * cross-origin JSON POST is preflighted, and an unanswered preflight
 * is a door that is open and cannot be opened.
 *
 * NOTHING IS WIDENED BY THIS. The middleware is bound to /ask alone —
 * /sites and /ask/feed.json are ordinary JSON GETs and take their
 * allowance from the app-wide derivation like every other published
 * document. /ask is free, unauthenticated, read-only, sets no cookie,
 * and answers identically for every caller, which is the whole of what
 * lib/cors.ts asks of a surface before opening it.
 */
askRoutes.use("/ask", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          c.req.header("Access-Control-Request-Headers") ?? "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Expose-Headers", "Content-Type");
});

/** NLWeb's site identifier for this deployment. */
const SITE = "scvd.store";

/**
 * The protocol envelope every answer carries. `version` is the NLWeb
 * revision this door implements, not a version of the store — a
 * client reads it to decide how to parse, and a number that moved when
 * our shelf moved would be worse than useless.
 */
const RESPONSE_META = {
  response_type: "list",
  version: "0.1",
  protocol: "nlweb",
  site: SITE,
} as const;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * The store's honest position on NLWeb's three modes. `list` is what
 * an index can do; the other two need a generator this door does not
 * have, and saying so is cheaper for the caller than a bad answer.
 */
const MODES = {
  list: "Ranked entries from the store's own published index. This is what this door does.",
  summarize:
    "Not implemented. It would need a generator this door does not have, and a summary assembled from keyword matches is not a summary.",
  generate:
    "Not implemented, and not planned. See summarize. The rooms are written by a human and are the answer.",
} as const;

function schemaObject(base: string, entry: AskEntry) {
  return {
    "@context": "https://schema.org",
    "@type": entry.schemaType,
    name: entry.name,
    description: entry.description,
    url: `${base}${entry.path}`,
    ...(entry.priceUsdc === undefined
      ? {}
      : {
          offers: {
            "@type": "Offer",
            price: entry.priceUsdc,
            priceCurrency: STORE_METADATA.currency,
            url: `${base}${entry.path}`,
          },
        }),
  };
}

/** One NLWeb result item. Field names are the protocol's, not ours. */
function resultItem(base: string, hit: AskHit) {
  return {
    url: `${base}${hit.entry.path}`,
    name: hit.entry.name,
    site: SITE,
    score: hit.score,
    description: hit.entry.description,
    schema_object: schemaObject(base, hit.entry),
  };
}

/**
 * The one sentence every answer carries. NLWeb has no field for "and
 * here is what this door cannot do", so it goes in the payload under a
 * name of ours: a caller that reads nothing else still learns that the
 * ranking is mechanical and where the rule is written down.
 */
function honesty(base: string) {
  return {
    this_is_an_index_not_a_model:
      "Results are entries this store already publishes, ranked by term overlap. Nothing here is generated.",
    /**
     * THE RULE ITSELF, not a link to it. A score is a number about
     * somebody's position in a list, and this store's whole position
     * is that such a number is worthless unless its reader can
     * recompute it. Pointing at a page that would have to be kept in
     * step with the code is how the two come to disagree; the sentence
     * that IS the code goes here instead.
     */
    scoring_rule:
      "Two points per query term appearing in an entry's name, one point per term appearing in its keywords or description, divided by twice the number of terms asked. Terms of three characters or fewer are dropped. No embeddings, no synonyms, no learned weights — every figure above is recomputable from the entry you were handed.",
    the_whole_index: `${base}/ask/feed.json`,
    every_result_is_a_live_url: true,
  };
}

function parseLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * NLWeb clients ask for a stream two ways: a `streaming=true` parameter
 * and a `prefer.streaming` field in the body. Both are honoured,
 * because a client that asked in the dialect it knows and got JSON
 * where it expected a stream generally hangs rather than falls back —
 * the same reasoning lib/accept.ts applies to Accept headers, one
 * protocol over.
 */
function wantsStream(raw: string | undefined): boolean {
  return (raw ?? "").toLowerCase() === "true";
}

/**
 * `prefer: { streaming: true }` — the nested form NLWeb bodies use,
 * read separately because `pick` only reaches top-level fields and a
 * client should not have to know which of the two spellings we
 * happened to implement.
 */
function preferStreaming(
  body: Record<string, unknown> | null,
): string | undefined {
  const prefer = body?.["prefer"];
  if (typeof prefer !== "object" || prefer === null) return undefined;
  const value = (prefer as Record<string, unknown>)["streaming"];
  if (value === undefined) return undefined;
  return String(value);
}

interface AskRequest {
  query: string;
  mode: keyof typeof MODES;
  limit: number;
  streaming: boolean;
  queryId: string;
}

function readRequest(
  params: URLSearchParams,
  body: Record<string, unknown> | null,
): AskRequest {
  const pick = (key: string): string | undefined => {
    const fromBody = body?.[key];
    if (typeof fromBody === "string") return fromBody;
    if (typeof fromBody === "number") return String(fromBody);
    if (typeof fromBody === "boolean") return String(fromBody);
    return params.get(key) ?? undefined;
  };
  const mode = (pick("mode") ?? "list").toLowerCase();
  return {
    query: (pick("query") ?? pick("q") ?? "").trim(),
    mode: (mode in MODES ? mode : "list") as keyof typeof MODES,
    limit: parseLimit(pick("limit") ?? pick("num_results")),
    streaming: wantsStream(pick("streaming") ?? preferStreaming(body)),
    /**
     * Echoed back so a caller can pair a response with its question in
     * a log. Theirs if they sent one; ours if not. Never used as a
     * key — nothing about a query is stored, here or anywhere.
     */
    queryId: pick("query_id") ?? crypto.randomUUID(),
  };
}

/**
 * SSE, and the reason the store implements it despite having nothing
 * slow to stream.
 *
 * NLWeb clients ask for `streaming=true` and expect `text/event-stream`
 * with typed messages; a client that gets JSON where it expected a
 * stream generally hangs rather than falls back. So the door speaks
 * the transport properly. It is HONEST about the fact that the work
 * behind it is instant: the messages arrive in one pass because the
 * index is in memory, and nothing here pretends to think.
 */
function streamAnswer(base: string, request: AskRequest, hits: AskHit[]): Response {
  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    payload: Record<string, unknown>,
  ) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      /**
       * TWO SPELLINGS PER EVENT, and it is not indecision.
       *
       * NLWeb's own implementation emits `query_analysis` /
       * `result_batch` / `complete`; the published event vocabulary
       * names `start` / `result` / `complete`. Clients exist for both
       * and neither is wrong, so each frame carries `message_type` in
       * the implementation's spelling and `event_type` in the spec's.
       * A client keying on either reads the same three events; a
       * client keying on neither still gets `_meta`.
       */
      send(controller, {
        message_type: "query_analysis",
        event_type: "start",
        _meta: RESPONSE_META,
        query_id: request.queryId,
        item_to_remember: null,
        decontextualized_query: request.query,
      });
      /*
       * One frame per hit AND the batch, for the same reason: a client
       * rendering progress wants them one at a time, and one that
       * wants the array should not have to accumulate.
       */
      hits.forEach((hit, index) => {
        send(controller, {
          message_type: "result",
          event_type: "result",
          query_id: request.queryId,
          index,
          result: resultItem(base, hit),
        });
      });
      send(controller, {
        message_type: "result_batch",
        event_type: "result_batch",
        query_id: request.queryId,
        results: hits.map((hit) => resultItem(base, hit)),
      });
      send(controller, {
        message_type: "complete",
        event_type: "complete",
        _meta: RESPONSE_META,
        query_id: request.queryId,
        count: hits.length,
        ...honesty(base),
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      /*
       * The stream is generated per query and a proxy that buffers it
       * defeats the transport the caller asked for.
       */
      "X-Accel-Buffering": "no",
    },
  });
}

async function handleAsk(c: Context<HonoEnv>) {
  const base = c.env.STORE_BASE_URL;
  const url = new URL(c.req.url);
  let body: Record<string, unknown> | null = null;
  if (c.req.method === "POST") {
    body = await c.req.json<Record<string, unknown>>().catch(() => null);
  }
  const request = readRequest(url.searchParams, body);

  if (!request.query) {
    return c.json(
      {
        error:
          "Ask something. Send ?query=<your question> (or POST {\"query\": \"...\"}). This door searches what this store publishes: the rooms, the shelf, the defect vocabulary and the free instruments.",
        example: `${base}/ask?query=how%20do%20I%20pay`,
        modes: MODES,
        site: SITE,
      },
      400,
    );
  }

  if (request.mode !== "list") {
    /**
     * 501, not 400: the request is well-formed and the mode is real
     * NLWeb. This store has not built it, which is a fact about us
     * rather than a fault in the asking, and the status should say
     * which of those it is.
     */
    return c.json(
      {
        error: `mode=${request.mode} is not implemented here.`,
        why: MODES[request.mode],
        what_to_send_instead: `${base}/ask?query=${encodeURIComponent(request.query)}&mode=list`,
        modes: MODES,
      },
      501,
    );
  }

  const hits = askRank(request.query, request.limit);

  if (request.streaming) {
    return streamAnswer(base, request, hits);
  }

  return c.json({
    /**
     * NLWeb's envelope, and it goes first because it is what a client
     * checks before reading anything else: which shape this response
     * is and which version of the protocol produced it. The store's
     * own honesty fields ride below under names of ours, so nothing
     * here has to guess which half of the document it is reading.
     */
    _meta: RESPONSE_META,
    query_id: request.queryId,
    query: request.query,
    site: SITE,
    mode: "list",
    count: hits.length,
    results: hits.map((hit) => resultItem(base, hit)),
    /**
     * An empty result is an answer and gets a next step rather than a
     * shrug. The mailbox is the honest one: if the store does not
     * publish it, the person who would have to write it reads that.
     */
    ...(hits.length === 0
      ? {
          nothing_matched: `Nothing in the index matched those words. The whole index is at ${base}/ask/feed.json if you would rather scan it yourself, and ${base}/api/letter reaches the keeper if the thing you wanted should exist and does not.`,
        }
      : {}),
    ...honesty(base),
  });
}

askRoutes.get("/ask", handleAsk);
askRoutes.post("/ask", handleAsk);

/**
 * NLWeb's /sites: which sites this endpoint can answer for. One, and
 * it is this one. Answered rather than omitted because a client that
 * asks and gets a 404 cannot tell a single-site deployment from a
 * broken one.
 */
askRoutes.get("/sites", (c) =>
  c.json({
    "message-type": "sites",
    sites: [SITE],
    note: `One site: this store. ${c.env.STORE_BASE_URL}/ask answers for it.`,
  }),
);

/**
 * THE SCHEMA FEED — the whole index as schema.org objects, in one
 * fetch, with no query.
 *
 * This is the door for a reader that would rather hold the index than
 * interrogate it: an NLWeb server ingesting another site's content, a
 * crawler that wants structured data without parsing pages, or anyone
 * checking that /ask's results are drawn from a published list rather
 * than made up per request. It is the same array /ask ranks, in the
 * same order it is built, so the two cannot disagree.
 */
askRoutes.get("/ask/feed.json", (c) => {
  const base = c.env.STORE_BASE_URL;
  const entries = askIndex();
  return c.json(
    {
      "@context": "https://schema.org",
      "@type": "DataFeed",
      name: `${STORE_SERVICE_NAME} — the askable index`,
      description:
        "Every entry /ask can return, as schema.org objects: the rooms, the shelf, the defect vocabulary and the free instruments. The same list, in the same order, that /ask ranks against a query.",
      url: `${base}/ask/feed.json`,
      isAccessibleForFree: true,
      license: "https://creativecommons.org/licenses/by/4.0/",
      publisher: {
        "@type": "Organization",
        name: STORE_SERVICE_NAME,
        url: base,
      },
      dataFeedElement: entries.map((entry) => ({
        "@type": "DataFeedItem",
        item: schemaObject(base, entry),
      })),
    },
    200,
    {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  );
});


/**
 * THE SCHEMA MAP — the sitemap.xml of structured data.
 *
 * NLWeb's Schema Feeds convention asks a site to publish an XML index
 * of its structured-data feeds and to name that index in robots.txt
 * with a `schemamap:` directive, so an ingesting agent finds the
 * catalog as data instead of scraping pages for it. This store had the
 * feeds and no index: /ask/feed.json, /corpus.json, /menu.json and
 * /doors.json were each discoverable on their own and nowhere
 * together, in a machine format a feed reader knows.
 *
 * DERIVED FROM DOORS THAT ALREADY ANSWER, and every one of them is a
 * document this store publishes for its own reasons rather than a feed
 * assembled to fill a map. test/ask.spec.ts fetches each.
 */
interface SchemaFeed {
  path: string;
  type: string;
  title: string;
}

const SCHEMA_FEEDS: readonly SchemaFeed[] = [
  {
    path: "/ask/feed.json",
    type: "application/json",
    title: "The askable index — rooms, shelf, defect vocabulary, instruments",
  },
  {
    path: "/menu.json",
    type: "application/json",
    title: "The shelf: every good, its price, its cadence and what it reads",
  },
  {
    path: "/corpus.json",
    type: "application/json",
    title: "The signed evidence corpus, appended weekly and Bitcoin-anchored",
  },
  {
    path: "/doors.json",
    type: "application/json",
    title: "Every x402 door this store has checked, with its verdict",
  },
  {
    path: "/defects.json",
    type: "application/json",
    title: "The named defect vocabulary",
  },
] as const;

/** The path robots.txt names. Exported so the two cannot disagree. */
export const SCHEMA_MAP_PATH = "/schemamap.xml";

askRoutes.get(SCHEMA_MAP_PATH, (c) => {
  const base = c.env.STORE_BASE_URL;
  const entries = SCHEMA_FEEDS.map(
    (feed) => `  <schema>
    <loc>${base}${feed.path}</loc>
    <type>${feed.type}</type>
    <title>${feed.title}</title>
  </schema>`,
  ).join("\n");
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>
<schemamap xmlns="https://schema.org/">
${entries}
</schemamap>
`,
    200,
    {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  );
});
