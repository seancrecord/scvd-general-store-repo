import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { operationIdFor } from "@/routes/openapi";

/**
 * A CONTRACT AN LLM CAN GENERATE FUNCTIONS FROM.
 *
 * The readiness audit of 2026-08-21 read the spec and reported
 * "0/99 operationIds, 38/99 typed schemas". Both numbers were right.
 * The store had spent months making the spec TRUE — every path real,
 * every free shelf marked `security: []`, every item's inputs pulled
 * from the same object the buy route enforces — and none of that
 * helps a function-calling format, which keys on operationId and
 * gives up on an operation without one.
 *
 * These tests hold the coverage at 100%, because the failure mode is
 * not "some operations lack ids", it is "the next operation added
 * lacks one and nobody notices for a month".
 */

async function spec(): Promise<Record<string, unknown>> {
  const response = await SELF.fetch("https://scvd.store/openapi.json");
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

type Operation = Record<string, unknown>;

function operations(
  document: Record<string, unknown>,
): Array<{ path: string; method: string; op: Operation }> {
  const out: Array<{ path: string; method: string; op: Operation }> = [];
  const paths = document["paths"] as Record<string, Record<string, Operation>>;
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (typeof op === "object" && op !== null) out.push({ path, method, op });
    }
  }
  return out;
}

/**
 * FOLLOW A `$ref` BACK TO WHAT IT NAMES.
 *
 * The document moved its repeated pieces into `components` on
 * 2026-08-31 — it was 1.48 MB and over the 1 MB cap every agent-side
 * scanner fetches under, which made a correct contract an unreadable
 * one. Nothing it says changed; four hundred copies of the problem
 * object became one plus four hundred references.
 *
 * These assertions resolve rather than relax. A test that stopped at
 * "there is a $ref here" would pass on a reference to a component
 * that does not exist, which is the one new way this document can now
 * be wrong.
 */
function resolve<T extends Record<string, unknown>>(
  document: Record<string, unknown>,
  node: T | undefined,
): T {
  expect(node, "nothing to resolve").toBeTruthy();
  const ref = (node as Record<string, unknown>)["$ref"];
  if (typeof ref !== "string") return node as T;
  expect(ref.startsWith("#/"), `${ref} is not an internal reference`).toBe(true);
  let current: unknown = document;
  for (const segment of ref.slice(2).split("/")) {
    expect(
      current && typeof current === "object" && segment in current,
      `${ref} points at nothing: ${segment} is missing`,
    ).toBe(true);
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T;
}

describe("every operation is callable by name", () => {
  it("gives all of them an operationId — not most of them", async () => {
    const all = operations(await spec());
    expect(all.length).toBeGreaterThan(50);
    const missing = all.filter((entry) => !entry.op["operationId"]);
    expect(missing.map((entry) => `${entry.method} ${entry.path}`)).toEqual([]);
  });

  it("never repeats one, because a duplicate silently drops a tool", async () => {
    const all = operations(await spec());
    const ids = all.map((entry) => String(entry.op["operationId"]));
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
    expect(duplicated).toEqual([]);
  });

  it("gives all of them a description, the other half of a function definition", async () => {
    const all = operations(await spec());
    const undescribed = all.filter(
      (entry) => !String(entry.op["description"] ?? "").trim(),
    );
    expect(undescribed.map((entry) => entry.path)).toEqual([]);
  });

  it("derives the id from the operation so it cannot drift", () => {
    expect(operationIdFor("get", "/menu.json")).toBe("get_menu_json");
    /*
     * The extension has to survive: these are two real, different
     * documents, and collapsing them cost one of them its handle.
     */
    expect(operationIdFor("get", "/.well-known/x402")).not.toBe(
      operationIdFor("get", "/.well-known/x402.json"),
    );
    expect(operationIdFor("get", "/api/buy/{item_id}")).toBe("get_api_buy_item_id");
    expect(operationIdFor("get", "/")).toBe("get_root");
    expect(operationIdFor("POST", "/api/tab/delta")).toBe("post_api_tab_delta");
  });
});

describe("every operation an LLM would call is typed, not described in prose", () => {
  /**
   * THE OTHER HALF OF THE SAME AUDIT FINDING. "102/102 operationIds,
   * 38/102 typed schemas" — and the 64 split cleanly into two
   * failures that are both invisible to a person reading the spec:
   *
   *   Sixteen POST operations published their request shape in the
   *   DESCRIPTION, as English (`JSON body: { "url": "https://..." }`).
   *   A function-calling converter reads `requestBody`, finds nothing,
   *   and emits a tool whose only parameter is "an object" — so the
   *   model guesses field names out of a sentence.
   *
   *   Ten templated GETs declared no `parameters` at all. Braces in
   *   the path and nothing saying what goes in them is not merely
   *   untyped; it is invalid OpenAPI, and a generator either drops the
   *   operation or invents the parameter.
   *
   * Both are asserted structurally rather than by count, because a
   * count passes the day somebody adds a typed operation and an
   * untyped one in the same commit.
   */
  it("declares a parameter for every brace in every path", async () => {
    const document = await spec();
    const untyped: string[] = [];
    for (const entry of operations(document)) {
      const names = [...entry.path.matchAll(/\{([^}]+)\}/g)].map(
        (match) => match[1],
      );
      if (names.length === 0) continue;
      const declared = ((entry.op["parameters"] ?? []) as Array<
        Record<string, unknown>
      >).filter((parameter) => parameter["in"] === "path");
      for (const name of names) {
        const found = declared.find((parameter) => parameter["name"] === name);
        if (!found || !found["schema"]) {
          untyped.push(`${entry.method} ${entry.path} → {${name}}`);
        }
      }
    }
    expect(untyped.sort()).toEqual([]);
  });

  it("gives every POST a typed request body instead of a sentence", async () => {
    const document = await spec();
    const untyped: string[] = [];
    for (const entry of operations(document)) {
      if (entry.method !== "post") continue;
      const body = entry.op["requestBody"] as Record<string, unknown> | undefined;
      const schema = body
        ? ((body["content"] as Record<string, Record<string, unknown>>)?.[
            "application/json"
          ]?.["schema"] as Record<string, unknown> | undefined)
        : undefined;
      // `type` alone is not typing: an operation whose body is a free
      // object has to SAY it is, which the verify-receipt desk does.
      if (!schema || !schema["type"]) {
        untyped.push(`${entry.method} ${entry.path}`);
      }
    }
    expect(untyped.sort()).toEqual([]);
  });

  it("counts what the audit counts, and clears its bar", async () => {
    /*
     * The audit's own arithmetic, reproduced: an operation is typed
     * when it declares a request body schema or typed parameters. It
     * read 38/102. This asserts the ratio can never fall back — a new
     * untyped operation fails here by name rather than in a report
     * three weeks later.
     */
    const all = operations(await spec());
    const untyped = all.filter((entry) => {
      const body = entry.op["requestBody"] as Record<string, unknown> | undefined;
      if (body) return false;
      const parameters = (entry.op["parameters"] ?? []) as Array<
        Record<string, unknown>
      >;
      if (parameters.length === 0) return true;
      return !parameters.every((parameter) => parameter["schema"]);
    });
    /*
     * NOT ZERO, AND THE REMAINDER IS NAMED RATHER THAN HIDDEN: a free
     * GET that takes no input has nothing to type, and inventing a
     * parameter so a ratio reads better is the exact species of
     * flattering number this store keeps off its own books. Every one
     * of these is an input-less GET, and THAT is what is asserted.
     */
    for (const entry of untyped) {
      expect(entry.method, `${entry.path} is an untyped ${entry.method}`).toBe(
        "get",
      );
      expect(entry.path, `${entry.path} has a brace and no parameter`).not.toContain(
        "{",
      );
    }
  });
});

describe("the error model, typed", () => {
  it("documents 4xx and 5xx as RFC 9457 problem objects", async () => {
    const document = await spec();
    const all = operations(document);
    for (const entry of all) {
      const responses = entry.op["responses"] as Record<string, Operation>;
      for (const code of ["400", "404", "429", "500"]) {
        expect(
          responses[code],
          `${entry.method} ${entry.path} has no ${code}`,
        ).toBeTruthy();
        // Resolving every one of them on every operation is what
        // proves the componentised document still says four hundred
        // times what it now writes down once.
        resolve(document, responses[code]);
      }
      const problem = resolve(document, responses["400"])["content"] as Record<
        string,
        unknown
      >;
      expect(problem["application/problem+json"]).toBeTruthy();
    }
  });

  it("keeps `error` required, because that is the field already being sent", async () => {
    /*
     * This documents what the store returns; it does not change it.
     * Every failure response has carried a human-readable `error`
     * since the first day, and a typed model that quietly dropped it
     * would break every client that reads it.
     */
    const document = await spec();
    const all = operations(document);
    const responses = all[0]?.op["responses"] as Record<string, Operation>;
    const schema = resolve(document, responses["400"] as Operation);
    const content = schema["content"] as Record<string, Operation>;
    const problem = resolve(
      document,
      (content["application/problem+json"] as Operation)["schema"] as Operation,
    ) as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(problem.required).toContain("error");
    expect(problem.properties["detail"]).toBeTruthy();
    expect(problem.properties["status"]).toBeTruthy();
  });

  it("advertises the rate limit it has, on exactly the paths that have one", async () => {
    /*
     * THE FIRST DRAFT OF THIS FILE ASSERTED THE OPPOSITE, and it was
     * right at the time: the audit asked for RateLimit headers, and
     * declaring them everywhere would have been false, because most of
     * these operations have no limiter to produce a number. An agent
     * self-throttling against a fiction is worse off than one told the
     * truth.
     *
     * What changed is not the principle. The preflight limiter has
     * been enforced since 2026-08-03 and reported its state to nobody
     * — so the ceiling was documented in prose and unobservable on the
     * wire, which the audit named exactly. Both halves are asserted
     * here now: the metered paths carry the fields, and everything
     * else still carries none.
     */
    const document = await spec();
    const policy = document["x-rate-limiting"] as Record<string, unknown>;
    expect(policy["application_level_limit"]).toBe(true);
    expect(policy["headers_returned"]).toContain("RateLimit-Limit");
    expect(policy["headers_returned"]).toContain("RateLimit-Policy");
    expect(String(policy["note"])).toMatch(/Retry-After/);
    const limited = policy["limited_paths"] as string[];
    expect(limited.length).toBeGreaterThan(0);

    for (const entry of operations(document)) {
      const responses = entry.op["responses"] as Record<string, Operation>;
      const ok = responses["200"] as Operation | undefined;
      const headers = (ok?.["headers"] ?? {}) as Record<string, unknown>;
      const metered = limited.includes(entry.path) && entry.method === "post";
      if (metered) {
        expect(
          headers["RateLimit-Limit"],
          `${entry.path} is metered and documents no RateLimit-Limit`,
        ).toBeTruthy();
      } else {
        expect(
          headers["RateLimit-Limit"],
          `${entry.method} ${entry.path} documents a ceiling nothing enforces`,
        ).toBeUndefined();
      }
    }
  });

  it("still documents the 429 that can arrive from the edge", async () => {
    const document = await spec();
    const all = operations(document);
    const responses = all[0]?.op["responses"] as Record<string, Operation>;
    const tooMany = resolve(document, responses["429"] as Operation);
    const headers = tooMany["headers"] as Record<string, unknown>;
    expect(headers["Retry-After"]).toBeTruthy();
  });
});

describe("the versioning promise", () => {
  it("says how a version ends, not just that versions exist", async () => {
    const document = await spec();
    const versioning = document["x-versioning"] as Record<string, unknown>;
    expect(versioning).toBeTruthy();
    expect(String(versioning["deprecation"])).toMatch(/Sunset|90 days/);
    expect(versioning["sunset_headers"]).toBeTruthy();
    // An empty list is a statement: nothing is being retired today.
    expect(versioning["currently_deprecated"]).toEqual([]);
    // And the table beside it, so a reader learns WHICH versions exist
    // rather than only that none of them is ending.
    const versions = versioning["versions"] as Array<Record<string, unknown>>;
    expect(versions.length).toBeGreaterThan(0);
    for (const row of versions) {
      expect(String(row["path"])).toMatch(/^\/api\//);
      expect(["current", "supported", "deprecated"]).toContain(row["status"]);
    }
  });

  it("points at a policy page that actually answers", async () => {
    const document = await spec();
    const versioning = document["x-versioning"] as { policy_url: string };
    const page = await SELF.fetch(versioning.policy_url);
    expect(page.status).toBe(200);
  });
});
