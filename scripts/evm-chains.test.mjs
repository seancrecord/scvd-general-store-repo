import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EVM_RAILS, normaliseCaip2, railFor, sameChain } from "./lib/evm-chains.mjs";

/** The store's own registry, read as text because .mjs cannot import .ts. */
const SOURCE = readFileSync(new URL("../src/lib/base-rpc.ts", import.meta.url), "utf8");
const constant = (name) => {
  const hit = new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`).exec(SOURCE);
  return hit?.[1] ?? null;
};

test("every mirrored rail carries the USDC contract the store actually uses", () => {
  // A hand-kept copy of a registry is the same defect as a hand-typed
  // count of a derived list. This reads the TypeScript and compares.
  const pairs = [
    ["eip155:8453", "BASE_USDC"],
    ["eip155:42161", "ARBITRUM_USDC"],
    ["eip155:137", "POLYGON_USDC"],
    ["eip155:480", "WORLD_USDC"],
    ["eip155:1", "ETHEREUM_USDC"],
    ["eip155:10", "OPTIMISM_USDC"],
    ["eip155:43114", "AVALANCHE_USDC"],
  ];
  for (const [caip2, name] of pairs) {
    const fromStore = constant(name);
    assert.ok(fromStore, `${name} is not in src/lib/base-rpc.ts — the registry moved`);
    assert.equal(
      EVM_RAILS[caip2].usdc.toLowerCase(),
      fromStore.toLowerCase(),
      `${caip2}: the mirror and src/lib/base-rpc.ts disagree about USDC`,
    );
  }
});

test("the mirror does not quietly cover fewer chains than the store", () => {
  // Counting the store's chains from its own array rather than from a
  // number typed here.
  const listed = /export const EVM_CHAINS[^=]*=\s*\[([^\]]*)\]/s.exec(SOURCE)?.[1] ?? "";
  const storeChains = listed.split(",").map((s) => s.trim()).filter(Boolean).length;
  assert.ok(storeChains > 0, "could not read EVM_CHAINS out of base-rpc.ts");
  assert.ok(
    Object.keys(EVM_RAILS).length >= storeChains,
    `the store reads ${storeChains} EVM chains and this mirror reads ${Object.keys(EVM_RAILS).length}`,
  );
});

test("a truncated chain reference still matches the chain it names", () => {
  // The failure this exists for: a counterparty's first pass at a
  // rail-coverage comparison returned 266 gaps, 248 of which were one
  // producer truncating a Solana chain ref and another not.
  const whole = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
  const cut = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  assert.equal(sameChain(whole, cut), true);
  assert.equal(sameChain(cut, whole), true);
  assert.equal(normaliseCaip2(whole), normaliseCaip2(cut));

  // Different chains in the same namespace must NOT be collapsed.
  assert.equal(sameChain("solana:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", whole), false);

  // EVM ids are short and exact: no prefix matching, or eip155:1 would
  // swallow eip155:137 and every count downstream would be wrong.
  assert.equal(sameChain("eip155:1", "eip155:137"), false);
  assert.equal(sameChain("eip155:8453", "eip155:8453"), true);
  assert.equal(sameChain("eip155:8453", "EIP155:8453"), true);
});

test("railFor answers only for rails this instrument can actually read", () => {
  assert.equal(railFor("eip155:42161").key, "arbitrum");
  assert.equal(railFor("eip155:480").key, "world");
  assert.equal(railFor("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"), null);
  assert.equal(railFor("xrpl:0"), null);
  assert.equal(railFor(null), null);
});
