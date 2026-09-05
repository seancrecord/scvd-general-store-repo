import {
  GUESTBOOK_MAX_PAGE_SIZE,
  GUESTBOOK_PAGE_SIZE,
} from "@/routes/guestbook";
import { ORDER_STATUSES, TERMINAL_ORDER_STATUSES } from "@/types";

/**
 * TWO PATTERNS THIS STORE ALREADY HAD AND NEVER DECLARED.
 *
 * A readiness pass scored REST pagination 0/2 and the async-job
 * pattern 0/2. Neither finding is that the store lacks the behaviour —
 * human-queue purchases have returned an order id and a poll URL since
 * the queue existed, and every list surface here has had a considered
 * bound since the first scalability audit. The finding is that a
 * machine reading the contract could not tell.
 *
 * That is the same defect as the MCP manifest answering 405 and the
 * verify endpoint answering "no such artifact" to its own
 * documentation URL: the store knew something and did not say it where
 * a machine looks.
 *
 * WHY A REGISTRY AND A POST-PASS rather than fields on each operation:
 * the same reason stampOperationIds and stampIdempotencyKey are
 * post-passes. A property added inside a builder covers the operations
 * that builder makes and silently misses any written by hand — and
 * these two properties are exactly the kind a hand-written operation
 * forgets.
 *
 * THE HONEST HALF, and it is the part worth reading. A scanner
 * rewards pagination, so the tempting move is to grow a cursor on
 * every list. Most collections here are BOUNDED — one census round,
 * one corpus entry per week, one linkset of the APIs that exist — and
 * a cursor on a bounded set is a field that never advances, a client
 * loop that never terminates for a reason it can see, and a claim that
 * there is more when there is not. So bounded sets declare themselves
 * bounded, with the bound and the reason, and only the one collection
 * that genuinely has no end carries a cursor.
 */

/** How a collection ends, which is the only question a client has. */
export type CollectionBound =
  /** Grows without limit; a cursor walks it. */
  | "cursor"
  /** Finite by construction, and small enough to serve whole. */
  | "bounded";

export interface CollectionSemantics {
  bound: CollectionBound;
  /** Why it is that kind. Prose, because the reason is the useful part. */
  reason: string;
  /** Cursor collections only: the query parameters that walk it. */
  cursor?: {
    parameter: string;
    limit_parameter: string;
    default_limit: number;
    max_limit: number;
    next_field: string;
    more_field: string;
  };
  /** Bounded collections only: what actually bounds them. */
  bounded_by?: string;
}

/**
 * Path to how its collection ends.
 *
 * Hand-written, and it is filing rather than fact — but a stale entry
 * here would publish a lie about a door's shape, so
 * test/collection-and-job-patterns.spec.ts asserts every path named
 * here exists in the document and that the numbers match the code they
 * are supposed to describe.
 */
export const COLLECTIONS: Record<string, CollectionSemantics> = {
  "/api/guestbook": {
    bound: "cursor",
    reason:
      "The register grows with every visitor and nobody ever unsigns, so there is no end to serve. This is the only collection on this store that genuinely needs walking.",
    cursor: {
      parameter: "cursor",
      limit_parameter: "limit",
      default_limit: GUESTBOOK_PAGE_SIZE,
      max_limit: GUESTBOOK_MAX_PAGE_SIZE,
      next_field: "pagination.next_cursor",
      more_field: "pagination.has_more",
    },
  },
  "/fresh-set": {
    bound: "bounded",
    reason:
      "One census round, not a history: every row is a door that answered in THIS week's walk. A cursor here would never advance, because there is never a second page — next week replaces this set rather than extending it.",
    bounded_by:
      "the hosts probed in the current census round; the previous round is replaced, never appended to",
  },
  "/corpus.json": {
    bound: "bounded",
    reason:
      "One signed snapshot per week, appended forever — so it grows, but at fifty-two entries a year against a read cap of 1,000 it is served whole and will be for years. Paginating it would also fracture the thing it exists for: the hash-chain verdict published beside the entries is computed over the WHOLE record, and a verdict over one page proves nothing about the chain.",
    bounded_by:
      "one entry per week under a 1,000-record read cap; per-host slices are at /corpus/host/{host}.json when the whole is more than a reader wants",
  },
  "/.well-known/api-catalog": {
    bound: "bounded",
    reason:
      "The set of APIs this origin serves. Finite by construction and derived from the lifecycle rows, so it changes when an API does and never grows on its own.",
    bounded_by: "the APIs this origin actually serves",
  },
  "/.well-known/ard.json": {
    bound: "bounded",
    reason:
      "The agentic resources this origin publishes: the MCP server, the A2A card, the HTTP API and the skills. Finite by construction, same as the API catalog.",
    bounded_by: "the agentic resources this origin publishes",
  },
  "/menu.json": {
    bound: "bounded",
    reason:
      "The shelf. Every item this store sells, in one document, because a catalog a buyer has to paginate is a catalog they will not finish reading.",
    bounded_by: "MENU_ITEMS, the shelf itself",
  },
};

/**
 * THE ASYNC JOB, IN THE SHAPE A SCANNER LOOKS FOR.
 *
 * Every human-fulfilled purchase already returns an order id, a status
 * and the URL to poll — which IS the pattern. What the contract never
 * said is that a caller should poll it, what the states are, or which
 * of them are terminal.
 *
 * NOT 202, AND THIS IS DELIBERATE. A scanner recognises 202 with a
 * Location header, and returning one would score better. This store
 * answers 200 because the paid response already carries the goods it
 * can produce at that moment — the patron number, the badge, the
 * signed certificate — and only the human's work is outstanding.
 * Declaring a 202 the API never sends would be advertising a status
 * code as a shape rather than as a fact, which is the same defect as
 * a `sameAs` naming a page that does not exist.
 */
export const ASYNC_JOB = {
  pattern: "poll",
  /** Where the id comes from and where it is polled. */
  job_id_field: "order_id",
  poll_url_field: "order_url",
  poll_url_template: "/api/order/{order_id}",
  /** The same poll on the MCP door, for an agent that holds only that transport. */
  mcp_tool: "check_order",
  status_field: "status",
  /** Derived from the union the code actually assigns. */
  states: [...ORDER_STATUSES],
  terminal_states: [...TERMINAL_ORDER_STATUSES],
  completed_field: "deliverable",
  initial_status_code: 200,
  why_not_202:
    "This store answers 200, not 202, because the paid response already carries everything it can produce at that moment — the patron number, the badge URL and the signed certificate — and only the human's part is outstanding. A 202 would describe the request as merely accepted, which is less than what happened.",
  poll_guidance:
    "Poll no faster than once a minute; sla_hours on the order says the window the keeper promised, and a missed window puts a window_breached block on the order stating what is owed. Free, unauthenticated, and the order id is the only thing needed.",
} as const;
