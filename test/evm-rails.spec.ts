import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  ARBITRUM_EVM,
  AVALANCHE_EVM,
  BASE_EVM,
  ETHEREUM_EVM,
  EVM_CHAINS,
  OPTIMISM_EVM,
  POLYGON_EVM,
  WALKED_EVM_CHAINS,
  evmChainOf,
  rpcEndpoints,
} from "@/lib/base-rpc";
import { KNOWN_CHAINS } from "@/evidence/subject";
import { SOLANA_CHAIN } from "@/lib/solana-rpc";
import { COVERAGE_REGISTRATIONS } from "@/evidence/coverage";
import { NETWORK_VOCABULARY, STATEMENT_RAILS, statementRailOf } from "@/lib/statement-rails";
import { CANONICAL_USDC, isCanonicalUsdc } from "@/lib/value-checks";
import { challengePriceOf } from "@/services/surface-reads";
import { evmUsdcPayTos } from "@/services/evm-receivable";
import type { Env } from "@/types";

/**
 * THE OTHER FOUR EVM CHAINS USDC SETTLES ON (2026-09-03). What this
 * file holds:
 *
 *   - six chains, each with its own CAIP-2, its own lowercase USDC
 *     contract, its own env stem and at least two independent
 *     keyless fallbacks, none shared between chains;
 *   - the vocabulary resolves every chain by name and by CAIP-2, Base
 *     when unsaid, null for a stranger;
 *   - a configured endpoint is tried before the fallbacks, on every
 *     chain, through the same three slots;
 *   - the four readers keep the conservative span, and the walked
 *     list is still exactly the two chains this store's money moves
 *     on — widening it is a cost decision, not a constant;
 *   - every consumer that used to type Base and Polygon now derives:
 *     the statement rails and their refusal sentence, the coverage
 *     claim, the canonical-USDC registry, the receivability read and
 *     the challenge price.
 */

const READERS = [ETHEREUM_EVM, ARBITRUM_EVM, OPTIMISM_EVM, AVALANCHE_EVM];

describe("the chain constants", () => {
  it("are six, distinct in key, CAIP-2 and contract, every contract lowercase", () => {
    expect(EVM_CHAINS).toHaveLength(6);
    const keys = EVM_CHAINS.map((chain) => chain.key);
    const caip2s = EVM_CHAINS.map((chain) => chain.caip2);
    const contracts = EVM_CHAINS.map((chain) => chain.usdc);
    expect(new Set(keys).size).toBe(6);
    expect(new Set(caip2s).size).toBe(6);
    expect(new Set(contracts).size).toBe(6);
    for (const chain of EVM_CHAINS) {
      expect(chain.caip2).toMatch(/^eip155:\d+$/);
      expect(chain.usdc).toMatch(/^0x[0-9a-f]{40}$/);
      expect(chain.blocksPerHour).toBeGreaterThan(0);
      expect(chain.envPrefix).toMatch(/^[A-Z]+$/);
    }
  });

  it("pin the CAIP-2 ids Circle's native USDC lives on", () => {
    expect(ETHEREUM_EVM.caip2).toBe("eip155:1");
    expect(ARBITRUM_EVM.caip2).toBe("eip155:42161");
    expect(OPTIMISM_EVM.caip2).toBe("eip155:10");
    expect(AVALANCHE_EVM.caip2).toBe("eip155:43114");
    expect(BASE_EVM.caip2).toBe("eip155:8453");
    expect(POLYGON_EVM.caip2).toBe("eip155:137");
  });

  it("give every chain its own fallbacks: https, at least two hosts, none shared", () => {
    const seen = new Map<string, string>();
    for (const chain of EVM_CHAINS) {
      expect(chain.fallbacks.length, chain.key).toBeGreaterThanOrEqual(2);
      expect(chain.defaultRpc).toMatch(/^https:\/\//);
      for (const url of chain.fallbacks) {
        expect(url).toMatch(/^https:\/\//);
        const host = new URL(url).host;
        expect(seen.get(host), `${host} serves two chains`).toBeUndefined();
        seen.set(host, chain.key);
      }
    }
  });

  it("keep the readers on the conservative span and the walk on the two accepted rails", () => {
    for (const chain of READERS) {
      expect(chain.logSpan).toBe(POLYGON_EVM.logSpan);
    }
    expect(WALKED_EVM_CHAINS.map((chain) => chain.key)).toEqual(["base", "polygon"]);
    expect(EVM_CHAINS[0]).toBe(BASE_EVM);
  });
});

describe("the vocabulary", () => {
  it("resolves every chain by name and by CAIP-2, Base when unsaid, null for a stranger", () => {
    for (const chain of EVM_CHAINS) {
      expect(evmChainOf(chain.key)).toBe(chain);
      expect(evmChainOf(chain.caip2)).toBe(chain);
      expect(evmChainOf(` ${chain.caip2.toUpperCase()} `)).toBe(chain);
    }
    expect(evmChainOf(undefined)).toBe(BASE_EVM);
    expect(evmChainOf("")).toBe(BASE_EVM);
    expect(evmChainOf("eip155:84532")).toBeNull();
    expect(evmChainOf("bsc")).toBeNull();
  });

  it("carries every chain into the statement rails, each at its own cadence, and into the refusal sentence", () => {
    for (const chain of EVM_CHAINS) {
      const rail = statementRailOf(chain.key);
      expect(rail?.caip2).toBe(chain.caip2);
      expect(rail?.unit).toBe("block");
      expect(rail?.unitsPerHour).toBe(chain.blocksPerHour);
      expect(STATEMENT_RAILS.some((entry) => entry.caip2 === chain.caip2)).toBe(true);
      expect(NETWORK_VOCABULARY).toContain(`"${chain.caip2}" (or "${chain.key}"`);
    }
    expect(NETWORK_VOCABULARY).toContain('"solana"');
    expect(statementRailOf("solana")?.key).toBe("solana");
    expect(ARBITRUM_EVM.blocksPerHour).toBeGreaterThan(BASE_EVM.blocksPerHour);
    expect(ETHEREUM_EVM.blocksPerHour).toBeLessThan(BASE_EVM.blocksPerHour);
  });
});

describe("the endpoints", () => {
  it("try the configured slots before the fallbacks, on every chain, through the same three names", () => {
    for (const chain of EVM_CHAINS) {
      const configured = {
        ...(env as unknown as Env),
        [`${chain.envPrefix}_RPC_URL_PRIMARY`]: `https://primary.example/${chain.key}`,
        [`${chain.envPrefix}_RPC_URL_SECONDARY`]: `https://secondary.example/${chain.key}`,
        [`${chain.envPrefix}_RPC_URL`]: `https://public.example/${chain.key}`,
      } as unknown as Env;
      const endpoints = rpcEndpoints(configured, chain);
      expect(endpoints.slice(0, 3)).toEqual([
        `https://primary.example/${chain.key}`,
        `https://secondary.example/${chain.key}`,
        `https://public.example/${chain.key}`,
      ]);
      for (const url of chain.fallbacks) expect(endpoints).toContain(url);
    }
  });

  it("fall back to the chain's own public endpoints when nothing is configured", () => {
    const bare = {} as Env;
    for (const chain of EVM_CHAINS) {
      const endpoints = rpcEndpoints(bare, chain);
      expect(endpoints[0]).toBe(chain.defaultRpc);
      expect(new Set(endpoints).size).toBe(endpoints.length);
      for (const url of chain.fallbacks) expect(endpoints).toContain(url);
      // No other chain's endpoint leaks into this chain's rotation.
      for (const other of EVM_CHAINS) {
        if (other === chain) continue;
        for (const url of other.fallbacks) expect(endpoints).not.toContain(url);
      }
    }
  });
});

describe("the consumers derive", () => {
  it("the coverage claim: the statement reads every EVM chain; the subject roster knows every id", () => {
    const statement = COVERAGE_REGISTRATIONS.find((entry) => entry.class_id === "the_statement");
    for (const chain of EVM_CHAINS) {
      expect(statement?.depths[chain.caip2]).toBe("read");
      expect(KNOWN_CHAINS).toContain(chain.caip2);
    }
    expect(statement?.depths[SOLANA_CHAIN]).toBe("read");
  });

  it("the canonical-USDC registry, case-insensitively on every EVM chain", () => {
    for (const chain of EVM_CHAINS) {
      expect(CANONICAL_USDC[chain.caip2]).toBe(chain.usdc);
      expect(isCanonicalUsdc(chain.caip2, chain.usdc.toUpperCase().replace("0X", "0x"))).toBe(true);
      expect(isCanonicalUsdc(chain.caip2, BASE_EVM.usdc === chain.usdc ? POLYGON_EVM.usdc : BASE_EVM.usdc)).toBe(false);
    }
  });

  it("the receivability read and the challenge price, for a door on a reader chain", () => {
    const payTo = "0x843b544bf5f0aa6cbf13e94563874878c98cc4a7";
    const accepts = [{ scheme: "exact", network: ARBITRUM_EVM.caip2, asset: ARBITRUM_EVM.usdc, payTo, maxAmountRequired: "2500" }];
    const found = evmUsdcPayTos(accepts as never);
    expect(found).toHaveLength(1);
    expect(found[0]?.chain).toBe(ARBITRUM_EVM);
    expect(challengePriceOf(accepts)?.minimum_usdc).toBe(0.0025);
    // A chain the store does not read still yields nothing — no guess.
    expect(evmUsdcPayTos([{ ...accepts[0], network: "eip155:56" }] as never)).toEqual([]);
    expect(challengePriceOf([{ ...accepts[0], asset: "0x" + "1".repeat(40) }])).toBeNull();
  });
});
