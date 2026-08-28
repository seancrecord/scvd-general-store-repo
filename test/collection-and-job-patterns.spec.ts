import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { ASYNC_JOB, COLLECTIONS } from "@/lib/collection-semantics";
import {
  GUESTBOOK_MAX_PAGE_SIZE,
  GUESTBOOK_PAGE_SIZE,
} from "@/routes/guestbook";
import { ORDER_STATUSES, TERMINAL_ORDER_STATUSES, isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * TWO PATTERNS THE STORE HAD AND NEVER DECLARED.
 *
 * A readiness pass scored REST pagination 0/2 and the async-job
 * pattern 0/2, and neither score was about missing behaviour. Orders
 * have been polled at /api/order/{order_id} since the queue existed,
 * and every list here has had a considered bound since the first
 * scalability audit. What was missing was the declaration.
 *
 * The assertion this file most exists for is the one about NOT
 * inventing pagination. A scanner rewards a cursor, so the cheap move
 * is to grow one on every list — and a cursor on a finite set is a
 * field that never advances, a loop with no visible end, and a claim
 * that there is more when there is not.
 */

async function spec(): Promise<Record<string, unknown>> {
  return (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as never;
}

function operationsOf(document: Record<string, unknown>): Array<{
  path: string;
  method: string;
  operation: Record<string, unknown>;
}> {
  const out: Array<{ path: string; method: string; operation: Record<string, unknown> }> = [];
  for (const [path, item] of Object.entries(
    document["paths"] as Record<string, Record<string, unknown>>,
  )) {
    for (const [method, operation] of Object.entries(item)) {
      if (isRecord(operation)) out.push({ path, method, operation });
    }
  }
  return out;
}

describe("every collection says how it ends", () => {
  it("declares each registered collection on the operation that serves it", async () => {
    const document = await spec();
    const paths = document["paths"] as Record<string, Record<string, unknown>>;
    for (const [path, semantics] of Object.entries(COLLECTIONS)) {
      const item = paths[path];
      expect(item, `${path} is registered but not in the document`).toBeTruthy();
      const get = item!["get"] as Record<string, unknown>;
      expect(get, `${path} has no GET`).toBeTruthy();
      expect(get["x-collection"], path).toEqual(semantics);
    }
  });

  it("does not invent pagination on a bounded set", async () => {
    /*
     * THE LOAD-BEARING ONE. A bounded collection must declare what
     * bounds it and must NOT carry cursor parameters — the absence is
     * the answer, and it is a better answer than a cursor that would
     * never advance.
     */
    const document = await spec();
    const paths = document["paths"] as Record<string, Record<string, unknown>>;
    const bounded = Object.entries(COLLECTIONS).filter(
      ([, semantics]) => semantics.bound === "bounded",
    );
    expect(bounded.length).toBeGreaterThan(0);

    for (const [path, semantics] of bounded) {
      expect(semantics.bounded_by, `${path} says bounded and not by what`).toBeTruthy();
      expect(semantics.cursor, `${path} is bounded; it must carry no cursor`).toBeUndefined();

      const get = paths[path]!["get"] as Record<string, unknown>;
      const parameters = (get["parameters"] ?? []) as Array<Record<string, unknown>>;
      for (const parameter of parameters) {
        expect(String(parameter["name"]), `${path}`).not.toMatch(/^(cursor|page|offset)$/);
      }
    }
  });

  it("declares the cursor parameters a generated client can actually send", async () => {
    const document = await spec();
    const paths = document["paths"] as Record<string, Record<string, unknown>>;
    const walked = Object.entries(COLLECTIONS).filter(
      ([, semantics]) => semantics.bound === "cursor",
    );
    expect(walked.length).toBeGreaterThan(0);

    for (const [path, semantics] of walked) {
      const get = paths[path]!["get"] as Record<string, unknown>;
      const parameters = (get["parameters"] ?? []) as Array<Record<string, unknown>>;
      const named = new Map(parameters.map((p) => [String(p["name"]), p]));

      // Prose is not a parameter: a generated client sends what the
      // parameters array names and nothing else.
      const cursor = named.get(semantics.cursor!.parameter);
      expect(cursor, `${path} documents a cursor it never declares`).toBeTruthy();
      expect(cursor!["in"]).toBe("query");
      expect(cursor!["required"]).toBe(false);

      const limit = named.get(semantics.cursor!.limit_parameter);
      expect(limit, `${path} has no limit parameter`).toBeTruthy();
      const schema = limit!["schema"] as Record<string, unknown>;
      expect(schema["maximum"]).toBe(semantics.cursor!.max_limit);
      expect(schema["default"]).toBe(semantics.cursor!.default_limit);
    }
  });

  it("keeps the registry's numbers equal to the code's", () => {
    /*
     * The registry is hand-written filing. Its PROSE is free; its
     * NUMBERS are claims about behaviour, so they are read from the
     * constants the route clamps with rather than typed twice.
     */
    const guestbook = COLLECTIONS["/api/guestbook"]!;
    expect(guestbook.cursor?.default_limit).toBe(GUESTBOOK_PAGE_SIZE);
    expect(guestbook.cursor?.max_limit).toBe(GUESTBOOK_MAX_PAGE_SIZE);
  });
});

describe("the guestbook actually walks", () => {
  it("hands back a page, its applied limit, and whether there is more", async () => {
    const response = await SELF.fetch(`${BASE}/api/guestbook`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      pagination: Record<string, unknown>;
      entries: unknown[];
    };
    expect(body.pagination["limit"]).toBe(GUESTBOOK_PAGE_SIZE);
    expect(body.pagination["max_limit"]).toBe(GUESTBOOK_MAX_PAGE_SIZE);
    expect(typeof body.pagination["has_more"]).toBe("boolean");
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("clamps a limit nobody should get, and says what it applied", async () => {
    /*
     * A caller asking for five thousand entries is a caller who will
     * otherwise believe they received five thousand. The APPLIED value
     * comes back, not the requested one.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/api/guestbook?limit=5000`)
    ).json()) as { pagination: Record<string, unknown> };
    expect(body.pagination["limit"]).toBe(GUESTBOOK_MAX_PAGE_SIZE);

    const small = (await (
      await SELF.fetch(`${BASE}/api/guestbook?limit=1`)
    ).json()) as { pagination: Record<string, unknown>; entries: unknown[] };
    expect(small.pagination["limit"]).toBe(1);
    expect(small.entries.length).toBeLessThanOrEqual(1);
  });

  it("survives nonsense in the limit rather than serving nothing", async () => {
    for (const bad of ["abc", "-4", "0", ""]) {
      const body = (await (
        await SELF.fetch(`${BASE}/api/guestbook?limit=${bad}`)
      ).json()) as { pagination: Record<string, unknown> };
      const limit = Number(body.pagination["limit"]);
      expect(limit, bad).toBeGreaterThanOrEqual(1);
      expect(limit, bad).toBeLessThanOrEqual(GUESTBOOK_MAX_PAGE_SIZE);
    }
  });

  it("offers a next cursor only when there is a next page", async () => {
    /*
     * An always-present next_cursor is a loop a client cannot tell it
     * has finished. Present exactly when has_more, and never otherwise.
     */
    const body = (await (
      await SELF.fetch(`${BASE}/api/guestbook?limit=1`)
    ).json()) as { pagination: Record<string, unknown> };
    if (body.pagination["has_more"] === true) {
      expect(typeof body.pagination["next_cursor"]).toBe("string");
    } else {
      expect("next_cursor" in body.pagination).toBe(false);
    }
  });

  it("publishes no total, on purpose", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/guestbook`)
    ).json()) as { pagination: Record<string, unknown> };
    expect(body.pagination["total"]).toBeUndefined();
    expect(String(body.pagination["no_total"])).toContain("full scan");
  });
});

describe("the async job is declared where a caller meets it", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("stamps the pattern on the poll endpoint and on every paid door", async () => {
    const document = await spec();
    const poll = operationsOf(document).find(
      (entry) => entry.path === ASYNC_JOB.poll_url_template,
    );
    expect(poll, "the poll endpoint is not in the document").toBeTruthy();
    expect((poll!.operation["x-async-job"] as Record<string, unknown>)["role"]).toBe(
      "poll",
    );

    const paid = operationsOf(document).filter((entry) => entry.operation["x-payment"]);
    expect(paid.length).toBeGreaterThan(0);
    for (const entry of paid) {
      const job = entry.operation["x-async-job"] as Record<string, unknown>;
      expect(job, `${entry.method} ${entry.path}`).toBeTruthy();
      expect(job["role"]).toBe("start");
      expect(job["poll_url_template"]).toBe(ASYNC_JOB.poll_url_template);
    }
  });

  it("enumerates the states the code can actually assign", async () => {
    /*
     * DERIVED, both ways. The spec's enum is the array OrderStatus is
     * built from, so the contract cannot name a state that never
     * happens — nor miss one that does.
     */
    const document = await spec();
    const poll = (document["paths"] as Record<string, Record<string, unknown>>)[
      ASYNC_JOB.poll_url_template
    ]!["get"] as Record<string, unknown>;

    const schema = (
      ((poll["responses"] as Record<string, unknown>)["200"] as Record<string, unknown>)[
        "content"
      ] as Record<string, Record<string, Record<string, unknown>>>
    )["application/json"]!["schema"]! as Record<string, unknown>;
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    expect(properties["status"]!["enum"]).toEqual([...ORDER_STATUSES]);
    expect(ASYNC_JOB.states).toEqual([...ORDER_STATUSES]);

    // A poller that does not know which states end the job either
    // stops early or never stops.
    expect(ASYNC_JOB.terminal_states).toEqual([...TERMINAL_ORDER_STATUSES]);
    for (const terminal of ASYNC_JOB.terminal_states) {
      expect(ASYNC_JOB.states).toContain(terminal);
    }
  });

  it("claims no 202, because the store never sends one", async () => {
    /*
     * A scanner recognises 202 with a Location header and this store
     * would score better for declaring one. It answers 200 — the paid
     * response already carries the patron number, the badge and the
     * signed certificate, and only the human's work is outstanding.
     * Declaring a status code the API never emits is advertising a
     * shape rather than a fact.
     */
    const document = await spec();
    for (const entry of operationsOf(document).filter(
      (row) => row.operation["x-payment"],
    )) {
      const responses = entry.operation["responses"] as Record<string, unknown>;
      expect(Object.keys(responses), `${entry.path}`).not.toContain("202");
    }
    expect(ASYNC_JOB.initial_status_code).toBe(200);
    expect(ASYNC_JOB.why_not_202).toContain("200");
  });

  it("polls a real order end to end, and the states match what was declared", async () => {
    const item = "the_collab";
    const challenge = await SELF.fetch(`${BASE}/api/buy/${item}?purpose=testing`);
    if (challenge.status !== 402) {
      // Shutter down or the item off the shelf: the declaration is
      // still asserted above, and this walk is skipped honestly rather
      // than passing on an assumption.
      expect([402, 404, 503]).toContain(challenge.status);
      return;
    }
    const { decodePaymentRequired, buildPaymentSignature } = await import(
      "./helpers/payment"
    );
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const paid = await SELF.fetch(`${BASE}/api/buy/${item}?purpose=testing`, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, unknown>;

    // The three fields the declaration promises a caller will find.
    expect(typeof body[ASYNC_JOB.job_id_field]).toBe("string");
    expect(String(body[ASYNC_JOB.poll_url_field])).toContain("/api/order/");
    expect(ORDER_STATUSES).toContain(body[ASYNC_JOB.status_field] as never);

    const polled = await SELF.fetch(String(body[ASYNC_JOB.poll_url_field]));
    expect(polled.status).toBe(200);
    const order = (await polled.json()) as Record<string, unknown>;
    expect(order["order_id"]).toBe(body[ASYNC_JOB.job_id_field]);
    expect(ORDER_STATUSES).toContain(order["status"] as never);
  });
});

describe("the async job speaks OpenAPI's own vocabulary too", () => {
  it("every start operation links its poll operation, derived from the document", async () => {
    /*
     * Scanner, 2026-08-28: "no async job pattern found" — it reads
     * the spec-native markers (202s, callbacks, links), not our
     * x-async-job extension. The 202 stays declined (the store
     * answers 200 with partial goods; why_not_202 says why), but
     * OpenAPI `links` is the vocabulary made for exactly this
     * relationship, so the buy operations now carry
     * responses.200.links.order pointing at the poll operation BY
     * THE OPERATIONID READ FROM THE DOCUMENT — never retyped, so a
     * renamed poll operation moves every link the same render.
     */
    const document = (await (
      await SELF.fetch("https://scvd.store/openapi.json")
    ).json()) as {
      paths: Record<string, Record<string, any>>;
    };
    const pollId =
      document.paths["/api/order/{order_id}"]?.get?.operationId;
    expect(typeof pollId).toBe("string");
    const starts = Object.entries(document.paths).filter(([, item]) =>
      Object.values(item).some(
        (op) => op && typeof op === "object" && op["x-payment"],
      ),
    );
    expect(starts.length).toBeGreaterThan(10);
    for (const [path, item] of starts) {
      for (const op of Object.values(item)) {
        if (!op || typeof op !== "object" || !op["x-payment"]) continue;
        const link = op.responses?.["200"]?.links?.order;
        expect(link, `${path} missing 200 links.order`).toBeTruthy();
        expect(link.operationId, path).toBe(pollId);
      }
    }
  });
});
