import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { performServiceAudit } from "@/services/service-audit";
import { sampleOnceOver } from "@/services/sample-artifacts";
import {
  LLMS_PRICE_CONVENTION,
  NOT_READ,
  SURFACE_BODY_CAP,
  acceptsDifference,
  challengePriceOf,
  llmsPriceFor,
  openapiPriceFor,
  surfacesSectionOf,
  whyNoChallengePrice,
  type SurfaceReads,
} from "@/services/surface-reads";
import {
  DEFECT_VOCABULARY_VERSION,
  VOCABULARY_CHANGELOG,
  defectClass,
} from "@/store/defect-vocabulary";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * S8 TIER B (2026-09-02): the door's other surfaces, read on the paid
 * audit always, at the same price — the keeper's ruling. What this
 * file holds:
 *
 *   - the convention, read: a price beside a path in a code span,
 *     inside the span or in parentheses after it, and never prose;
 *   - the OpenAPI fields this store and its clients emit;
 *   - the four states, the counts with their denominators, and the
 *     bookend that turns a contradiction into "moving";
 *   - the paid audit carrying the section, signed, and the free
 *     preflight carrying nothing of the kind;
 *   - the specimen built through the same arithmetic;
 *   - our own guide, read by the reader it ships, naming the shelf's
 *     minimum for every paid door — the first door Tier B was pointed
 *     at, because the bundle drift it is built to catch was ours;
 *   - the vocabulary's v9 row, paid-detectable, pointing here.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x0000000000000000000000000000000000000001";
const DOOR = "https://merchant.example/api/buy/thing";
const PATH = "/api/buy/thing";

beforeAll(installFacilitatorMock);

function accept(amount = "50000", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { scheme: "exact", network: "eip155:8453", asset: USDC, payTo: PAY_TO, amount, ...overrides };
}

function challenge402(accepts: Record<string, unknown>[], extra: Record<string, unknown> = {}): Response {
  const challenge = { x402Version: 2, accepts, ...extra };
  return new Response(JSON.stringify({ error: "payment required" }), {
    status: 402,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
  });
}

/** A whole origin, switched on pathname — the stub matches by parsed host, never a substring. */
function originFetch(routes: Record<string, () => Response>, host = "merchant.example"): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    if (parsed.host !== host) throw new Error(`unexpected host ${parsed.host}`);
    const route = routes[parsed.pathname];
    return route ? route() : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

function reads(overrides: Partial<SurfaceReads> = {}): SurfaceReads {
  const accepts = [accept()];
  return {
    probed_url: DOOR,
    llms: { url: "https://merchant.example/llms.txt", status: 404, text: null },
    openapi: { url: "https://merchant.example/openapi.json", status: 404, text: null },
    resource: null,
    resource_url: null,
    bookend: { url: DOOR, status: 402, text: JSON.stringify(accepts) },
    ...overrides,
  };
}

describe("the convention, read", () => {
  it("reads a dollar amount in parentheses right after the code span", () => {
    const text = `# Shop\n\nBuy a thing: \`GET ${PATH}\` ($0.05, one thing, signed).\n`;
    expect(llmsPriceFor(text, PATH)?.price).toBe(0.05);
  });

  it("reads a dollar amount inside the code span", () => {
    const text = `- \`GET ${PATH} $0.05\`\n`;
    expect(llmsPriceFor(text, PATH)?.price).toBe(0.05);
  });

  it("never reads prose for a number", () => {
    const text = `The thing at ${PATH} costs $0.05 and is worth it.\n\`GET ${PATH}\` is the door.\n`;
    expect(llmsPriceFor(text, PATH)).toBeNull();
  });

  it("reads the first line that satisfies the convention and reports the line", () => {
    const text = `- \`GET ${PATH}\` ($0.05)\n- \`GET ${PATH}\` ($0.50)\n`;
    const found = llmsPriceFor(text, PATH);
    expect(found?.price).toBe(0.05);
    expect(found?.line).toContain("$0.05");
  });

  it("does not read a span for a different path", () => {
    const text = `- \`GET /api/buy/other\` ($9)\n`;
    expect(llmsPriceFor(text, PATH)).toBeNull();
  });

  it("reads the OpenAPI fields this store emits, smallest option first", () => {
    expect(openapiPriceFor({ paths: { [PATH]: { get: { "x-payment-info": { price_usdc: 0.05 } } } } }, PATH)).toBe(0.05);
    expect(openapiPriceFor({ paths: { [PATH]: { get: { "x-payment": { price_usdc_options: [0.5, 0.05, 5] } } } } }, PATH)).toBe(0.05);
    expect(openapiPriceFor({ paths: { [PATH]: { post: { "x-price": "$0.05" } } } }, PATH)).toBe(0.05);
    expect(openapiPriceFor({ paths: { [PATH]: { "x-price-usdc": 0.05 } } }, PATH)).toBe(0.05);
    expect(openapiPriceFor({ paths: { [PATH]: { get: { summary: "a thing" } } } }, PATH)).toBeNull();
    expect(openapiPriceFor({ paths: {} }, PATH)).toBeNull();
    expect(openapiPriceFor("not a document", PATH)).toBeNull();
  });

  it("prices the challenge from its first rail's minimum, in atomic units only", () => {
    const price = challengePriceOf([accept("50000"), accept("500000"), accept("1", { network: "eip155:137" })]);
    expect(price?.minimum_usdc).toBe(0.05);
    expect(price?.tiers_offered).toBe(2);
    expect(price?.rail).toContain("eip155:8453");
    expect(challengePriceOf([accept("0.05")])).toBeNull();
    expect(whyNoChallengePrice([accept("0.05")])).toContain("atomic");
    expect(challengePriceOf([accept("50000", { asset: "0xdeadbeef" })])).toBeNull();
    expect(whyNoChallengePrice([accept("50000", { asset: "0xdeadbeef" })])).toContain("USDC");
    expect(challengePriceOf([])).toBeNull();
    expect(whyNoChallengePrice(null)).toContain("no accepts");
  });

  it("names the convention on the artifact, with the shape a door can copy", () => {
    expect(LLMS_PRICE_CONVENTION).toContain("code span");
    expect(LLMS_PRICE_CONVENTION).toContain("never from prose");
    expect(LLMS_PRICE_CONVENTION).toMatch(/`GET \/api\/buy\/thing` \(\$0\.05\)/);
  });
});

describe("four states, counts with denominators, and the bookend", () => {
  it("absent: a 404 is a fact, not a defect, and counts in no denominator", () => {
    const section = surfacesSectionOf(reads(), [accept()], "2026-09-02T00:00:00.000Z");
    expect(section.rows.find((row) => row.surface === "llms.txt")?.state).toBe("absent");
    expect(section.rows.find((row) => row.surface === "openapi")?.state).toBe("absent");
    expect(section.rows.find((row) => row.surface === "resource_url")?.state).toBe("absent");
    expect(section.rows.find((row) => row.surface === "402_bookend")?.state).toBe("read");
    expect(section.named_a_price).toBe(0);
    expect(section.agree).toBe(0);
    expect(section.differ).toBe(0);
    expect(section.moving).toBe(false);
    expect(section.challenge_price?.minimum_usdc).toBe(0.05);
    expect(section.not_read).toEqual(NOT_READ);
    expect(section.not_read.join(" ")).toContain("mcp tools/list");
  });

  it("silent: a surface that exists and names no price is not a disagreement", () => {
    const section = surfacesSectionOf(
      reads({
        llms: { url: "https://merchant.example/llms.txt", status: 200, text: `A thing costs $9 in prose.\n` },
        openapi: {
          url: "https://merchant.example/openapi.json",
          status: 200,
          text: JSON.stringify({ paths: { [PATH]: { get: { summary: "thing" } } } }),
        },
      }),
      [accept()],
      "2026-09-02T00:00:00.000Z",
    );
    const llms = section.rows.find((row) => row.surface === "llms.txt")!;
    const openapi = section.rows.find((row) => row.surface === "openapi")!;
    expect(llms.state).toBe("silent");
    expect(llms.detail).toContain("prose is not read");
    expect(openapi.state).toBe("silent");
    expect(openapi.detail).toContain("describes /api/buy/thing but carries no");
    expect(section.named_a_price).toBe(0);
    expect(section.differ).toBe(0);
  });

  it("read: one agrees, one differs, and the counts carry the denominator", () => {
    const section = surfacesSectionOf(
      reads({
        llms: { url: "https://merchant.example/llms.txt", status: 200, text: `- \`GET ${PATH}\` ($0.05)\n` },
        openapi: {
          url: "https://merchant.example/openapi.json",
          status: 200,
          text: JSON.stringify({ paths: { [PATH]: { get: { "x-payment-info": { price_usdc: 0.5 } } } } }),
        },
      }),
      [accept()],
      "2026-09-02T00:00:00.000Z",
    );
    const llms = section.rows.find((row) => row.surface === "llms.txt")!;
    const openapi = section.rows.find((row) => row.surface === "openapi")!;
    expect(llms.state).toBe("read");
    expect(llms.price_usdc).toBe(0.05);
    expect(llms.agrees).toBe(true);
    expect(llms.detail).toContain("the line read:");
    expect(openapi.state).toBe("read");
    expect(openapi.price_usdc).toBe(0.5);
    expect(openapi.agrees).toBe(false);
    expect(openapi.detail).toContain("against the challenge's minimum of $0.05");
    expect(section.named_a_price).toBe(2);
    expect(section.agree).toBe(1);
    expect(section.differ).toBe(1);
  });

  it("unreadable: our read failing is ours to report, never the door's", () => {
    const section = surfacesSectionOf(
      reads({
        llms: { url: "https://merchant.example/llms.txt", status: null, text: null, failure: "TimeoutError" },
        openapi: {
          url: "https://merchant.example/openapi.json",
          status: 200,
          text: null,
          failure: `the body exceeded ${SURFACE_BODY_CAP} bytes and was not read`,
        },
      }),
      [accept()],
      "2026-09-02T00:00:00.000Z",
    );
    expect(section.rows.find((row) => row.surface === "llms.txt")?.state).toBe("unreadable");
    const openapi = section.rows.find((row) => row.surface === "openapi")!;
    expect(openapi.state).toBe("unreadable");
    expect(openapi.detail).toContain("exceeded");
    expect(section.named_a_price).toBe(0);
    expect(section.differ).toBe(0);
  });

  it("the resource URL's own 402 is compared rail by rail", () => {
    const same = surfacesSectionOf(
      reads({
        resource_url: "https://merchant.example/api/thing",
        resource: { url: "https://merchant.example/api/thing", status: 402, text: JSON.stringify([accept()]) },
      }),
      [accept()],
      "2026-09-02T00:00:00.000Z",
    );
    const agreeing = same.rows.find((row) => row.surface === "resource_url")!;
    expect(agreeing.state).toBe("read");
    expect(agreeing.agrees).toBe(true);
    expect(agreeing.price_usdc).toBe(0.05);

    const other = surfacesSectionOf(
      reads({
        resource_url: "https://merchant.example/api/thing",
        resource: { url: "https://merchant.example/api/thing", status: 402, text: JSON.stringify([accept("70000")]) },
      }),
      [accept()],
      "2026-09-02T00:00:00.000Z",
    );
    const differing = other.rows.find((row) => row.surface === "resource_url")!;
    expect(differing.agrees).toBe(false);
    expect(differing.detail).toContain("differs from the probed door's");
    expect(other.differ).toBe(1);
    expect(other.named_a_price).toBe(1);
  });

  it("acceptsDifference names the rail and the field, and is empty when they agree", () => {
    expect(acceptsDifference([accept()], [accept()])).toEqual([]);
    expect(acceptsDifference([accept()], [accept("70000")]).join(" ")).toContain("payTo or amount differ");
    expect(acceptsDifference([accept()], [accept(), accept("1", { network: "eip155:137" })]).join(" ")).toContain(
      "second read only",
    );
    expect(acceptsDifference([accept(), accept("1", { network: "eip155:137" })], [accept()]).join(" ")).toContain(
      "first read only",
    );
  });

  it("moving: when the bookend 402 differs from the first, nothing counts against the door", () => {
    const section = surfacesSectionOf(
      reads({
        llms: { url: "https://merchant.example/llms.txt", status: 200, text: `- \`GET ${PATH}\` ($0.50)\n` },
        bookend: { url: DOOR, status: 402, text: JSON.stringify([accept("500000")]) },
      }),
      [accept()],
      "2026-09-02T00:00:00.000Z",
    );
    expect(section.moving).toBe(true);
    const llms = section.rows.find((row) => row.surface === "llms.txt")!;
    // The row still says what it read — the fact survives — but the
    // summary charges nothing: agree and differ both zero, denominator kept.
    expect(llms.state).toBe("read");
    expect(llms.agrees).toBe(false);
    expect(section.named_a_price).toBe(1);
    expect(section.agree).toBe(0);
    expect(section.differ).toBe(0);
    expect(section.rows.find((row) => row.surface === "402_bookend")?.detail).toContain("moving");
  });

  it("a challenge with no dollar price still reports what the surface named, with the reason", () => {
    const section = surfacesSectionOf(
      reads({
        llms: { url: "https://merchant.example/llms.txt", status: 200, text: `- \`GET ${PATH}\` ($0.05)\n` },
        bookend: { url: DOOR, status: 402, text: JSON.stringify([accept("0.05")]) },
      }),
      [accept("0.05")],
      "2026-09-02T00:00:00.000Z",
    );
    expect(section.challenge_price).toBeNull();
    expect(section.no_challenge_price).toContain("atomic");
    const llms = section.rows.find((row) => row.surface === "llms.txt")!;
    expect(llms.state).toBe("read");
    expect(llms.price_usdc).toBe(0.05);
    expect(llms.agrees).toBeUndefined();
    expect(llms.detail).toContain("no comparison");
    expect(section.named_a_price).toBe(0);
  });
});

describe("the paid audit carries the section; the free preflight carries nothing of the kind", () => {
  it("reads llms.txt, the OpenAPI document, the resource URL and the bookend on one origin", async () => {
    const audit = await performServiceAudit(testEnv, DOOR, {
      fetch: originFetch({
        [PATH]: () => challenge402([accept()], { resource: "https://merchant.example/api/thing" }),
        "/api/thing": () => challenge402([accept()]),
        "/llms.txt": () => new Response(`# Merchant\n\n- \`GET ${PATH}\` ($0.05)\n`, { status: 200 }),
        "/openapi.json": () =>
          new Response(JSON.stringify({ paths: { [PATH]: { get: { "x-payment-info": { price_usdc: 0.5 } } } } }), {
            status: 200,
          }),
      }),
    });
    expect(audit.verdict).toBe("ready");
    expect(audit.surfaces).toBeDefined();
    const surfaces = audit.surfaces!;
    expect(surfaces.rows.map((row) => row.surface)).toEqual(["llms.txt", "openapi", "resource_url", "402_bookend"]);
    expect(surfaces.rows.find((row) => row.surface === "llms.txt")?.agrees).toBe(true);
    expect(surfaces.rows.find((row) => row.surface === "openapi")?.agrees).toBe(false);
    expect(surfaces.rows.find((row) => row.surface === "resource_url")?.agrees).toBe(true);
    expect(surfaces.moving).toBe(false);
    expect(surfaces.named_a_price).toBe(3);
    expect(surfaces.agree).toBe(2);
    expect(surfaces.differ).toBe(1);
    // The section never moves the verdict: an OpenAPI document that
    // names a different price is a fact about the surface, reported.
    expect(audit.verdict).toBe("ready");
    expect(audit.scope).toContain("none of which move the verdict");
  });

  it("falls back to /.well-known/openapi.json when /openapi.json is absent", async () => {
    const audit = await performServiceAudit(testEnv, DOOR, {
      fetch: originFetch({
        [PATH]: () => challenge402([accept()]),
        "/.well-known/openapi.json": () =>
          new Response(JSON.stringify({ paths: { [PATH]: { get: { "x-payment-info": { price_usdc: 0.05 } } } } }), {
            status: 200,
          }),
      }),
    });
    const openapi = audit.surfaces!.rows.find((row) => row.surface === "openapi")!;
    expect(openapi.url).toContain("/.well-known/openapi.json");
    expect(openapi.state).toBe("read");
    expect(openapi.agrees).toBe(true);
  });

  it("is inside the signed core: the evidence hash moves when a surface does", async () => {
    const run = (llms: string) =>
      performServiceAudit(testEnv, DOOR, {
        now: new Date("2026-09-02T00:00:00.000Z"),
        fetch: originFetch({
          [PATH]: () => challenge402([accept()]),
          "/llms.txt": () => new Response(llms, { status: 200 }),
        }),
      });
    const agreeing = await run(`- \`GET ${PATH}\` ($0.05)\n`);
    const differing = await run(`- \`GET ${PATH}\` ($0.50)\n`);
    expect(agreeing.surfaces?.differ).toBe(0);
    expect(differing.surfaces?.differ).toBe(1);
    expect(agreeing.evidence_hash).not.toBe(differing.evidence_hash);
  });

  it("an unreachable door has no section: no battery ran, so no surfaces were compared", async () => {
    const audit = await performServiceAudit(testEnv, DOOR, {
      fetch: (async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
    });
    expect(audit.verdict).toBe("unreachable");
    expect(audit.surfaces).toBeUndefined();
  });

  it("the free preflight makes its one request and carries no surfaces section", async () => {
    const response = await SELF.fetch(`${BASE}/api/preflight/v2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: DOOR }),
    });
    const text = await response.text();
    expect(text).not.toContain('"surfaces"');
    expect(text).not.toContain("402_bookend");
  });
});

describe("the specimen is built through the same arithmetic", () => {
  it("shows a surface naming a price beside a door whose amount cannot be read as dollars", async () => {
    const sample = await sampleOnceOver(testEnv, 5);
    const surfaces = sample.sample.surfaces;
    expect(surfaces).toBeDefined();
    const llms = surfaces!.rows.find((row) => row.surface === "llms.txt")!;
    expect(llms.state).toBe("read");
    expect(llms.price_usdc).toBe(0.1);
    // The specimen's door types its amount in dollars — the defect the
    // headline names — so the surface's number has nothing to be
    // compared with, and the section says why rather than shrugging.
    expect(surfaces!.challenge_price).toBeNull();
    expect(surfaces!.no_challenge_price).toContain("atomic");
    expect(surfaces!.rows.find((row) => row.surface === "402_bookend")?.state).toBe("read");
    expect(surfaces!.moving).toBe(false);
    expect(surfaces!.not_read).toEqual(NOT_READ);
  });
});

describe("our own guide, read by the reader it ships", () => {
  it("names the shelf's minimum for every paid door, in the convention, derived not typed", async () => {
    // The full guide and the shelf's area file both carry the section;
    // the index at /llms.txt is the map, and a map lists no prices.
    const text = await (await SELF.fetch(`${BASE}/menu/llms.txt`)).text();
    expect(text).toContain("## Prices, by the convention");
    const wrong: string[] = [];
    for (const item of MENU_ITEMS.filter((entry) => entry.price_usdc > 0)) {
      const found = llmsPriceFor(text, `/api/buy/${item.id}`);
      if (!found) {
        wrong.push(`${item.id}: the guide names no price for it by the convention`);
      } else if (Math.round(found.price * 1_000_000) !== Math.round(item.price_usdc * 1_000_000)) {
        wrong.push(`${item.id}: the guide says $${found.price}, the shelf says $${item.price_usdc}`);
      }
    }
    expect(
      wrong,
      "our own llms.txt disagrees with our own shelf under the convention the paid audit reads other people's doors by. The instrument must not fail its own test.",
    ).toEqual([]);
  });

  it("the full guide reads the same way", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    const item = MENU_ITEMS.find((entry) => entry.id === "service_audit")!;
    expect(llmsPriceFor(text, `/api/buy/${item.id}`)?.price).toBe(item.price_usdc);
  });
});

describe("the vocabulary's v9 row", () => {
  it("carries surface-contradicts-challenge as paid-detectable, pointing at the surfaces section", () => {
    expect(DEFECT_VOCABULARY_VERSION).toBe("9");
    const row = VOCABULARY_CHANGELOG.find((change) => change.version === "9")!;
    expect(row.date).toBe("2026-09-02");
    expect(row.what_changed).toContain("surface-contradicts-challenge");
    const cls = defectClass("surface-contradicts-challenge")!;
    expect(cls.detectable).toBe("paid");
    expect(cls.our_signal).toContain("surfaces");
    expect(cls.falsified_by).toContain("moving");
    expect(cls.registered).toBe("2026-09-02");
  });
});
