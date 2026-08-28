import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE CONTRACT SAYS WHAT COMES BACK, AND THE STORE PROVES IT.
 *
 * A readiness scan on 2026-08-28 scored function-calling readiness at
 * "69/117 typed"; measured against the live document, 115 of 117
 * operations declared their 200 as a bare `{type: "object"}` with no
 * properties at all. Honest — the store really does return an object —
 * and useless: a function-calling host converting this contract into
 * a tool emits one whose return value is "some JSON", so a model has
 * to discover every field by provoking a response and reading it.
 *
 * The request side was fixed in August (jsonBody, and the comment
 * there tells that story). This is the same defect facing the other
 * way.
 *
 * WHY THIS IS A TEST AND NOT JUST A SCHEMA. Rule 46 says derive or
 * refuse, and a response schema typed by hand beside a handler is
 * exactly the second copy that drifts — the shape lives in the
 * handler, the claim lives in the contract, and nothing makes them
 * meet. They meet here: every property the contract declares is
 * fetched from the real endpoint and checked to exist with the
 * declared type. The contract may describe less than the store sends
 * (a schema is a floor, not a census, and `additionalProperties` is
 * left open on purpose), but it can never describe MORE. The day a
 * handler stops sending a declared field, this fails and names it.
 *
 * The free instruments come first, on purpose: their shapes are
 * stable, they cost nothing to call, and they are what a builder
 * evaluating this store reaches for before deciding to pay for
 * anything.
 */

interface Probe {
  /** Path in the OpenAPI document. */
  path: string;
  method: "get" | "post";
  /** How to actually call it, live. */
  call: () => Promise<Response>;
}

const PROBES: Probe[] = [
  {
    path: "/menu.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/menu.json`),
  },
  {
    path: "/api/preflight/checks",
    method: "get",
    call: () => SELF.fetch(`${BASE}/api/preflight/checks`),
  },
];

async function document(): Promise<Record<string, any>> {
  return (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as never;
}

function schemaFor(
  doc: Record<string, any>,
  probe: Probe,
): Record<string, any> | undefined {
  return doc["paths"]?.[probe.path]?.[probe.method]?.["responses"]?.["200"]
    ?.["content"]?.["application/json"]?.["schema"];
}

/** The JSON Schema types the store actually uses, checked honestly. */
function matchesType(value: unknown, declared: string): boolean {
  switch (declared) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
    case "integer":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    default:
      return true;
  }
}

describe("the free instruments declare what they return", () => {
  it.each(PROBES)("$method $path declares more than 'an object'", async (probe) => {
    const schema = schemaFor(await document(), probe);
    expect(schema, `${probe.path} has no 200 JSON schema at all`).toBeTruthy();
    expect(schema?.["type"]).toBe("object");
    const properties = schema?.["properties"] as
      | Record<string, unknown>
      | undefined;
    expect(
      properties && Object.keys(properties).length > 0,
      `${probe.path} declares a bare object — the exact finding this file exists to close`,
    ).toBe(true);
  });

  it.each(PROBES)(
    "$method $path sends every field it declares",
    async (probe) => {
      const schema = schemaFor(await document(), probe)!;
      const properties = (schema["properties"] ?? {}) as Record<string, any>;
      const response = await probe.call();
      expect(response.status, probe.path).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      for (const [name, declared] of Object.entries(properties)) {
        expect(
          name in body,
          `${probe.path} declares "${name}" and the store does not send it`,
        ).toBe(true);
        const type = declared?.["type"];
        if (typeof type === "string") {
          expect(
            matchesType(body[name], type),
            `${probe.path}: "${name}" is declared ${type} and is not one`,
          ).toBe(true);
        }
      }
    },
  );

  it.each(PROBES)(
    "$method $path requires only fields it always sends",
    async (probe) => {
      /*
       * `required` is the half a client trusts hardest: it is the
       * promise it may read the field without checking. Declaring a
       * field required that the handler sometimes omits is a worse
       * lie than declaring nothing, so the required list is held to
       * the live response too.
       */
      const schema = schemaFor(await document(), probe)!;
      const required = (schema["required"] ?? []) as string[];
      const body = (await (await probe.call()).json()) as Record<
        string,
        unknown
      >;
      for (const name of required) {
        expect(
          name in body,
          `${probe.path} marks "${name}" required and did not send it`,
        ).toBe(true);
      }
    },
  );
});
