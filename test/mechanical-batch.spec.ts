import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EXTERNAL_RECORDS } from "@/store/trust-signals";
import { STANDARDS_POSTURE } from "@/store/standards";
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
} from "@/lib/idempotency";
import { isUrlTemplatePlaceholder } from "@/lib/url-template";
import { WBA_KEY_IN_SERVICE_FROM } from "@/lib/web-bot-auth";
import { agentsMd } from "@/routes/agents-md";
import { MENU_ITEMS } from "@/store";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * SIX SMALL FINDINGS FROM ONE OUTSIDE PASS, and the reason they are
 * in one file is that they share a shape rather than a subsystem:
 * every one is the store knowing something and failing to say it in
 * the place a machine looks. The repository URL was on six surfaces
 * and not in sameAs. Idempotency-Key was honoured on every paid door
 * and absent from the contract a client is generated from. The
 * markdown root existed and answered only to a header. A verification
 * endpoint answered "no such artifact" to its own documentation URL.
 * A published key had no lifetime. Item pages had no structured data.
 *
 * None of them is a bug in what the store DOES. All of them are the
 * gap between doing it and declaring it, which is the gap this whole
 * file is a guard on.
 */

/**
 * FOLLOW A `$ref` BACK TO WHAT IT NAMES.
 *
 * The contract moved its repeated pieces into `components` on
 * 2026-08-31 — it had reached 1.48 MB, past the 1 MB cap the
 * agent-side scanners fetch under, which made a correct contract an
 * unread one. The Idempotency-Key parameter is one of the pieces:
 * twenty-seven identical copies became one definition and
 * twenty-seven references.
 *
 * Resolving rather than relaxing matters here. A test that accepted
 * "there is a $ref where the parameter used to be" would pass on a
 * reference to a component that does not exist, and the header that
 * stops a retry becoming a second charge is not a thing to assert
 * loosely.
 */
function deref(
  document: Record<string, unknown>,
  node: Record<string, unknown>,
): Record<string, unknown> {
  const ref = node["$ref"];
  if (typeof ref !== "string") return node;
  let current: unknown = document;
  for (const segment of ref.replace(/^#\//, "").split("/")) {
    expect(
      current && typeof current === "object" && segment in current,
      `${ref} points at nothing: ${segment} is missing`,
    ).toBe(true);
    current = (current as Record<string, unknown>)[segment];
  }
  return current as Record<string, unknown>;
}

describe("1. the source is in sameAs", () => {
  it("lists the repository, derived from where the store already publishes it", () => {
    const repository = STANDARDS_POSTURE.code_transparency.repository;
    const record = EXTERNAL_RECORDS.find((entry) => entry.url === repository);
    expect(record, "no repository entry in EXTERNAL_RECORDS").toBeTruthy();
    /*
     * DERIVED, not a second copy. If somebody retypes this URL rather
     * than reading it from code_transparency, the two can drift — and
     * a dead link in the one document claiming legitimacy is, in this
     * array's own words, worse than an empty list.
     */
    expect(record!.url).toBe(repository);
    expect(record!.what_it_proves.length).toBeGreaterThan(80);
  });

  it("reaches the storefront's sameAs, which is the field being scored", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain(STANDARDS_POSTURE.code_transparency.repository);
  });

  it("claims no Wikipedia or Wikidata entity, because none exists", () => {
    /*
     * The same scan that wanted GitHub wants these two, and inventing
     * either is the failure the array's docblock forbids in the
     * strongest terms: sameAs means a page that unambiguously
     * identifies THIS item, and a link to a page that does not exist
     * is the strongest possible argument against a trust document.
     */
    for (const record of EXTERNAL_RECORDS) {
      expect(record.url).not.toMatch(/wikipedia\.org|wikidata\.org/i);
    }
  });
});

describe("2. Idempotency-Key is in the contract", () => {
  async function spec(): Promise<Record<string, unknown>> {
    return (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as never;
  }

  it("declares the header on every paid operation and on no free one", async () => {
    const document = await spec();
    const paths = document["paths"] as Record<string, Record<string, unknown>>;

    let paid = 0;
    for (const [path, item] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (!isRecord(operation)) continue;
        const parameters = (
          Array.isArray(operation["parameters"])
            ? (operation["parameters"] as Array<Record<string, unknown>>)
            : []
        ).map((parameter) => deref(document, parameter));
        const declared = parameters.filter(
          (parameter) =>
            String(parameter["name"]).toLowerCase() === "idempotency-key",
        );

        if (operation["x-payment"]) {
          paid += 1;
          expect(declared.length, `${method} ${path}`).toBe(1);
          const parameter = declared[0]!;
          expect(parameter["in"]).toBe("header");
          // Optional, always: the header can never refuse a purchase,
          // and a spec that made it required would generate clients
          // that cannot buy without one.
          expect(parameter["required"]).toBe(false);
        } else {
          /*
           * A free door does not honour it, so declaring it there
           * would be advertising a protection that is not running —
           * which is worse than not mentioning it, because a caller
           * would stop looking for the real one.
           */
          expect(declared.length, `${method} ${path} is free`).toBe(0);
        }
      }
    }
    expect(paid, "no paid operations found at all").toBeGreaterThan(0);
  });

  it("states the bounds the gate actually enforces, not a second pair", async () => {
    /*
     * DERIVED FROM lib/idempotency.ts. A spec advertising a range the
     * code does not enforce would generate clients whose keys are
     * silently discarded — and a discarded key fails invisibly: the
     * purchase still completes, and still charges.
     */
    const document = await spec();
    const paths = document["paths"] as Record<string, Record<string, unknown>>;
    const parameters: Array<Record<string, unknown>> = [];
    for (const item of Object.values(paths)) {
      for (const operation of Object.values(item)) {
        if (!isRecord(operation) || !operation["x-payment"]) continue;
        for (const declared of (operation["parameters"] ?? []) as Array<
          Record<string, unknown>
        >) {
          const parameter = deref(document, declared);
          if (String(parameter["name"]).toLowerCase() === "idempotency-key") {
            parameters.push(parameter);
          }
        }
      }
    }
    expect(parameters.length).toBeGreaterThan(0);
    for (const parameter of parameters) {
      const schema = parameter["schema"] as Record<string, unknown>;
      expect(schema["minLength"]).toBe(IDEMPOTENCY_KEY_MIN_LENGTH);
      expect(schema["maxLength"]).toBe(IDEMPOTENCY_KEY_MAX_LENGTH);
    }
  });
});

describe("3. /index.md is the markdown root", () => {
  it("serves the same bytes as the negotiated apex", async () => {
    const direct = await SELF.fetch(`${BASE}/index.md`);
    expect(direct.status).toBe(200);
    expect(direct.headers.get("content-type")).toContain("text/markdown");

    const negotiated = await SELF.fetch(`${BASE}/`, {
      headers: { Accept: "text/markdown" },
    });
    expect(negotiated.status).toBe(200);

    // Byte-identical, because it is the same function and not a copy.
    const body = await direct.text();
    expect(body).toBe(await negotiated.text());
    expect(body).toBe(agentsMd(BASE));
  });

  it("points its canonical at the root rather than at itself", async () => {
    /*
     * One document, two addresses. Declaring this one canonical would
     * hand an indexer a duplicate to adjudicate between `/` and
     * `/index.md`, which is the problem the Link header exists to
     * prevent rather than create.
     */
    const link = (await SELF.fetch(`${BASE}/index.md`)).headers.get("Link");
    expect(link).toContain(`<${BASE}/>`);
    expect(link).toContain('rel="canonical"');
  });

  it("leaves the HTML apex alone", async () => {
    const response = await SELF.fetch(`${BASE}/`, {
      headers: { Accept: "text/html" },
    });
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});

describe("4. a templated URL answers with guidance, not a false negative", () => {
  it("knows a placeholder from an identifier", () => {
    for (const placeholder of ["{id}", "{cert_id}", "<id>", ":cert_id", "%7Bid%7D", "{host}.json"]) {
      expect(isUrlTemplatePlaceholder(placeholder), placeholder).toBe(true);
    }
    /*
     * The other direction is the one that matters: a real artifact id
     * swallowed by this check would be reported as a template instead
     * of verified, which is a worse defect than the one being fixed.
     */
    for (const real of [SAMPLE_ARTIFACT_ID, "cert_abc123", "handover_1", "", "id", "{unclosed"]) {
      expect(isUrlTemplatePlaceholder(real), real).toBe(false);
    }
  });

  it("answers /api/verify/{id} without ever saying valid: false", async () => {
    const response = await SELF.fetch(`${BASE}/api/verify/%7Bid%7D`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    /*
     * THE ASSERTION THIS TEST EXISTS FOR. The old answer was a 404
     * carrying `valid: false` — indistinguishable, to a crawler or a
     * careless agent, from "that artifact is fake". The new answer
     * expresses no verdict at all, in either direction.
     */
    expect("valid" in body).toBe(false);
    expect(body["template"]).toBe(true);
    expect(body["sample_cert_id"]).toBe(SAMPLE_ARTIFACT_ID);
  });

  it("still 404s a plausible id that simply is not here", async () => {
    const response = await SELF.fetch(`${BASE}/api/verify/cert_notarealone`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as Record<string, unknown>)["valid"]).toBe(
      false,
    );
  });

  it("emits no templated URL as a link in llms.txt", async () => {
    /*
     * The other half of the same finding. A link checker extracts
     * hrefs and fetches them; a markdown link whose target contains
     * braces resolves to nothing anywhere. Templates still appear in
     * llms.txt as PROSE, which is what they are — this only bans them
     * from the one position that gets fetched.
     */
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    const linkTargets = [...text.matchAll(/\]\(([^)]+)\)/g)].map(
      (match) => match[1]!,
    );
    expect(linkTargets.length).toBeGreaterThan(10);
    for (const target of linkTargets) {
      expect(target, `templated link: ${target}`).not.toMatch(/[{}<>]/);
    }
  });
});

describe("5. the Web Bot Auth key carries a lifetime", () => {
  it("publishes nbf and exp, with nbf fixed and exp ahead of the cache", async () => {
    const response = await SELF.fetch(
      `${BASE}/.well-known/http-message-signatures-directory`,
    );
    /*
     * 200, ASSERTED RATHER THAN TOLERATED. In production a 404 here is
     * the honest answer when no egress key is configured, and the
     * store deliberately answers that way rather than serving an
     * empty key set. This worker DOES configure one (vitest.config.ts),
     * so a 404 arriving here means the fixture went missing and every
     * assertion below would otherwise be skipped in silence — which
     * is the guard-that-cannot-fail shape rule 46 forbids.
     */
    expect(
      response.status,
      "the test env configures WBA_SIGNING_KEY; a 404 here is a missing fixture, not a passing store",
    ).toBe(200);
    const body = (await response.json()) as {
      keys: Array<Record<string, unknown>>;
    };
    expect(body.keys.length).toBeGreaterThan(0);

    const nowSeconds = Math.floor(Date.now() / 1000);
    for (const key of body.keys) {
      const nbf = key["nbf"] as number;
      const exp = key["exp"] as number;
      expect(typeof nbf).toBe("number");
      expect(typeof exp).toBe("number");

      // nbf is the day the signing module shipped: a floor a stranger
      // can check against the public commit, never a rolling "now".
      expect(nbf).toBe(
        Math.floor(Date.parse(`${WBA_KEY_IN_SERVICE_FROM}T00:00:00Z`) / 1000),
      );
      expect(nbf).toBeLessThan(nowSeconds);

      /*
       * The window must outlast the document's own Cache-Control, or
       * a cached copy expires while still being served — a key that
       * reads as dead to whoever fetched it yesterday.
       */
      const cacheSeconds = Number(
        /max-age=(\d+)/.exec(response.headers.get("Cache-Control") ?? "")?.[1] ??
          0,
      );
      expect(exp).toBeGreaterThan(nowSeconds + cacheSeconds);
    }
  });

  it("does not let the lifetime move the key's own name", async () => {
    /*
     * The RFC 7638 thumbprint is computed over crv, kty and x only.
     * If nbf or exp ever leaked into it, every signature this store
     * has made would stop matching its own directory entry — a
     * silent, total break. The kid is checked against a directory
     * fetched fresh, which is the only way to catch that.
     */
    const response = await SELF.fetch(
      `${BASE}/.well-known/http-message-signatures-directory`,
    );
    // Same reasoning as above: this must not skip itself quietly.
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      keys: Array<Record<string, unknown>>;
    };
    const signatureInput = response.headers.get("Signature-Input") ?? "";
    for (const key of body.keys) {
      expect(signatureInput).toContain(`keyid="${String(key["kid"])}"`);
    }
  });
});

describe("6. the item pages carry structured data, and never a rating", () => {
  async function itemPage(id: string): Promise<string> {
    return (
      await SELF.fetch(`${BASE}/menu/${id}`, {
        headers: { Accept: "text/html" },
      })
    ).text();
  }

  function jsonLd(html: string): Array<Record<string, unknown>> {
    return [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((match) => JSON.parse(match[1]!.replace(/\\u003c/g, "<")) as never);
  }

  it("describes each item as a Service with an honest offer", async () => {
    for (const item of MENU_ITEMS.slice(0, 6)) {
      const nodes = jsonLd(await itemPage(item.id));
      const service = nodes.find((node) => node["@type"] === "Service");
      expect(service, `${item.id} has no Service node`).toBeTruthy();
      expect(service!["name"]).toBe(item.name);
      expect(service!["url"]).toBe(`${BASE}/menu/${item.id}`);

      const offer = service!["offers"] as Record<string, unknown>;
      expect(offer["@type"]).toBe("Offer");
      // ISO code for the validator, the asset in words beside it
      // (JSONLD_PRICE_CURRENCY, 2026-09-02).
      expect(offer["priceCurrency"]).toBe("USD");
      expect(String(offer["acceptedPaymentMethod"])).toContain("USDC");

      if (item.pricing === "fixed") {
        expect(offer["price"]).toBe(String(item.price_usdc));
        expect(offer["priceSpecification"]).toBeUndefined();
      } else {
        /*
         * A pay-what-it-deserves minimum is a FLOOR. Publishing it as
         * a bare `price` would state a fixed charge the store does
         * not make.
         */
        expect(offer["price"]).toBeUndefined();
        const specification = offer["priceSpecification"] as Record<
          string,
          unknown
        >;
        expect(specification["minPrice"]).toBe(String(item.price_usdc));
      }
    }
  });

  it("never emits aggregateRating or review, anywhere on the site", async () => {
    /*
     * THE ONE THAT MATTERS MOST IN THIS FILE. This store has no
     * ratings — no stars, no count, nothing anybody submitted — and
     * the rich-result payoff for inventing them is large enough that
     * it is the obvious next thing somebody adds. /corrections exists
     * because claims like that get made by accident.
     *
     * Checked across the shelf and the two pages most likely to grow
     * one, from the served bytes rather than from the source.
     */
    const pages = await Promise.all([
      ...MENU_ITEMS.slice(0, 6).map((item) => itemPage(item.id)),
      (await SELF.fetch(`${BASE}/`, { headers: { Accept: "text/html" } })).text(),
      (await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })).text(),
    ]);
    for (const html of pages) {
      for (const node of jsonLd(html)) {
        const serialised = JSON.stringify(node);
        expect(serialised).not.toMatch(/aggregateRating/i);
        expect(serialised).not.toMatch(/"ratingValue"/i);
        expect(serialised).not.toMatch(/"reviewCount"/i);
      }
    }
  });

  it("keeps the FAQPage on /what, which is a real FAQ", async () => {
    const nodes = jsonLd(
      await (
        await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })
      ).text(),
    );
    const faq = nodes.find((node) => node["@type"] === "FAQPage");
    expect(faq).toBeTruthy();
    const questions = faq!["mainEntity"] as unknown[];
    expect(questions.length).toBeGreaterThan(3);
  });
});

describe("the keeper's own account is in sameAs", () => {
  it("rides beside the external records, from its own constant", async () => {
    /*
     * His word, 2026-08-28: "@keeper_scvd — is my twitter in the
     * schemas?" It was not. KEEPER_SOCIAL is deliberately NOT an
     * EXTERNAL_RECORDS entry — that array promises independent
     * records, and an owned account is not one — but sameAs is
     * exactly the field for it, and this derives from the constant
     * rather than retyping the handle.
     */
    const { KEEPER_SOCIAL } = await import("@/store/trust-signals");
    expect(KEEPER_SOCIAL.length).toBeGreaterThanOrEqual(1);
    const html = await (
      await SELF.fetch("https://scvd.store/", {
        headers: { "User-Agent": "browser/1" },
      })
    ).text();
    for (const url of KEEPER_SOCIAL) {
      expect(html, `sameAs missing ${url}`).toContain(url);
    }
  });
});
