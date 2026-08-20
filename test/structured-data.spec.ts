import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import { VERDICT_VOCABULARY } from "@/store/copy/criteria";
import { jsonLdBody, jsonLdScript } from "@/lib/jsonld";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * THE PAGES THAT WERE ARGUED BUT NEVER TYPED.
 *
 * /corpus caught this on 2026-08-18 — a dataset that lived only as a
 * JSON endpoint was invisible to everything that classifies pages —
 * and the fix stopped at one page. The 2026-08-20 sweep found the
 * same hole one room over on the four surfaces that carry the store's
 * most citable material: the weekly registry census (measurements
 * nobody else publishes), the verdict vocabulary, the signing spec,
 * and the free desk. All four had an HTML page, a sitemap line, a
 * meta description — and no typed entity at all, so an answer engine
 * reading them got prose it could summarise and nothing it could
 * lift.
 *
 * These tests pin the type, not the wording. The prose above each
 * node is the keeper's to edit; what may not silently vanish is the
 * declaration that the page IS a dataset, a vocabulary, a spec, an
 * API.
 */

async function jsonLdNodes(path: string): Promise<Record<string, unknown>[]> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: HTML });
  expect(response.status).toBe(200);
  const html = await response.text();
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  return blocks.map(
    (match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>,
  );
}

function nodeOfType(
  nodes: Record<string, unknown>[],
  type: string,
): Record<string, unknown> {
  const found = nodes.find((node) => node["@type"] === type);
  expect(found, `no ${type} node on the page`).toBeDefined();
  return found as Record<string, unknown>;
}

describe("the escape every node inherits", () => {
  it("cannot be ended early by a value that contains a tag", () => {
    const body = jsonLdBody({ name: "</script><img src=x>" });
    expect(body).not.toContain("</script>");
    expect(JSON.parse(body).name).toBe("</script><img src=x>");
  });

  it("wraps the escaped body in an inert block", () => {
    const block = jsonLdScript({ "@type": "Thing" });
    expect(block.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(block.endsWith("</script>")).toBe(true);
  });
});

describe("/registry publishes its census as a Dataset", () => {
  it("declares the type, the licence and a free reading", async () => {
    const dataset = nodeOfType(await jsonLdNodes("/registry"), "Dataset");
    expect(dataset.url).toBe(`${BASE}/registry`);
    expect(dataset.description).toBeTruthy();
    expect(dataset.license).toContain("creativecommons.org");
    expect(dataset.isAccessibleForFree).toBe(true);
  });

  it("names the measurements rather than describing them", async () => {
    const dataset = nodeOfType(await jsonLdNodes("/registry"), "Dataset");
    const measured = dataset.variableMeasured;
    if (!Array.isArray(measured)) {
      // No week published in this fixture: the node is still valid,
      // and claiming measurements it does not have would be the bug.
      expect(measured).toBeUndefined();
      return;
    }
    for (const entry of measured as Record<string, unknown>[]) {
      expect(entry["@type"]).toBe("PropertyValue");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.value).toBe("number");
    }
  });
});

describe("/criteria publishes its vocabulary as defined terms", () => {
  it("defines every verdict the checks can return", async () => {
    const set = nodeOfType(await jsonLdNodes("/criteria"), "DefinedTermSet");
    const terms = set.hasDefinedTerm as Record<string, unknown>[];
    const names = terms.map((term) => term.name);
    for (const entry of VERDICT_VOCABULARY) {
      expect(names).toContain(entry.verdict);
    }
  });

  it("carries the does-not-prove column into the machine copy", async () => {
    const set = nodeOfType(await jsonLdNodes("/criteria"), "DefinedTermSet");
    const terms = set.hasDefinedTerm as Record<string, unknown>[];
    for (const artifact of ARTIFACT_CLASSES) {
      const term = terms.find((entry) => entry.name === artifact.name);
      expect(term, `${artifact.name} is not a defined term`).toBeDefined();
      expect(String(term?.description)).toContain(artifact.does_not_prove);
    }
  });
});

describe("/attestation publishes the signing spec as an article", () => {
  it("names the key algorithm and where the public key lives", async () => {
    const article = nodeOfType(
      await jsonLdNodes("/attestation"),
      "TechArticle",
    );
    const mentions = article.mentions as Record<string, unknown>[];
    const byName = new Map(mentions.map((entry) => [entry.name, entry.value]));
    expect(byName.get("signing key algorithm")).toBe("ed25519");
    expect(String(byName.get("public key"))).toContain(BASE);
  });

  it("states the absence of a successor key rather than leaving it inferred", async () => {
    const article = nodeOfType(
      await jsonLdNodes("/attestation"),
      "TechArticle",
    );
    const mentions = article.mentions as Record<string, unknown>[];
    const successor = mentions.find(
      (entry) => entry.name === "successor key exists",
    );
    expect(successor?.value).toBe(false);
  });
});

describe("/conformance publishes the desk as a free API", () => {
  it("declares a POST entry point at the versioned contract", async () => {
    const api = nodeOfType(await jsonLdNodes("/conformance"), "WebAPI");
    const action = api.potentialAction as Record<string, unknown>;
    const target = action.target as Record<string, unknown>;
    expect(target.httpMethod).toBe("POST");
    expect(String(target.urlTemplate)).toContain("/api/conformance/v");
  });

  it("prices the desk at zero as a fact, not as an adjective", async () => {
    const api = nodeOfType(await jsonLdNodes("/conformance"), "WebAPI");
    const offer = api.offers as Record<string, unknown>;
    expect(offer.price).toBe("0");
    expect(offer.priceCurrency).toBe("USD");
    expect(api.isAccessibleForFree).toBe(true);
  });
});

describe("the money-out rooms are rooms, not just endpoints", () => {
  it("/bounties publishes the claim procedure as steps", async () => {
    const howTo = nodeOfType(await jsonLdNodes("/bounties"), "HowTo");
    const steps = howTo.step as Record<string, unknown>[];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (const step of steps) {
      expect(step["@type"]).toBe("HowToStep");
      expect(String(step.text).length).toBeGreaterThan(20);
    }
    expect(String(howTo.url)).toBe(`${BASE}/bounties`);
  });

  it("/credit publishes the rate, floor, cap and expiry as facts", async () => {
    const service = nodeOfType(await jsonLdNodes("/credit"), "Service");
    const props = service.additionalProperty as Record<string, unknown>[];
    const names = props.map((entry) => String(entry.name));
    expect(names.some((name) => name.includes("rebate rate"))).toBe(true);
    expect(names.some((name) => name.includes("minimum balance"))).toBe(true);
    expect(names.some((name) => name.includes("maximum balance"))).toBe(true);
    expect(names.some((name) => name.includes("expires"))).toBe(true);
    for (const entry of props) expect(typeof entry.value).toBe("number");
  });

  it("/credit refuses to call a rebate a membership or a token", async () => {
    // The flattering markup would be MemberProgram, and it would be a
    // lie: no tier, no signup, nothing to join. The page says what it
    // is not, and the machine copy has to agree with the page.
    const nodes = await jsonLdNodes("/credit");
    expect(nodes.map((node) => node["@type"])).not.toContain("MemberProgram");
    const service = nodeOfType(nodes, "Service");
    expect(String(service.description)).toContain("never a token");
  });

  it("both rooms still answer JSON to a machine that asks for it", async () => {
    for (const path of ["/bounties", "/credit"]) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toBeTruthy();
    }
  });
});
