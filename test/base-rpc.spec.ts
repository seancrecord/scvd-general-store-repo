import { describe, expect, it } from "vitest";
import { redactRpc, rpcEndpoints } from "@/lib/base-rpc";
import type { Env } from "@/types";

/**
 * The RPC ladder: which endpoints the chain readers will try, and in
 * what order. Born 2026-08-13 during the bank walk's nineteenth
 * consecutive stalled hour — one authenticated key is one point of
 * failure, and the public fallback shares the Worker egress every
 * other tenant is being rate-limited on, so it can fail at the same
 * moment for the same reason. The ladder is primary, then secondary
 * (a different provider), then public.
 */

function envWith(overrides: Partial<Env>): Env {
  return overrides as Env;
}

describe("the RPC ladder", () => {
  it("tries primary, then secondary, then the public one, then the keyless rotation", () => {
    // The keyless tail joined 2026-08-20 ("i dont care who manages as
    // long as its free and works"): configured endpoints keep their
    // order and the public fallbacks always bring up the rear.
    const endpoints = rpcEndpoints(
      envWith({
        BASE_RPC_URL_PRIMARY: "https://paid-one.example/v2/key",
        BASE_RPC_URL_SECONDARY: "https://paid-two.example/key",
        BASE_RPC_URL: "https://public.example",
      }),
    );
    expect(endpoints).toEqual([
      "https://paid-one.example/v2/key",
      "https://paid-two.example/key",
      "https://public.example",
      "https://base-rpc.publicnode.com",
      "https://base.drpc.org",
    ]);
  });

  it("collapses blanks and duplicates instead of retrying the same door twice", () => {
    // Retrying a rate-limited endpoint against itself helps with a
    // hiccup and not at all with an outage; a duplicate entry would
    // spend attempts pretending one provider is two.
    const endpoints = rpcEndpoints(
      envWith({
        BASE_RPC_URL_PRIMARY: "  ",
        BASE_RPC_URL_SECONDARY: "https://public.example",
        BASE_RPC_URL: "https://public.example",
      }),
    );
    expect(endpoints).toEqual([
      "https://public.example",
      "https://base-rpc.publicnode.com",
      "https://base.drpc.org",
    ]);
  });

  it("stands on the default public endpoint plus the keyless rotation when nothing is configured", () => {
    expect(rpcEndpoints(envWith({}))).toEqual([
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
      "https://base.drpc.org",
    ]);
  });

  it("never says a URL out loud that could carry a credential", () => {
    // The token lives IN an authenticated URL; error text reaches
    // alert emails and audit details. Hosts only.
    expect(redactRpc("https://paid-one.example/v2/secret-key")).toBe(
      "paid-one.example",
    );
    expect(redactRpc("not a url")).toBe("the configured endpoint");
  });
});

import {afterEach,vi} from "vitest";
import {getBlockHash,BASE_EVM} from "@/lib/base-rpc";
afterEach(()=>vi.unstubAllGlobals());
it("reads the exact canonical block identity and normalizes its hash",async()=>{
 const hash=`0x${"A".repeat(64)}`;
 const request=vi.fn(async()=>Response.json({jsonrpc:"2.0",id:1,result:{number:"0x65",hash}}));vi.stubGlobal("fetch",request);
 expect(await getBlockHash(envWith({}),101,BASE_EVM)).toBe(hash.toLowerCase());
 const init=request.mock.calls[0] as unknown as [string,RequestInit];
 expect(JSON.parse(String(init[1].body))).toMatchObject({method:"eth_getBlockByNumber",params:["0x65",false]});
});
it.each([null,{number:"0x66",hash:`0x${"a".repeat(64)}`},{number:"0x65",hash:"0x1"},{number:"0x65"},{hash:`0x${"a".repeat(64)}`}])("refuses a missing or inconsistent block identity: %j",async header=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({jsonrpc:"2.0",id:1,result:header})));
 await expect(getBlockHash(envWith({}),101,BASE_EVM)).rejects.toThrow("Block identity unavailable");
});
