import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isRecord } from "@/types";
import type { Env } from "@/types";

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
  {
    path: "/corpus.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/corpus.json`),
  },
  {
    path: "/fresh-set",
    method: "get",
    // JSON is what a bare fetch gets; the HTML dialect is for browsers.
    call: () => SELF.fetch(`${BASE}/fresh-set`),
  },
  {
    path: "/defects.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/defects.json`),
  },
  {
    path: "/api/verify/{id}",
    method: "get",
    /*
     * Verification needs something signed to verify, so this probe
     * mints one first. That is the point of the endpoint — it checks
     * artifacts, including ones the caller did not buy — and a schema
     * asserted against a 404 would assert nothing.
     */
    call: async () => {
      const { mintCertificate } = await import("@/services/certificates");
      const minted = await mintCertificate(env as unknown as Env, {
        itemId: "hello",
      });
      return SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`);
    },
  },
  {
    path: "/pulse.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/pulse.json`),
  },
  {
    path: "/api/preflight/v1",
    method: "get",
    call: () => SELF.fetch(`${BASE}/api/preflight/v1`),
  },
  {
    path: "/api/preflight/v2",
    method: "get",
    call: () => SELF.fetch(`${BASE}/api/preflight/v2`),
  },
  {
    path: "/api/onpage/v1",
    method: "get",
    call: () => SELF.fetch(`${BASE}/api/onpage/v1`),
  },
  {
    path: "/api/conformance/v1",
    method: "get",
    call: () => SELF.fetch(`${BASE}/api/conformance/v1`),
  },
  {
    path: "/.well-known/api-catalog",
    method: "get",
    call: () => SELF.fetch(`${BASE}/.well-known/api-catalog`),
  },
  {
    path: "/.well-known/ard.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/.well-known/ard.json`),
  },
  {
    path: "/.well-known/ai-catalog.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/.well-known/ai-catalog.json`),
  },
  {
    path: "/.well-known/mcp.json",
    method: "get",
    call: () => SELF.fetch(`${BASE}/.well-known/mcp.json`),
  },
  {
    path: "/deprecation",
    method: "get",
    // JSON by Accept; the HTML twin is for browsers.
    call: () =>
      SELF.fetch(`${BASE}/deprecation`, {
        headers: { Accept: "application/json" },
      }),
  },
  {
    path: "/api/conformance/v1",
    method: "post",
    /*
     * A deliberately malformed artifact. The desk's whole posture is
     * that a verdict of "no" is as fully-shaped an answer as a
     * verdict of "yes" — same fields, same checks list — so the
     * cheapest honest probe is one that fails conformance rather than
     * one that needs a real signed offer to exist.
     */
    call: () =>
      SELF.fetch(`${BASE}/api/conformance/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact: "aaa.bbb.ccc" }),
      }),
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
        /*
         * DECLARED IS NOT THE SAME AS ALWAYS SENT, and the first
         * version of this test conflated them. /corpus.json omits
         * temporalCoverage entirely until there is a first week to
         * cover, which is honest — an empty corpus has no span — and
         * the schema is right to name the field. What would NOT be
         * honest is a contract naming a field that never arrives and
         * nobody noticing.
         *
         * So the rule is: a declared field must either be in the
         * response, or its description must say WHEN it is absent.
         * That keeps the bite (a phantom field with no such sentence
         * still fails) while letting a genuinely conditional field
         * exist — and it forces the condition into the contract,
         * where a reader can act on it, instead of leaving them to
         * discover it by getting undefined at runtime.
         */
        if (!(name in body)) {
          const description = String(declared?.["description"] ?? "");
          expect(
            /absent|omitted|only when|until there|when there|none was|null when/i.test(
              description,
            ),
            `${probe.path} declares "${name}", the store did not send it, and the schema does not say when it is absent`,
          ).toBe(true);
          continue;
        }
        /*
         * OpenAPI 3.1 spells nullable as a UNION — type: ["object",
         * "null"] — and several honest fields here are genuinely
         * absent-or-a-value (a conformance verdict on a malformed
         * artifact cannot report a `kind`). A union passes if the
         * value matches any member, which is what the document says.
         */
        const type = declared?.["type"];
        const declaredTypes = Array.isArray(type)
          ? (type as string[])
          : typeof type === "string"
            ? [type]
            : [];
        if (declaredTypes.length > 0) {
          expect(
            declaredTypes.some((each) =>
              each === "null"
                ? body[name] === null
                : matchesType(body[name], each),
            ),
            `${probe.path}: "${name}" is declared ${declaredTypes.join("|")} and is not one`,
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
