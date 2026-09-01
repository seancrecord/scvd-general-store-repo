import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CENSUS_FINDING, CENSUS_NUMBER } from "@/store/copy/census";
import { OPERATED_BY, VALUE_PROPOSITION } from "@/store/copy/position";
import { CAPABILITY_QUERY } from "@/store/spec";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };

/**
 * INFRASTRUCTURE FIRST, WHIMSY SECOND (2026-08-10).
 *
 * Five outside models were asked "what is scvd.store." The two that
 * read our own pages got the positioning roughly right; the three
 * that leaned on third-party directories filed us as a novelty shop;
 * and NONE of the five found the conformance desk or the corpus,
 * because both lived behind an API path and a JSON file with no
 * crawlable landing. The personality is real and stays — it is the
 * store's soul — but it was the FIRST thing a reader learned, so it
 * was the answer a reader carried away.
 *
 * These tests hold the reorder: the trust-layer opening (with the
 * operating entity) leads every first-pass surface, the two
 * differentiators have rooms a crawler can read, and every paid
 * endpoint states the job it does before the charm.
 */

async function text(path: string, html = false): Promise<string> {
  const response = await SELF.fetch(
    `${BASE}${path}`,
    html ? { headers: HTML } : undefined,
  );
  expect(response.status, `${path} did not answer 200`).toBe(200);
  return response.text();
}

describe("llms.txt leads with the infrastructure", () => {
  it("states the position, the entity and both differentiators before the whimsy", async () => {
    const guide = await text("/llms.txt");
    const position = guide.indexOf("evidence observatory");
    const whimsy = guide.indexOf("Well well. Come in then.");
    expect(position, "the position is missing entirely").toBeGreaterThan(-1);
    expect(whimsy, "the keeper's greeting is gone — it must stay").toBeGreaterThan(-1);
    expect(
      position,
      "the whimsy still goes first; the infrastructure must lead",
    ).toBeLessThan(whimsy);
    expect(guide).toContain(OPERATED_BY);
    expect(guide).toContain("conformance desk");
    expect(guide).toContain("Bitcoin-anchored corpus");
  });

  it("names the two landing rooms and the npm packages", async () => {
    // The complete prose, not the index: the packages are named in the
    // standards section, which files under /developers/llms.txt since
    // the 2026-08-27 split.
    const guide = await text("/llms-full.txt");
    expect(guide).toContain(`${BASE}/conformance`);
    expect(guide).toContain(`${BASE}/corpus`);
    expect(guide).toContain("x402-verify");
    expect(guide).toContain("x402-sign");
  });
});

describe("the homepage says what the store IS before what it sells", () => {
  it("puts the what-this-is section ahead of the shelves, entity included", async () => {
    const page = await text("/", true);
    const what = page.indexOf("WHAT THIS PLACE IS");
    const shelves = page.indexOf("ON THE SHELVES");
    expect(what, "no what-this-is section on the storefront").toBeGreaterThan(-1);
    expect(shelves).toBeGreaterThan(-1);
    expect(what, "the catalog still goes first").toBeLessThan(shelves);
    /*
     * 2026-08-26, keeper's ruling: "the trust layer of the x402
     * economy" is retired as the LEAD. It may persist as flavor in a
     * few places, but a test REQUIRING it would hold the retired line
     * in place — the offers lesson, where the guard argued for the
     * violation. The homepage asserts the canonical identity instead.
     */
    expect(page).toContain("evidence observatory for agentic commerce");
    expect(page).toContain(OPERATED_BY);
    expect(page).toContain('href="/conformance"');
    expect(page).toContain('href="/corpus"');
  });

  it("carries the entity in the footer and in the Organization JSON-LD", async () => {
    const page = await text("/", true);
    const footer = page.slice(page.indexOf('class="porch-print"'));
    expect(footer, "the footer does not name the LLC").toContain(OPERATED_BY);
    expect(page).toContain(`"legalName":"${OPERATED_BY}"`);
  });
});

describe("the conformance desk has a crawlable landing", () => {
  it("answers as HTML with the pitch, the census, and the packages", async () => {
    const page = await text("/conformance", true);
    expect(page).toContain("POST any issuer");
    expect(page).toContain("No account");
    expect(page).toContain(CENSUS_NUMBER);
    expect(page).toContain("/api/conformance/v1");
    expect(page).toContain("x402-verify");
    expect(page).toContain("x402-sign");
    // A landing that praises the desk without the desk's own caveat
    // would be marketing wearing an instrument's name.
    expect(page.toLowerCase()).toContain("we compete with");
  });

  it("answers as JSON with the pinned endpoint for machines", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/conformance`)).json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;
    expect(body.endpoint).toBe(`${BASE}/api/conformance/v1`);
    expect(String(body.census)).toContain(CENSUS_NUMBER);
  });
});

describe("the corpus has a crawlable landing", () => {
  it("answers as HTML with the census finding front and center", async () => {
    const page = await text("/corpus", true);
    expect(page).toContain("Bitcoin-anchored");
    expect(page).toContain("Hash-chained");
    const census = page.indexOf(CENSUS_NUMBER);
    expect(census, "the census finding is missing").toBeGreaterThan(-1);
    expect(
      census,
      "the census finding is buried below the reading instructions",
    ).toBeLessThan(page.indexOf("Reading it"));
    expect(page).toContain("/corpus.json");
    // Free to read, and never a score on an operator.
    expect(page.toLowerCase()).toContain("free to read");
    expect(page.toLowerCase()).toContain("not a rating");
  });

  it("answers as JSON pointing at the data, which lives only in corpus.json", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/corpus`)).json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;
    expect(body.data).toBe(`${BASE}/corpus.json`);
  });

  it("agrees with the signer package README on the census figure", async () => {
    // The figure was born in the x402-sign README; the landing pages
    // print the shared constant. If the README's number ever moves,
    // this fails until the constant moves with it.
    const readme = (await import("../signer/README.md?raw")).default;
    expect(readme).toContain(CENSUS_NUMBER);
    expect(CENSUS_FINDING).toContain(CENSUS_NUMBER);
  });
});

describe("paid endpoints state the job before the charm", () => {
  const TASKED = [
    "small_blessing",
    "settlement_attestation",
    "standing_watch",
    "context_anchor",
  ] as const;

  it("leads every tasked x402.json resource description with its task", async () => {
    const doc = (await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json()) as { resources: Array<Record<string, unknown>> };
    for (const id of TASKED) {
      const resource = doc.resources.find((entry) =>
        String(entry["resourceUrl"]).endsWith(`/api/buy/${id}`),
      );
      expect(resource, `${id} is not in the discovery document`).toBeTruthy();
      expect(
        String(resource?.["description"]).startsWith(
          `Task: ${CAPABILITY_QUERY[id]}.`,
        ),
        `${id}'s description does not lead with its task`,
      ).toBe(true);
    }
  });

  it("carries the task on menu.json items too", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: Array<Record<string, unknown>>;
    };
    for (const id of TASKED) {
      const item = menu.items.find((entry) => entry["id"] === id);
      expect(item, `${id} is not on the menu`).toBeTruthy();
      expect(item?.["task"]).toBe(CAPABILITY_QUERY[id]);
    }
  });
});

describe("the contract and the handshakes carry the new opening", () => {
  it("openapi.json describes the infrastructure and documents the free instruments", async () => {
    const spec = (await (await SELF.fetch(`${BASE}/openapi.json`)).json()) as {
      info: { description: string };
      paths: Record<string, unknown>;
    };
    expect(spec.info.description).toContain(OPERATED_BY);
    expect(spec.info.description).toContain("conformance desk");
    for (const path of [
      "/api/conformance/v1",
      "/api/preflight/v1",
      "/corpus.json",
    ]) {
      expect(spec.paths, `${path} is missing from the contract`).toHaveProperty(
        path,
      );
    }
  });

  it("the MCP handshake names the entity and both differentiators", async () => {
    const reply = await SELF.fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      }),
    });
    const body = (await reply.json()) as {
      result: { instructions: string };
    };
    expect(body.result.instructions).toContain(OPERATED_BY);
    expect(body.result.instructions).toContain("conformance desk");
    expect(body.result.instructions).toContain("/corpus.json");
  });

  it("agents.md leads with the opening and no longer claims settle-then-deliver", async () => {
    const manual = await text("/agents.md");
    expect(manual).toContain(OPERATED_BY);
    expect(manual.toLowerCase()).not.toContain("settles on-chain first");
    expect(manual.toLowerCase()).toContain("delivers first and settles after");
    expect(manual).toContain(`${BASE}/conformance`);
    expect(manual).toContain(`${BASE}/corpus`);
    expect(manual).toContain("x402-sign");
  });

  it("robots.txt points a crawler at the maps and both landings", async () => {
    const robots = await text("/robots.txt");
    expect(robots).toContain(`${BASE}/agents.md`);
    expect(robots).toContain(`${BASE}/conformance`);
    expect(robots).toContain(`${BASE}/corpus`);
  });
});

/**
 * THE STRAGGLERS (2026-08-10, evening pass). The morning pass fixed
 * the surfaces the store serves; these are the ones it publishes
 * sideways — the skill file directories ingest, the meta tags search
 * snippets quote, and the repo README GitHub and the MCP crawlers
 * read. The skill description's OPENING is not touched: the keeper's
 * 2026-08-02 ruling (test/skill-parity.spec.ts) leads it with the
 * practice counter on purpose, so the entity rides the metadata block
 * instead, where a directory parser looks for exactly this.
 */
describe("the sideways surfaces carry the position too", () => {
  it("skill.md names the operator in metadata and links both landing rooms", async () => {
    const skill = await text("/skill.md");
    expect(skill).toContain(`operator: ${OPERATED_BY}`);
    expect(skill).toContain(`${BASE}/conformance`);
    // A bare /corpus link, not just corpus.json or the host view.
    expect(skill).toMatch(/scvd\.store\/corpus(?![\w./])/);
  });

  it("the homepage meta and og descriptions name the differentiators", async () => {
    const page = await text("/", true);
    const meta =
      page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    expect(meta, "no meta description on the storefront").toBeTruthy();
    expect(meta).toContain("conformance");
    expect(meta).toContain("Bitcoin-anchored");
    expect(meta).toContain("Solana");
    const og =
      page.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ??
      "";
    /*
     * 2026-09-01 (roadmap N2): the social card is one of the six first
     * screens, so it carries the keeper's sixty words verbatim rather
     * than a third short form. The differentiators it used to name by
     * keyword are inside those words ("check the signed offer or
     * receipt"; "a dated corpus"). test/first-screen.spec.ts holds the
     * same line on every other surface.
     */
    expect(og).toBe(VALUE_PROPOSITION);
  });

  it("the repo README walks a reader to both landings and states the jobs", async () => {
    const readme = (await import("../README.md?raw")).default;
    expect(readme).toContain("scvd.store/conformance");
    expect(readme).toMatch(/scvd\.store\/corpus(?![\w./])/);
    for (const job of [
      "endpoint monitoring",
      "agent memory",
      "test payment",
      "x402-verify",
      "x402-sign",
    ]) {
      expect(readme.toLowerCase(), `README never says "${job}"`).toContain(
        job,
      );
    }
  });

  it("the README carries the Smithery backlink its verification scan looks for", async () => {
    /*
     * Smithery's ownership check scans the README for a link to the
     * SERVER PAGE. That is the requirement, and it is what this
     * asserts.
     *
     * THE BADGE WAS ALSO PINNED HERE UNTIL 2026-09-01, and dropping
     * that assertion is a deliberate narrowing rather than a
     * loosening. Smithery was acquired and its badge endpoint now
     * serves a broken image, so the badge was removed from the top of
     * the README on the keeper's call — a broken image is a worse
     * advertisement than none. The backlink itself did not go
     * anywhere: it lives in the directories section, in prose, where
     * the same scan reads it.
     *
     * The risk this leaves, stated rather than buried: nobody here
     * has read Smithery's scanner. If it turns out to key on the
     * badge URL specifically rather than on any link to the server
     * page, the next verification scan fails and this test will not
     * have caught it. Restoring the badge line is the one-line
     * revert. What is NOT acceptable is dropping the assertion
     * below — the backlink is the claim, and a claim ships with the
     * check that fails when it stops being true.
     */
    const readme = (await import("../README.md?raw")).default;
    expect(readme).toContain(
      "https://smithery.ai/servers/seancrecord/scvd-general-store",
    );
  });

  it("the README shows the real MCP connection, so extractors stop guessing", async () => {
    // mcp.so's auto-extracted config (seen 2026-08-10) showed a
    // wrangler KV-setup command as the server command — it had grabbed
    // the first plausible code block. Give every extractor the real
    // door in the one shape they all parse.
    const readme = (await import("../README.md?raw")).default;
    expect(readme).toContain('"mcpServers"');
    expect(readme).toContain('"url": "https://scvd.store/mcp"');
  });

  it("the social card leads with the trust layer, and the alt tells the truth", async () => {
    // The og card is the one surface that renders when anyone shares
    // the store anywhere. Until 2026-08-10 its pixels said "a general
    // store for ai agents" and nothing else — the pre-reversal
    // identity, baked into an image no text sweep could see. The
    // tagline and the alt text are asserted against the same phrase
    // so the picture and its description cannot drift apart.
    const script = (
      await import("../scripts/generate-og-image.mjs?raw")
    ).default;
    // Re-inked 2026-09-01 with the noun the keeper settled at /becoming.
    expect(script).toContain('drawText("an evidence observatory for agentic commerce"');
    expect(script, "the store line must stay on the card, second").toContain(
      'drawText("a general store for ai agents"',
    );
    const page = await text("/", true);
    const alt =
      page.match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1] ?? "";
    expect(alt).toContain("evidence observatory for agentic commerce");
  });

  it("the README no longer claims settle-then-deliver", async () => {
    // The flow flipped 2026-08-10; llms.txt and agents.md were
    // corrected the same day and the README kept the old claim.
    const readme = (await import("../README.md?raw")).default;
    expect(readme.toLowerCase()).not.toContain("settle first");
    expect(readme.toLowerCase()).toContain("settle after");
  });
});

/**
 * THE PUBLISH MANIFESTS (2026-08-11). Three static files exist only to
 * be read by other people's machinery: glama.json (Glama's claim
 * flow), server.json (the official MCP registry, whose live entry
 * still carried the pre-reversal description when checked on
 * 2026-08-11), and tab/server.json (The Tab's own registry entry,
 * validated against the npm package's mcpName). None is served by the
 * Worker, so no route test can catch them drifting — these hold them
 * to the sources they must agree with.
 */
describe("the publish manifests agree with what they publish", () => {
  it("glama.json names the keeper as maintainer", async () => {
    const glama = JSON.parse((await import("../glama.json?raw")).default) as {
      maintainers: string[];
    };
    expect(glama.maintainers).toContain("seancrecord");
  });

  it("server.json carries the position within the registry's 100-char cap", async () => {
    const manifest = JSON.parse(
      (await import("../server.json?raw")).default,
    ) as {
      name: string;
      description: string;
      remotes: Array<{ url: string }>;
    };
    expect(manifest.name).toBe("store.scvd/general-store");
    expect(manifest.description.toLowerCase()).toContain(
      "evidence observatory",
    );
    expect(manifest.description.length).toBeLessThanOrEqual(100);
    expect(manifest.remotes[0]?.url).toBe("https://scvd.store/mcp");
  });

  it("the Tab's manifest and its npm package cannot disagree", async () => {
    const manifest = JSON.parse(
      (await import("../tab/server.json?raw")).default,
    ) as {
      name: string;
      version: string;
      description: string;
      packages: Array<{ identifier: string; version: string }>;
    };
    const pkg = JSON.parse(
      (await import("../tab/package.json?raw")).default,
    ) as { name: string; version: string; mcpName?: string };
    expect(manifest.name, "registry name must match npm mcpName").toBe(
      pkg.mcpName,
    );
    expect(manifest.packages[0]?.identifier).toBe(pkg.name);
    expect(manifest.packages[0]?.version).toBe(pkg.version);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.description.length).toBeLessThanOrEqual(100);
  });
});
