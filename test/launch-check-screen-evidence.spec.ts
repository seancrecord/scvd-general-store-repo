import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  chainalysisScreen, getLaunchCheck, oracleScreen, performLaunchCheck,
  SANCTIONS_ORACLE_BASE, signLaunchCheck, storeLaunchCheck,
  type FieldSigner, type LaunchCheckCore, type SanctionsScreen, type SignedLaunchCheck,
} from "@/services/launch-check";
import { BASE_NETWORK } from "@/lib/payment-networks";
import type { Env } from "@/types";
import { hexToBytes, verifyEd25519 } from "../verifier/x402-verify.js";

const testEnv = env as unknown as Env;
const ADDRESS = "0x2222222222222222222222222222222222222222";
const TARGET = "https://screen-evidence.example/api/buy/thing";
const OBSERVED = "2026-09-14T12:00:01.000Z";
const CLEAR = `0x${"0".repeat(64)}`;
const LISTED = `0x${"0".repeat(63)}1`;
const clock = () => new Date(OBSERVED);
const URLS = ["https://user:password@primary.test/private-key?token=secret", "https://secondary.test/another-key"];

async function verifies(check: SignedLaunchCheck) {
  const { signature, public_key, signature_covers: _description, ...signed } = check;
  return verifyEd25519(JSON.stringify(signed), hexToBytes(signature)!, hexToBytes(public_key)!);
}

function run(screen: SanctionsScreen) {
  const retained: Array<{ stage: string; core: LaunchCheckCore }> = [];
  const signer: FieldSigner = {
    address: "0x3333333333333333333333333333333333333333",
    signTypedData: vi.fn(async () => `0x${"ab".repeat(65)}` as `0x${string}`),
  };
  const seller = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (new Headers(init?.headers).has("PAYMENT-SIGNATURE")) {
      return new Response("goods", { headers: {
        "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: `0x${"cd".repeat(32)}` })),
      } });
    }
    return new Response("{}", { status: 402, headers: {
      "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, accepts: [{
        scheme: "exact", network: BASE_NETWORK, payTo: ADDRESS,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "5000",
        maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" },
      }] })),
    } });
  });
  return { signer, seller, retained, check: performLaunchCheck(testEnv, TARGET, {
    screen, signer, fetch: seller as typeof fetch, now: new Date("2026-09-14T12:00:00Z"),
    randomNonce: () => `0x${"ef".repeat(32)}`,
    retain: async (stage, core) => { retained.push({ stage, core: structuredClone(core) }); },
  }) };
}

describe("the gate preserves its actual latest-block response", () => {
  it.each([[false, CLEAR], [true, LISTED]] as const)("keeps the first valid boolean (%s) without consulting another provider", async (listed, result) => {
    const rpc = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ result })));
    const answer = await oracleScreen(URLS, rpc as typeof fetch, clock)(ADDRESS);
    expect(answer.listed).toBe(listed);
    expect(answer.evidence).toEqual({
      version: 1, chain: BASE_NETWORK, contract: SANCTIONS_ORACLE_BASE,
      address: ADDRESS, method: "eth_call", calldata: "0xdf592f7d" + ADDRESS.slice(2).padStart(64, "0"),
      block_tag: "latest", block_number: null, block_hash: null,
      provider_host: "primary.test", observed_at: OBSERVED, result, listed,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(rpc.mock.calls[0]?.[1]?.body));
    expect(request.params).toEqual([{ to: answer.evidence!.contract, data: answer.evidence!.calldata }, "latest"]);
    expect(request.method).toBe(answer.evidence!.method);
    for (const secret of ["user", "password", "private-key", "token", "secret"]) {
      expect(JSON.stringify(answer)).not.toContain(secret);
    }
  });

  it("keeps the answering fallback's identity without retaining a hostile failed body", async () => {
    const rpc = vi.fn(async () => new Response(JSON.stringify({ result: "private-key password" })))
      .mockResolvedValueOnce(new Response("private-key password", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: CLEAR, error: "private-key password" })));
    const answer = await oracleScreen(URLS, rpc as typeof fetch, clock)(ADDRESS);
    expect(answer.listed).toBe(false);
    expect(answer.evidence?.provider_host).toBe("secondary.test");
    expect(answer.evidence?.result).toBe(CLEAR);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(answer)).not.toMatch(/private-key|password/);
  });

  it.each(["0x1", "0xdeadbeef", "private-key", null, false])("does not invent evidence for malformed result %s", async result => {
    const rpc = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ result })));
    const answer = await oracleScreen(URLS, rpc as typeof fetch, clock)(ADDRESS);
    expect(answer.listed).toBeNull();
    expect(answer).not.toHaveProperty("evidence");
    expect(rpc).toHaveBeenCalledTimes(URLS.length);
  });

  it("does not read the chain for an unsupported address", async () => {
    const rpc = vi.fn();
    const answer = await oracleScreen(URLS, rpc as typeof fetch, clock)("not-an-evm-address");
    expect(answer.listed).toBeNull();
    expect(answer).not.toHaveProperty("evidence");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Launch Check signs and retains the screen evidence before returning", () => {
  it.each([[false, CLEAR], [true, LISTED]] as const)("retains evidence when listed=%s and keeps the payment decision", async (listed, result) => {
    const rpc = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ result })));
    const fixture = run(oracleScreen(URLS, rpc as typeof fetch, clock));
    const check = await fixture.check;
    const stage = check.stages.find(row => row.stage === "screen")!;
    expect(stage.ok).toBe(!listed);
    expect(stage.evidence?.result).toBe(result);
    expect(stage.evidence?.listed).toBe(listed);
    expect(await verifies(check)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fixture.signer.signTypedData).toHaveBeenCalledTimes(listed ? 0 : 1);
    expect(fixture.seller).toHaveBeenCalledTimes(listed ? 1 : 3);
    expect(check.verdict).toBe(listed ? "unpaid_by_rule" : "settled");
    for (const retained of fixture.retained) {
      expect(retained.core.stages.find(row => row.stage === "screen")?.evidence).toEqual(stage.evidence);
      const recovered = await signLaunchCheck(testEnv, retained.core);
      expect(recovered.stages.find(row => row.stage === "screen")?.evidence).toEqual(stage.evidence);
      expect(await verifies(recovered)).toBe(true);
    }
    expect(fixture.retained.map(row => row.stage)).toEqual(listed ? ["observation"] : ["attempt", "observation"]);
    await storeLaunchCheck(testEnv, check, "cert_screen_fixture", OBSERVED);
    expect((await getLaunchCheck(testEnv, check.check_id))?.check).toEqual(check);

    // Delete, edit, and edit-and-rehash: none may keep the original signature valid.
    const removed = structuredClone(check);
    delete removed.stages.find(row => row.stage === "screen")!.evidence;
    expect(await verifies(removed)).toBe(false);
    const edited = structuredClone(check);
    edited.stages.find(row => row.stage === "screen")!.evidence!.provider_host = "other.test";
    expect(await verifies(edited)).toBe(false);
    const { evidence_hash: _hash, scope: _scope, signature: _sig, public_key: _key, signature_covers: _cover, ...core } = edited;
    edited.evidence_hash = (await signLaunchCheck(testEnv, core)).evidence_hash;
    expect(await verifies(edited)).toBe(false);
  });

  it("keeps legacy and unavailable screens compatible without fabricating evidence", async () => {
    for (const listed of [false, null] as const) {
      const fixture = run(async () => ({ listed, source: "test screen" }));
      const check = await fixture.check;
      expect(check.stages.find(row => row.stage === "screen")).not.toHaveProperty("evidence");
      expect(fixture.signer.signTypedData).toHaveBeenCalledTimes(listed === false ? 1 : 0);
      expect(await verifies(check)).toBe(true);
      await storeLaunchCheck(testEnv, check, "cert_legacy_screen", OBSERVED);
      expect((await getLaunchCheck(testEnv, check.check_id))?.check).toEqual(check);
    }
  });

  it("does not label the API override as an oracle observation", async () => {
    const api = vi.fn(async () => new Response(JSON.stringify({ identifications: [] })));
    const answer = await chainalysisScreen("test-api-key", api as typeof fetch)(ADDRESS);
    expect(answer.listed).toBe(false);
    expect(answer).not.toHaveProperty("evidence");
  });
});
