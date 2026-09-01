import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STORE_CONTACT_EMAIL } from "@/store";
import {
  SCANNER_BUDGET_BYTES,
  SCANNER_FETCH_CAP_BYTES,
} from "@/store/reader-limits";

const BASE = "https://scvd.store";

/**
 * THE CONTRACT NOBODY COULD READ.
 *
 * On 2026-08-31 this store's OpenAPI document served 1,480,775 bytes.
 * Every path in it was real, every operation had an id, every door
 * declared its shape — and none of that reached a single agent,
 * because the scanners that read a seller's spec fetch with a 1 MB
 * cap and a document over it is simply not fetched. Circle's
 * Sell-to-Agents readiness check reported the store as having no
 * discoverable OpenAPI document at all, which was, from where it was
 * standing, true.
 *
 * The cause was not size in the sense of scope. It was five objects
 * inlined about a thousand times between them — the RFC 9457 problem
 * schema alone appeared 1,072 times at 848 bytes each. `components`
 * plus `$ref` is what OpenAPI provides for exactly this, and the
 * document lost 75% of its bytes without losing a sentence.
 *
 * THIS FILE IS A CEILING, NOT A CELEBRATION. The failure mode it
 * guards is not "the document is big today", it is "someone adds
 * forty paths over six months and nobody re-measures until a
 * scanner reports us missing again". A budget with real headroom,
 * asserted on every run, is the only version of this that keeps
 * working.
 */

/** Scanner fetch cap and budget: src/store/reader-limits.ts, once. */
const FETCH_CAP_BYTES = SCANNER_FETCH_CAP_BYTES;
const BUDGET_BYTES = SCANNER_BUDGET_BYTES;

async function document(): Promise<{ text: string; json: Record<string, unknown> }> {
  const response = await SELF.fetch(`${BASE}/openapi.json`);
  expect(response.status).toBe(200);
  const text = await response.text();
  return { text, json: JSON.parse(text) as Record<string, unknown> };
}

describe("the contract is small enough to be read", () => {
  it("stays inside the budget, which is inside the fetch cap", async () => {
    const { text } = await document();
    expect(
      text.length,
      `the document is ${text.length} bytes, past the ${BUDGET_BYTES}-byte budget. Do not raise the number — find what got inlined and move it into components, the way the problem schema and the delivery envelope went. Past ${FETCH_CAP_BYTES} bytes the scanners stop fetching it and the store reads as having no contract.`,
    ).toBeLessThan(BUDGET_BYTES);
    expect(text.length).toBeLessThan(FETCH_CAP_BYTES);
  });

  it("still describes every door it described before", async () => {
    /*
     * The cheap way to pass the test above is to delete paths. That
     * would trade an unreadable contract for an incomplete one, which
     * is worse: an agent would read it, believe it, and never find
     * the doors it left out.
     */
    const { json } = await document();
    const paths = json["paths"] as Record<string, unknown>;
    expect(Object.keys(paths).length).toBeGreaterThan(110);
  });

  it("resolves every internal reference it makes", async () => {
    const { json, text } = await document();
    const refs = [...text.matchAll(/"\$ref":"([^"]+)"/g)].map(
      (match) => match[1] as string,
    );
    expect(refs.length).toBeGreaterThan(100);
    const broken: string[] = [];
    for (const ref of new Set(refs)) {
      if (!ref.startsWith("#/")) {
        broken.push(`${ref} is not internal`);
        continue;
      }
      let current: unknown = json;
      for (const segment of ref.slice(2).split("/")) {
        if (!current || typeof current !== "object" || !(segment in current)) {
          current = undefined;
          break;
        }
        current = (current as Record<string, unknown>)[segment];
      }
      if (current === undefined) broken.push(`${ref} points at nothing`);
    }
    expect(broken.sort().join("\n")).toBe("");
  });
});

/**
 * THE FIELDS A BUYER'S AGENT READS BEFORE IT DECIDES TO PAY.
 *
 * Each of these is one of Circle's Sell-to-Agents readiness signals,
 * and each is here because it was missing or unreadable on
 * 2026-08-31. They are asserted together because they are read
 * together: a spec with guidance and no payment terms tells an agent
 * what the service does and not whether it can buy it, and a spec
 * with payment terms and no guidance tells it the opposite.
 */
describe("the contract says how to understand and how to pay", () => {
  it("carries guidance, a contact, and somewhere to read more", async () => {
    const { json } = await document();
    const info = json["info"] as Record<string, unknown>;
    const guidance = String(info["x-guidance"] ?? "");
    expect(guidance.length).toBeGreaterThan(200);
    /*
     * The budget is roughly 1000 tokens. Four characters to the token
     * is the usual rough conversion and it is generous for English
     * prose, so this ceiling is conservative on purpose — the point of
     * the field is to be read in full, and a guidance block that gets
     * truncated is worse than a shorter one that does not.
     */
    expect(
      guidance.length,
      "info.x-guidance is past its ~1000-token budget and risks truncation",
    ).toBeLessThan(4000);
    const contact = info["contact"] as Record<string, unknown>;
    expect(contact["email"]).toBe(STORE_CONTACT_EMAIL);
    const externalDocs = json["externalDocs"] as Record<string, unknown>;
    expect(externalDocs["url"]).toBe(`${BASE}/developers`);
  });

  it("gives every paid operation its terms, multi-chain, and a 402 to match", async () => {
    const { json } = await document();
    const paths = json["paths"] as Record<string, Record<string, unknown>>;
    const problems: string[] = [];
    let paid = 0;

    for (const [path, item] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (typeof operation !== "object" || operation === null) continue;
        const op = operation as Record<string, unknown>;
        if (!op["x-payment"]) continue;
        paid += 1;
        const where = `${method} ${path}`;

        const info = op["x-payment-info"] as Record<string, unknown> | undefined;
        if (!info) {
          problems.push(`${where}: no x-payment-info`);
          continue;
        }
        if (info["protocol"] !== "x402") problems.push(`${where}: not x402`);
        if (info["x402Version"] !== 2) problems.push(`${where}: not x402 v2`);

        /*
         * MULTI-CHAIN, CHECKED AS A FACT ABOUT THE OFFER rather than
         * as a count. Every accept has to name a chain, an atomic
         * amount, the USDC contract on that chain and the address
         * that chain settles to — an accepts array missing any of
         * those is a rail an agent cannot actually pay on, however
         * many entries it has.
         */
        const accepts = info["accepts"] as Array<Record<string, unknown>>;
        if (!Array.isArray(accepts) || accepts.length === 0) {
          problems.push(`${where}: no accepts[]`);
          continue;
        }
        for (const accept of accepts) {
          for (const field of ["scheme", "network", "amount", "asset", "payTo"]) {
            if (!accept[field]) problems.push(`${where}: accept missing ${field}`);
          }
          if (!/^(eip155:\d+|solana:.+)$/.test(String(accept["network"]))) {
            problems.push(`${where}: ${String(accept["network"])} is not a CAIP-2 chain`);
          }
          /*
           * Atomic units, as a decimal string. USDC has six decimals
           * and a client that sends 0.001 where 1000 was asked for
           * pays a thousandth of the price and is refused — the
           * single most common first-payment failure there is.
           */
          if (!/^\d+$/.test(String(accept["amount"]))) {
            problems.push(`${where}: amount ${String(accept["amount"])} is not atomic`);
          }
        }
        if (!accepts.some((accept) => String(accept["network"]).startsWith("eip155:"))) {
          problems.push(`${where}: no EVM rail`);
        }

        const responses = op["responses"] as Record<string, Record<string, unknown>>;
        const challenge = responses?.["402"];
        if (!challenge) {
          problems.push(`${where}: paid, and declares no 402`);
          continue;
        }
        const headers = (challenge["headers"] ?? {}) as Record<string, unknown>;
        if (!headers["PAYMENT-REQUIRED"]) {
          problems.push(`${where}: 402 does not name the PAYMENT-REQUIRED header`);
        }
        const schema = (
          (challenge["content"] ?? {}) as Record<string, { schema?: Record<string, unknown> }>
        )["application/json"]?.schema;
        if (!schema?.["$ref"]) {
          problems.push(`${where}: 402 body has no schema`);
        }
      }
    }

    expect(paid).toBeGreaterThan(20);
    expect(problems.sort().join("\n")).toBe("");
  });

  it("declares described inputs on every buy, from the schema the door enforces", async () => {
    const { json } = await document();
    const paths = json["paths"] as Record<string, Record<string, unknown>>;
    const problems: string[] = [];

    for (const [path, item] of Object.entries(paths)) {
      if (!path.startsWith("/api/buy/")) continue;
      const op = item["get"] as Record<string, unknown>;
      const requestSchema = op["x-request-schema"] as
        | Record<string, unknown>
        | undefined;
      if (!requestSchema) {
        problems.push(`${path}: no x-request-schema`);
        continue;
      }
      const properties = requestSchema["properties"] as Record<
        string,
        Record<string, unknown>
      >;
      if (!properties || Object.keys(properties).length === 0) {
        problems.push(`${path}: request schema names no fields`);
        continue;
      }
      /*
       * A FIELD WITHOUT A DESCRIPTION is the failure this catches. A
       * named, typed parameter tells an agent that a string goes
       * there; it does not tell it what to put in the string, which
       * is the only thing it actually needed to know before spending
       * money to find out.
       */
      for (const [name, property] of Object.entries(properties)) {
        if (!property["description"]) {
          problems.push(`${path}: ${name} has no description`);
        }
      }
      const info = op["x-payment-info"] as Record<string, unknown>;
      const input = info["input"] as Record<string, unknown> | undefined;
      if (!input?.["schema"]) problems.push(`${path}: x-payment-info names no input`);
    }

    expect(problems.sort().join("\n")).toBe("");
  });
});
