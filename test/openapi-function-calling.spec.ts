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

describe("the error model, typed", () => {
  it("documents 4xx and 5xx as RFC 9457 problem objects", async () => {
    const all = operations(await spec());
    for (const entry of all) {
      const responses = entry.op["responses"] as Record<string, Operation>;
      for (const code of ["400", "404", "429", "500"]) {
        expect(responses[code]).toBeTruthy();
      }
      const problem = responses["400"]?.["content"] as Record<string, unknown>;
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
    const schema = responses["400"] as Operation;
    const content = schema["content"] as Record<string, Operation>;
    const problem = (content["application/problem+json"] as Operation)["schema"] as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(problem.required).toContain("error");
    expect(problem.properties["detail"]).toBeTruthy();
    expect(problem.properties["status"]).toBeTruthy();
  });

  it("does not advertise a rate limit nothing enforces", async () => {
    /*
     * The audit asked for RateLimit headers. The first draft of this
     * change added them, and they would have been false: there is no
     * limiter in this Worker to produce a number. An agent
     * self-throttling against a fiction is worse off than one that
     * was told the truth, and a spec that lies once is a spec.
     */
    const document = await spec();
    const policy = document["x-rate-limiting"] as Record<string, unknown>;
    expect(policy["application_level_limit"]).toBe(false);
    expect(policy["headers_returned"]).toEqual([]);
    expect(String(policy["note"])).toMatch(/Retry-After/);

    const all = operations(document);
    for (const entry of all) {
      const responses = entry.op["responses"] as Record<string, Operation>;
      const ok = responses["200"] as Operation | undefined;
      const headers = (ok?.["headers"] ?? {}) as Record<string, unknown>;
      expect(headers["RateLimit-Limit"]).toBeUndefined();
    }
  });

  it("still documents the 429 that can arrive from the edge", async () => {
    const all = operations(await spec());
    const responses = all[0]?.op["responses"] as Record<string, Operation>;
    const tooMany = responses["429"] as Operation;
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
  });

  it("points at a policy page that actually answers", async () => {
    const document = await spec();
    const versioning = document["x-versioning"] as { policy_url: string };
    const page = await SELF.fetch(versioning.policy_url);
    expect(page.status).toBe(200);
  });
});
