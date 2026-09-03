import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import ciYml from "../.github/workflows/ci.yml?raw";
import examplesReadme from "../examples/README.md?raw";
import packageJsonRaw from "../package.json?raw";
import { BEFORE_YOU_PAY_VERSION, beforeYouPay } from "@/services/before-you-pay";
import { BATTERY_CHECK_NAMES, PREFLIGHT_VERSION } from "@/services/preflight";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE EXAMPLES (2026-09-03, roadmap C2). What this file holds:
 *
 *   - the recorded readings in examples/fixtures are the live
 *     battery's shape: same report keys, same dry-run keys, every check
 *     name in the registry, the versions the store serves today — so a
 *     battery change fails HERE until the fixtures are re-cut, rather
 *     than teaching a developer a stale shape;
 *   - every framework file wires the shared module, never a second
 *     copy of the logic, and names only free doors;
 *   - the examples README names every directory, and CI runs the
 *     shared tests as a named step.
 *
 * The framework files are not executed here (see the README's "What CI
 * runs"); their syntax is checked by the examples:test script.
 */

const readings = Object.entries(
  import.meta.glob("../examples/fixtures/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
)
  .filter(([path]) => !path.endsWith("expected.json"))
  .map(([path, raw]) => ({ name: path.split("/").at(-1)!, body: JSON.parse(raw) as Record<string, any> }));

const frameworkFiles = {
  ...(import.meta.glob("../examples/*/agent.*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../examples/{claude-code,copilot}/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
};

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

describe("the recorded readings are the live battery's shape", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keys, check names and versions match a reading produced today", async () => {
    const challenge = { x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", asset: USDC, amount: "1000", payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 300 }] };
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) } }));
    const live = await beforeYouPay("https://door.example/api/paid-answer", testEnv, {});
    expect(live.status).toBe(200);
    const liveBody = live.body as Record<string, any>;
    const liveKeys = Object.keys(liveBody).sort();
    const liveDoorKeys = Object.keys(liveBody.the_door).sort();
    const liveClientKeys = Object.keys(liveBody.your_client).sort();
    expect(readings.length).toBeGreaterThanOrEqual(5);
    for (const { name, body } of readings) {
      expect(Object.keys(body).sort(), `${name}: reading keys`).toEqual(liveKeys);
      expect(body.version, `${name}: before-you-pay version`).toBe(BEFORE_YOU_PAY_VERSION);
      expect(body.the_door.version, `${name}: preflight version`).toBe(PREFLIGHT_VERSION);
      // The served key set, with its two optional keys: network_failure
      // rides only on an unreachable probe; also_under only where a
      // second battery scored the same bytes. Everything else is present
      // on every reading, and no reading carries a key the live report
      // does not.
      const optional = new Set(["network_failure", "also_under"]);
      const doorKeys = Object.keys(body.the_door).sort();
      for (const key of doorKeys) expect([...liveDoorKeys, ...optional], `${name}: report carries ${key}, which the live report does not`).toContain(key);
      for (const key of liveDoorKeys) if (!optional.has(key)) expect(doorKeys, `${name}: report lacks ${key}`).toContain(key);
      expect(Object.keys(body.your_client).sort(), `${name}: dry-run keys`).toEqual(liveClientKeys);
      // `reachable` is the one row a probe that never completed
      // writes; it is not a battery check, and the registry does not
      // carry it.
      for (const check of body.the_door.checks) {
        expect(check.name === "reachable" || (BATTERY_CHECK_NAMES as readonly string[]).includes(check.name), `${name}: unknown check ${check.name}`).toBe(true);
      }
      expect(["ready", "not_ready", "unreachable"]).toContain(body.the_door.verdict);
      expect(["would_sign", "would_throw", "cannot_simulate"]).toContain(body.will_your_client_pay);
    }
  });
});

describe("every framework file wires the shared module and names only free doors", () => {
  it("imports decide, never re-derives, and mentions no paid door", () => {
    const paths = Object.keys(frameworkFiles);
    expect(paths.length).toBeGreaterThanOrEqual(8);
    for (const [path, text] of Object.entries(frameworkFiles)) {
      const shared = /shared\/decide|from decide import|decide\.mjs|decide\.py/.test(text);
      expect(shared, `${path} does not use the shared module`).toBe(true);
      expect(text, `${path} names a paid door`).not.toMatch(/\/api\/buy\/|buy_[a-z_]+/);
      expect(text.toLowerCase(), `${path} reads as a score`).not.toMatch(/\b(trust score|rating|ranking)\b/);
    }
  });

  it("the README names every directory, and CI runs the shared tests as a named step", () => {
    const directories = new Set(Object.keys(frameworkFiles).map((path) => path.split("/").at(-2)!));
    for (const directory of directories) {
      expect(examplesReadme, `README does not name ${directory}/`).toContain(`${directory}/`);
    }
    expect(examplesReadme).toContain("fixtures/");
    expect(examplesReadme).toContain("shared/decide.mjs");
    expect(examplesReadme).toContain("shared/decide.py");
    const scripts = (JSON.parse(packageJsonRaw) as { scripts: Record<string, string> }).scripts;
    expect(scripts["examples:test"]).toContain("examples/shared/decide.test.mjs");
    expect(scripts["examples:test"]).toContain("test_decide");
    expect(scripts["gates"]).toContain("npm run examples:test");
    expect(ciYml).toMatch(/- name: The examples\n\s+run: npm run examples:test/);
  });
});
