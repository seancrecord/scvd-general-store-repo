import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentChallenges, parseWwwAuthenticate, protocolsSpoken, requestIsCanonical } from "@/lib/mpp-challenge";
import { MPP_ADVISORY_NAMES, MPP_CHECK_NAMES, countMppMisreads, runMppChecks } from "@/services/mpp-battery";
import { PREFLIGHT_VERSION_NEXT, preflightUrl } from "@/services/preflight";
import { PROTOCOL_FAMILIES } from "@/evidence/subject";
import { DEFECT_CLASSES, defectsBySignal } from "@/store/defect-vocabulary";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const NOW = new Date("2026-09-04T00:00:00Z");

/**
 * THE SECOND WIRE, READ (roadmap V3 PR 1, 2026-09-04). What this file holds:
 *
 *   - the RFC 9110 parser: quoted strings, a comma inside a
 *     description, several challenges of several schemes in one value,
 *     the Payment scheme keyed on and the rest ignored;
 *   - every recorded door fails EXACTLY the checks it is bad in and
 *     raises exactly the advisories named — check independence, the
 *     door-fixtures discipline, on the second battery;
 *   - protocols_spoken is derived from the headers, both / either /
 *     neither, and a proxy's Basic beside PAYMENT-REQUIRED is not MPP;
 *   - the free report carries protocols_spoken and the mpp block, the
 *     x402 verdict is untouched by any of it, and an unreachable probe
 *     speaks nothing;
 *   - the practice door serves the shape and the guide can point at it;
 *   - the family row, the vocabulary classes for every failing check.
 */

interface MppFixture {
  name: string;
  why: string;
  url: string;
  expect_spoken: string[];
  expect_failed: string[];
  expect_advisories: string[];
  status: number;
  headers: Record<string, string>;
  body: string;
}
const fixtures = Object.entries(import.meta.glob("./fixtures/mpp/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>).map(([path, raw]) => ({ path, fixture: JSON.parse(raw) as MppFixture }));

const headersOf = (record: Record<string, string>) => ({ get: (name: string) => record[name.toLowerCase()] ?? null });

describe("the RFC 9110 parser", () => {
  it("reads several challenges of several schemes from one joined value, honouring quoted commas", () => {
    const parsed = parseWwwAuthenticate('Basic realm="proxy", Payment id="a", realm="door", description="one, two", Bearer, Payment id="b", realm="door"');
    expect(parsed.map((c) => c.scheme)).toEqual(["basic", "payment", "bearer", "payment"]);
    expect(parsed[1]!.params).toEqual({ id: "a", realm: "door", description: "one, two" });
    expect(parsed[3]!.params["id"]).toBe("b");
    expect(paymentChallenges('Payment id="x", realm="r", method="evm", intent="charge"')[0]!.request_error).toBe("no request parameter");
    expect(parseWwwAuthenticate(null)).toEqual([]);
  });

  it("decodes the request and knows canonical from pretty", () => {
    const canonical = '{"amount":"1","currency":"usd"}';
    const pretty = '{\n  "currency": "usd",\n  "amount": "1"\n}';
    const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const [good] = paymentChallenges(`Payment id="a", realm="r", method="evm", intent="charge", request="${b64u(canonical)}"`);
    const [bad] = paymentChallenges(`Payment id="b", realm="r", method="evm", intent="charge", request="${b64u(pretty)}"`);
    expect(requestIsCanonical(good!)).toBe(true);
    expect(requestIsCanonical(bad!)).toBe(false);
    expect(good!.request).toEqual({ amount: "1", currency: "usd" });
  });
});

describe("every recorded door fails exactly the checks it is bad in", () => {
  it("the corpus exists and every entry documents itself", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    for (const { path, fixture } of fixtures) {
      expect(fixture.why, path).toBeTruthy();
      for (const name of fixture.expect_failed) expect((MPP_CHECK_NAMES as readonly string[]).includes(name), `${path} expects unknown check ${name}`).toBe(true);
      for (const name of fixture.expect_advisories) expect((MPP_ADVISORY_NAMES as readonly string[]).includes(name), `${path} expects unknown advisory ${name}`).toBe(true);
    }
  });

  for (const { path, fixture } of fixtures) {
    it(`${fixture.name}: ${fixture.why.split(":")[0]}`, () => {
      const outcome = runMppChecks({ headers: headersOf(fixture.headers), url: fixture.url, bodyText: fixture.body, now: NOW });
      expect(outcome.protocols_spoken, `${path} protocols`).toEqual(fixture.expect_spoken);
      if (!fixture.expect_spoken.includes("mpp")) {
        expect(outcome.spoken).toBe(false);
        expect(outcome.checks).toEqual([]);
        return;
      }
      expect(outcome.spoken).toBe(true);
      expect(outcome.checks.map((check) => check.name)).toEqual([...MPP_CHECK_NAMES]);
      const failed = outcome.checks.filter((check) => !check.ok).map((check) => check.name).sort();
      expect(failed, `${path}: failed checks`).toEqual([...fixture.expect_failed].sort());
      expect(outcome.advisories.map((advisory) => advisory.name).sort(), `${path}: advisories`).toEqual([...fixture.expect_advisories].sort());
      for (const check of outcome.checks) expect(check.detail, check.name).toBeTruthy();
    });
  }
});

describe("the report, the practice door, the family and the vocabulary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carries protocols_spoken and the mpp block; the x402 verdict is untouched; unreachable speaks nothing", async () => {
    const evm = fixtures.find((entry) => entry.fixture.name === "evm-clean")!.fixture;
    vi.stubGlobal("fetch", async () => new Response(evm.body, { status: 402, headers: evm.headers }));
    const { status, body } = await preflightUrl("https://door.example/api/paid", testEnv, PREFLIGHT_VERSION_NEXT);
    expect(status).toBe(200);
    const report = body as Record<string, any>;
    expect(report.verdict).toBe("not_ready");
    expect(report.checks.find((check: { name: string }) => check.name === "payment-required-header").ok).toBe(false);
    expect(report.protocols_spoken).toEqual(["mpp"]);
    expect(report.mpp.spoken).toBe(true);
    expect(report.mpp.checks.every((check: { ok: boolean }) => check.ok)).toBe(true);
    expect(report.mpp.the_x402_verdict_above).toMatch(/x402-ready, permanently/);
    vi.stubGlobal("fetch", async () => { throw new TypeError("connection refused"); });
    const dead = (await preflightUrl("https://door.example/api/paid", testEnv, PREFLIGHT_VERSION_NEXT)).body as Record<string, any>;
    expect(dead.verdict).toBe("unreachable");
    expect(dead.protocols_spoken).toEqual([]);
    expect(dead.mpp.spoken).toBe(false);
  });

  it("the practice door serves an MPP-shaped 402 the battery reads clean, on the other wire", async () => {
    const response = await SELF.fetch(`${BASE}/api/practice/mpp-shape`);
    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBeNull();
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const outcome = runMppChecks({ headers: response.headers, url: `${BASE}/api/practice/mpp-shape`, bodyText: await response.text(), now: NOW });
    expect(outcome.protocols_spoken).toEqual(["mpp"]);
    expect(outcome.checks.filter((check) => !check.ok)).toEqual([]);
    expect(outcome.advisories).toEqual([]);
    expect(protocolsSpoken(response.headers)).toEqual(["mpp"]);
  });

  it("the family row exists, every failing check is a vocabulary class sourced to the draft, and the misread count carries its denominators", () => {
    expect(PROTOCOL_FAMILIES.find((family) => family.id === "mpp")?.versions).toEqual(["draft-00"]);
    for (const name of MPP_CHECK_NAMES) {
      if (name === "mpp-challenge-present") continue;
      const classes = defectsBySignal(name);
      expect(classes.length, `${name} has no vocabulary class`).toBe(1);
      expect(classes[0]!.detectable).toBe("unpaid");
      expect(classes[0]!.sourced_by, name).toMatch(/mpp-specs/);
      expect(classes[0]!.buyer_hint).toBeTruthy();
    }
    expect(DEFECT_CLASSES.some((entry) => entry.id === "x402-and-mpp")).toBe(false);
    const count = countMppMisreads([
      { evidence: { headers: { "content-type": "application/json" } } },
      { evidence: { headers: { "www-authenticate": 'Payment id="a", realm="r"', "content-type": "application/problem+json" } } },
      { evidence: { headers: { "www-authenticate": 'Payment id="b", realm="r"', "payment-required": "eyJ4" } } },
      {},
    ]);
    expect(count).toMatchObject({ rows_with_captured_headers: 3, rows_that_could_show_it: 2, rows_speaking_mpp: 2, rows_misread_as_broken_x402: 1 });
  });
});
