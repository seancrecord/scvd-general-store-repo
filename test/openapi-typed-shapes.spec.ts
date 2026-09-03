import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PreflightReport } from "@/services/preflight";

const BASE = "https://scvd.store";

/**
 * EVERY DOOR SAYS WHAT COMES BACK, OR IS ON A LIST THAT ONLY SHRINKS.
 *
 * A 2026-08-30 readiness scan reported this store's contract as only
 * partly usable for function calling, and the count it gave was worse
 * than it looked. Every operation HAS a 200 schema — so a naive check
 * says 134 of 134 are typed — but 76 of them were `{"type":"object"}`
 * and nothing else. That is a schema in the sense that a sealed box is
 * a description of its contents. A client generating from it learns
 * that JSON comes back, which it could have guessed.
 *
 * THE LIST IS NOW EMPTY (2026-08-31). Every operation describes what
 * it returns, so rules 2 and 3 have nothing left to prune and this
 * file is a pure floor: the only thing it can catch from here is a NEW
 * door shipping bare. That is the state it was built to reach, and the
 * ratchet is what got it there — it named every door as it was typed
 * and refused to let the register go stale in between.
 *
 * THE FIX WAS NOT ONE COMMIT, and pretending otherwise is how a list
 * like this rots. Writing 76 response shapes means deriving each from
 * its route, and a schema that is confidently wrong is worse than a
 * bare one: it is a false claim in machine form, on the surface this
 * store's whole argument depends on. So this guard is a RATCHET rather
 * than a deadline.
 *
 * THREE RULES, AND THE SECOND IS THE ONE THAT MATTERS:
 *
 *   1. A door not on the list must declare its shape. A NEW door
 *      cannot ship bare — that is the leak this closes.
 *   2. A door ON the list must still BE bare. The moment one is typed,
 *      its entry has to go, or this fails by name. An allowlist nobody
 *      is forced to prune is a list that silently stops meaning
 *      anything, which is the failure mode of every "we'll fix it
 *      later" register ever written.
 *   3. The list never grows. The number below is a high-water mark,
 *      and it only ever goes down.
 *
 * WHAT THE SWEEP FOUND, beyond the bare schemas themselves. Three
 * classes of contract that was not vague but WRONG, each of which
 * would have broken a generated client rather than merely underserved
 * it:
 *
 *   /auth.md and /pricing.md declared application/json for bodies that
 *   are text/markdown. A generated client would have parsed markdown
 *   as JSON and failed on the first byte.
 *
 *   Five intake doors — guestbook, stamp, letter, request, tip —
 *   answer 201 Created and every one of them declared 200, inherited
 *   from freeOp. `created()` replaces it rather than listing both.
 *
 *   /api/practice/{scenario} answers 402 ALWAYS, on purpose, and
 *   declaring a 200 for it would have described a success that door
 *   never produces. `returnsOn402` puts the schema where the answer
 *   actually is — and this guard learned 402 rather than pressuring
 *   that door toward a 2xx it does not have.
 */

/**
 * Still bare, by method and path. Remove an entry in the same commit
 * that types it — rule 2 makes that mandatory rather than polite.
 */
const UNTYPED_YET = new Set<string>([
]);

/** The high-water mark. It only ever goes down. */
const UNTYPED_CEILING = 0;

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

interface Operation {
  key: string;
  operation: Record<string, unknown>;
}

function operations(document: Record<string, unknown>): Operation[] {
  const paths = document["paths"] as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const found: Operation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!(METHODS as readonly string[]).includes(method)) continue;
      found.push({ key: `${method} ${path}`, operation });
    }
  }
  return found;
}

/**
 * TRUE WHEN A GENERATED CLIENT LEARNS SOMETHING. A `$ref`, named
 * properties, an array with items, or a scalar all describe a value.
 * A bare `{"type":"object"}` describes the fact that JSON is JSON.
 *
 * 201 is read alongside 200 and 202 because the intake doors answer
 * Created — which the contract did not say until 2026-08-31, and this
 * guard would have scored a correctly-typed 201 door as bare if it
 * only knew about the two.
 *
 * 402 joins them for the practice course, whose ONLY answer is a
 * deliberately broken challenge. That door has no 200 to describe, so
 * its schema rides the status it actually sends, and a guard that
 * insisted on a 2xx would have pushed it toward declaring a success it
 * never produces.
 */
function describesItsShape(operation: Record<string, unknown>): boolean {
  const responses = (operation["responses"] ?? {}) as Record<string, unknown>;
  for (const status of ["200", "201", "202", "402"]) {
    const response = responses[status] as Record<string, unknown> | undefined;
    const content = (response?.["content"] ?? {}) as Record<
      string,
      { schema?: Record<string, unknown> }
    >;
    for (const media of Object.values(content)) {
      const schema = media.schema;
      if (!schema) continue;
      if (schema["$ref"]) return true;
      if (schema["type"] === "array" && schema["items"]) return true;
      if (typeof schema["type"] === "string" && schema["type"] !== "object") {
        return true;
      }
      const properties = schema["properties"] as
        | Record<string, unknown>
        | undefined;
      if (properties && Object.keys(properties).length > 0) return true;
    }
  }
  return false;
}

async function spec(): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}/openapi.json`);
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe("every operation says what comes back", () => {
  it("lets no new door ship without a shape", async () => {
    const bare = operations(await spec())
      .filter((entry) => !describesItsShape(entry.operation))
      .map((entry) => entry.key)
      .filter((key) => !UNTYPED_YET.has(key))
      .sort();

    expect(
      bare.join("\n"),
      "these operations return a bare {\"type\":\"object\"} and are not on the shrinking list — describe what comes back, or a generated client learns only that JSON is JSON",
    ).toBe("");
  });

  it("forces the list to shrink when a door is typed", async () => {
    /*
     * Rule 2, and the reason this file is a ratchet rather than a
     * register. An entry whose door now HAS a shape is a line nobody
     * pruned, and a list nobody prunes stops meaning anything long
     * before anyone notices.
     */
    const document = await spec();
    const live = new Map(
      operations(document).map((entry) => [entry.key, entry.operation]),
    );

    const stale: string[] = [];
    for (const key of UNTYPED_YET) {
      const operation = live.get(key);
      if (!operation) {
        stale.push(`${key} — no such operation; remove the entry`);
      } else if (describesItsShape(operation)) {
        stale.push(`${key} — now declares its shape; remove the entry`);
      }
    }
    expect(stale.sort().join("\n")).toBe("");
  });

  it("keeps the count going one way", () => {
    expect(
      UNTYPED_YET.size,
      "the untyped list grew; it is a high-water mark, not a budget",
    ).toBeLessThanOrEqual(UNTYPED_CEILING);
  });
});


/**
 * THE FLAGSHIP VERDICT, BOUND TO ITS TYPE IN BOTH DIRECTIONS.
 *
 * PREFLIGHT_VERDICT_SCHEMA is the contract-side twin of
 * `PreflightReport`, and a twin that can drift is worse than no twin:
 * a generated client would trust a shape the instrument stopped
 * returning. So the binding is mechanical rather than remembered.
 *
 * The map below is typed `Record<keyof PreflightReport, true>`, which
 * means TypeScript refuses to compile this file if the interface gains
 * a field and nobody adds it here. The assertion then refuses to pass
 * if the schema does not name it. Add a field to the report and you
 * are walked from a compile error to a test failure to the contract —
 * which is the only route that ends with the spec telling the truth.
 */
const REPORT_FIELDS: Record<keyof PreflightReport, true> = {
  version: true,
  verdict: true,
  reached_level: true,
  reached_level_meaning: true,
  network_failure: true,
  checks_vector: true,
  checks: true,
  advisories: true,
      remediation: true,
  single_probe_note: true,
  what_this_cannot_tell_you: true,
  our_conflict_of_interest: true,
  rate_limit: true,
  store_identity: true,
  also_under: true,
  next_steps: true,
};

describe("the preflight verdict schema cannot drift from its type", () => {
  it("names every field the report can carry", async () => {
    const document = await spec();
    const schema = (
      (
        (
          (document["paths"] as Record<string, Record<string, Record<string, unknown>>>)[
            "/api/preflight/v1"
          ]!["post"]!["responses"] as Record<string, Record<string, unknown>>
        )["200"]!["content"] as Record<string, { schema: Record<string, unknown> }>
      )["application/json"]!.schema
    );
    const described = Object.keys(
      schema["properties"] as Record<string, unknown>,
    );

    const missing = Object.keys(REPORT_FIELDS)
      .filter((field) => !described.includes(field))
      .sort();
    expect(
      missing.join(", "),
      "PreflightReport carries these fields and the contract does not describe them",
    ).toBe("");
  });

  it("marks nothing required that the report leaves optional", async () => {
    /*
     * The other direction. `network_failure` and `also_under` are
     * conditional — present only when the probe stopped at level none,
     * or while more than one battery is served. A contract that called
     * either one required would generate clients that reject a
     * perfectly good verdict.
     */
    const document = await spec();
    const schema = (
      (
        (
          (document["paths"] as Record<string, Record<string, Record<string, unknown>>>)[
            "/api/preflight/v1"
          ]!["post"]!["responses"] as Record<string, Record<string, unknown>>
        )["200"]!["content"] as Record<string, { schema: Record<string, unknown> }>
      )["application/json"]!.schema
    );
    const required = (schema["required"] ?? []) as string[];
    for (const conditional of ["network_failure", "also_under"]) {
      expect(required, `${conditional} is conditional`).not.toContain(conditional);
    }
  });
});
